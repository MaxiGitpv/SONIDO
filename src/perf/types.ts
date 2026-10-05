export type Inst = 'piano' | 'pad' | 'organ' | 'strings';
export const INSTS: Inst[] = ['piano', 'pad', 'organ', 'strings'];

export type SceneId = 'intro' | 'verso' | 'coro' | 'puente' | 'final';
export const SCENE_LIST: { id: SceneId; label: string }[] = [
  { id: 'intro', label: 'Intro' },
  { id: 'verso', label: 'Verso' },
  { id: 'coro', label: 'Coro' },
  { id: 'puente', label: 'Puente' },
  { id: 'final', label: 'Final' },
];

export type SoundId = 'grand' | 'rhodes' | 'organ' | 'ambient' | 'pianostrings';

export interface Layer {
  on: boolean;
  level: number; // 0..1
}
export interface Macros {
  ambience: number;
  brightness: number;
  expression: number;
}
export interface SceneMix {
  sound: SoundId;
  layers: Record<Inst, Layer>;
  macros: Macros;
}
export interface InstSetup {
  lo: number; // nota MIDI
  hi: number;
  transpose: number;
  gamma: number; // curva de velocidad: salida = entrada^gamma
}
export interface Fx {
  reverbSize: number;
  reverbMix: number;
  reverbPre: number;
  chorusRate: number;
  chorusDepth: number;
  tremRate: number;
  tremDepth: number;
  rotary: 'stop' | 'slow' | 'fast';
  drawbars: number[]; // 9 barras, 0..8
}
export interface MidiMap {
  id: string;
  label: string;
  cc: number;
  ch: number;
}

export type EditTab = 'ranges' | 'velocity' | 'fx' | 'midi';

export interface PerfState {
  songId: string;
  sceneId: SceneId;
  mix: Record<string, Record<SceneId, SceneMix>>;
  inst: Record<Inst, InstSetup>;
  fx: Fx;
  master: number;
  midi: MidiMap[];
  edit: boolean;
  editTab: EditTab;
  test: { on: boolean; t: number; auto: boolean };
  held: number[];
  toast: { id: number; text: string } | null;
}

export interface Song {
  id: string;
  title: string;
  key: string;
  bpm: number;
}

export const NOTE_LO = 36; // C2
export const NOTE_HI = 96; // C7
