import type { Comp, EqBand, Hpf } from '../types';

export type ChId = 'piano' | 'pad' | 'organ' | 'strings' | 'voz' | 'guitarra' | 'tracks' | 'click';
export const CH_IDS: ChId[] = ['piano', 'pad', 'organ', 'strings', 'voz', 'guitarra', 'tracks', 'click'];
export const KEY_CH: ChId[] = ['piano', 'pad', 'organ', 'strings'];

export type SceneId = 'intro' | 'verso' | 'coro' | 'puente' | 'final';
export const SCENES: { id: SceneId; label: string }[] = [
  { id: 'intro', label: 'Intro' },
  { id: 'verso', label: 'Verso' },
  { id: 'coro', label: 'Coro' },
  { id: 'puente', label: 'Puente' },
  { id: 'final', label: 'Final' },
];

export type SoundId = 'grandpad' | 'rhodes' | 'pianostrings' | 'ambient' | 'warmpad' | 'gospel' | 'organpad' | 'strings' | 'cinema';
export type SoundCat = 'Pianos' | 'Pads' | 'Órganos' | 'Cuerdas';

export interface Chan {
  id: ChId;
  fader: number; // dB
  pan: number; // -100..100
  mute: boolean;
  solo: boolean;
  hpf: Hpf;
  eqOn: boolean;
  eq: [EqBand, EqBand, EqBand, EqBand];
  comp: Comp;
  sendRev: number; // dB
  sendDly: number; // dB
}

export interface Macros {
  ambience: number;
  brightness: number;
  expression: number;
}

export interface SceneMix {
  sound: SoundId;
  chans: Record<ChId, Chan>;
  macros: Macros;
}

export interface Fx {
  reverbOn: boolean;
  reverbSend: number; // dB
  reverbWet: number; // 0..1
  delayOn: boolean;
  delaySend: number; // dB
  delayWet: number;
  delayFb: number; // 0..0.9
  rotary: 'stop' | 'slow' | 'fast';
  drawbars: number[];
}

export interface Song {
  id: string;
  title: string;
  key: string; // letra: C, D, E, A...
  bpm: number;
  ts: string;
}

export interface MidiMap {
  id: string;
  label: string;
  cc: number;
  ch: number;
}

export type Tab = 'live' | 'sounds' | 'mixer' | 'routes' | 'midi';
export type EqTab = 'eq' | 'comp' | 'reverb' | 'delay';

export interface LiveState {
  songs: Song[];
  songId: string;
  sceneId: SceneId;
  mix: Record<string, Record<SceneId, SceneMix>>;
  selected: ChId;
  fx: Fx;
  master: number; // dB
  masterMute: boolean;
  tab: Tab;
  eqTab: EqTab;
  soundCat: SoundCat;
  split: number;
  transpose: number;
  playing: boolean;
  trackName: string | null;
  clickMonitor: boolean;
  midi: MidiMap[];
  dirty: boolean;
  leftOpen: boolean;
  toast: { id: number; text: string } | null;
}
