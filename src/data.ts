import type { Channel, EqBand, FxState, MixId, MixSnapshot, PerMix, Scene } from './types';
import { MIX_IDS } from './types';
import { clone } from './util';

const perMix = <T,>(v: (m: MixId) => T): PerMix<T> => ({ main: v('main'), mon1: v('mon1'), mon2: v('mon2'), mon3: v('mon3') });

const OFF = -90;

interface Seed {
  id: string;
  name: string;
  hue: number;
  gain: number;
  phantom?: boolean;
  hpf: number;
  levels: [number, number, number, number]; // principal, mon1, mon2, mon3
  pan?: number;
  fx?: [number, number];
  eq?: Partial<EqBand>[];
  comp?: { threshold: number; ratio: number; attack: number; release: number; makeup: number; on?: boolean };
}

const SEEDS: Seed[] = [
  { id: 'pastor', name: 'Pastor', hue: 200, gain: 32, hpf: 120, levels: [-6, -8, OFF, OFF], fx: [-30, OFF],
    eq: [{ freq: 120, gain: -3 }, { freq: 350, gain: -2.5, q: 1.4 }, { freq: 3200, gain: 2.5 }, { freq: 9000, gain: 1.5 }],
    comp: { threshold: -22, ratio: 3, attack: 12, release: 180, makeup: 3 } },
  { id: 'voz', name: 'Voz principal', hue: 188, gain: 30, hpf: 100, levels: [-4, -3, -6, -8], fx: [-18, -24],
    eq: [{ freq: 100, gain: -2 }, { freq: 400, gain: -2, q: 1.2 }, { freq: 4000, gain: 3, q: 1.1 }, { freq: 10000, gain: 2.5 }],
    comp: { threshold: -20, ratio: 3.5, attack: 8, release: 150, makeup: 4 } },
  { id: 'coros1', name: 'Coros 1', hue: 172, gain: 28, hpf: 130, levels: [-9, -6, -10, -12], pan: -35, fx: [-14, -26],
    comp: { threshold: -20, ratio: 3, attack: 15, release: 200, makeup: 2 } },
  { id: 'coros2', name: 'Coros 2', hue: 172, gain: 28, hpf: 130, levels: [-9, -6, -10, -12], pan: 35, fx: [-14, -26],
    comp: { threshold: -20, ratio: 3, attack: 15, release: 200, makeup: 2 } },
  { id: 'piano', name: 'Piano', hue: 38, gain: 20, phantom: true, hpf: 60, levels: [-8, -12, -4, OFF], pan: -20, fx: [-22, OFF],
    eq: [{ freq: 90, gain: 0 }, { freq: 500, gain: -1.5 }, { freq: 2500, gain: 1 }, { freq: 8000, gain: 1 }] },
  { id: 'pad', name: 'Pad', hue: 262, gain: 14, hpf: 50, levels: [-14, -16, -6, OFF], pan: 20, fx: [-30, OFF] },
  { id: 'guitarra', name: 'Guitarra', hue: 28, gain: 22, hpf: 90, levels: [-9, -14, -4, -10], pan: 25, fx: [-26, -20],
    comp: { threshold: -18, ratio: 2.5, attack: 20, release: 220, makeup: 2 } },
  { id: 'bajo', name: 'Bajo', hue: 18, gain: 18, hpf: 35, levels: [-8, -18, -6, -4],
    eq: [{ freq: 80, gain: 2 }, { freq: 250, gain: -2 }, { freq: 900, gain: 1.5 }, { freq: 6000, gain: 0 }],
    comp: { threshold: -16, ratio: 4, attack: 25, release: 160, makeup: 3 } },
  { id: 'bateriaL', name: 'Batería L', hue: 350, gain: 24, hpf: 70, levels: [-10, OFF, -8, -2], pan: -60 },
  { id: 'bateriaR', name: 'Batería R', hue: 350, gain: 24, hpf: 70, levels: [-10, OFF, -8, -2], pan: 60 },
  { id: 'tracks', name: 'Tracks', hue: 220, gain: 8, hpf: 20, levels: [-7, -20, -6, -6], comp: { threshold: -10, ratio: 2, attack: 30, release: 250, makeup: 0, on: false } },
  { id: 'click', name: 'Click', hue: 55, gain: 8, hpf: 80, levels: [OFF, OFF, -6, -4] },
];

