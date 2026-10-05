import type { ChId, EndAction, Fx, InId, InputCfg, PlayMode, SceneId, SceneMix, Section, SrcMode, Style } from './types';
import { CH_IDS, IN_IDS } from './types';
import { GROOVES, PERC, PERC_HITS, at } from './rhythm';
import type { Hit } from './rhythm';
import { meterBus } from '../meterEngine';
import { FLOOR, dbToLin } from '../util';

/*
 * Motor de audio en el navegador (Web Audio API). Todo lo que suena se genera aquí:
 * instrumentos sintetizados, batería y percusión, pistas de audio cargadas por el usuario,
 * EQ de 6 bandas con filtros, compresor, panorama, envíos a reverb y delay, y master con limitador.
 */

interface Handle {
  release: (when?: number) => void;
  end: number;
}

interface ChanNodes {
  dest: AudioNode;
  input: GainNode;
  hpf: BiquadFilterNode;
  eq: BiquadFilterNode[];
  lpf: BiquadFilterNode;
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
  rhodes: boolean;
  drawbars: number[];
  style: Style;
  arr: Section[];
  mode: PlayMode;
  end: EndAction;
  src: Record<'pad' | 'drums', SrcMode>;
}

export interface ApplyInput {
  mix: SceneMix;
  fx: Fx;
  master: number;
  masterMute: boolean;
  clickMonitor: boolean;
}

export interface Position {
  sec: number;
  bar: number; // compás dentro de la sección (0..)
  beat: number; // 0..3
  songBar: number; // compás absoluto en la canción
  pending: number | null;
}

const mtof = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const lin = (db: number) => (db <= -89.5 ? 0 : dbToLin(db));
const DRAW_H = [0.5, 1.5, 1, 2, 3, 4, 5, 6, 8];
const PROG: [number, boolean][] = [[0, false], [7, false], [9, true], [5, false]]; // I V vi IV
const LATIN: Style[] = ['salsa', 'tumbao', 'merengue', 'samba'];

class Engine {
  ctx: AudioContext | null = null;
  info: EngineInfo = { bpm: 68, key: 9, rhodes: false, drawbars: [8, 8, 6, 0, 0, 0, 0, 0, 0], style: 'worship', arr: [{ scene: 'verso', bars: 8 }], mode: 'follow', end: 'stop', src: { pad: 'synth', drums: 'synth' } };
  playing = false;
  onState: (() => void) | null = null;
  onSection: ((sec: number) => void) | null = null;
  onEnd: ((a: EndAction) => void) | null = null;

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
  private noise!: AudioBuffer;
  private fxBus!: GainNode;
  private voices = new Set<Handle>();
  private timer = 0;
  private step = 0; // semicorchea dentro del compás actual (0..15) acumulada
  private nextTime = 0;
  private sec = 0;
  private barInSec = 0;
  private songBar = 0;
  private pending: number | null = null;
  private stopAt: number | null = null;
  private bars: { t: number; sec: number; bar: number; songBar: number }[] = [];
  private files: Partial<Record<ChId, { buf: AudioBuffer; src: AudioBufferSourceNode | null; offset: number; start: number }>> = {};
  private drone: Handle[] = [];
  private last: ApplyInput | null = null;
  private streams = new Map<string, { src: MediaStreamAudioSourceNode; split: ChannelSplitterNode; mono: GainNode }>();
  private inNodes = {} as Record<InId, { trim: GainNode; pol: GainNode; an: AnalyserNode; from: AudioNode | null }>;
  private pendingInputs: Partial<Record<InId, InputCfg>> = {};
  private peaks = new Map<string, { v: number; pk: number; t: number }>();

