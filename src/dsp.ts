import type { Channel, Comp } from './types';

const FS = 48000;

type Kind = 'peak' | 'lowshelf' | 'highshelf' | 'highpass';

// Coeficientes RBJ (Audio EQ Cookbook) y magnitud en dB.
function magDb(kind: Kind, f0: number, gainDb: number, q: number, f: number): number {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * f0) / FS;
  const cos = Math.cos(w0);
  const sin = Math.sin(w0);
  const alpha = sin / (2 * q);
  let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number;
  if (kind === 'peak') {
    b0 = 1 + alpha * A;
    b1 = -2 * cos;
    b2 = 1 - alpha * A;
    a0 = 1 + alpha / A;
    a1 = -2 * cos;
    a2 = 1 - alpha / A;
  } else if (kind === 'lowshelf') {
    const s = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 - (A - 1) * cos + s);
    b1 = 2 * A * (A - 1 - (A + 1) * cos);
    b2 = A * (A + 1 - (A - 1) * cos - s);
    a0 = A + 1 + (A - 1) * cos + s;
    a1 = -2 * (A - 1 + (A + 1) * cos);
    a2 = A + 1 + (A - 1) * cos - s;
  } else if (kind === 'highshelf') {
    const s = 2 * Math.sqrt(A) * alpha;
    b0 = A * (A + 1 + (A - 1) * cos + s);
    b1 = -2 * A * (A - 1 + (A + 1) * cos);
    b2 = A * (A + 1 + (A - 1) * cos - s);
    a0 = A + 1 - (A - 1) * cos + s;
    a1 = 2 * (A - 1 - (A + 1) * cos);
    a2 = A + 1 - (A - 1) * cos - s;
  } else {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = (1 + cos) / 2;
    a0 = 1 + alpha;
    a1 = -2 * cos;
    a2 = 1 - alpha;
  }
  const w = (2 * Math.PI * f) / FS;
  const c1 = Math.cos(w);
  const s1 = Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = Math.sin(2 * w);
  const nr = b0 + b1 * c1 + b2 * c2;
  const ni = -(b1 * s1 + b2 * s2);
  const dr = a0 + a1 * c1 + a2 * c2;
  const di = -(a1 * s1 + a2 * s2);
  return 10 * Math.log10((nr * nr + ni * ni) / (dr * dr + di * di));
}

export const BAND_KINDS: Kind[] = ['lowshelf', 'peak', 'peak', 'highshelf'];

export function bandResponse(ch: Pick<Channel, 'hpf' | 'eqOn' | 'eq'>, f: number, includeHpf = true): number {
  let db = 0;
  if (includeHpf && ch.hpf.on) db += magDb('highpass', ch.hpf.freq, 0, 0.7071, f);
  if (ch.eqOn) {
    ch.eq.forEach((b, i) => {
      if (b.on) db += magDb(BAND_KINDS[i], b.freq, b.gain, b.q, f);
    });
  }
  return db;
}

// Salida del compresor (dB) con rodilla suave de 6 dB, para el gráfico.
export function compOut(c: Comp, inDb: number): number {
  const knee = 6;
  const over = inDb - c.threshold;
  const slope = 1 - 1 / c.ratio;
  let out: number;
  if (2 * over < -knee) out = inDb;
  else if (2 * Math.abs(over) <= knee) out = inDb + (slope * Math.pow(over + knee / 2, 2)) / (2 * knee) * -1;
  else out = c.threshold + over / c.ratio;
  return out + (c.on ? c.makeup : 0);
}
