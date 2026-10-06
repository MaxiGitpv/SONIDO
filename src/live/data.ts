import type { Bus, Chan, ChId, Fx, InId, InputCfg, Layer, MidiMap, MixData, MusicScene, Outputs, RecallMask, SamplerCfg, Section, SectionDef, SectionKind, Song, SceneId, SoundCat, SoundId, Style } from './types';
import type { EqBand } from '../types';
import { CH_IDS, IN_IDS, KINDS, MONITOR_ONLY, MUSIC_IDS, PLAYABLE, isInput } from './types';

export const CH_META: Record<ChId, { name: string; color: string; badge: string }> = {
  piano: { name: 'Piano', color: '#35b4ff', badge: 'Sinte' },
  pad: { name: 'Pad', color: '#a06bff', badge: 'Sinte' },
  organ: { name: 'Órgano', color: '#f0a23a', badge: 'Sinte' },
  strings: { name: 'Cuerdas', color: '#c75bd6', badge: 'Sinte' },
  brass: { name: 'Metales', color: '#f5c542', badge: 'Sinte' },
  sampler: { name: 'Sampler', color: '#4fd1c5', badge: 'Muestras' },
  voz: { name: 'Coro', color: '#ef5b73', badge: 'Sinte' },
  guitarra: { name: 'Guitarra', color: '#3fcf8e', badge: 'Sinte' },
  bajo: { name: 'Bajo', color: '#5b8cff', badge: 'Sinte' },
  drums: { name: 'Batería', color: '#ff8a4c', badge: 'Sinte' },
  perc: { name: 'Percusión', color: '#e6c84a', badge: 'Sinte' },
  in1: { name: 'Pastor', color: '#ff7aa8', badge: 'Entrada' },
  in2: { name: 'Voz principal', color: '#ff9a6b', badge: 'Entrada' },
  in3: { name: 'Coros 1', color: '#ffc46b', badge: 'Entrada' },
  in4: { name: 'Coros 2', color: '#e8e06b', badge: 'Entrada' },
  in5: { name: 'Guitarra acústica', color: '#7be0b0', badge: 'Entrada' },
  in6: { name: 'Teclado externo', color: '#7bc8ff', badge: 'Entrada' },
  tracks: { name: 'Tracks', color: '#9fb0c8', badge: 'Archivo' },
  click: { name: 'Click', color: '#8da2bd', badge: 'Solo monitores' },
};

export interface Sound {
  id: SoundId;
  cat: SoundCat;
  name: string;
  desc: string;
  layers: { ch: ChId; name: string; desc: string }[];
}

