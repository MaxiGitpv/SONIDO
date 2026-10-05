import { magDb } from '../dsp';
import type { Kind } from '../dsp';
import type { Chan } from './types';

export const LIVE_KINDS: Kind[] = ['lowshelf', 'peak', 'peak', 'peak', 'peak', 'highshelf'];

/** Respuesta en dB de la cadena del canal: pasa altos, 6 bandas y pasa bajos. */
export function chanResponse(ch: Pick<Chan, 'hpf' | 'lpf' | 'eqOn' | 'eq'>, f: number): number {
  let db = 0;
  if (ch.hpf.on) db += magDb('highpass', ch.hpf.freq, 0, 0.7071, f);
  if (ch.lpf.on) db += magDb('lowpass', ch.lpf.freq, 0, 0.7071, f);
  if (ch.eqOn) ch.eq.forEach((b, i) => b.on && (db += magDb(LIVE_KINDS[i] ?? 'peak', b.freq, b.gain, b.q, f)));
  return db;
}
