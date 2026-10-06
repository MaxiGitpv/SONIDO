/*
 * Picos de forma de onda calculados del archivo decodificado (nunca ondas decorativas).
 * Varios niveles de detalle: cada nivel guarda, por canal, pares mín/máx cuantizados a int8.
 * El dibujo elige el nivel según cuántas muestras caen en un píxel.
 */

export interface PeakLevel {
  spp: number; // muestras por par mín/máx
  ch: Int8Array[]; // por canal: [min0, max0, min1, max1, …]
}
export interface Peaks {
  sr: number;
  length: number; // muestras
  channels: number;
  levels: PeakLevel[];
}
interface BufLike {
  numberOfChannels: number;
  sampleRate: number;
  length: number;
  getChannelData(i: number): Float32Array;
}

const BASE = 128;
const q = (v: number) => Math.max(-127, Math.min(127, Math.round(v * 127)));

export function computePeaks(buf: BufLike, maxChannels = 2): Peaks {
  const channels = Math.min(maxChannels, buf.numberOfChannels);
  const n = Math.ceil(buf.length / BASE);
  const first: Int8Array[] = [];
  for (let c = 0; c < channels; c++) {
    const d = buf.getChannelData(c);
    const out = new Int8Array(n * 2);
    for (let i = 0; i < n; i++) {
      let lo = 1;
      let hi = -1;
      const end = Math.min(d.length, (i + 1) * BASE);
      for (let k = i * BASE; k < end; k++) {
        const v = d[k];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (lo > hi) lo = hi = 0;
      out[i * 2] = q(lo);
      out[i * 2 + 1] = q(hi);
    }
    first.push(out);
  }
  const levels: PeakLevel[] = [{ spp: BASE, ch: first }];
  // Cada nivel siguiente resume 4 pares del anterior.
  while (levels[levels.length - 1].ch[0].length / 2 > 256) {
    const prev = levels[levels.length - 1];
    const m = Math.ceil(prev.ch[0].length / 2 / 4);
    levels.push({
      spp: prev.spp * 4,
      ch: prev.ch.map((src) => {
        const out = new Int8Array(m * 2);
        for (let i = 0; i < m; i++) {
          let lo = 127;
          let hi = -127;
          for (let k = i * 4; k < Math.min(src.length / 2, i * 4 + 4); k++) {
            if (src[k * 2] < lo) lo = src[k * 2];
            if (src[k * 2 + 1] > hi) hi = src[k * 2 + 1];
          }
          out[i * 2] = lo;
          out[i * 2 + 1] = hi;
        }
        return out;
      }),
    });
  }
  return { sr: buf.sampleRate, length: buf.length, channels, levels };
}

/** Nivel más detallado que no supera `samplesPerPixel` (o el más fino si el zoom es extremo). */
export function pickLevel(p: Peaks, samplesPerPixel: number): PeakLevel {
  let best = p.levels[0];
  for (const l of p.levels) if (l.spp <= samplesPerPixel) best = l;
  return best;
}

/** Mín/máx (−1..1) del tramo de archivo [t0, t1) segundos en el canal `c`. */
export function rangeAt(p: Peaks, lvl: PeakLevel, c: number, t0: number, t1: number): [number, number] {
  const arr = lvl.ch[Math.min(c, lvl.ch.length - 1)];
  const a = Math.max(0, Math.floor((t0 * p.sr) / lvl.spp));
  const b = Math.min(arr.length / 2, Math.max(a + 1, Math.ceil((t1 * p.sr) / lvl.spp)));
  let lo = 127;
  let hi = -127;
  for (let i = a; i < b; i++) {
    if (arr[i * 2] < lo) lo = arr[i * 2];
    if (arr[i * 2 + 1] > hi) hi = arr[i * 2 + 1];
  }
  if (lo > hi) return [0, 0];
  return [lo / 127, hi / 127];
}

/* ---------- Envío reducido a clientes remotos (no se manda el audio) ---------- */

const b64 = (a: Int8Array) => {
  let s = '';
  const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => {
  const bin = atob(s);
  const u = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = (bin.charCodeAt(i) << 24) >> 24;
  return u;
};
export interface PeaksWire {
  sr: number;
  length: number;
  channels: number;
  levels: { spp: number; ch: string[] }[];
}
/** Solo los niveles gruesos (≥ 2048 muestras por par): unos KB por minuto de audio. */
export function toWire(p: Peaks, minSpp = 2048): PeaksWire {
  const levels = p.levels.filter((l) => l.spp >= minSpp);
  return { sr: p.sr, length: p.length, channels: p.channels, levels: (levels.length ? levels : p.levels.slice(-1)).map((l) => ({ spp: l.spp, ch: l.ch.map(b64) })) };
}
export const fromWire = (w: PeaksWire): Peaks => ({ sr: w.sr, length: w.length, channels: w.channels, levels: w.levels.map((l) => ({ spp: l.spp, ch: l.ch.map(unb64) })) });

/* ---------- Caché en memoria compartida por la interfaz ---------- */
const cache = new Map<string, Peaks>();
const subs = new Set<() => void>();
export const peaksStore = {
  get: (asset: string) => cache.get(asset),
  set(asset: string, p: Peaks) {
    cache.set(asset, p);
    subs.forEach((f) => f());
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => void subs.delete(f);
  },
};