export const SOUNDS: Sound[] = [
  { id: 'grandpad', cat: 'Pianos', name: 'Grand + Warm Pad', desc: 'Piano + Pad en capas', layers: [{ ch: 'piano', name: 'Concert Grand', desc: 'Piano acústico' }, { ch: 'pad', name: 'Warm Analog Pad', desc: 'Pad cálido' }] },
  { id: 'rhodes', cat: 'Pianos', name: 'Velvet Rhodes', desc: 'Piano eléctrico suave', layers: [{ ch: 'piano', name: 'Velvet Rhodes', desc: 'Piano eléctrico' }] },
  { id: 'pianostrings', cat: 'Pianos', name: 'Piano + Strings', desc: 'Piano con cuerdas', layers: [{ ch: 'piano', name: 'Concert Grand', desc: 'Piano acústico' }, { ch: 'strings', name: 'Strings Ensemble', desc: 'Cuerdas con expresión' }] },
  { id: 'ambient', cat: 'Pads', name: 'Ambient Swell', desc: 'Pad atmosférico', layers: [{ ch: 'pad', name: 'Ambient Swell', desc: 'Pad de ataque lento' }, { ch: 'strings', name: 'Soft Strings', desc: 'Cuerdas suaves' }] },
  { id: 'warmpad', cat: 'Pads', name: 'Warm Analog Pad', desc: 'Pad cálido', layers: [{ ch: 'pad', name: 'Warm Analog Pad', desc: 'Pad cálido' }] },
  { id: 'gospel', cat: 'Órganos', name: 'Gospel Organ', desc: 'Órgano Live', layers: [{ ch: 'organ', name: 'Gospel Organ', desc: 'Drawbars y rotary' }] },
  { id: 'organpad', cat: 'Órganos', name: 'Organ + Pad', desc: 'Órgano con pad', layers: [{ ch: 'organ', name: 'Gospel Organ', desc: 'Drawbars y rotary' }, { ch: 'pad', name: 'Warm Analog Pad', desc: 'Pad cálido' }] },
  { id: 'strings', cat: 'Cuerdas', name: 'Strings Ensemble', desc: 'Sección de cuerdas', layers: [{ ch: 'strings', name: 'Strings Ensemble', desc: 'Cuerdas con expresión' }] },
  { id: 'cinema', cat: 'Cuerdas', name: 'Cinematic Strings', desc: 'Cuerdas y pad', layers: [{ ch: 'strings', name: 'Strings Ensemble', desc: 'Cuerdas con expresión' }, { ch: 'pad', name: 'Ambient Swell', desc: 'Pad de ataque lento' }] },
  { id: 'brassensemble', cat: 'Metales', name: 'Brass Section', desc: 'Trompetas y trombones sintetizados', layers: [{ ch: 'brass', name: 'Brass Section', desc: 'Metales sintetizados' }] },
  { id: 'brasspad', cat: 'Metales', name: 'Brass + Pad', desc: 'Metales sobre pad', layers: [{ ch: 'brass', name: 'Brass Section', desc: 'Metales sintetizados' }, { ch: 'pad', name: 'Warm Analog Pad', desc: 'Pad cálido' }] },
  { id: 'samplerkeys', cat: 'Sampler', name: 'Mis muestras', desc: 'Sus archivos WAV o MP3', layers: [{ ch: 'sampler', name: 'Sampler', desc: 'Muestras cargadas por usted' }] },
];
export const soundById = (id: SoundId) => SOUNDS.find((s) => s.id === id) ?? SOUNDS[0];
export const CATS: SoundCat[] = ['Pianos', 'Pads', 'Órganos', 'Cuerdas', 'Metales', 'Sampler'];

export const LAYER_INFO: Partial<Record<ChId, { name: string; desc: string }>> = {
  piano: { name: 'Concert Grand', desc: 'Piano acústico' },
  pad: { name: 'Warm Analog Pad', desc: 'Pad cálido' },
  organ: { name: 'Gospel Organ', desc: 'Drawbars y rotary' },
  strings: { name: 'Strings Ensemble', desc: 'Cuerdas con expresión' },
  brass: { name: 'Brass Section', desc: 'Metales sintetizados' },
  sampler: { name: 'Sampler', desc: 'Muestras cargadas por usted' },
  voz: { name: 'Choir Ooh', desc: 'Coro sintético' },
  guitarra: { name: 'Clean Guitar', desc: 'Guitarra limpia' },
  bajo: { name: 'Finger Bass', desc: 'Bajo eléctrico' },
};
export function layerInfo(sound: SoundId, ch: ChId) {
  return soundById(sound).layers.find((l) => l.ch === ch) ?? LAYER_INFO[ch] ?? { name: CH_META[ch].name, desc: '' };
}

/* ---------- Canciones y secciones ---------- */