const BAND_DEFAULTS: EqBand[] = [
  { freq: 100, gain: 0, q: 0.9, on: true },
  { freq: 400, gain: 0, q: 1.0, on: true },
  { freq: 2500, gain: 0, q: 1.0, on: true },
  { freq: 9000, gain: 0, q: 0.9, on: true },
];

function makeChannel(s: Seed): Channel {
  const eq = BAND_DEFAULTS.map((b, i) => ({ ...b, ...(s.eq?.[i] ?? {}) })) as Channel['eq'];
  const isClick = s.id === 'click';
  return {
    id: s.id,
    name: s.name,
    hue: s.hue,
    gain: s.gain,
    phantom: !!s.phantom,
    polarity: false,
    fader: { main: s.levels[0], mon1: s.levels[1], mon2: s.levels[2], mon3: s.levels[3] },
    pan: perMix((m) => (m === 'main' ? s.pan ?? 0 : 0)),
    mute: perMix(() => false),
    // El click solo se dirige a monitores.
    route: perMix((m) => !(isClick && m === 'main')),
    solo: false,
    fx: { rev: s.fx?.[0] ?? OFF, dly: s.fx?.[1] ?? OFF },
    hpf: { freq: s.hpf, on: true },
    eqOn: true,
    eq,
    comp: { on: !!s.comp && s.comp.on !== false, threshold: s.comp?.threshold ?? -20, ratio: s.comp?.ratio ?? 3, attack: s.comp?.attack ?? 15, release: s.comp?.release ?? 200, makeup: s.comp?.makeup ?? 0 },
  };
}

const FX_DEFAULT: FxState = {
  rev: { on: true, time: 1.8, preDelay: 30, damp: 7500, ret: -12 },
  dly: { on: true, time: 416, feedback: 28, tone: 4500, ret: -16 },
};

export function baseSnapshot(): MixSnapshot {
  return {
    channels: SEEDS.map(makeChannel),
    masters: perMix((m) => ({ level: m === 'main' ? 0 : -3, mute: false })),
    fx: clone(FX_DEFAULT),
  };
}

type SceneFn = (s: MixSnapshot) => void;
const ch = (s: MixSnapshot, id: string) => s.channels.find((c) => c.id === id)!;

const SCENE_FNS: Record<string, SceneFn> = {
  ensayo: (s) => {
    s.masters.main.level = -6;
    ch(s, 'pastor').mute.main = true;
    ch(s, 'tracks').fader.main = -14;
    ch(s, 'click').fader.mon1 = -12;
    ch(s, 'click').fader.mon2 = -3;
    ch(s, 'click').fader.mon3 = -1;
  },
  alabanza: () => {},
  adoracion: (s) => {
    ch(s, 'bateriaL').fader.main = -18;
    ch(s, 'bateriaR').fader.main = -18;
    ch(s, 'bajo').fader.main = -12;
    ch(s, 'guitarra').fader.main = -13;
    ch(s, 'pad').fader.main = -8;
    ch(s, 'piano').fader.main = -6;
    ch(s, 'voz').fader.main = -3;
    ch(s, 'voz').fx.rev = -10;
    ch(s, 'tracks').fader.main = -12;
    s.masters.main.level = -2;
  },
  predicacion: (s) => {
    ch(s, 'pastor').fader.main = -2;
    ch(s, 'pastor').fader.mon1 = -4;
    ch(s, 'pastor').fx.rev = -90;
    for (const id of ['voz', 'coros1', 'coros2', 'guitarra', 'bajo', 'bateriaL', 'bateriaR', 'tracks']) ch(s, id).mute.main = true;
    ch(s, 'piano').fader.main = -22;
    ch(s, 'pad').fader.main = -26;
    for (const id of ['coros1', 'coros2', 'guitarra', 'bajo', 'bateriaL', 'bateriaR', 'tracks']) for (const m of MIX_IDS) if (m !== 'main') ch(s, id).mute[m] = true;
  },
};

const SCENE_NAMES: [string, string, string][] = [
  ['ensayo', 'Ensayo', '2025-04-23T19:30:00'],
  ['alabanza', 'Alabanza', '2025-04-27T09:40:00'],
  ['adoracion', 'Adoración', '2025-04-27T09:55:00'],
  ['predicacion', 'Predicación', '2025-04-27T10:20:00'],
];

export function sampleScenes(): Scene[] {
  return SCENE_NAMES.map(([id, name, savedAt]) => {
    const snap = baseSnapshot();
    SCENE_FNS[id](snap);
    return { id, name, savedAt, data: snap };
  });
}
