import type { ChId, Fx, SceneId, SceneMix } from './types';
import { CH_IDS } from './types';
import { meterBus } from '../meterEngine';
import { FLOOR, dbToLin } from '../util';

/*
 * Motor de audio en el navegador (Web Audio API). Todo lo que suena se genera aquí:
 * sintetizadores sencillos por canal, una pista de audio cargada por el usuario, EQ,
 * compresor, panorama, envíos a reverb y delay, y master con brillo y limitador.
 */

interface Handle {
  release: (when?: number) => void;
  end: number;
}

interface ChanNodes {
  dest: AudioNode; // donde se conectan las voces
  input: GainNode; // expresión
  hpf: BiquadFilterNode;
  eq: BiquadFilterNode[];
  comp: DynamicsCompressorNode;
  fader: GainNode;
  pan: StereoPannerNode;
  an: AnalyserNode;
  rev: GainNode;
  dly: GainNode;
}

export interface EngineInfo {
  bpm: number;
  key: number;
  scene: SceneId;
  rhodes: boolean;
  drawbars: number[];
}

export interface ApplyInput {
  mix: SceneMix;
  fx: Fx;
  master: number;
  masterMute: boolean;
  clickMonitor: boolean;
}

const mtof = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const lin = (db: number) => (db <= -89.5 ? 0 : dbToLin(db));
const DRAW_H = [0.5, 1.5, 1, 2, 3, 4, 5, 6, 8];
const PROG: [number, boolean][] = [[0, false], [7, false], [9, true], [5, false]]; // I V vi IV

class Engine {
  ctx: AudioContext | null = null;
  info: EngineInfo = { bpm: 68, key: 9, scene: 'coro', rhodes: false, drawbars: [8, 8, 6, 0, 0, 0, 0, 0, 0] };
  playing = false;
  onState: (() => void) | null = null;
  private ch = {} as Record<ChId, ChanNodes>;
  private masterIn!: GainNode;
  private bright!: BiquadFilterNode;
  private masterGain!: GainNode;
  private anL!: AnalyserNode;
  private anR!: AnalyserNode;
  private revIn!: GainNode;
  private revOut!: GainNode;
  private dlyIn!: GainNode;
  private dlyNode!: DelayNode;
  private dlyFb!: GainNode;
  private dlyOut!: GainNode;
  private rotLfo!: OscillatorNode;
  private rotDepth!: GainNode;
  private voices = new Set<Handle>();
  private timer = 0;
  private step = 0;
  private nextTime = 0;
  private trackBuf: AudioBuffer | null = null;
  private trackSrc: AudioBufferSourceNode | null = null;
  private trackOffset = 0;
  private trackStart = 0;

  private last: ApplyInput | null = null;
  private peaks = new Map<string, { v: number; pk: number; t: number }>();