export const kindLabel = (k: SectionKind) => KINDS.find((x) => x.id === k)?.label ?? 'Sección';
export const DEFAULT_SECTIONS: SectionDef[] = [
  { id: 'intro', label: 'Intro', kind: 'intro' },
  { id: 'verso', label: 'Verso', kind: 'verso' },
  { id: 'coro', label: 'Coro', kind: 'coro' },
  { id: 'puente', label: 'Puente', kind: 'puente' },
  { id: 'final', label: 'Final', kind: 'final' },
];
const ARR: Section[] = [
  { scene: 'intro', bars: 4 },
  { scene: 'verso', bars: 8 },
  { scene: 'coro', bars: 8 },
  { scene: 'puente', bars: 4 },
  { scene: 'final', bars: 4 },
];
const mkSong = (id: string, title: string, key: string, bpm: number, style: Style, end: Song['end'] = 'stop', extra: Partial<Song> = {}): Song => ({
  id, title, key, bpm, ts: '4/4', style, sections: DEFAULT_SECTIONS.map((x) => ({ ...x })), arr: ARR.map((x) => ({ ...x })), end, stems: [], stemsOnly: false, ...extra,
});
export const newSong = (id: string, title: string): Song => mkSong(id, title, 'G', 72, 'worship');
export const SONGS: Song[] = [
  mkSong('s1', 'Apertura', 'D', 118, 'jubilo', 'next'),
  mkSong('s2', 'Bondad de Dios', 'A', 68, 'worship'),
  mkSong('s3', 'Cuán grande es Él', 'E', 76, 'balada', 'stop', {
    ts: '6/8',
    sections: [...DEFAULT_SECTIONS.slice(0, 2).map((x) => ({ ...x })), { id: 'precoro', label: 'Pre-coro', kind: 'precoro' }, ...DEFAULT_SECTIONS.slice(2).map((x) => ({ ...x }))],
    arr: [{ scene: 'intro', bars: 4 }, { scene: 'verso', bars: 8 }, { scene: 'precoro', bars: 4 }, { scene: 'coro', bars: 8 }, { scene: 'verso', bars: 8 }, { scene: 'precoro', bars: 4 }, { scene: 'coro', bars: 8 }, { scene: 'final', bars: 4 }],
  }),
  mkSong('s4', 'Momento de oración', 'C', 60, 'worship', 'stop', { ts: '3/4' }),
  mkSong('s5', 'Alabanza latina', 'G', 96, 'salsa'),
];
export const KEY_SEMI: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
export const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const STYLE_BPM: Record<Style, number> = { worship: 72, balada: 66, jubilo: 120, funk: 104, salsa: 96, tumbao: 92, merengue: 128, samba: 100 };

/* ---------- Consola ---------- */

export const EQ_FREQS = [90, 250, 600, 2500, 6000, 11000];
export const EQ_NAMES = ['Graves', 'Cuerpo', 'Lodo', 'Presencia', 'Definición', 'Brillo'];
/** El EQ básico de tres perillas edita estas tres bandas del EQ avanzado: no hay un segundo EQ. */
export const BASIC_EQ: { band: number; label: string }[] = [
  { band: 0, label: 'Graves' },
  { band: 3, label: 'Medios' },
  { band: 5, label: 'Agudos' },
];
const flatEq = (): EqBand[] => EQ_FREQS.map((freq, i) => ({ freq, gain: 0, q: i === 0 || i === 5 ? 0.8 : 1.1, on: true }));

export const BUS_COLORS = ['#6f9cff', '#a98bf2', '#e58fb3', '#7fd6a4', '#f2c14a', '#7fd8ff'];
export const defaultBuses = (): Bus[] => [
  { id: 'm1', name: 'Monitor 1 · Voces', color: BUS_COLORS[0], level: -3, mute: false },
  { id: 'm2', name: 'Monitor 2 · Banda', color: BUS_COLORS[1], level: -3, mute: false },
  { id: 'm3', name: 'Monitor 3 · Batería', color: BUS_COLORS[2], level: -3, mute: false },
];
const OFF = -90;
// Envíos iniciales a monitores (pre-fader), tomados de la consola anterior.
const AUX0: Partial<Record<ChId, [number, number, number]>> = {
  in1: [-8, OFF, OFF], in2: [-3, -6, -8], in3: [-6, -10, -12], in4: [-6, -10, -12], in5: [-14, -4, -10], in6: [-12, -4, OFF],
  piano: [-12, -4, OFF], pad: [-16, -6, OFF], organ: [-14, -6, OFF], strings: [-16, -8, OFF], brass: [-16, -8, OFF], sampler: [-14, -6, OFF],
  voz: [-6, -10, -12], guitarra: [-14, -4, -10], bajo: [-18, -6, -4], drums: [OFF, -8, -2], perc: [OFF, -10, -6], tracks: [-20, -6, -6], click: [OFF, -6, -4],
};
const LEVEL: Partial<Record<ChId, number>> = { piano: -7, pad: -9, organ: -8, strings: -10, brass: -9, sampler: -8, voz: -6, guitarra: -11, bajo: -6, drums: -5, perc: -10, tracks: -9, click: -14, in1: -6, in2: -6, in3: -9, in4: -9, in5: -9, in6: -9 };

