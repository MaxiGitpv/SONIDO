import type { Comp, EqBand, Hpf } from '../types';

/* ---------- Canales ---------- */

export type InId = 'in1' | 'in2' | 'in3' | 'in4' | 'in5' | 'in6';
export const IN_IDS: InId[] = ['in1', 'in2', 'in3', 'in4', 'in5', 'in6'];
export type ChId = 'piano' | 'pad' | 'organ' | 'strings' | 'brass' | 'sampler' | 'voz' | 'guitarra' | 'bajo' | 'drums' | 'perc' | InId | 'tracks' | 'click';
/** Canales musicales: el director decide si suenan y con qué nivel musical en cada sección. */
export const INST_IDS: ChId[] = ['piano', 'pad', 'organ', 'strings', 'brass', 'sampler', 'voz', 'guitarra', 'bajo', 'drums', 'perc'];
export const MUSIC_IDS: ChId[] = [...INST_IDS, 'tracks'];
export const CH_IDS: ChId[] = [...INST_IDS, ...IN_IDS, 'tracks', 'click'];
export const isInput = (id: ChId): id is InId => (IN_IDS as string[]).includes(id);
export const isMusical = (id: ChId) => MUSIC_IDS.includes(id);
/** Canales que nunca van a la sala, a los efectos ni a la grabación principal. */
export const MONITOR_ONLY: ChId[] = ['click'];

export type InType = 'dinamico' | 'condensador' | 'inalambrico' | 'di' | 'linea';
export const IN_TYPES: { id: InType; label: string }[] = [
  { id: 'dinamico', label: 'Micrófono dinámico' },
  { id: 'condensador', label: 'Micrófono de condensador' },
  { id: 'inalambrico', label: 'Micrófono inalámbrico' },
  { id: 'di', label: 'Instrumento (caja DI)' },
  { id: 'linea', label: 'Línea (teclado, consola, reproductor)' },
];
export interface InputCfg {
  name: string;
  type: InType;
  device: string | null; // deviceId del navegador (no se exporta como conexión válida)
  side: 'mix' | 'L' | 'R';
  trim: number; // dB aplicados por software
  polarity: boolean;
}

/** Canales que se pueden tocar desde el teclado o los cuadros. */
export const PLAYABLE: ChId[] = ['piano', 'pad', 'organ', 'strings', 'brass', 'sampler', 'voz', 'guitarra', 'bajo'];
export const FILE_CH: ChId[] = ['pad', 'drums', 'tracks'];

/* ---------- Buses y salidas ---------- */

export type BusId = string; // 'm1', 'm2'… identificadores estables
export interface Bus {
  id: BusId;
  name: string;
  color: string;
  level: number; // dB
  mute: boolean;
}
export interface Send {
  db: number;
  pre: boolean; // pre-fader (monitores) o post-fader
}
export interface Outputs {
  sink: string; // deviceId de salida ('' = predeterminada del sistema)
  main: number; // par de salida (0 = canales 1-2)
  cue: number; // par para la escucha del operador, -1 = sin salida propia
  buses: Record<BusId, number>; // par por bus, -1 = sin salida física
  cueReplacesMain: boolean; // solo en ensayo: con un solo par, la escucha reemplaza la salida
  rec: 'main' | BusId; // qué graba el botón de grabación
}

/* ---------- Canal de consola (sonidista) ---------- */

export interface Chan {
  id: ChId;
  fader: number; // dB del fader de consola
  pan: number;
  mute: boolean;
  solo: boolean; // escucha (PFL); nunca silencia la sala
  hpf: Hpf;
  lpf: { on: boolean; freq: number };
  eqOn: boolean;
  eq: EqBand[]; // 6 bandas; el EQ básico edita las bandas 0, 3 y 5
  comp: Comp;
  sendRev: number; // post-fader
  sendDly: number; // post-fader
  aux: Record<BusId, Send>;
  toMain: boolean; // false para click y guías
}

/* ---------- Música (director) ---------- */

