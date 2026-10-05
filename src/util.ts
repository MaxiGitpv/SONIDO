export const DB_MIN = -90;
export const DB_MAX = 10;
export const FLOOR = -90;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Posición del fader (0..1) por dB, interpolada por tramos como una consola real.
const MAP: [number, number][] = [
  [-90, 0],
  [-60, 0.05],
  [-50, 0.1],
  [-40, 0.18],
  [-30, 0.28],
  [-20, 0.4],
  [-10, 0.56],
  [0, 0.75],
  [5, 0.88],
  [10, 1],
];

export function dbToPos(db: number): number {
  const d = clamp(db, DB_MIN, DB_MAX);
  for (let i = 1; i < MAP.length; i++) {
    const [d1, p1] = MAP[i];
    if (d <= d1) {
      const [d0, p0] = MAP[i - 1];
      return p0 + ((d - d0) / (d1 - d0)) * (p1 - p0);
    }
  }
  return 1;
}

export function posToDb(pos: number): number {
  const p = clamp(pos, 0, 1);
  for (let i = 1; i < MAP.length; i++) {
    const [d1, p1] = MAP[i];
    if (p <= p1) {
      const [d0, p0] = MAP[i - 1];
      return d0 + ((p - p0) / (p1 - p0)) * (d1 - d0);
    }
  }
  return DB_MAX;
}

export const FADER_TICKS = [10, 5, 0, -10, -20, -30, -40, -50, -60];

export function fmtDb(db: number, dec = 1): string {
  if (db <= -89.5) return '-∞';
  return (db > 0 ? '+' : '') + db.toFixed(dec);
}

export function parseDb(s: string): number | null {
  const t = s.trim().replace(',', '.').toLowerCase();
  if (t === '-inf' || t === '-∞' || t === 'inf' || t === '∞') return DB_MIN;
  const n = parseFloat(t);
  return Number.isFinite(n) ? clamp(n, DB_MIN, DB_MAX) : null;
}

export function fmtPan(p: number): string {
  const r = Math.round(p);
  if (r === 0) return 'C';
  return r < 0 ? `L${-r}` : `R${r}`;
}

export function fmtHz(f: number): string {
  return f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 1 : 2).replace(/\.?0+$/, '')} kHz` : `${Math.round(f)} Hz`;
}

export const dbToLin = (db: number) => Math.pow(10, db / 20);
export const linToDb = (x: number) => (x <= 1e-5 ? FLOOR : 20 * Math.log10(x));

export const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
