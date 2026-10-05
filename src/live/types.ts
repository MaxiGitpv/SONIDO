import type { Comp, EqBand, Hpf } from '../types';

export type ChId = 'piano' | 'pad' | 'organ' | 'strings' | 'voz' | 'guitarra' | 'bajo' | 'drums' | 'perc' | 'tracks' | 'click';
export const CH_IDS: ChId[] = ['piano', 'pad', 'organ', 'strings', 'voz', 'guitarra', 'bajo', 'drums', 'perc', 'tracks', 'click'];
/** Canales que se pueden tocar desde el teclado o los cuadros. */
export const PLAYABLE: ChId[] = ['piano', 'pad', 'organ', 'strings', 'voz', 'guitarra', 'bajo'];
/** Canales que pueden sonar desde un archivo en lugar del sintetizador. */
export const FILE_CH: ChId[] = ['pad', 'drums', 'tracks'];

export type SceneId = 'intro' | 'verso' | 'coro' | 'puente' | 'final';
export const SCENES: { id: SceneId; label: string }[] = [
  { id: 'intro', label: 'Intro' },
  { id: 'verso', label: 'Verso' },
  { id: 'coro', label: 'Coro' },
  { id: 'puente', label: 'Puente' },
  { id: 'final', label: 'Final' },
];

export type Style = 'worship' | 'balada' | 'jubilo' | 'funk' | 'salsa' | 'tumbao' | 'merengue' | 'samba';
export const STYLES: { id: Style; label: string }[] = [
  { id: 'worship', label: 'Worship' },
  { id: 'balada', label: 'Balada' },
  { id: 'jubilo', label: 'Júbilo' },
  { id: 'funk', label: 'Funk' },
  { id: 'salsa', label: 'Salsa' },
  { id: 'tumbao', label: 'Tumbao' },
  { id: 'merengue', label: 'Merengue' },
  { id: 'samba', label: 'Samba' },
];

export type SoundId = 'grandpad' | 'rhodes' | 'pianostrings' | 'ambient' | 'warmpad' | 'gospel' | 'organpad' | 'strings' | 'cinema';
export type SoundCat = 'Pianos' | 'Pads' | 'Órganos' | 'Cuerdas';

export type Zone = 'all' | 'low' | 'high';
export interface Layer {
  ch: ChId;
  zone: Zone;
}

export interface Chan {
  id: ChId;
  fader: number; // dB
  pan: number; // -100..100
  mute: boolean;
  solo: boolean;
  hpf: Hpf;
  lpf: { on: boolean; freq: number };
  eqOn: boolean;
  eq: EqBand[]; // 6 bandas: low shelf, 4 campanas, high shelf
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
  layers: Layer[];
  chans: Record<ChId, Chan>;
  macros: Macros;
}

export interface Fx {
  reverbOn: boolean;
  reverbSend: number;
  reverbWet: number;
  delayOn: boolean;
  delaySend: number;
  delayWet: number;
  delayFb: number;
  rotary: 'stop' | 'slow' | 'fast';
  drawbars: number[];
}

export interface Section {
  scene: SceneId;
  bars: number;
}
export type EndAction = 'stop' | 'loop' | 'next';

export interface Song {
  id: string;
  title: string;
  key: string;
  bpm: number;
  ts: string;
  style: Style;
  arr: Section[];
  end: EndAction;
}

export interface MidiMap {
  id: string;
  label: string;
  cc: number;
  ch: number;
}

export type Tab = 'live' | 'sounds' | 'mixer' | 'routes' | 'midi';
export type EqTab = 'eq' | 'comp' | 'reverb' | 'delay';
export type PlayMode = 'follow' | 'loop';
export type SrcMode = 'synth' | 'file';

export interface LiveState {
  songs: Song[];
  songId: string;
  sceneId: SceneId;
  mix: Record<string, Record<SceneId, SceneMix>>;
  selected: ChId;
  fx: Fx;
  master: number;
  masterMute: boolean;
  tab: Tab;
  eqTab: EqTab;
  soundCat: SoundCat;
  split: number;
  transpose: number;
  octave: number;
  sustain: boolean;
  playMode: PlayMode;
  src: Record<'pad' | 'drums', SrcMode>;
  files: Partial<Record<ChId, string>>;
  playing: boolean;
  clickMonitor: boolean;
  midi: MidiMap[];
  dirty: boolean;
  leftOpen: boolean;
  editor: ChId | null;
  playPanel: 'keys' | 'pads';
  toast: { id: number; text: string } | null;
}