export function defaultChan(id: ChId, buses: Bus[] = defaultBuses()): Chan {
  const aux: Chan['aux'] = {};
  buses.forEach((b, i) => (aux[b.id] = { db: AUX0[id]?.[i] ?? OFF, pre: true }));
  const monOnly = MONITOR_ONLY.includes(id);
  return {
    id,
    fader: LEVEL[id] ?? -9,
    pan: id === 'guitarra' ? 18 : id === 'perc' ? -15 : 0,
    // Las entradas empiezan silenciadas. Los instrumentos suenan según el nivel musical de cada sección.
    mute: isInput(id),
    solo: false,
    hpf: { on: !['click', 'bajo', 'drums', 'in6'].includes(id), freq: id === 'piano' || id === 'organ' ? 60 : id === 'guitarra' || id === 'voz' || isInput(id) ? 100 : 40 },
    lpf: { on: false, freq: 18000 },
    eqOn: true,
    eq: flatEq(),
    comp: { on: ['voz', 'guitarra', 'bajo', 'drums', 'in1', 'in2', 'in3', 'in4'].includes(id), threshold: id === 'drums' ? -14 : -20, ratio: id === 'bajo' ? 4 : 3, attack: id === 'drums' ? 25 : 15, release: 200, makeup: 2 },
    sendRev: monOnly ? OFF : id === 'pad' || id === 'strings' ? -14 : ['piano', 'voz', 'in2', 'in3', 'in4', 'brass'].includes(id) ? -20 : id === 'drums' ? -26 : OFF,
    sendDly: monOnly ? OFF : id === 'voz' || id === 'guitarra' ? -22 : OFF,
    aux,
    toMain: !monOnly,
  };
}
export const defaultConsole = (buses: Bus[] = defaultBuses()): Record<ChId, Chan> => Object.fromEntries(CH_IDS.map((id) => [id, defaultChan(id, buses)])) as Record<ChId, Chan>;

export const defaultInputs = (): Record<InId, InputCfg> => {
  const types: InputCfg['type'][] = ['inalambrico', 'dinamico', 'dinamico', 'condensador', 'di', 'linea'];
  return Object.fromEntries(IN_IDS.map((id, i) => [id, { name: CH_META[id].name, type: types[i], device: null, side: 'mix', trim: 0, polarity: false }])) as Record<InId, InputCfg>;
};

export const defaultOutputs = (): Outputs => ({ sink: '', main: 0, cue: -1, buses: {}, cueReplacesMain: false, rec: 'main' });
export const defaultMask = (): RecallMask => ({ faders: true, mutes: true, pans: true, proc: true, sends: true, buses: true, fx: true, master: false, trims: false });
export const defaultSampler = (): SamplerCfg => ({ zones: [], attack: 0.005, release: 0.35 });

/* ---------- Escenas musicales ---------- */

const KIND_SOUND: Record<SectionKind, SoundId> = { intro: 'ambient', verso: 'grandpad', precoro: 'grandpad', coro: 'pianostrings', puente: 'gospel', interludio: 'ambient', tag: 'pianostrings', vamp: 'pianostrings', final: 'grandpad', otro: 'grandpad' };
const KIND_EXTRA: Record<SectionKind, ChId[]> = {
  intro: [],
  verso: ['guitarra', 'bajo', 'drums'],
  precoro: ['guitarra', 'bajo', 'drums', 'voz'],
  coro: ['voz', 'guitarra', 'bajo', 'drums', 'perc'],
  puente: ['voz', 'bajo'],
  interludio: ['bajo'],
  tag: ['voz', 'guitarra', 'bajo', 'drums'],
  vamp: ['voz', 'guitarra', 'bajo', 'drums', 'perc'],
  final: ['voz', 'guitarra', 'bajo', 'drums', 'perc'],
  otro: ['bajo', 'drums'],
};
const KIND_MACROS: Record<SectionKind, MusicScene['macros']> = {
  intro: { ambience: 0.7, brightness: 0.25, expression: 0.6 },
  verso: { ambience: 0.35, brightness: 0.35, expression: 0.65 },
  precoro: { ambience: 0.38, brightness: 0.4, expression: 0.72 },
  coro: { ambience: 0.42, brightness: 0.18, expression: 0.76 },
  puente: { ambience: 0.5, brightness: 0.4, expression: 0.8 },
  interludio: { ambience: 0.6, brightness: 0.3, expression: 0.6 },
  tag: { ambience: 0.5, brightness: 0.45, expression: 0.85 },
  vamp: { ambience: 0.45, brightness: 0.4, expression: 0.8 },
  final: { ambience: 0.6, brightness: 0.5, expression: 0.9 },
  otro: { ambience: 0.4, brightness: 0.4, expression: 0.7 },
};

