import type { MixId, MixSnapshot } from './types';
import { FLOOR, clamp } from './util';

// Niveles SIMULADOS. Solo se generan con DEMO activado y no provienen de ningún audio.

export interface Level {
  l: number;
  r: number;
  pl: number;
  pr: number;
}

type Listener = (lv: Level | undefined) => void;

class MeterBus {
  private levels = new Map<string, Level>();
  private subs = new Map<string, Set<Listener>>();

  subscribe(key: string, fn: Listener): () => void {
    let set = this.subs.get(key);
    if (!set) this.subs.set(key, (set = new Set()));
    set.add(fn);
    fn(this.levels.get(key));
    return () => {
      set!.delete(fn);
    };
  }
  publish(key: string, lv: Level) {
    this.levels.set(key, lv);
    this.subs.get(key)?.forEach((fn) => fn(lv));
  }
  get(key: string) {
    return this.levels.get(key);
  }
  clear() {
    this.levels.clear();
    this.subs.forEach((set) => set.forEach((fn) => fn(undefined)));
  }
}

export const meterBus = new MeterBus();

const BPM = 72;
const BEAT = 60 / BPM;
const decayDb = (x: number, k: number) => Math.max(FLOOR, 20 * Math.log10(Math.exp(-x * k) + 1e-6));
const mod = (a: number, b: number) => ((a % b) + b) % b;

// Nivel de la fuente simulada (dBFS, antes del fader).
function source(id: string, t: number): number {
  const n = (Math.random() - 0.5) * 3;
  switch (id) {
    case 'pastor': {
      const talking = Math.sin(t * 0.9) + Math.sin(t * 0.37 + 1) > -0.1;
      return talking ? -17 + Math.abs(Math.sin(t * 8.3)) * 10 - 10 + n : FLOOR;
    }
    case 'voz': {
      const singing = Math.sin(t * 0.5) > -0.55;
      return singing ? -13 + Math.sin(t * 5.2) * 2 + n : FLOOR;
    }
    case 'coros1':
    case 'coros2': {
      const ph = id === 'coros1' ? 0 : 0.7;
      return Math.sin(t * 0.5 + ph) > -0.3 ? -19 + Math.sin(t * 4.1 + ph) * 2 + n : FLOOR;
    }
    case 'piano':
      return -24 + 14 * Math.exp(-mod(t, BEAT * 2) * 2.2) + n * 0.6;
    case 'pad':
      return -25 + Math.sin(t * 0.3) * 3 + n * 0.3;
    case 'guitarra':
      return -22 + 10 * Math.exp(-mod(t, BEAT / 2) * 6) + n * 0.6;
    case 'bajo':
      return -21 + 9 * Math.exp(-mod(t, BEAT) * 3) + n * 0.4;
    case 'bateriaL':
    case 'bateriaR': {
      const kick = -8 + decayDb(mod(t, BEAT), 18);
      const snare = -9 + decayDb(mod(t - BEAT, BEAT * 2), 16);
      const hat = -22 + decayDb(mod(t, BEAT / 2), 30);
      return Math.max(kick, snare, hat) + (id === 'bateriaR' ? n * 0.8 : 0);
    }
    case 'tracks':
      return -19 + Math.sin(t * 0.7) * 2 + n * 0.5;
    case 'click':
      return -12 + decayDb(mod(t, BEAT), 40);
    default:
      return FLOOR;
  }
}

const sumDb = (xs: number[]) => {
  const p = xs.reduce((a, x) => a + (x <= FLOOR ? 0 : Math.pow(10, x / 10)), 0);
  return p <= 1e-9 ? FLOOR : 10 * Math.log10(p);
};

function advance(prev: Level | undefined, l: number, r: number, mono: boolean): Level {
  const p = prev ?? { l: FLOOR, r: FLOOR, pl: FLOOR, pr: FLOOR };
  const fall = (cur: number, next: number) => Math.max(next, cur - 1.4);
  const nl = fall(p.l, l);
  const nr = mono ? nl : fall(p.r, r);
  const peak = (pk: number, v: number) => (v >= pk ? v : pk - 0.45);
  return { l: nl, r: nr, pl: peak(p.pl, nl), pr: mono ? peak(p.pl, nl) : peak(p.pr, nr) };
}

export function startDemo(getState: () => { snap: MixSnapshot; mixId: MixId }): () => void {
  const t0 = performance.now();
  const timer = window.setInterval(() => {
    const t = (performance.now() - t0) / 1000;
    const { snap, mixId } = getState();
    const mixes: MixId[] = mixId === 'main' ? ['main'] : ['main', mixId];
    const feeds: Record<string, { l: number[]; r: number[] }> = {};
    mixes.forEach((m) => (feeds[m] = { l: [], r: [] }));

    for (const ch of snap.channels) {
      const src = source(ch.id, t);
      for (const m of mixes) {
        const live = ch.route[m] && !ch.mute[m] && ch.fader[m] > -89.5 && src > FLOOR;
        const out = live ? src + ch.fader[m] : FLOOR;
        if (m === mixId) meterBus.publish(`ch:${ch.id}`, advance(meterBus.get(`ch:${ch.id}`), out, out, true));
        const a = ((clamp(ch.pan[m], -100, 100) + 100) / 200) * (Math.PI / 2);
        feeds[m].l.push(out + 20 * Math.log10(Math.cos(a) + 1e-6) + 3);
        feeds[m].r.push(out + 20 * Math.log10(Math.sin(a) + 1e-6) + 3);
      }
    }
    for (const m of mixes) {
      const M = snap.masters[m];
      const g = M.mute ? FLOOR : M.level;
      const l = M.mute ? FLOOR : sumDb(feeds[m].l) + g;
      const r = M.mute ? FLOOR : sumDb(feeds[m].r) + g;
      meterBus.publish(`master:${m}`, advance(meterBus.get(`master:${m}`), l, r, false));
    }
  }, 50);
  return () => {
    window.clearInterval(timer);
    meterBus.clear();
  };
}
