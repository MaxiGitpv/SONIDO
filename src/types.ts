export type MixId = 'main' | 'mon1' | 'mon2' | 'mon3';
export const MIX_IDS: MixId[] = ['main', 'mon1', 'mon2', 'mon3'];
export const MONITOR_IDS: MixId[] = ['mon1', 'mon2', 'mon3'];

export type ViewId = 'mix' | 'channels' | 'monitors' | 'fx' | 'scenes' | 'routes';

export interface MixInfo {
  id: MixId;
  label: string; // etiqueta larga
  short: string; // etiqueta corta
  sub: string;
  color: string;
}

export const MIXES: Record<MixId, MixInfo> = {
  main: { id: 'main', label: 'Mezcla principal', short: 'Principal L-R', sub: 'Sala', color: '#3cc8dc' },
  mon1: { id: 'mon1', label: 'Monitor 1', short: 'Mon 1', sub: 'Voces', color: '#6f9cff' },
  mon2: { id: 'mon2', label: 'Monitor 2', short: 'Mon 2', sub: 'Banda', color: '#a98bf2' },
  mon3: { id: 'mon3', label: 'Monitor 3', short: 'Mon 3', sub: 'Batería', color: '#e58fb3' },
};

export type PerMix<T> = Record<MixId, T>;

export interface EqBand {
  freq: number;
  gain: number;
  q: number;
  on: boolean;
}
export interface Hpf {
  freq: number;
  on: boolean;
}
export interface Comp {
  on: boolean;
  threshold: number;
  ratio: number;
  attack: number;
  release: number;
  makeup: number;
}

export interface Channel {
  id: string;
  name: string;
  hue: number;
  gain: number;
  phantom: boolean;
  polarity: boolean;
  fader: PerMix<number>;
  pan: PerMix<number>;
  mute: PerMix<boolean>;
  route: PerMix<boolean>;
  solo: boolean;
  fx: { rev: number; dly: number };
  hpf: Hpf;
  eqOn: boolean;
  eq: [EqBand, EqBand, EqBand, EqBand];
  comp: Comp;
}

export interface Master {
  level: number;
  mute: boolean;
}

export interface FxState {
  rev: { on: boolean; time: number; preDelay: number; damp: number; ret: number };
  dly: { on: boolean; time: number; feedback: number; tone: number; ret: number };
}

export interface MixSnapshot {
  channels: Channel[];
  masters: PerMix<Master>;
  fx: FxState;
}

export interface Scene {
  id: string;
  name: string;
  savedAt: string;
  data: MixSnapshot;
}

export const NAV: { id: ViewId; label: string }[] = [
  { id: 'mix', label: 'Mezcla' },
  { id: 'channels', label: 'Canales' },
  { id: 'monitors', label: 'Monitores' },
  { id: 'fx', label: 'Efectos' },
  { id: 'scenes', label: 'Escenas' },
  { id: 'routes', label: 'Rutas' },
];