  /** Crea o reanuda el contexto. Debe llamarse dentro de un gesto del usuario. */
  ensure(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: 'interactive' });
      this.build(this.ctx);
      if (this.last) this.apply(this.last);
      this.meters();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private build(c: AudioContext) {
    this.masterIn = c.createGain();
    this.bright = c.createBiquadFilter();
    this.bright.type = 'highshelf';
    this.bright.frequency.value = 5500;
    this.masterGain = c.createGain();
    const limiter = c.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    this.masterIn.connect(this.bright).connect(this.masterGain).connect(limiter).connect(c.destination);
    const split = c.createChannelSplitter(2);
    limiter.connect(split);
    this.anL = c.createAnalyser();
    this.anR = c.createAnalyser();
    this.anL.fftSize = this.anR.fftSize = 1024;
    split.connect(this.anL, 0);
    split.connect(this.anR, 1);

    // Reverb: respuesta al impulso generada (ruido con caída exponencial).
    this.revIn = c.createGain();
    const conv = c.createConvolver();
    conv.buffer = impulse(c, 2.8, 2.6);
    this.revOut = c.createGain();
    this.revIn.connect(conv).connect(this.revOut).connect(this.masterIn);

    // Delay a negra con realimentación filtrada.
    this.dlyIn = c.createGain();
    this.dlyNode = c.createDelay(2);
    this.dlyFb = c.createGain();
    const tone = c.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 4200;
    this.dlyOut = c.createGain();
    this.dlyIn.connect(this.dlyNode).connect(tone).connect(this.dlyOut).connect(this.masterIn);
    tone.connect(this.dlyFb).connect(this.dlyNode);

    // Rotary del órgano: trémolo con LFO.
    this.rotLfo = c.createOscillator();
    this.rotLfo.frequency.value = 0.8;
    this.rotDepth = c.createGain();
    this.rotDepth.gain.value = 0.18;
    this.rotLfo.connect(this.rotDepth);
    this.rotLfo.start();

    for (const id of CH_IDS) {
      const input = c.createGain();
      const hpf = c.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.Q.value = 0.707;
      const eq = (['lowshelf', 'peaking', 'peaking', 'highshelf'] as BiquadFilterType[]).map((t) => {
        const f = c.createBiquadFilter();
        f.type = t;
        return f;
      });
      const comp = c.createDynamicsCompressor();
      const fader = c.createGain();
      const pan = c.createStereoPanner();
      const an = c.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0.82;
      const rev = c.createGain();
      const dly = c.createGain();
      let dest: AudioNode = input;
      if (id === 'organ') {
        const trem = c.createGain();
        trem.gain.value = 0.82;
        this.rotDepth.connect(trem.gain);
        trem.connect(input);
        dest = trem;
      }
      input.connect(hpf);
      let node: AudioNode = hpf;
      for (const f of eq) node = node.connect(f);
      node.connect(comp).connect(fader).connect(pan);
      pan.connect(an);
      pan.connect(this.masterIn);
      pan.connect(rev).connect(this.revIn);
      pan.connect(dly).connect(this.dlyIn);
      this.ch[id] = { dest, input, hpf, eq, comp, fader, pan, an, rev, dly };
    }
  }

  /** Lleva todos los parámetros del estado al grafo de audio, con rampas cortas. */
  apply(a: ApplyInput) {
    this.last = a;
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime;
    const set = (p: AudioParam, v: number, tc = 0.03) => p.setTargetAtTime(v, t, tc);
    const { mix, fx } = a;
    const anySolo = Object.values(mix.chans).some((x) => x.solo);
    const expr = 0.35 + 0.65 * mix.macros.expression;
    for (const id of CH_IDS) {
      const s = mix.chans[id];
      const n = this.ch[id];
      set(n.input.gain, id === 'pad' || id === 'strings' || id === 'organ' || id === 'voz' ? expr : 1);
      set(n.hpf.frequency, s.hpf.on ? s.hpf.freq : 10);
      s.eq.forEach((b, i) => {
        set(n.eq[i].frequency, b.freq);
        set(n.eq[i].gain, s.eqOn && b.on ? b.gain : 0);
        set(n.eq[i].Q, b.q);
      });
      set(n.comp.threshold, s.comp.on ? s.comp.threshold : 0);
      set(n.comp.ratio, s.comp.on ? s.comp.ratio : 1);
      set(n.comp.knee, s.comp.on ? 6 : 0);
      set(n.comp.attack, s.comp.attack / 1000);
      set(n.comp.release, s.comp.release / 1000);
      const muted = s.mute || (anySolo && !s.solo) || (id === 'click' && !a.clickMonitor);
      set(n.fader.gain, muted ? 0 : lin(s.fader) * (s.comp.on ? dbToLin(s.comp.makeup) : 1), 0.05);
      set(n.pan.pan, s.pan / 100);
      set(n.rev.gain, lin(s.sendRev));
      set(n.dly.gain, lin(s.sendDly));
    }
    set(this.bright.gain, -6 + mix.macros.brightness * 14);
    set(this.revIn.gain, fx.reverbOn ? lin(fx.reverbSend) * 4 : 0);
    set(this.revOut.gain, fx.reverbWet * 2.2 * (0.4 + 1.2 * mix.macros.ambience));
    set(this.dlyIn.gain, fx.delayOn ? lin(fx.delaySend) * 4 : 0);
    set(this.dlyOut.gain, fx.delayWet * 1.6);
    set(this.dlyFb.gain, Math.min(0.9, fx.delayFb));
    set(this.dlyNode.delayTime, 60 / this.info.bpm, 0.1);
    set(this.rotLfo.frequency, fx.rotary === 'fast' ? 6.4 : fx.rotary === 'slow' ? 0.8 : 0.01, 0.6);
    set(this.rotDepth.gain, fx.rotary === 'stop' ? 0 : 0.18, 0.3);
    set(this.masterGain.gain, a.masterMute ? 0 : lin(a.master), 0.05);
  }

  /* ---------- Voces ---------- */

  private voice(id: ChId, midi: number, t: number, vel = 0.8, dur?: number): Handle | null {
    const c = this.ctx;
    if (!c) return null;
    const dest = this.ch[id].dest;
    const f = mtof(midi);
    const g = c.createGain();
    g.gain.value = 0;
    g.connect(dest);
    const oscs: OscillatorNode[] = [];
    const osc = (type: OscillatorType, freq: number, gain: number, to: AudioNode = g, detune = 0) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const og = c.createGain();
      og.gain.value = gain;
      o.connect(og).connect(to);
      oscs.push(o);
      return o;
    };
    let rel = 0.15;
    let natural = 6; // duración máxima de la voz
    switch (id) {
      case 'piano': {
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.connect(g);
        const decay = Math.max(0.6, 2.6 - (midi - 48) * 0.03);
        lp.frequency.setValueAtTime(Math.min(12000, f * 9 + 1500), t);
        lp.frequency.setTargetAtTime(f * 2.5 + 300, t + 0.02, decay * 0.6);
        if (this.info.rhodes) {
          osc('sine', f, 1, lp);
          osc('sine', f * 2, 0.22, lp);
          osc('sine', f * 7.1, 0.04, lp);
        } else {
          osc('triangle', f, 0.9, lp);
          osc('sine', f * 2, 0.45, lp, 3);
          osc('sine', f * 3, 0.18, lp, -4);
          osc('sine', f * 4.02, 0.08, lp);
        }
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.32 * vel, t + 0.005);
        g.gain.setTargetAtTime(0, t + 0.01, decay);
        rel = 0.12;
        natural = decay * 4;
        break;
      }
      case 'pad': {
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 1400;
        lp.Q.value = 0.8;
        lp.connect(g);
        [-9, 0, 8].forEach((d) => osc('sawtooth', f, 0.33, lp, d));
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.09 * vel, t + 1.1);
        rel = 0.9;
        natural = 30;
        break;
      }
      case 'organ': {
        this.info.drawbars.forEach((v, i) => {
          if (v > 0) osc('sine', f * DRAW_H[i], (v / 8) * 0.22);
        });
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.28 * vel, t + 0.012);
        rel = 0.06;
        natural = 30;
        break;
      }
      case 'strings': {
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 2600;
        lp.connect(g);
        [-14, -5, 6, 15].forEach((d) => osc('sawtooth', f, 0.25, lp, d));
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.07 * vel, t + 0.6);
        rel = 0.5;
        natural = 30;
        break;
      }
      case 'voz': {
        const f1 = c.createBiquadFilter();
        const f2 = c.createBiquadFilter();
        f1.type = f2.type = 'bandpass';
        f1.frequency.value = 520;
        f2.frequency.value = 900;
        f1.Q.value = 6;
        f2.Q.value = 7;
        const mixG = c.createGain();
        mixG.gain.value = 3;
        f1.connect(mixG);
        f2.connect(mixG);
        mixG.connect(g);
        const o = osc('sawtooth', f, 1, f1);
        const og2 = c.createGain();
        og2.gain.value = 0.6;
        o.connect(og2).connect(f2);
        const vib = c.createOscillator();
        vib.frequency.value = 5.2;
        const vd = c.createGain();
        vd.gain.value = 7;
        vib.connect(vd).connect(o.detune);
        oscs.push(vib);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.22 * vel, t + 0.25);
        rel = 0.35;
        natural = 20;
        break;
      }
      case 'guitarra': {
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.Q.value = 2;
        lp.frequency.setValueAtTime(4200, t);
        lp.frequency.setTargetAtTime(600, t, 0.12);
        lp.connect(g);
        osc('sawtooth', f, 0.6, lp);
        osc('square', f * 2, 0.12, lp, 4);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.18 * vel, t + 0.003);
        g.gain.setTargetAtTime(0, t + 0.005, 0.32);
        rel = 0.08;
        natural = 1.6;
        break;
      }
      case 'click': {
        osc('sine', f, 1);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.001);
        g.gain.setTargetAtTime(0, t + 0.002, 0.012);
        rel = 0.01;
        natural = 0.08;
        break;
      }
      default:
        return null;
    }
    oscs.forEach((o) => o.start(t));
    const end = t + natural;
    oscs.forEach((o) => o.stop(end + 0.1));
    const h: Handle = {
      end,
      release: (when) => {
        const w = Math.max(when ?? c.currentTime, c.currentTime);
        if (w >= h.end) return;
        g.gain.cancelScheduledValues(w);
        g.gain.setTargetAtTime(0, w, rel / 3);
        h.end = w + rel * 2.5;
        oscs.forEach((o) => {
          try {
            o.stop(h.end + 0.05);
          } catch {
            /* ya detenido */
          }
        });
      },
    };
    if (dur !== undefined) h.release(t + dur);
    this.voices.add(h);
    return h;
  }

  /** Nota en vivo desde el teclado gráfico. Devuelve la función para soltarla. */
  noteOn(ids: ChId[], midi: number, vel = 0.85): () => void {
    this.ensure();
    const t = this.ctx!.currentTime + 0.005;
    const hs = ids.map((id) => this.voice(id, midi, t, vel)).filter(Boolean) as Handle[];
    return () => hs.forEach((h) => h.release());
  }

  /* ---------- Transporte y secuenciador ---------- */

  play() {
    const c = this.ensure();
    if (this.playing) return;
    this.playing = true;
    this.nextTime = c.currentTime + 0.08;
    this.timer = window.setInterval(() => this.tick(), 25);
    this.startTrack();
    this.onState?.();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    window.clearInterval(this.timer);
    this.stopTrack(true);
    this.releaseAll(0.15);
    this.onState?.();
  }

  stop() {
    this.pause();
    this.step = 0;
    this.trackOffset = 0;
    this.onState?.();
  }

  panic() {
    this.releaseAll(0);
  }

  get bar() {
    return Math.floor(this.step / 8) % 4;
  }

  private releaseAll(after: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + after;
    this.voices.forEach((v) => v.release(t));
    this.voices.clear();
  }

  private tick() {
    const c = this.ctx!;
    const stepDur = 60 / this.info.bpm / 2;
    while (this.nextTime < c.currentTime + 0.12) {
      this.schedule(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
    const now = c.currentTime;
    this.voices.forEach((v) => v.end < now && this.voices.delete(v));
  }

  private schedule(step: number, t: number, S: number) {
    const pos = step % 8;
    const [deg, minor] = PROG[Math.floor(step / 8) % 4];
    const r = 48 + ((this.info.key + deg) % 12);
    const th = r + (minor ? 3 : 4);
    const fi = r + 7;
    const n = (id: ChId, notes: number[], dur: number, vel = 0.8, spread = 0) =>
      notes.forEach((m, i) => this.voice(id, m, t + i * spread, vel, dur));
    const sc = this.info.scene;

    // Piano
    if (sc === 'intro') {
      if (pos === 0) n('piano', [r + 12, th + 12, fi + 12], S * 7.6, 0.55, 0.03);
      if (pos === 4) n('piano', [fi + 24], S * 3, 0.45);
    } else if (sc === 'verso') {
      const arp = [r, fi, r + 12, th + 12, r + 12, fi, r + 12, th + 12];
      n('piano', [arp[pos]], S * 1.8, 0.6);
      if (pos === 0) n('piano', [r - 12], S * 7, 0.6);
    } else if (sc === 'puente') {
      if (pos === 0) n('piano', [th + 12, fi + 12, r + 24], S * 3.8, 0.6, 0.02);
      if (pos === 5) n('piano', [fi + 12, r + 24], S * 2.8, 0.5, 0.02);
    } else {
      if (pos % 2 === 0) n('piano', [r + 12, th + 12, fi + 12].concat(sc === 'final' ? [r + 24] : []), S * 1.7, pos === 0 ? 0.85 : 0.68, 0.008);
      if (pos === 0 || pos === 4) n('piano', [r - 12], S * 3.6, 0.75);
    }
    // Pad, órgano, cuerdas: acorde por compás
    if (pos === 0) {
      n('pad', [r, fi, r + 12, th + 12], S * 8.05, 0.8);
      n('organ', [r - 12, r, fi, th + 12], S * 7.9, 0.8);
      n('strings', [fi, r + 12, th + 12, fi + 12], S * 8.05, 0.8);
    }
    // Voz (coro "uh")
    if (pos === 0) n('voz', [th + 12], S * 3.9, 0.8);
    if (pos === 4) n('voz', [fi + 12], S * 3.9, 0.8);
    // Guitarra: rasgueo
    if ([0, 2, 3, 5, 6].includes(pos)) n('guitarra', pos % 2 ? [fi + 12, th + 12, r + 12] : [r, fi, r + 12, th + 12], S * 1.6, pos === 0 ? 0.9 : 0.6, 0.012);
    // Click a negras
    if (pos % 2 === 0) this.voice('click', pos === 0 ? 96 : 84, t, pos === 0 ? 1 : 0.7);
  }

  /* ---------- Pista de audio ---------- */

  async loadFile(file: File): Promise<number> {
    const c = this.ensure();
    const buf = await c.decodeAudioData(await file.arrayBuffer());
    const wasPlaying = this.playing;
    this.stopTrack(false);
    this.trackBuf = buf;
    this.trackOffset = 0;
    if (wasPlaying) this.startTrack();
    return buf.duration;
  }

  get hasTrack() {
    return !!this.trackBuf;
  }

  trackTime(): { pos: number; dur: number } {
    if (!this.trackBuf || !this.ctx) return { pos: 0, dur: 0 };
    const dur = this.trackBuf.duration;
    const pos = this.trackSrc ? this.trackOffset + (this.ctx.currentTime - this.trackStart) : this.trackOffset;
    return { pos: pos % dur, dur };
  }

  private startTrack() {
    if (!this.trackBuf || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.trackBuf;
    src.loop = true;
    src.connect(this.ch.tracks.dest);
    this.trackStart = this.ctx.currentTime;
    src.start(0, this.trackOffset % this.trackBuf.duration);
    this.trackSrc = src;
  }

  private stopTrack(keep: boolean) {
    if (!this.trackSrc || !this.ctx) return;
    if (keep) this.trackOffset += this.ctx.currentTime - this.trackStart;
    try {
      this.trackSrc.stop();
    } catch {
      /* ya detenido */
    }
    this.trackSrc = null;
  }

  /* ---------- Medición ---------- */

  spectrum(id: ChId, out: Uint8Array<ArrayBuffer>) {
    if (!this.ctx) return false;
    this.ch[id].an.getByteFrequencyData(out);
    return true;
  }

  /** Reducción de ganancia actual del compresor del canal, en dB (negativa o 0). */
  reduction(id: ChId): number {
    return this.ctx ? this.ch[id].comp.reduction : 0;
  }

  get sampleRate() {
    return this.ctx?.sampleRate ?? 0;
  }

  get latencySamples() {
    if (!this.ctx) return 0;
    return Math.round((this.ctx.baseLatency || 0) * this.ctx.sampleRate);
  }

  private meters() {
    const buf = new Float32Array(1024);
    const peakOf = (an: AnalyserNode) => {
      an.getFloatTimeDomainData(buf);
      let p = 0;
      for (let i = 0; i < buf.length; i++) p = Math.max(p, Math.abs(buf[i]));
      return p <= 1e-5 ? FLOOR : 20 * Math.log10(p);
    };
    const smooth = (key: string, db: number) => {
      const now = performance.now();
      const prev = this.peaks.get(key) ?? { v: FLOOR, pk: FLOOR, t: now };
      const v = db >= prev.v ? db : Math.max(db, prev.v - 1.6);
      let pk = prev.pk;
      let pt = prev.t;
      if (v >= pk) {
        pk = v;
        pt = now;
      } else if (now - pt > 1200) pk = Math.max(v, pk - 0.8);
      const next = { v, pk, t: pt };
      this.peaks.set(key, next);
      return next;
    };
    const loop = () => {
      for (const id of CH_IDS) {
        const m = smooth(`ch:${id}`, peakOf(this.ch[id].an));
        meterBus.publish(`live:${id}`, { l: m.v, r: m.v, pl: m.pk, pr: m.pk });
      }
      const l = smooth('mL', peakOf(this.anL));
      const r = smooth('mR', peakOf(this.anR));
      meterBus.publish('live:master', { l: l.v, r: r.v, pl: l.pk, pr: r.pk });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

function impulse(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < 200 ? i / 200 : 1);
  }
  return b;
}

export const engine = new Engine();
