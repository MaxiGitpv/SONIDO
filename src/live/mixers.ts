/*
 * Adaptadores de mesas digitales controlables por red (OSC sobre UDP, a través del puente local).
 * Solo se declaran modelos con protocolo documentado y probado contra el emulador del repositorio.
 * Otras marcas no se presentan como compatibles hasta tener su adaptador.
 */

export type MixerModel = 'xair' | 'x32';

export interface MixerSpec {
  id: MixerModel;
  label: string;
  port: number;
  channels: number;
  buses: number;
  ch: (n: number) => string; // '/ch/01'
  /** Dirección del preamp físico por índice de preamp (no por canal). */
  headampAt: (index: number) => string;
  /** Cómo se sabe qué preamp alimenta un canal: leyendo la fuente del canal (X Air) o por asignación manual (X32). */
  preampMode: 'insrc' | 'manual';
  /** Trim digital del canal (no toca el preamp físico), si la mesa lo tiene. */
  trim: ((n: number) => string) | null;
  /** Estado de verificación declarado en la interfaz. */
  tested: string;
  bus: (n: number) => string;
  main: string;
  sendLevel: (ch: number, bus: number) => string;
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export const MIXERS: Record<MixerModel, MixerSpec> = {
  xair: {
    id: 'xair',
    label: 'Behringer X Air (XR12, XR16, XR18) / Midas MR18',
    port: 10024,
    channels: 16,
    buses: 6,
    ch: (n) => `/ch/${pad(n)}`,
    headampAt: (i) => `/headamp/${pad(i + 1)}`,
    preampMode: 'insrc',
    trim: null,
    tested: 'Implementado · probado con el emulador XR18 del repositorio · mesa real pendiente (F4–F6)',
    bus: (n) => `/bus/${n}`,
    main: '/lr',
    sendLevel: (c, b) => `/ch/${pad(c)}/mix/${pad(b)}/level`,
  },
  x32: {
    id: 'x32',
    label: 'Behringer X32 / Midas M32',
    port: 10023,
    channels: 32,
    buses: 16,
    ch: (n) => `/ch/${pad(n)}`,
    // En X32 el preamp que alimenta un canal depende del enrutamiento (local, AES50 A/B, tarjeta).
    // No se supone la entrada local: el sonidista asigna el preamp de cada canal o solo usa el trim digital.
    headampAt: (i) => `/headamp/${pad(i, 3)}`,
    preampMode: 'manual',
    trim: (n) => `/ch/${pad(n)}/preamp/trim`,
    tested: 'Implementado según el protocolo OSC publicado · sin emulador ni mesa real probados',
    bus: (n) => `/bus/${pad(n)}`,
    main: '/main/st',
    sendLevel: (c, b) => `/ch/${pad(c)}/mix/${pad(b)}/level`,
  },
};

export const modelFromInfo = (model: string): MixerModel => (/X32|M32/i.test(model) ? 'x32' : 'xair');

/** Fader de X32/X Air: valor 0..1 ↔ dB (curva por tramos documentada por Behringer). */
export function faderToDb(f: number): number {
  if (f <= 0) return -90;
  if (f >= 0.5) return f * 40 - 30;
  if (f >= 0.25) return f * 80 - 50;
  if (f >= 0.0625) return f * 160 - 70;
  return f * 480 - 90;
}
export function dbToFader(db: number): number {
  if (db <= -89.5) return 0;
  let f: number;
  if (db >= -10) f = (db + 30) / 40;
  else if (db >= -30) f = (db + 50) / 80;
  else if (db >= -60) f = (db + 70) / 160;
  else f = (db + 90) / 480;
  return Math.max(0, Math.min(1, Math.round(f * 1023) / 1023));
}
/** Ganancia de preamplificador de X Air/X32: 0..1 ↔ −12..+60 dB. */
export const gainToDb = (v: number) => -12 + v * 72;
export const dbToGain = (db: number) => Math.max(0, Math.min(1, (db + 12) / 72));

/** Preamps físicos de X32/M32: 0–31 locales, 32–79 AES50 A, 80–127 AES50 B. */
export function x32PreampLabel(i: number): string {
  if (i < 0) return 'Sin asignar';
  if (i < 32) return `Local ${i + 1}`;
  if (i < 80) return `AES50 A ${i - 31}`;
  return `AES50 B ${i - 79}`;
}
/** X Air: la fuente del canal (insrc) 0–15 es la entrada física 1–16; otros valores no tienen preamp. */
export const xairPreampOf = (insrc: unknown): number | null => (typeof insrc === 'number' && insrc >= 0 && insrc <= 15 ? insrc : null);
/** Trim digital X32: 0..1 ↔ −18..+18 dB. */
export const trimToDb = (v: number) => -18 + v * 36;
export const dbToTrim = (db: number) => Math.max(0, Math.min(1, (db + 18) / 36));