  ensure(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: 'interactive' });
      this.build(this.ctx);
      if (this.last) this.apply(this.last);
      for (const [id, cfg] of Object.entries(this.pendingInputs) as [InId, InputCfg][]) void this.setInput(id, cfg).catch(() => undefined);
      this.pendingInputs = {};
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

    this.revIn = c.createGain();
    const conv = c.createConvolver();
    conv.buffer = impulse(c, 2.8, 2.6);
    this.revOut = c.createGain();
    this.revIn.connect(conv).connect(this.revOut).connect(this.masterIn);

    this.dlyIn = c.createGain();
    this.dlyNode = c.createDelay(2);
    this.dlyFb = c.createGain();
    const tone = c.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 4200;
    this.dlyOut = c.createGain();
    this.dlyIn.connect(this.dlyNode).connect(tone).connect(this.dlyOut).connect(this.masterIn);
    tone.connect(this.dlyFb).connect(this.dlyNode);

    this.rotLfo = c.createOscillator();
    this.rotLfo.frequency.value = 0.8;
    this.rotDepth = c.createGain();
    this.rotDepth.gain.value = 0.18;
    this.rotLfo.connect(this.rotDepth);
    this.rotLfo.start();

    this.fxBus = c.createGain();
    this.fxBus.gain.value = 0.8;
    this.fxBus.connect(this.masterIn);
    const fxRev = c.createGain();
    fxRev.gain.value = 0.3;
    this.fxBus.connect(fxRev).connect(this.revIn);

    const len = c.sampleRate;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const nd = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;

    for (const id of CH_IDS) {
      const input = c.createGain();
      const hpf = c.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.Q.value = 0.707;
      const eq = (['lowshelf', 'peaking', 'peaking', 'peaking', 'peaking', 'highshelf'] as BiquadFilterType[]).map((t) => {
        const f = c.createBiquadFilter();
        f.type = t;
        return f;
      });
      const lpf = c.createBiquadFilter();
      lpf.type = 'lowpass';
      lpf.Q.value = 0.707;
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
      node.connect(lpf).connect(comp).connect(fader).connect(pan);
      pan.connect(an);
      pan.connect(this.masterIn);
      pan.connect(rev).connect(this.revIn);
      pan.connect(dly).connect(this.dlyIn);
      this.ch[id] = { dest, input, hpf, eq, lpf, comp, fader, pan, an, rev, dly };
    }
    for (const id of IN_IDS) {
      const trim = c.createGain();
      const pol = c.createGain();
      const an = c.createAnalyser();
      an.fftSize = 1024;
      trim.connect(pol).connect(this.ch[id].dest);
      trim.connect(an);
      this.inNodes[id] = { trim, pol, an, from: null };
    }
  }

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
      set(n.lpf.frequency, s.lpf.on ? s.lpf.freq : 22000);
      s.eq.forEach((b, i) => {
        if (!n.eq[i]) return;
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

  /** Cambia la fuente de un canal (sintetizador o archivo) sin detener la reproducción. */
  syncSources() {
    if (!this.playing) return;
    for (const id of ['pad', 'drums'] as const) {
      const f = this.files[id];
      if (!f) continue;
      const want = this.info.src[id] === 'file';
      if (want && !f.src) this.startFile(id);
      if (!want && f.src) this.stopFile(id, true);
    }
  }

  /* ---------- Entradas reales: micrófonos e interfaces de audio ---------- */

  /** Pide permiso para usar las entradas de audio y devuelve la lista de dispositivos. */
  async inputDevices(ask: boolean): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
    if (ask) {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      st.getTracks().forEach((t) => t.stop());
    }
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'audioinput');
  }

  /** Conecta (o desconecta) una entrada física a su canal. */
  async setInput(id: InId, cfg: InputCfg) {
    if (!this.ctx) {
      this.pendingInputs[id] = cfg;
      return;
    }
    const n = this.inNodes[id];
    const t = this.ctx.currentTime;
    n.trim.gain.setTargetAtTime(dbToLin(cfg.trim), t, 0.03);
    n.pol.gain.setTargetAtTime(cfg.polarity ? -1 : 1, t, 0.01);
    if (n.from) {
      try {
        n.from.disconnect(n.trim);
      } catch {
        /* ya desconectado */
      }
      n.from = null;
    }
    if (!cfg.device) return;
    let s = this.streams.get(cfg.device);
    if (!s) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: cfg.device }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 } },
      });
      const src = this.ctx.createMediaStreamSource(stream);
      const split = this.ctx.createChannelSplitter(2);
      const mono = this.ctx.createGain();
      mono.channelCount = 1;
      mono.channelCountMode = 'explicit';
      mono.channelInterpretation = 'speakers';
      src.connect(split);
      src.connect(mono);
      s = { src, split, mono };
      this.streams.set(cfg.device, s);
    }
    if (cfg.side === 'mix') s.mono.connect(n.trim);
    else s.split.connect(n.trim, cfg.side === 'L' ? 0 : 1);
    n.from = cfg.side === 'mix' ? s.mono : s.split;
  }

  /* ---------- Voces melódicas ---------- */

  private voice(id: ChId, midi: number, t: number, vel = 0.8, dur?: number, to?: AudioNode): Handle | null {
    const c = this.ctx;
    if (!c) return null;
    const f = mtof(midi);
    const g = c.createGain();
    g.gain.value = 0;
    g.connect(to ?? this.ch[id].dest);
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
    const lowpass = (freq: number, q = 0.7) => {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = freq;
      lp.Q.value = q;
      lp.connect(g);
      return lp;
    };
    let rel = 0.15;
    let natural = 6;
    switch (id) {
      case 'piano': {
        const decay = Math.max(0.6, 2.6 - (midi - 48) * 0.03);
        const lp = lowpass(Math.min(12000, f * 9 + 1500));
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
        const lp = lowpass(1400, 0.8);
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
        const lp = lowpass(2600);
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
        const lp = lowpass(4200, 2);
        lp.frequency.setValueAtTime(4200, t);
        lp.frequency.setTargetAtTime(600, t, 0.12);
        osc('sawtooth', f, 0.6, lp);
        osc('square', f * 2, 0.12, lp, 4);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.18 * vel, t + 0.003);
        g.gain.setTargetAtTime(0, t + 0.005, 0.32);
        rel = 0.08;
        natural = 1.6;
        break;
      }
      case 'bajo': {
        const lp = lowpass(900, 1.2);
        lp.frequency.setValueAtTime(1400, t);
        lp.frequency.setTargetAtTime(380, t, 0.09);
        osc('sawtooth', f, 0.45, lp);
        osc('sine', f, 0.9, lp);
        osc('sine', f / 2, 0.25, lp);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.42 * vel, t + 0.004);
        g.gain.setTargetAtTime(0.25 * vel, t + 0.01, 0.3);
        rel = 0.07;
        natural = 8;
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

  /* ---------- Batería y percusión sintetizadas ---------- */

  hit(name: Hit, when?: number, vel = 1, direct = false) {
    const c = this.ensure();
    const t = when ?? c.currentTime + 0.005;
    const dest = direct ? this.fxBus : this.ch[PERC_HITS.includes(name) ? 'perc' : 'drums'].dest;
    const out = c.createGain();
    out.gain.value = vel * 0.55;
    out.connect(dest);
    const tone = (type: OscillatorType, f0: number, f1: number, sweep: number, decay: number, level: number) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + sweep);
      const g = c.createGain();
      g.gain.setValueAtTime(level, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + decay + 0.05);
    };
    const noise = (type: BiquadFilterType, freq: number, q: number, decay: number, level: number, delay = 0) => {
      const s = c.createBufferSource();
      s.buffer = this.noise;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(level, t + delay);
      g.gain.exponentialRampToValueAtTime(0.0008, t + delay + decay);
      s.connect(f).connect(g).connect(out);
      s.start(t + delay, Math.random() * 0.5);
      s.stop(t + delay + decay + 0.05);
    };
    switch (name) {
      case 'kick': tone('sine', 150, 42, 0.09, 0.42, 1); tone('triangle', 900, 60, 0.02, 0.03, 0.3); break;
      case 'snare': tone('triangle', 210, 160, 0.05, 0.12, 0.45); noise('bandpass', 1900, 0.7, 0.18, 0.7); break;
      case 'clap': [0, 0.012, 0.024].forEach((dl) => noise('bandpass', 1300, 1.4, dl === 0.024 ? 0.2 : 0.02, 0.8, dl)); break;
      case 'hat': noise('highpass', 7600, 0.8, 0.045, 0.32); break;
      case 'ohat': noise('highpass', 7000, 0.8, 0.26, 0.28); break;
      case 'crash': noise('highpass', 5200, 0.5, 1.6, 0.42); noise('bandpass', 9000, 0.6, 0.9, 0.2); break;
      case 'tomH': tone('sine', 240, 170, 0.15, 0.32, 0.8); break;
      case 'tomL': tone('sine', 150, 100, 0.18, 0.42, 0.85); break;
      case 'rim': tone('square', 1700, 1500, 0.01, 0.035, 0.22); noise('bandpass', 3000, 2, 0.02, 0.3); break;
      case 'conga': tone('sine', 330, 300, 0.05, 0.22, 0.75); noise('bandpass', 2500, 1.5, 0.015, 0.2); break;
      case 'congaLo': tone('sine', 220, 195, 0.06, 0.3, 0.8); break;
      case 'bongo': tone('sine', 520, 470, 0.03, 0.1, 0.5); break;
      case 'cowbell': {
        [540, 810].forEach((fq) => tone('square', fq, fq, 0.01, 0.28, 0.12));
        break;
      }
      case 'guira': noise('highpass', 6500, 0.9, 0.05, 0.4); break;
      case 'shaker': noise('bandpass', 7000, 1.2, 0.06, 0.32); break;
      case 'clave': tone('sine', 2500, 2400, 0.01, 0.06, 0.55); break;
      case 'tambora': tone('sine', 130, 105, 0.08, 0.26, 0.85); noise('bandpass', 1600, 1, 0.03, 0.3); break;
      case 'surdo': tone('sine', 78, 60, 0.12, 0.6, 0.95); break;
      case 'tamborim': tone('sine', 760, 700, 0.02, 0.07, 0.4); noise('bandpass', 4200, 1.4, 0.03, 0.3); break;
    }
  }

  /** Efecto de subida (ruido filtrado) que dura dos compases. */
  swell() {
    const c = this.ensure();
    const t = c.currentTime + 0.01;
    const dur = (60 / this.info.bpm) * 8;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2.5;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(9000, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + dur);
    g.gain.setTargetAtTime(0, t + dur, 0.05);
    s.connect(f).connect(g).connect(this.fxBus);
    s.start(t);
    s.stop(t + dur + 0.4);
  }

  /** Golpe grave de impacto con platillo. */
  impact() {
    const c = this.ensure();
    const t = c.currentTime + 0.005;
    this.hit('kick', t, 1.2, true);
    this.hit('crash', t, 1.1, true);
    const o = c.createOscillator();
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(30, t + 1.2);
    const g = c.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    o.connect(g).connect(this.fxBus);
    o.start(t);
    o.stop(t + 1.7);
  }

  /** Fondo continuo (raíz y quinta de la tonalidad) en el canal Pad. */
  setDrone(on: boolean) {
    const c = this.ensure();
    this.drone.forEach((h) => h.release());
    this.drone = [];
    if (!on) return;
    const r = 48 + this.info.key;
    this.drone = [r - 12, r, r + 7, r + 12].map((n) => this.voice('pad', n, c.currentTime + 0.01, 0.8, undefined, this.fxBus)!).filter(Boolean);
    this.drone.forEach((h) => this.voices.delete(h));
  }

  /** Nota en vivo: devuelve la función para soltarla. */
  noteOn(ids: ChId[], midi: number, vel = 0.85): () => void {
    this.ensure();
    const t = this.ctx!.currentTime + 0.005;
    const hs = ids.map((id) => this.voice(id, id === 'bajo' ? midi - 12 : midi, t, vel)).filter(Boolean) as Handle[];
    hs.forEach((h) => this.voices.delete(h));
    return () => hs.forEach((h) => h.release());
  }

  /* ---------- Transporte, línea de tiempo y secuenciador ---------- */

  /** Sitúa la reproducción al inicio de una sección (cuando está detenido). */
  setSection(sec: number) {
    if (this.playing) {
      this.pending = sec;
      return;
    }
    this.sec = Math.max(0, Math.min(sec, this.info.arr.length - 1));
    this.barInSec = 0;
    this.songBar = this.info.arr.slice(0, this.sec).reduce((a, x) => a + x.bars, 0);
    this.step = 0;
  }

  play() {
    const c = this.ensure();
    if (this.playing) return;
    this.playing = true;
    this.stopAt = null;
    this.bars = [];
    this.step = 0;
    this.nextTime = c.currentTime + 0.08;
    this.timer = window.setInterval(() => this.tick(), 25);
    this.startFiles();
    this.onState?.();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    window.clearInterval(this.timer);
    for (const id of Object.keys(this.files) as ChId[]) this.stopFile(id, true);
    this.releaseAll(0.15);
    this.onState?.();
  }

  stop() {
    this.pause();
    this.setSection(0);
    for (const f of Object.values(this.files)) if (f) f.offset = 0;
    this.pending = null;
    this.bars = [];
    this.onState?.();
  }

  panic() {
    this.releaseAll(0);
    this.drone.forEach((h) => h.release(0));
    this.drone = [];
  }

  position(): Position {
    const base = { sec: this.sec, bar: this.barInSec, beat: 0, songBar: this.songBar, pending: this.pending };
    if (!this.ctx || !this.playing) return base;
    const now = this.ctx.currentTime;
    let cur = this.bars[0];
    for (const b of this.bars) if (b.t <= now) cur = b;
    if (!cur) return base;
    const beat = Math.min(3, Math.max(0, Math.floor((now - cur.t) / (60 / this.info.bpm))));
    return { sec: cur.sec, bar: cur.bar, beat, songBar: cur.songBar, pending: this.pending };
  }

  private releaseAll(after: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + after;
    this.voices.forEach((v) => v.release(t));
    this.voices.clear();
  }

  private tick() {
    const c = this.ctx!;
    const S = 60 / this.info.bpm / 4;
    while (this.nextTime < c.currentTime + 0.12) {
      if (this.stopAt !== null) break;
      const p = this.step % 16;
      if (p === 0) this.barStart(this.nextTime);
      if (this.stopAt !== null) break;
      this.schedule(p, this.nextTime, S);
      this.nextTime += S;
      this.step++;
    }
    const now = c.currentTime;
    this.voices.forEach((v) => v.end < now && this.voices.delete(v));
    this.bars = this.bars.filter((b, i, arr) => i >= arr.length - 4 || b.t > now - 8);
  }

  /** Decide qué sección suena en este compás: avanzar, repetir, saltar o terminar. */
  private barStart(t: number) {
    const arr = this.info.arr;
    if (!arr.length) return;
    let changed = false;
    if (this.step > 0) {
      this.barInSec++;
      this.songBar++;
      if (this.pending !== null) {
        this.sec = this.pending;
        this.barInSec = 0;
        this.pending = null;
        changed = true;
      } else if (this.barInSec >= arr[this.sec].bars) {
        this.barInSec = 0;
        if (this.info.mode === 'follow') {
          this.sec++;
          changed = true;
          if (this.sec >= arr.length) {
            const end = this.info.end;
            this.sec = 0;
            if (end === 'stop') {
              this.stopAt = t;
              const delay = Math.max(0, (t - this.ctx!.currentTime) * 1000);
              window.setTimeout(() => {
                this.stop();
                this.onEnd?.('stop');
              }, delay);
              return;
            }
            const delay = Math.max(0, (t - this.ctx!.currentTime) * 1000);
            window.setTimeout(() => this.onEnd?.(end), delay);
          }
        }
      }
    } else changed = true;
    if (changed) {
      this.songBar = arr.slice(0, this.sec).reduce((a, x) => a + x.bars, 0) + this.barInSec;
      const sec = this.sec;
      const delay = Math.max(0, (t - this.ctx!.currentTime) * 1000);
      window.setTimeout(() => this.onSection?.(sec), delay);
      if (arr[sec].scene !== 'intro' && !LATIN.includes(this.info.style)) this.hit('crash', t, 0.7);
    }
    this.bars.push({ t, sec: this.sec, bar: this.barInSec, songBar: this.songBar });
  }

  private schedule(p: number, t: number, S: number) {
    const arr = this.info.arr;
    const section = arr[this.sec] ?? arr[0];
    const scene: SceneId = section.scene;
    const style = this.info.style;
    const groove = GROOVES[style];
    const [deg, minor] = PROG[this.barInSec % 4];
    const [ndeg] = PROG[(this.barInSec + 1) % 4];
    const r = 48 + ((this.info.key + deg) % 12);
    const th = r + (minor ? 3 : 4);
    const fi = r + 7;
    const n = (id: ChId, notes: number[], dur: number, vel = 0.8, spread = 0) => notes.forEach((m, i) => this.voice(id, m, t + i * spread, vel, dur));
    const even = p % 2 === 0;
    const p8 = p / 2;
    const local = this.barInSec * 16 + p; // para patrones de dos compases
    const latin = LATIN.includes(style);

    // Piano: patrón del estilo si lo tiene; si no, el de la escena.
    if (groove.comp && scene !== 'intro') {
      const c = at(groove.comp, local);
      if (c) n('piano', [r + 12, th + 12, fi + 12], S * 1.6, 0.7, 0.006);
      if (p === 0 && !latin) n('piano', [r - 12], S * 7, 0.6);
    } else if (even) {
      if (scene === 'intro') {
        if (p8 === 0) n('piano', [r + 12, th + 12, fi + 12], S * 15, 0.55, 0.03);
        if (p8 === 4) n('piano', [fi + 24], S * 6, 0.45);
      } else if (scene === 'verso') {
        const arp = [r, fi, r + 12, th + 12, r + 12, fi, r + 12, th + 12];
        n('piano', [arp[p8]], S * 3.6, 0.6);
        if (p8 === 0) n('piano', [r - 12], S * 14, 0.6);
      } else if (scene === 'puente') {
        if (p8 === 0) n('piano', [th + 12, fi + 12, r + 24], S * 7.6, 0.6, 0.02);
        if (p8 === 5) n('piano', [fi + 12, r + 24], S * 5.6, 0.5, 0.02);
      } else {
        if (p8 % 2 === 0) n('piano', [r + 12, th + 12, fi + 12].concat(scene === 'final' ? [r + 24] : []), S * 3.4, p8 === 0 ? 0.85 : 0.68, 0.008);
        if (p8 === 0 || p8 === 4) n('piano', [r - 12], S * 7.2, 0.75);
      }
    }
    // Pad, órgano, cuerdas: acorde por compás (si el pad no viene de un archivo)
    if (p === 0) {
      if (this.info.src.pad === 'synth' || !this.files.pad) n('pad', [r, fi, r + 12, th + 12], S * 16.1, 0.8);
      n('organ', [r - 12, r, fi, th + 12], S * 15.8, 0.8);
      n('strings', [fi, r + 12, th + 12, fi + 12], S * 16.1, 0.8);
      n('voz', [th + 12], S * 7.8, 0.8);
    }
    if (p === 8) n('voz', [fi + 12], S * 7.8, 0.8);
    // Guitarra
    if (latin && groove.comp) {
      if (at(groove.comp, local + 2)) n('guitarra', [r + 12, fi + 12, th + 24], S * 1.2, 0.55, 0.008);
    } else if (even && [0, 2, 3, 5, 6].includes(p8)) {
      n('guitarra', p8 % 2 ? [fi + 12, th + 12, r + 12] : [r, fi, r + 12, th + 12], S * 3.2, p8 === 0 ? 0.9 : 0.6, 0.012);
    }
    // Bajo
    const b = groove.bass[local % groove.bass.length];
    if (b && b !== '.') {
      const root = 36 + ((this.info.key + deg) % 12);
      const next = 36 + ((this.info.key + ndeg) % 12);
      const note = b === 'R' ? root : b === '5' ? root + 7 : b === '8' ? root + 12 : b === '3' ? root + (minor ? 3 : 4) : b === 'a' ? next : root;
      const len = groove.bass.slice((local % groove.bass.length) + 1).search(/[^.]/);
      this.voice('bajo', note, t, 0.85, S * Math.max(1, Math.min(8, len < 0 ? 4 : len + 1)) * 0.9);
    }
    // Batería (si no viene de archivo) y percusión
    if (this.info.src.drums === 'synth' || !this.files.drums) {
      const fillBar = groove.fills && this.barInSec === section.bars - 1 && scene !== 'intro';
      if (fillBar && p >= 12) this.hit(p % 2 ? 'snare' : p === 12 ? 'tomH' : 'tomL', t, 0.75);
      else {
        for (const [hit, pat] of Object.entries(groove.drums) as [Hit, string][]) {
          const v = at(pat, local);
          if (v) this.hit(hit, t, v === 'x' ? 1 : 0.55);
        }
      }
    }
    for (const [hit, pat] of Object.entries(PERC[style]) as [Hit, string][]) {
      const v = at(pat, local);
      if (v) this.hit(hit, t, v === 'x' ? 1 : 0.5);
    }
    // Click a negras
    if (p % 4 === 0) this.voice('click', p === 0 ? 96 : 84, t, p === 0 ? 1 : 0.7);
  }

  /* ---------- Archivos de audio por canal ---------- */

  async loadFile(id: ChId, file: File): Promise<number> {
    const c = this.ensure();
    const buf = await c.decodeAudioData(await file.arrayBuffer());
    this.stopFile(id, false);
    this.files[id] = { buf, src: null, offset: 0, start: 0 };
    if (this.playing && (id === 'tracks' || this.info.src[id as 'pad' | 'drums'] === 'file')) this.startFile(id);
    return buf.duration;
  }

  hasFile(id: ChId) {
    return !!this.files[id];
  }

  fileTime(id: ChId): { pos: number; dur: number } {
    const f = this.files[id];
    if (!f || !this.ctx) return { pos: 0, dur: 0 };
    const pos = f.src ? f.offset + (this.ctx.currentTime - f.start) : f.offset;
    return { pos: pos % f.buf.duration, dur: f.buf.duration };
  }

  private startFiles() {
    for (const id of Object.keys(this.files) as ChId[]) {
      if (id === 'tracks' || this.info.src[id as 'pad' | 'drums'] === 'file') this.startFile(id);
    }
  }

  private startFile(id: ChId) {
    const f = this.files[id];
    if (!f || !this.ctx || f.src) return;
    const src = this.ctx.createBufferSource();
    src.buffer = f.buf;
    src.loop = true;
    src.connect(this.ch[id].dest);
    f.start = this.ctx.currentTime;
    src.start(0, f.offset % f.buf.duration);
    f.src = src;
  }

  private stopFile(id: ChId, keep: boolean) {
    const f = this.files[id];
    if (!f?.src || !this.ctx) return;
    if (keep) f.offset += this.ctx.currentTime - f.start;
    try {
      f.src.stop();
    } catch {
      /* ya detenido */
    }
    f.src = null;
  }

  /* ---------- Medición ---------- */

  spectrum(id: ChId, out: Uint8Array<ArrayBuffer>) {
    if (!this.ctx) return false;
    this.ch[id].an.getByteFrequencyData(out);
    return true;
  }

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
      for (const id of IN_IDS) {
        const m = smooth(`in:${id}`, peakOf(this.inNodes[id].an));
        meterBus.publish(`in:${id}`, { l: m.v, r: m.v, pl: m.pk, pr: m.pk });
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
