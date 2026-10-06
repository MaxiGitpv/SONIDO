import type { Bus, Chan, ChId, EndAction, Fx, InId, InputCfg, Outputs, PlayMode, SamplerCfg, SceneMix, Section, SectionKind, SrcMode, Stem, Style, TimeSig } from './types';
import { CH_IDS, IN_IDS, INST_IDS, MONITOR_ONLY, isMusical } from './types';
import { GROOVES, PERC, PERC_HITS, at } from './rhythm';
import type { Hit } from './rhythm';
import { meterBus } from '../meterEngine';
import { FLOOR, dbToLin, faderGain } from '../util';

/*
 * Motor de audio único de SONIDO (Web Audio API). Ver docs/FLUJO-AUDIO.md.
 *
 * Por canal:  fuente → nivel musical × expresión → HPF → EQ (6) → LPF → compresor
 *              ├─ escucha (PFL, antes del mute) → bus de escucha
 *              └─ mute → [envíos PRE a monitores] → fader → pan → medidor
 *                                                       ├─ sala (si toMain) → master
 *                                                       ├─ envíos POST a monitores
 *                                                       └─ envíos POST a reverb y delay
 * El click (y las guías) nunca llegan a la sala, a los efectos ni a la grabación principal:
 * esas conexiones no existen en el grafo para ese canal.
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
  cue: GainNode;
  mute: GainNode;
  fader: GainNode;
  pan: StereoPannerNode;
  an: AnalyserNode;
  main: GainNode;
  rev: GainNode;
  dly: GainNode;
  pre: Map<string, GainNode>;
  post: Map<string, GainNode>;
}

interface BusNodes {
  input: GainNode;
  out: GainNode;
  an: AnalyserNode;
  port: GainNode;
}

export interface EngineInfo {
  bpm: number;
  key: number;
  ts: TimeSig;
  rhodes: boolean;
  drawbars: number[];
  style: Style;
  arr: Section[];
  kinds: Record<string, SectionKind>;
  mode: PlayMode;
  end: EndAction;
  src: Record<'pad' | 'drums', SrcMode>;
  stemsOnly: boolean;
}

export interface ApplyInput {
  mix: SceneMix;
  fx: Fx;
  master: number;
  masterMute: boolean;
  buses: Bus[];
  outputs: Outputs;
}

export interface Position {
  sec: number;
  bar: number;
  beat: number;
  beats: number;
  songBar: number;
  pending: number | null;
}

const mtof = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const lin = faderGain;
const DRAW_H = [0.5, 1.5, 1, 2, 3, 4, 5, 6, 8];
const PROG: [number, boolean][] = [[0, false], [7, false], [9, true], [5, false]]; // I V vi IV
const LATIN: Style[] = ['salsa', 'tumbao', 'merengue', 'samba'];
const EXPR_CH: ChId[] = ['pad', 'strings', 'organ', 'voz', 'brass'];
const DIV: Record<Fx['delayDiv'], number> = { '1/4': 1, '1/8': 0.5, '1/8.': 0.75, '1/4.': 1.5, '1/2': 2 };
const MAX_SAMPLER_VOICES = 32;

/** Compás: semicorcheas por compás, duración de cada una y dónde caen los pulsos. */
export function meter(ts: TimeSig, bpm: number) {
  const [num, den] = ts.split('/').map(Number);
  const compound = den === 8 && num % 3 === 0;
  const steps = den === 4 ? num * 4 : num * 2;
  // En 6/8, 9/8 y 12/8 el BPM es la negra con puntillo; en los demás, la negra.
  const step = compound ? 60 / bpm / 6 : 60 / bpm / 4;
  let beats: number[];
  if (den === 4) beats = Array.from({ length: num }, (_, i) => i * 4);
  else if (compound) beats = Array.from({ length: num / 3 }, (_, i) => i * 6);
  else beats = num === 7 ? [0, 4, 8] : num === 5 ? [0, 6] : Array.from({ length: Math.ceil(num / 2) }, (_, i) => i * 4).filter((x) => x < steps);
  return { steps, step, beats, bar: steps * step, simple44: ts === '4/4' };
}

class Engine {
  ctx: AudioContext | null = null;
  /** En un cliente remoto el motor no suena: el audio lo produce solo el equipo anfitrión. */
  disabled = false;
  info: EngineInfo = { bpm: 68, key: 9, ts: '4/4', rhodes: false, drawbars: [8, 8, 6, 0, 0, 0, 0, 0, 0], style: 'worship', arr: [{ scene: 'verso', bars: 8 }], kinds: { verso: 'verso' }, mode: 'follow', end: 'stop', src: { pad: 'synth', drums: 'synth' }, stemsOnly: false };
  playing = false;
  onState: (() => void) | null = null;
  onSection: ((sec: number) => void) | null = null;
  onEnd: ((a: EndAction) => void) | null = null;
  onDevices: (() => void) | null = null;