export function layersFor(sound: SoundId): Layer[] {
  return soundById(sound).layers.map((l, i) => ({ ch: l.ch, zone: i === 0 ? 'all' : 'high' }));
}

/** Aplica las capas al nivel musical de la sección: nunca toca la consola del sonidista. */
export function applyLayers(music: MusicScene['music'], layers: Layer[]): MusicScene['music'] {
  const out = { ...music };
  const ids = layers.map((l) => l.ch);
  for (const id of ['piano', 'pad', 'organ', 'strings', 'brass', 'sampler'] as ChId[]) out[id] = { db: out[id]?.db ?? 0, on: ids.includes(id) };
  layers.forEach((l, i) => (out[l.ch] = { db: out[l.ch]?.on ? out[l.ch]!.db : i === 0 ? 0 : -3, on: true }));
  return out;
}

export function musicScene(kind: SectionKind): MusicScene {
  const music: MusicScene['music'] = {};
  for (const id of MUSIC_IDS) music[id] = { db: 0, on: id === 'tracks' || KIND_EXTRA[kind].includes(id) };
  const sound = KIND_SOUND[kind];
  const layers = layersFor(sound);
  return { sound, layers, macros: { ...KIND_MACROS[kind] }, music: applyLayers(music, layers) };
}

export function defaultMix(songs: Song[]): Record<string, Record<SceneId, MusicScene>> {
  const all: Record<string, Record<SceneId, MusicScene>> = {};
  songs.forEach((s) => {
    all[s.id] = {};
    s.sections.forEach((sc) => (all[s.id][sc.id] = musicScene(sc.kind)));
  });
  return all;
}

export const defaultFx = (): Fx => ({
  reverbOn: true, reverbSend: -12, reverbWet: 0.28, reverbSize: 2.8, reverbPre: 20, reverbDamp: 9000,
  delayOn: true, delaySend: -18, delayWet: 0.22, delayFb: 0.35, delayDiv: '1/4', delayTone: 4200,
  rotary: 'slow', drawbars: [8, 8, 6, 0, 0, 0, 0, 0, 0],
});

export const defaultMidi = (): MidiMap[] => [
  { id: 'ambience', label: 'Ambiente', cc: 91, ch: 1 },
  { id: 'brightness', label: 'Brillo', cc: 74, ch: 1 },
  { id: 'expression', label: 'Expresión', cc: 11, ch: 1 },
  { id: 'master', label: 'Volumen principal (solo sonidista)', cc: 7, ch: 1 },
  { id: 'sustain', label: 'Pedal de sustain', cc: 64, ch: 1 },
  { id: 'prev', label: 'Sección anterior', cc: 85, ch: 1 },
  { id: 'next', label: 'Sección siguiente', cc: 86, ch: 1 },
  { id: 'play', label: 'Reproducir / pausa', cc: 87, ch: 1 },
  { id: 'panic', label: 'Panic MIDI', cc: 123, ch: 1 },
];

export const mixDataOf = (s: { console: Record<ChId, Chan>; buses: Bus[]; master: number; masterMute: boolean; fx: Fx; inputs: Record<InId, InputCfg> }): MixData => ({
  console: s.console, buses: s.buses, master: s.master, masterMute: s.masterMute, fx: s.fx,
  trims: Object.fromEntries(IN_IDS.map((id) => [id, s.inputs[id].trim])),
});