export type SectionKind = 'intro' | 'verso' | 'precoro' | 'coro' | 'puente' | 'interludio' | 'tag' | 'vamp' | 'final' | 'otro';
export const KINDS: { id: SectionKind; label: string }[] = [
  { id: 'intro', label: 'Intro' },
  { id: 'verso', label: 'Verso' },
  { id: 'precoro', label: 'Pre-coro' },
  { id: 'coro', label: 'Coro' },
  { id: 'puente', label: 'Puente' },
  { id: 'interludio', label: 'Interludio' },
  { id: 'tag', label: 'Tag' },
  { id: 'vamp', label: 'Vamp' },
  { id: 'final', label: 'Final' },
  { id: 'otro', label: 'Otra' },
];
export type SceneId = string;
export interface SectionDef {
  id: SceneId;
  label: string;
  kind: SectionKind;
}
export interface Section {
  scene: SceneId;
  bars: number;
}
export type EndAction = 'stop' | 'loop' | 'next';
export type TimeSig = '2/4' | '3/4' | '4/4' | '5/4' | '6/8' | '7/8' | '12/8';
export const TIME_SIGS: TimeSig[] = ['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '12/8'];

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

export type SoundId = 'grandpad' | 'rhodes' | 'pianostrings' | 'ambient' | 'warmpad' | 'gospel' | 'organpad' | 'strings' | 'cinema' | 'brassensemble' | 'brasspad' | 'samplerkeys';
export type SoundCat = 'Pianos' | 'Pads' | 'Órganos' | 'Cuerdas' | 'Metales' | 'Sampler';

export type Zone = 'all' | 'low' | 'high';
export interface Layer {
  ch: ChId;
  zone: Zone;
}
export interface Macros {
  ambience: number;
  brightness: number;
  expression: number;
}
/** Nivel musical de un instrumento en una sección: lo decide el director. */
export interface MusicLevel {
  db: number;
  on: boolean;
}
export interface MusicScene {
  sound: SoundId;
  layers: Layer[];
  macros: Macros;
  music: Partial<Record<ChId, MusicLevel>>;
}
/** Vista combinada para los componentes: música de la sección + consola. */
export interface SceneMix extends MusicScene {
  chans: Record<ChId, Chan>;
}

export type StemCat = 'bateria' | 'bajo' | 'teclados' | 'guitarras' | 'voces' | 'ambiente' | 'click' | 'guia' | 'otro';
export const STEM_CATS: { id: StemCat; label: string }[] = [
  { id: 'bateria', label: 'Batería' },
  { id: 'bajo', label: 'Bajo' },
  { id: 'teclados', label: 'Teclados' },
  { id: 'guitarras', label: 'Guitarras' },
  { id: 'voces', label: 'Voces de apoyo' },
  { id: 'ambiente', label: 'Ambiente' },
  { id: 'click', label: 'Click' },
  { id: 'guia', label: 'Guía' },
  { id: 'otro', label: 'Otro' },
];
export interface Stem {
  id: string;
  name: string;
  cat: StemCat;
  asset: string; // id en IndexedDB
  db: number;
  mute: boolean;
  offset: number; // segundos: dónde empieza respecto al compás 1
  duration: number;
}

export interface Song {
  id: string;
  title: string;
  key: string;
  bpm: number;
  ts: TimeSig;
  style: Style;
  sections: SectionDef[];
  arr: Section[];
  end: EndAction;
  stems: Stem[];
  stemsOnly: boolean; // al usar pistas, silencia la parte sintetizada
}

/* ---------- Sampler ---------- */

export interface SampleZone {
  id: string;
  name: string;
  asset: string;
  root: number;
  lo: number;
  hi: number;
  velLo: number; // 0..127
  velHi: number;
  gain: number; // dB
  loop: boolean;
}
export interface SamplerCfg {
  zones: SampleZone[];
  attack: number; // s
  release: number; // s
}

/* ---------- Efectos ---------- */

export interface Fx {
  reverbOn: boolean;
  reverbSend: number;
  reverbWet: number;
  reverbSize: number; // s
  reverbPre: number; // ms
  reverbDamp: number; // Hz
  delayOn: boolean;
  delaySend: number;
  delayWet: number;
  delayFb: number;
  delayDiv: '1/4' | '1/8' | '1/8.' | '1/4.' | '1/2';
  delayTone: number; // Hz
  rotary: 'stop' | 'slow' | 'fast';
  drawbars: number[];
}

/* ---------- Escenas de mezcla ---------- */

export interface MixData {
  console: Record<ChId, Chan>;
  buses: Bus[];
  master: number;
  masterMute: boolean;
  fx: Fx;
  trims: Partial<Record<InId, number>>;
}
export interface MixScene {
  id: string;
  name: string;
  savedAt: string;
  version: number;
  data: MixData;
  /** Escena completa: también recuerda canción y sección musical. */
  ref?: { songId: string; sceneId: SceneId };
}
export interface RecallMask {
  faders: boolean;
  mutes: boolean;
  pans: boolean;
  proc: boolean; // filtros, EQ y compresor
  sends: boolean; // envíos a buses y efectos
  buses: boolean;
  fx: boolean;
  master: boolean;
  trims: boolean;
}

export interface MidiMap {
  id: string;
  label: string;
  cc: number;
  ch: number;
}

/* ---------- Vistas, pestañas y estado ---------- */

export type View = 'all' | 'mixer' | 'director';
export type Tab = 'live' | 'scenes' | 'play' | 'sounds' | 'stems' | 'mixer' | 'channel' | 'fx' | 'inputs' | 'buses' | 'outputs' | 'mixscenes' | 'network' | 'routes' | 'midi';
export type StripGroup = 'all' | 'inst' | 'inputs' | 'tracks';
export type EqTab = 'eq' | 'comp' | 'reverb' | 'delay';
export type PlayMode = 'follow' | 'loop';
export type SrcMode = 'synth' | 'file';

export interface LiveState {
  songs: Song[];
  songId: string;
  sceneId: SceneId;
  mix: Record<string, Record<SceneId, MusicScene>>;
  console: Record<ChId, Chan>;
  buses: Bus[];
  outputs: Outputs;
  mixScenes: MixScene[];
  activeMix: string | null;
  recallMask: RecallMask;
  protectedCh: ChId[];
  selected: ChId;
  fx: Fx;
  master: number;
  masterMute: boolean;
  view: View;
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
  sampler: SamplerCfg;
  playing: boolean;
  midi: MidiMap[];
  dirty: boolean;
  leftOpen: boolean;
  inputs: Record<InId, InputCfg>;
  stripGroup: StripGroup;
  playPanel: 'keys' | 'pads';
  toast: { id: number; text: string } | null;
  trash?: MixScene | null;
}