  private ch = {} as Record<ChId, ChanNodes>;
  private buses = new Map<string, BusNodes>();
  private masterIn!: GainNode;
  private bright!: BiquadFilterNode;
  private masterGain!: GainNode;
  private limiter!: DynamicsCompressorNode;
  private mainPort!: GainNode;
  private cueIn!: GainNode;
  private cuePort!: GainNode;
  private cueAn!: AnalyserNode;
  private anL!: AnalyserNode;
  private anR!: AnalyserNode;
  private revIn!: GainNode;
  private revPre!: DelayNode;
  private revDamp!: BiquadFilterNode;
  private conv!: ConvolverNode;
  private revOut!: GainNode;
  private revSize = 0;
  private dlyIn!: GainNode;
  private dlyNode!: DelayNode;
  private dlyFb!: GainNode;
  private dlyTone!: BiquadFilterNode;
  private dlyOut!: GainNode;
  private rotLfo!: OscillatorNode;
  private rotDepth!: GainNode;
  private noise!: AudioBuffer;
  private fxBus!: GainNode;
  private merger: ChannelMergerNode | null = null;
  private recDest: MediaStreamAudioDestinationNode | null = null;
  private recFrom: AudioNode | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private voices = new Set<Handle>();
  private liveNotes = new Set<Set<Handle>>();
  private samplerVoices: Handle[] = [];
  private timer = 0;
  private step = 0;
  private nextTime = 0;
  private sec = 0;
  private barInSec = 0;
  private songBar = 0;
  private pending: number | null = null;
  private stopAt: number | null = null;
  private bars: { t: number; sec: number; bar: number; songBar: number }[] = [];
  private files: Partial<Record<ChId, { buf: AudioBuffer; src: AudioBufferSourceNode | null; offset: number; start: number }>> = {};
  private stems: Stem[] = [];
  private stemBufs = new Map<string, AudioBuffer>();
  private stemNodes = new Map<string, { src: AudioBufferSourceNode; gain: GainNode }>();
  private sampleBufs = new Map<string, AudioBuffer>();
  private sampler: SamplerCfg = { zones: [], attack: 0.005, release: 0.35 };
  private drone: Handle[] = [];
  private last: ApplyInput | null = null;
  private lastOutputs = '';
  private streams = new Map<string, { src: MediaStreamAudioSourceNode; split: ChannelSplitterNode; mono: GainNode; channels: number; settings: MediaTrackSettings }>();
  private inNodes = {} as Record<InId, { trim: GainNode; pol: GainNode; an: AnalyserNode; from: AudioNode | null }>;
  private pendingInputs: Partial<Record<InId, InputCfg>> = {};
  private peaks = new Map<string, { v: number; pk: number; t: number }>();