/* ---------- Presets de canal para el editor ---------- */
export interface ChanPreset {
  id: string;
  name: string;
  for: ChId[] | 'all';
  gains: number[]; // 6 bandas
  hpf?: number;
  lpf?: number;
  comp?: Partial<Chan['comp']>;
}
const VOICES: ChId[] = ['voz', 'in1', 'in2', 'in3', 'in4'];
export const PRESETS: ChanPreset[] = [
  { id: 'flat', name: 'Plano', for: 'all', gains: [0, 0, 0, 0, 0, 0] },
  { id: 'mud', name: 'Quitar lodo', for: 'all', gains: [0, -1.5, -4, 0, 0.5, 0] },
  { id: 'warm', name: 'Cálido', for: 'all', gains: [2, 1.5, 0, -1, -1.5, -2] },
  { id: 'bright', name: 'Brillante', for: 'all', gains: [-1, 0, -1, 2, 3, 4] },
  { id: 'vocwarm', name: 'Voz cálida', for: VOICES, gains: [-2, 1.5, -2, 1.5, 1, 1.5], hpf: 110, comp: { on: true, threshold: -22, ratio: 3, attack: 10, release: 160, makeup: 4 } },
  { id: 'vocfront', name: 'Voz al frente', for: VOICES, gains: [-3, -1, -2.5, 3.5, 2, 3], hpf: 130, comp: { on: true, threshold: -24, ratio: 4, attack: 6, release: 120, makeup: 6 } },
  { id: 'preach', name: 'Predicación clara', for: ['in1', 'in2'], gains: [-4, -1, -3, 3, 1.5, 0], hpf: 140, comp: { on: true, threshold: -26, ratio: 3.5, attack: 8, release: 180, makeup: 5 } },
  { id: 'pianobright', name: 'Piano brillante', for: ['piano', 'in6'], gains: [-1, -1.5, -2, 2, 3, 3.5], hpf: 70 },
  { id: 'pianowarm', name: 'Piano cálido', for: ['piano', 'in6'], gains: [2, 1, -1, -0.5, -1, -2], hpf: 50 },
  { id: 'padsoft', name: 'Pad suave', for: ['pad', 'strings'], gains: [-2, -1, -1, -1, -2, -3], hpf: 120, lpf: 9000 },
  { id: 'padair', name: 'Pad aireado', for: ['pad', 'strings', 'voz'], gains: [-3, -2, -1.5, 0.5, 2, 5], hpf: 160 },
  { id: 'basbody', name: 'Bajo con cuerpo', for: ['bajo'], gains: [3.5, 1.5, -3, 1.5, 0, -2], comp: { on: true, threshold: -18, ratio: 4, attack: 20, release: 180, makeup: 3 } },
  { id: 'basfunk', name: 'Bajo funk', for: ['bajo'], gains: [2, -2, -3, 3, 4, 1], comp: { on: true, threshold: -20, ratio: 5, attack: 8, release: 120, makeup: 4 } },
  { id: 'kitpunch', name: 'Batería pegada', for: ['drums', 'perc'], gains: [3, -1, -4, 2, 2, 3], comp: { on: true, threshold: -16, ratio: 4, attack: 25, release: 140, makeup: 3 } },
  { id: 'gtclean', name: 'Guitarra limpia', for: ['guitarra', 'in5'], gains: [-3, -1, -1.5, 2, 2.5, 1.5], hpf: 120 },
  { id: 'organfat', name: 'Órgano gordo', for: ['organ'], gains: [2.5, 2, -1, 1, 0, -1.5] },
  { id: 'brassbright', name: 'Metales con brillo', for: ['brass'], gains: [-2, 0, -1.5, 2.5, 2, 1], hpf: 120 },
];

export const presetsFor = (id: ChId) => PRESETS.filter((p) => p.for === 'all' || p.for.includes(id));
export const isPlayable = (id: ChId) => PLAYABLE.includes(id);
export const chName = (s: { inputs: Record<InId, InputCfg> }, id: ChId) => (isInput(id) ? s.inputs[id].name : CH_META[id].name);
export const chIcon = (id: ChId) => (id === 'in5' ? 'guitarra' : id === 'in6' ? 'keys' : isInput(id) ? 'voz' : id === 'brass' ? 'brass' : id === 'sampler' ? 'grid' : id);

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const noteName = (n: number) => `${NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
export const isBlack = (n: number) => [1, 3, 6, 8, 10].includes(((n % 12) + 12) % 12);