  ensure(): AudioContext | null {
    if (this.disabled) return null;
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
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = -3;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    this.mainPort = c.createGain();
    this.masterIn.connect(this.bright).connect(this.masterGain).connect(this.limiter).connect(this.mainPort);
    const split = c.createChannelSplitter(2);
    this.limiter.connect(split);
    this.anL = c.createAnalyser();
    this.anR = c.createAnalyser();
    this.anL.fftSize = this.anR.fftSize = 1024;
    split.connect(this.anL, 0);
    split.connect(this.anR, 1);
    this.recDest = c.createMediaStreamDestination();
    this.limiter.connect(this.recDest);
    this.recFrom = this.limiter;

    this.cueIn = c.createGain();
    this.cueAn = c.createAnalyser();
    this.cueAn.fftSize = 1024;
    this.cuePort = c.createGain();
    this.cueIn.connect(this.cueAn);
    this.cueIn.connect(this.cuePort);

    this.revIn = c.createGain();
    this.revPre = c.createDelay(0.5);
    this.revDamp = c.createBiquadFilter();
    this.revDamp.type = 'lowpass';
    this.conv = c.createConvolver();
    this.revOut = c.createGain();
    this.revIn.connect(this.revPre).connect(this.revDamp).connect(this.conv).connect(this.revOut).connect(this.masterIn);
    this.setReverbSize(2.8);

    this.dlyIn = c.createGain();
    this.dlyNode = c.createDelay(4);
    this.dlyFb = c.createGain();
    this.dlyTone = c.createBiquadFilter();
    this.dlyTone.type = 'lowpass';
    this.dlyOut = c.createGain();
    this.dlyIn.connect(this.dlyNode).connect(this.dlyTone).connect(this.dlyOut).connect(this.masterIn);
    this.dlyTone.connect(this.dlyFb).connect(this.dlyNode);

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
      const cue = c.createGain();
      cue.gain.value = 0;
      const mute = c.createGain();
      const fader = c.createGain();
      const pan = c.createStereoPanner();
      const an = c.createAnalyser();
      an.fftSize = 2048;
      an.smoothingTimeConstant = 0.82;
      const main = c.createGain();
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
      node.connect(lpf).connect(comp);
      comp.connect(cue).connect(this.cueIn);
      comp.connect(mute).connect(fader).connect(pan);
      pan.connect(an);
      pan.connect(main);
      if (!MONITOR_ONLY.includes(id)) {
        main.connect(this.masterIn);
        pan.connect(rev).connect(this.revIn);
        pan.connect(dly).connect(this.dlyIn);
      }
      this.ch[id] = { dest, input, hpf, eq, lpf, comp, cue, mute, fader, pan, an, main, rev, dly, pre: new Map(), post: new Map() };
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

  private setReverbSize(sec: number) {
    if (!this.ctx || Math.abs(sec - this.revSize) < 0.05) return;
    this.revSize = sec;
    this.conv.buffer = impulse(this.ctx, sec, 2.6);
  }

  private syncBuses(buses: Bus[]) {
    const c = this.ctx!;
    for (const b of buses) {
      if (this.buses.has(b.id)) continue;
      const input = c.createGain();
      const out = c.createGain();
      const an = c.createAnalyser();
      an.fftSize = 1024;
      const port = c.createGain();
      input.connect(out);
      out.connect(port);
      out.connect(an);
      this.buses.set(b.id, { input, out, an, port });
      for (const id of CH_IDS) {
        const n = this.ch[id];
        const pre = c.createGain();
        const post = c.createGain();
        pre.gain.value = post.gain.value = 0;
        n.mute.connect(pre).connect(input);
        n.pan.connect(post).connect(input);
        n.pre.set(b.id, pre);
        n.post.set(b.id, post);
      }
      this.lastOutputs = '';
    }
    for (const [id, bn] of [...this.buses]) {
      if (buses.some((b) => b.id === id)) continue;
      for (const ch of CH_IDS) {
        this.ch[ch].pre.get(id)?.disconnect();
        this.ch[ch].post.get(id)?.disconnect();
        this.ch[ch].pre.delete(id);
        this.ch[ch].post.delete(id);
      }
      bn.port.disconnect();
      bn.out.disconnect();
      this.buses.delete(id);
      this.lastOutputs = '';
    }
  }

  apply(a: ApplyInput) {
    this.last = a;
    const c = this.ctx;
    if (!c) return;
    this.syncBuses(a.buses);
    const t = c.currentTime;
    const set = (p: AudioParam, v: number, tc = 0.03) => p.setTargetAtTime(v, t, tc);
    const { mix, fx } = a;
    const anySolo = Object.values(mix.chans).some((x) => x.solo);
    const expr = 0.35 + 0.65 * mix.macros.expression;
    for (const id of CH_IDS) {
      const s: Chan = mix.chans[id];
      const n = this.ch[id];
      // Nivel musical (director) × expresión; se aplica antes del procesamiento y del fader de consola.
      let g = 1;
      if (isMusical(id)) {
        const m = mix.music[id];
        g = m && m.on ? lin(m.db) : 0;
        if (this.info.stemsOnly && INST_IDS.includes(id)) g = 0;
        if (EXPR_CH.includes(id)) g *= expr;
      }
      set(n.input.gain, g);
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
      const makeup = s.comp.on ? dbToLin(s.comp.makeup) : 1;
      set(n.cue.gain, s.solo ? makeup : 0, 0.02);
      set(n.mute.gain, s.mute ? 0 : makeup, 0.02);
      set(n.fader.gain, lin(s.fader), 0.05);
      set(n.pan.pan, s.pan / 100);
      const monOnly = MONITOR_ONLY.includes(id);
      set(n.main.gain, !monOnly && s.toMain ? 1 : 0);
      set(n.rev.gain, monOnly ? 0 : lin(s.sendRev));
      set(n.dly.gain, monOnly ? 0 : lin(s.sendDly));
      for (const b of a.buses) {
        const snd = s.aux[b.id] ?? { db: -90, pre: true };
        set(n.pre.get(b.id)!.gain, snd.pre ? lin(snd.db) : 0);
        set(n.post.get(b.id)!.gain, snd.pre ? 0 : lin(snd.db));
      }
    }
    for (const b of a.buses) set(this.buses.get(b.id)!.out.gain, b.mute ? 0 : lin(b.level), 0.05);
    set(this.bright.gain, -6 + mix.macros.brightness * 14);
    set(this.revIn.gain, fx.reverbOn ? lin(fx.reverbSend) * 4 : 0);
    set(this.revOut.gain, fx.reverbWet * 2.2 * (0.4 + 1.2 * mix.macros.ambience));
    set(this.revPre.delayTime, fx.reverbPre / 1000, 0.05);
    set(this.revDamp.frequency, fx.reverbDamp, 0.05);
    this.setReverbSize(fx.reverbSize);
    set(this.dlyIn.gain, fx.delayOn ? lin(fx.delaySend) * 4 : 0);
    set(this.dlyOut.gain, fx.delayWet * 1.6);
    set(this.dlyFb.gain, Math.min(0.9, fx.delayFb));
    set(this.dlyTone.frequency, fx.delayTone, 0.05);
    set(this.dlyNode.delayTime, Math.min(3.9, (60 / this.info.bpm) * DIV[fx.delayDiv]), 0.1);
    set(this.rotLfo.frequency, fx.rotary === 'fast' ? 6.4 : fx.rotary === 'slow' ? 0.8 : 0.01, 0.6);
    set(this.rotDepth.gain, fx.rotary === 'stop' ? 0 : 0.18, 0.3);
    set(this.masterGain.gain, a.masterMute ? 0 : lin(a.master), 0.05);
    this.routeOutputs(a.outputs, anySolo);
    this.setRecSource(a.outputs.rec);
  }

  /* ---------- Salidas físicas ---------- */

  outputInfo() {
    const c = this.ctx;
    const sinkOk = typeof (AudioContext.prototype as unknown as { setSinkId?: unknown }).setSinkId === 'function';
    return { channels: c ? c.destination.maxChannelCount : 0, sinkSupported: sinkOk };
  }

  async setSink(deviceId: string) {
    const c = this.ensure() as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (!c?.setSinkId) throw new Error('unsupported');
    await c.setSinkId(deviceId);
    this.lastOutputs = '';
    if (this.last) this.routeOutputs(this.last.outputs, Object.values(this.last.mix.chans).some((x) => x.solo));
    this.onDevices?.();
  }

  /** Conecta master, buses y escucha a los pares disponibles. Con un solo par, los monitores quedan sin salida física. */
  private routeOutputs(o: Outputs, anySolo: boolean) {
    const c = this.ctx!;
    const n = Math.min(32, c.destination.maxChannelCount || 2);
    const key = JSON.stringify([n, o.main, o.cue, o.buses, o.cueReplacesMain && anySolo, [...this.buses.keys()]]);
    if (key === this.lastOutputs) return;
    this.lastOutputs = key;
    this.mainPort.disconnect();
    this.cuePort.disconnect();
    this.buses.forEach((b) => b.port.disconnect());
    this.merger?.disconnect();
    this.merger = null;
    if (n >= 4) {
      c.destination.channelCount = n;
      c.destination.channelCountMode = 'explicit';
      c.destination.channelInterpretation = 'discrete';
      const m = c.createChannelMerger(n);
      const pairs = n / 2;
      const route = (port: GainNode, pair: number) => {
        if (pair < 0 || pair >= pairs) return;
        const sp = c.createChannelSplitter(2);
        port.connect(sp);
        sp.connect(m, 0, pair * 2);
        sp.connect(m, 1, pair * 2 + 1);
      };
      route(this.mainPort, o.main);
      route(this.cuePort, o.cue);
      this.buses.forEach((b, id) => route(b.port, o.buses[id] ?? -1));
      m.connect(c.destination);
      this.merger = m;
    } else {
      c.destination.channelCount = 2;
      c.destination.channelInterpretation = 'speakers';
      // Con un solo par, la escucha reemplaza la salida únicamente si el usuario lo eligió (ensayo).
      if (o.cueReplacesMain && anySolo) this.cuePort.connect(c.destination);
      else this.mainPort.connect(c.destination);
    }
  }

  private setRecSource(src: Outputs['rec']) {
    if (!this.recDest) return;
    const from = src === 'main' ? this.limiter : this.buses.get(src)?.out ?? this.limiter;
    if (from === this.recFrom) return;
    try {
      this.recFrom?.disconnect(this.recDest);
    } catch {
      /* ya desconectado */
    }
    from.connect(this.recDest);
    this.recFrom = from;
  }

  /* ---------- Entradas reales ---------- */

  async inputDevices(ask: boolean): Promise<MediaDeviceInfo[]> {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
    if (ask) {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      st.getTracks().forEach((t) => t.stop());
    }
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'audioinput');
  }

  async outputDevices(): Promise<MediaDeviceInfo[]> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      return all.filter((d) => d.kind === 'audiooutput');
    } catch {
      return [];
    }
  }

  /** Canales efectivos y ajustes que el navegador respetó para un dispositivo abierto. */
  inputCaps(device: string) {
    const s = this.streams.get(device);
    return s ? { channels: s.channels, settings: s.settings } : null;
  }

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
      const track = stream.getAudioTracks()[0];
      const settings = track.getSettings();
      const src = this.ctx.createMediaStreamSource(stream);
      const split = this.ctx.createChannelSplitter(2);
      const mono = this.ctx.createGain();
      mono.channelCount = 1;
      mono.channelCountMode = 'explicit';
      mono.channelInterpretation = 'speakers';
      src.connect(split);
      src.connect(mono);
      s = { src, split, mono, channels: settings.channelCount ?? 1, settings };
      this.streams.set(cfg.device, s);
      const dev = cfg.device;
      track.addEventListener('ended', () => {
        this.streams.delete(dev);
        this.onDevices?.();
      });
    }
    // Con un stream mono, izquierdo y derecho serían la misma señal: se usa la suma.
    const side = s.channels < 2 ? 'mix' : cfg.side;
    if (side === 'mix') s.mono.connect(n.trim);
    else s.split.connect(n.trim, side === 'L' ? 0 : 1);
    n.from = side === 'mix' ? s.mono : s.split;
  }

  /* ---------- Voces ---------- */

  private voice(id: ChId, midi: number, t: number, vel = 0.8, dur?: number, to?: AudioNode): Handle | null {
    const c = this.ctx;
    if (!c) return null;
    if (id === 'sampler') return this.samplerVoice(midi, t, vel, dur);
    const f = mtof(midi);
    const g = c.createGain();
    g.gain.value = 0;
    g.connect(to ?? this.ch[id].dest);
    const oscs: OscillatorNode[] = [];
    const osc = (type: OscillatorType, freq: number, gain: number, dst: AudioNode = g, detune = 0) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const og = c.createGain();
      og.gain.value = gain;
      o.connect(og).connect(dst);
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
      case 'brass': {
        // Metales: dientes de sierra con un filtro que se abre en el ataque.
        const lp = lowpass(800, 1.4);
        lp.frequency.setValueAtTime(500, t);
        lp.frequency.linearRampToValueAtTime(Math.min(9000, f * 8 + 1800 * vel), t + 0.06);
        lp.frequency.setTargetAtTime(f * 4 + 900, t + 0.08, 0.35);
        [-6, 0, 7].forEach((d) => osc('sawtooth', f, 0.3, lp, d));
        osc('square', f / 2, 0.08, lp);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.16 * vel, t + 0.05);
        g.gain.setTargetAtTime(0.12 * vel, t + 0.06, 0.2);
        rel = 0.22;
        natural = 20;
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

  /* ---------- Sampler ---------- */

  setSampler(cfg: SamplerCfg) {
    this.sampler = cfg;
  }

  async loadSample(asset: string, data: ArrayBuffer): Promise<AudioBuffer> {
    const c = this.ensure();
    if (!c) throw new Error('sin-motor');
    const buf = await c.decodeAudioData(data.slice(0));
    this.sampleBufs.set(asset, buf);
    return buf;
  }

  hasSample(asset: string) {
    return this.sampleBufs.has(asset);
  }

  private samplerVoice(midi: number, t: number, vel: number, dur?: number): Handle | null {
    const c = this.ctx!;
    const v127 = Math.round(vel * 127);
    const zone = this.sampler.zones.find((z) => midi >= z.lo && midi <= z.hi && v127 >= z.velLo && v127 <= z.velHi && this.sampleBufs.has(z.asset));
    if (!zone) return null;
    this.samplerVoices = this.samplerVoices.filter((h) => h.end > c.currentTime);
    if (this.samplerVoices.length >= MAX_SAMPLER_VOICES) this.samplerVoices.shift()?.release();
    const src = c.createBufferSource();
    src.buffer = this.sampleBufs.get(zone.asset)!;
    src.playbackRate.value = Math.pow(2, (midi - zone.root) / 12);
    src.loop = zone.loop;
    const g = c.createGain();
    const peak = dbToLin(zone.gain) * (0.25 + 0.75 * vel);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + Math.max(0.002, this.sampler.attack));
    src.connect(g).connect(this.ch.sampler.dest);
    src.start(t);
    const rel = Math.max(0.02, this.sampler.release);
    const natural = zone.loop ? 60 : src.buffer.duration / src.playbackRate.value;
    const h: Handle = {
      end: t + natural,
      release: (when) => {
        const w = Math.max(when ?? c.currentTime, c.currentTime);
        if (w >= h.end) return;
        g.gain.cancelScheduledValues(w);
        g.gain.setTargetAtTime(0, w, rel / 3);
        h.end = w + rel * 2.5;
        try {
          src.stop(h.end + 0.05);
        } catch {
          /* ya detenido */
        }
      },
    };
    if (!zone.loop) src.stop(t + natural + 0.05);
    if (dur !== undefined) h.release(t + dur);
    this.samplerVoices.push(h);
    this.voices.add(h);
    return h;
  }

  /* ---------- Batería y percusión sintetizadas ---------- */

  hit(name: Hit, when?: number, vel = 1, direct = false) {
    const c = this.ensure();
    if (!c) return;
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
      case 'cowbell': [540, 810].forEach((fq) => tone('square', fq, fq, 0.01, 0.28, 0.12)); break;
      case 'guira': noise('highpass', 6500, 0.9, 0.05, 0.4); break;
      case 'shaker': noise('bandpass', 7000, 1.2, 0.06, 0.32); break;
      case 'clave': tone('sine', 2500, 2400, 0.01, 0.06, 0.55); break;
      case 'tambora': tone('sine', 130, 105, 0.08, 0.26, 0.85); noise('bandpass', 1600, 1, 0.03, 0.3); break;
      case 'surdo': tone('sine', 78, 60, 0.12, 0.6, 0.95); break;
      case 'tamborim': tone('sine', 760, 700, 0.02, 0.07, 0.4); noise('bandpass', 4200, 1.4, 0.03, 0.3); break;
    }
  }

  swell() {
    const c = this.ensure();
    if (!c) return;
    const t = c.currentTime + 0.01;
    const dur = meter(this.info.ts, this.info.bpm).bar * 2;
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

  impact() {
    const c = this.ensure();
    if (!c) return;
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

  setDrone(on: boolean) {
    const c = this.ensure();
    if (!c) return;
    this.drone.forEach((h) => h.release());
    this.drone = [];
    if (!on) return;
    const r = 48 + this.info.key;
    this.drone = [r - 12, r, r + 7, r + 12].map((n) => this.voice('pad', n, c.currentTime + 0.01, 0.8, undefined, this.fxBus)!).filter(Boolean);
    this.drone.forEach((h) => this.voices.delete(h));
  }

  /** Nota en vivo: devuelve la función que la suelta; la voz queda ligada a quien la creó. */
  noteOn(ids: ChId[], midi: number, vel = 0.85): () => void {
    const c = this.ensure();
    if (!c) return () => undefined;
    const t = c.currentTime + 0.005;
    const hs = ids.map((id) => this.voice(id, id === 'bajo' ? midi - 12 : midi, t, vel)).filter(Boolean) as Handle[];
    hs.forEach((h) => this.voices.delete(h));
    const live = new Set(hs);
    this.liveNotes.add(live);
    return () => {
      hs.forEach((h) => h.release());
      this.liveNotes.delete(live);
    };
  }

  /* ---------- Transporte, secciones y secuenciador ---------- */

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
    if (!c || this.playing) return;
    this.playing = true;
    this.stopAt = null;
    this.bars = [];
    this.step = 0;
    this.nextTime = c.currentTime + 0.1;
    this.timer = window.setInterval(() => this.tick(), 25);
    this.startFiles();
    this.onState?.();
  }

  pause() {
    if (!this.playing) return;
    this.playing = false;
    window.clearInterval(this.timer);
    for (const id of Object.keys(this.files) as ChId[]) this.stopFile(id, true);
    this.stopStems();
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

  /** Panic: suelta todas las voces musicales y el fondo. No silencia micrófonos ni la sala. */
  panic() {
    this.releaseAll(0);
    this.liveNotes.forEach((set) => set.forEach((h) => h.release(0)));
    this.liveNotes.clear();
    this.drone.forEach((h) => h.release(0));
    this.drone = [];
  }

  position(): Position {
    const m = meter(this.info.ts, this.info.bpm);
    const base = { sec: this.sec, bar: this.barInSec, beat: 0, beats: m.beats.length, songBar: this.songBar, pending: this.pending };
    if (!this.ctx || !this.playing) return base;
    const now = this.ctx.currentTime;
    let cur = this.bars[0];
    for (const b of this.bars) if (b.t <= now) cur = b;
    if (!cur) return base;
    const stepIn = Math.max(0, Math.floor((now - cur.t) / m.step));
    let beat = 0;
    m.beats.forEach((b, i) => {
      if (stepIn >= b) beat = i;
    });
    return { sec: cur.sec, bar: cur.bar, beat, beats: m.beats.length, songBar: cur.songBar, pending: this.pending };
  }

  private releaseAll(after: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + after;
    this.voices.forEach((v) => v.release(t));
    this.voices.clear();
  }

  private tick() {
    const c = this.ctx!;
    const m = meter(this.info.ts, this.info.bpm);
    while (this.nextTime < c.currentTime + 0.12) {
      if (this.stopAt !== null) break;
      const p = this.step % m.steps;
      if (p === 0) this.barStart(this.nextTime, m.bar);
      if (this.stopAt !== null) break;
      this.schedule(p, this.nextTime, m);
      this.nextTime += m.step;
      this.step++;
    }
    const now = c.currentTime;
    this.voices.forEach((v) => v.end < now && this.voices.delete(v));
    this.bars = this.bars.filter((b, i, arr) => i >= arr.length - 4 || b.t > now - 8);
  }

  private barStart(t: number, barDur: number) {
    const arr = this.info.arr;
    if (!arr.length) return;
    let changed = false;
    let restartStems = this.step === 0;
    if (this.step > 0) {
      this.barInSec++;
      this.songBar++;
      if (this.pending !== null) {
        this.sec = Math.min(this.pending, arr.length - 1);
        this.barInSec = 0;
        this.pending = null;
        changed = restartStems = true;
      } else if (this.barInSec >= arr[this.sec].bars) {
        this.barInSec = 0;
        if (this.info.mode === 'follow') {
          this.sec++;
          changed = true;
          if (this.sec >= arr.length) {
            const end = this.info.end;
            this.sec = 0;
            restartStems = true;
            const delay = Math.max(0, (t - this.ctx!.currentTime) * 1000);
            if (end === 'stop') {
              this.stopAt = t;
              window.setTimeout(() => {
                this.stop();
                this.onEnd?.('stop');
              }, delay);
              return;
            }
            window.setTimeout(() => this.onEnd?.(end), delay);
          }
        } else {
          changed = restartStems = true; // repetir sección: las pistas vuelven al inicio de la sección
        }
      }
    } else changed = true;
    if (changed) {
      this.songBar = arr.slice(0, this.sec).reduce((a, x) => a + x.bars, 0) + this.barInSec;
      const sec = this.sec;
      const delay = Math.max(0, (t - this.ctx!.currentTime) * 1000);
      window.setTimeout(() => this.onSection?.(sec), delay);
      const kind = this.info.kinds[arr[sec].scene] ?? 'verso';
      if (kind !== 'intro' && !LATIN.includes(this.info.style) && this.step > 0) this.hit('crash', t, 0.7);
    }
    if (restartStems) this.startStems(t, this.songBar * barDur);
    this.bars.push({ t, sec: this.sec, bar: this.barInSec, songBar: this.songBar });
  }

  private schedule(p: number, t: number, m: ReturnType<typeof meter>) {
    const S = m.step;
    const arr = this.info.arr;
    const section = arr[this.sec] ?? arr[0];
    const kind = this.info.kinds[section.scene] ?? 'verso';
    const K = kind === 'intro' || kind === 'interludio' ? 'intro' : kind === 'puente' ? 'puente' : kind === 'verso' || kind === 'precoro' || kind === 'otro' ? 'verso' : 'coro';
    const style = this.info.style;
    const groove = GROOVES[style];
    const [deg, minor] = PROG[this.barInSec % 4];
    const [ndeg] = PROG[(this.barInSec + 1) % 4];
    const r = 48 + ((this.info.key + deg) % 12);
    const th = r + (minor ? 3 : 4);
    const fi = r + 7;
    const n = (id: ChId, notes: number[], dur: number, vel = 0.8, spread = 0) => notes.forEach((x, i) => this.voice(id, x, t + i * spread, vel, dur));
    const local = this.barInSec * m.steps + p;
    const latin = LATIN.includes(style);
    const mid = m.beats[Math.floor(m.beats.length / 2)] ?? Math.floor(m.steps / 2);
    const onBeat = m.beats.includes(p);
    const bar = m.steps * S;

    // Piano
    if (m.simple44 && groove.comp && K !== 'intro') {
      if (at(groove.comp, local)) n('piano', [r + 12, th + 12, fi + 12], S * 1.6, 0.7, 0.006);
      if (p === 0 && !latin) n('piano', [r - 12], S * 7, 0.6);
    } else if (K === 'intro') {
      if (p === 0) n('piano', [r + 12, th + 12, fi + 12], bar * 0.95, 0.55, 0.03);
      if (p === mid && mid > 0) n('piano', [fi + 24], bar * 0.4, 0.45);
    } else if (K === 'verso') {
      if (p % 2 === 0) {
        const arp = [r, fi, r + 12, th + 12, r + 12, fi];
        n('piano', [arp[(p / 2) % arp.length]], S * 3.6, 0.6);
      }
      if (p === 0) n('piano', [r - 12], bar * 0.9, 0.6);
    } else if (K === 'puente') {
      if (p === 0) n('piano', [th + 12, fi + 12, r + 24], bar * 0.48, 0.6, 0.02);
      if (p === mid && mid > 0) n('piano', [fi + 12, r + 24], bar * 0.35, 0.5, 0.02);
    } else if (onBeat) {
      n('piano', [r + 12, th + 12, fi + 12].concat(kind === 'final' || kind === 'tag' ? [r + 24] : []), S * 3.4, p === 0 ? 0.85 : 0.68, 0.008);
      if (p === 0 || p === mid) n('piano', [r - 12], S * 7, 0.75);
    }
    // Acordes largos por compás
    if (p === 0) {
      if (this.info.src.pad === 'synth' || !this.files.pad) n('pad', [r, fi, r + 12, th + 12], bar * 1.01, 0.8);
      n('organ', [r - 12, r, fi, th + 12], bar * 0.99, 0.8);
      n('strings', [fi, r + 12, th + 12, fi + 12], bar * 1.01, 0.8);
      n('brass', K === 'coro' ? [r + 12, th + 12, fi + 12] : [th + 12, fi + 12], K === 'coro' ? S * 3 : bar * 0.48, 0.8, 0.01);
      n('voz', [th + 12], bar * 0.49, 0.8);
    }
    if (p === mid && mid > 0) {
      n('voz', [fi + 12], bar * 0.49, 0.8);
      if (K === 'coro') n('brass', [r + 12, th + 12, fi + 12], S * 3, 0.7, 0.01);
    }
    // Guitarra
    if (m.simple44 && latin && groove.comp) {
      if (at(groove.comp, local + 2)) n('guitarra', [r + 12, fi + 12, th + 24], S * 1.2, 0.55, 0.008);
    } else if (p % 2 === 0 && (m.simple44 ? [0, 4, 6, 10, 12].includes(p) : true)) {
      n('guitarra', p % 4 ? [fi + 12, th + 12, r + 12] : [r, fi, r + 12, th + 12], S * 3.2, p === 0 ? 0.9 : 0.6, 0.012);
    }
    // Bajo
    const root = 36 + ((this.info.key + deg) % 12);
    const next = 36 + ((this.info.key + ndeg) % 12);
    if (m.simple44) {
      const b = groove.bass[local % groove.bass.length];
      if (b && b !== '.') {
        const note = b === 'R' ? root : b === '5' ? root + 7 : b === '8' ? root + 12 : b === '3' ? root + (minor ? 3 : 4) : b === 'a' ? next : root;
        const len = groove.bass.slice((local % groove.bass.length) + 1).search(/[^.]/);
        this.voice('bajo', note, t, 0.85, S * Math.max(1, Math.min(8, len < 0 ? 4 : len + 1)) * 0.9);
      }
    } else if (p === 0) this.voice('bajo', root, t, 0.85, S * Math.max(2, mid || m.steps) * 0.9);
    else if (p === mid) this.voice('bajo', root + 7, t, 0.75, S * Math.max(2, m.steps - mid) * 0.9);
    // Batería
    if (this.info.src.drums === 'synth' || !this.files.drums) {
      const fillBar = groove.fills && this.barInSec === section.bars - 1 && K !== 'intro';
      if (m.simple44) {
        if (fillBar && p >= 12) this.hit(p % 2 ? 'snare' : p === 12 ? 'tomH' : 'tomL', t, 0.75);
        else for (const [hit, pat] of Object.entries(groove.drums) as [Hit, string][]) {
          const v = at(pat, local);
          if (v) this.hit(hit, t, v === 'x' ? 1 : 0.55);
        }
      } else if (K !== 'intro') {
        // Otros compases: bombo en el primer pulso, caja en el último grupo, platillos a corcheas.
        if (p === 0) this.hit('kick', t, 1);
        else if (onBeat) this.hit(m.beats.indexOf(p) === m.beats.length - 1 ? 'snare' : 'kick', t, 0.8);
        if (p % 2 === 0) this.hit('hat', t, p === 0 ? 0.9 : 0.5);
      }
    }
    // Percusión
    if (m.simple44) {
      for (const [hit, pat] of Object.entries(PERC[style]) as [Hit, string][]) {
        const v = at(pat, local);
        if (v) this.hit(hit, t, v === 'x' ? 1 : 0.5);
      }
    } else if (p % 2 === 0) this.hit('shaker', t, onBeat ? 0.8 : 0.45);
    // Click en cada pulso, con acento en el primero (solo monitores)
    if (onBeat) this.voice('click', p === 0 ? 96 : 84, t, p === 0 ? 1 : 0.7);
  }

  /* ---------- Archivos sueltos por canal ---------- */

  async loadFile(id: ChId, data: ArrayBuffer): Promise<number> {
    const c = this.ensure();
    if (!c) throw new Error('sin-motor');
    const buf = await c.decodeAudioData(data.slice(0));
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

  private startFiles() {
    for (const id of Object.keys(this.files) as ChId[]) if (id === 'tracks' || this.info.src[id as 'pad' | 'drums'] === 'file') this.startFile(id);
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

  /* ---------- Multitrack: stems alineados al reloj de audio ---------- */

  setStems(stems: Stem[]) {
    this.stems = stems;
    const c = this.ctx;
    if (!c) return;
    for (const st of stems) {
      const nd = this.stemNodes.get(st.id);
      if (nd) nd.gain.gain.setTargetAtTime(st.mute ? 0 : lin(st.db), c.currentTime, 0.03);
    }
  }

  async loadStem(asset: string, data: ArrayBuffer): Promise<number> {
    const c = this.ensure();
    if (!c) throw new Error('sin-motor');
    const buf = await c.decodeAudioData(data.slice(0));
    this.stemBufs.set(asset, buf);
    return buf.duration;
  }

  stemReady(asset: string) {
    return this.stemBufs.has(asset);
  }

  /** Arranca todos los stems en el mismo instante `t` del reloj de audio, en la posición `pos` (segundos desde el compás 1). */
  private startStems(t: number, pos: number) {
    const c = this.ctx!;
    this.stopStems(t);
    for (const st of this.stems) {
      const buf = this.stemBufs.get(st.asset);
      if (!buf) continue;
      const local = pos - st.offset;
      if (local >= buf.duration) continue; // stem más corto: ya terminó
      const src = c.createBufferSource();
      src.buffer = buf;
      const gain = c.createGain();
      gain.gain.value = st.mute ? 0 : lin(st.db);
      // Click y guía entran por el canal de click: nunca llegan a la sala.
      src.connect(gain).connect(this.ch[st.cat === 'click' || st.cat === 'guia' ? 'click' : 'tracks'].dest);
      if (local >= 0) src.start(t, local);
      else src.start(t - local, 0);
      this.stemNodes.set(st.id, { src, gain });
    }
  }

  private stopStems(at?: number) {
    this.stemNodes.forEach(({ src }) => {
      try {
        src.stop(at);
      } catch {
        /* ya detenido */
      }
    });
    this.stemNodes.clear();
  }

  /* ---------- Grabación ---------- */

  startRec(): { ext: string; mime: string } {
    this.ensure();
    if (!this.recDest || typeof MediaRecorder === 'undefined') throw new Error('unsupported');
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    const mime = types.find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
    this.chunks = [];
    this.recorder = new MediaRecorder(this.recDest.stream, mime ? { mimeType: mime, audioBitsPerSecond: 192000 } : undefined);
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start(500);
    const real = this.recorder.mimeType || mime;
    return { ext: real.includes('mp4') ? 'm4a' : real.includes('ogg') ? 'ogg' : 'webm', mime: real };
  }

  stopRec(): Promise<Blob> {
    return new Promise((resolve) => {
      const r = this.recorder;
      if (!r) return resolve(new Blob());
      r.onstop = () => resolve(new Blob(this.chunks, { type: r.mimeType || 'audio/webm' }));
      r.stop();
      this.recorder = null;
    });
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
    const pub = (key: string, an: AnalyserNode) => {
      const m = smooth(key, peakOf(an));
      meterBus.publish(key, { l: m.v, r: m.v, pl: m.pk, pr: m.pk });
    };
    const loop = () => {
      for (const id of CH_IDS) pub(`live:${id}`, this.ch[id].an);
      for (const id of IN_IDS) pub(`in:${id}`, this.inNodes[id].an);
      this.buses.forEach((b, id) => pub(`bus:${id}`, b.an));
      pub('cue', this.cueAn);
      const l = smooth('mL', peakOf(this.anL));
      const r = smooth('mR', peakOf(this.anR));
      meterBus.publish('live:master', { l: l.v, r: r.v, pl: l.pk, pr: r.pk });
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Niveles actuales (dBFS) para enviar a clientes remotos con frecuencia limitada. */
  levels(): Record<string, number> {
    const o: Record<string, number> = {};
    this.peaks.forEach((v, k) => (o[k] = Math.round(v.v)));
    return o;
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
