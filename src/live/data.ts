import type { Chan, ChId, Fx, Layer, MidiMap, Section, Song, SceneId, SceneMix, SoundCat, SoundId, Style } from './types';
import type { EqBand } from '../types';
import { CH_IDS, PLAYABLE, SCENES } from './types';

export const CH_META: Record<ChId, { name: string; color: string; badge: string }> = {
  piano: { name: 'Piano', color: '#35b4ff', badge: 'Sinte' },
  pad: { name: 'Pad', color: '#a06bff', badge: 'Sinte' },
  organ: { name: 'Órgano', color: '#f0a23a', badge: 'Sinte' },
  strings: { name: 'Cuerdas', color: '#c75bd6', badge: 'Sinte' },
  voz: { name: 'Coro', color: '#ef5b73', badge: 'Sinte' },
  guitarra: { name: 'Guitarra', color: '#3fcf8e', badge: 'Sinte' },
  bajo: { name: 'Bajo', color: '#5b8cff', badge: 'Sinte' },
  drums: { name: 'Batería', color: '#ff8a4c', badge: 'Sinte' },
  perc: { name: 'Percusión', color: '#e6c84a', badge: 'Sinte' },
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
];
export const soundById = (id: SoundId) => SOUNDS.find((s) => s.id === id)!;
export const CATS: SoundCat[] = ['Pianos', 'Pads', 'Órganos', 'Cuerdas'];

/** Nombre y descripción de una capa: los del sonido si la trae, si no los del instrumento. */
export const LAYER_INFO: Record<ChId, { name: string; desc: string }> = {
  piano: { name: 'Concert Grand', desc: 'Piano acústico' },
  pad: { name: 'Warm Analog Pad', desc: 'Pad cálido' },
  organ: { name: 'Gospel Organ', desc: 'Drawbars y rotary' },
  strings: { name: 'Strings Ensemble', desc: 'Cuerdas con expresión' },
  voz: { name: 'Choir Ooh', desc: 'Coro sintético' },
  guitarra: { name: 'Clean Guitar', desc: 'Guitarra limpia' },
  bajo: { name: 'Finger Bass', desc: 'Bajo eléctrico' },
  drums: { name: 'Batería', desc: '' },
  perc: { name: 'Percusión', desc: '' },
  tracks: { name: 'Tracks', desc: '' },
  click: { name: 'Click', desc: '' },
};
export function layerInfo(sound: SoundId, ch: ChId) {
  return soundById(sound).layers.find((l) => l.ch === ch) ?? LAYER_INFO[ch];
}

const ARR: Section[] = [
  { scene: 'intro', bars: 4 },
  { scene: 'verso', bars: 8 },
  { scene: 'coro', bars: 8 },
  { scene: 'puente', bars: 4 },
  { scene: 'final', bars: 4 },
];
export const SONGS: Song[] = [
  { id: 's1', title: 'Apertura', key: 'D', bpm: 118, ts: '4/4', style: 'jubilo', arr: ARR, end: 'next' },
  { id: 's2', title: 'Bondad de Dios', key: 'A', bpm: 68, ts: '4/4', style: 'worship', arr: ARR, end: 'stop' },
  { id: 's3', title: 'Cuán grande es Él', key: 'E', bpm: 76, ts: '4/4', style: 'balada', arr: ARR, end: 'stop' },
  { id: 's4', title: 'Momento de oración', key: 'C', bpm: 60, ts: '4/4', style: 'worship', arr: ARR, end: 'stop' },
  { id: 's5', title: 'Alabanza latina', key: 'G', bpm: 96, ts: '4/4', style: 'salsa', arr: ARR, end: 'stop' },
];
export const KEY_SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const KEY_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const STYLE_BPM: Record<Style, number> = { worship: 72, balada: 66, jubilo: 120, funk: 104, salsa: 96, tumbao: 92, merengue: 128, samba: 100 };

export const EQ_FREQS = [90, 250, 600, 2500, 6000, 11000];
export const EQ_NAMES = ['Graves', 'Cuerpo', 'Lodo', 'Presencia', 'Definición', 'Brillo'];
const flatEq = (): EqBand[] => EQ_FREQS.map((freq, i) => ({ freq, gain: 0, q: i === 0 || i === 5 ? 0.8 : 1.1, on: true }));

const mk = (id: ChId, fader: number, mute: boolean, pan = 0): Chan => ({
  id,
  fader,
  pan,
  mute,
  solo: false,
  hpf: { on: !['click', 'bajo', 'drums'].includes(id), freq: id === 'piano' || id === 'organ' ? 60 : id === 'guitarra' || id === 'voz' ? 110 : 40 },
  lpf: { on: false, freq: 18000 },
  eqOn: true,
  eq: flatEq(),
  comp: { on: ['voz', 'guitarra', 'bajo', 'drums'].includes(id), threshold: id === 'drums' ? -14 : -20, ratio: id === 'bajo' ? 4 : 3, attack: id === 'drums' ? 25 : 15, release: 200, makeup: 2 },
  sendRev: id === 'pad' || id === 'strings' ? -14 : id === 'piano' || id === 'voz' ? -20 : id === 'drums' ? -26 : -90,
  sendDly: id === 'voz' || id === 'guitarra' ? -22 : -90,
});

const SCENE_SOUND: Record<SceneId, SoundId> = { intro: 'ambient', verso: 'grandpad', coro: 'pianostrings', puente: 'gospel', final: 'grandpad' };
const EXTRA: Record<SceneId, ChId[]> = {
  intro: [],
  verso: ['guitarra', 'bajo', 'drums'],
  coro: ['voz', 'guitarra', 'bajo', 'drums', 'perc'],
  puente: ['voz', 'bajo'],
  final: ['voz', 'guitarra', 'bajo', 'drums', 'perc'],
};
const MACROS: Record<SceneId, SceneMix['macros']> = {
  intro: { ambience: 0.7, brightness: 0.25, expression: 0.6 },
  verso: { ambience: 0.35, brightness: 0.35, expression: 0.65 },
  coro: { ambience: 0.42, brightness: 0.18, expression: 0.76 },
  puente: { ambience: 0.5, brightness: 0.4, expression: 0.8 },
  final: { ambience: 0.6, brightness: 0.5, expression: 0.9 },
};
const LEVEL: Partial<Record<ChId, number>> = { voz: -6, guitarra: -11, bajo: -6, drums: -5, perc: -10, tracks: -9, click: -14 };

export function layersFor(sound: SoundId): Layer[] {
  return soundById(sound).layers.map((l, i) => ({ ch: l.ch, zone: i === 0 ? 'all' : 'high' }));
}

/** Aplica las capas: activa sus canales y silencia los demás instrumentos de teclado. */
export function applyLayers(chans: SceneMix['chans'], layers: Layer[]): SceneMix['chans'] {
  const out = { ...chans };
  const ids = layers.map((l) => l.ch);
  for (const id of ['piano', 'pad', 'organ', 'strings'] as ChId[]) {
    const on = ids.includes(id);
    out[id] = { ...out[id], mute: !on };
  }
  for (const id of ids) out[id] = { ...out[id], mute: false };
  return out;
}

export function sceneMix(scene: SceneId): SceneMix {
  const chans = {} as SceneMix['chans'];
  for (const id of CH_IDS) chans[id] = mk(id, LEVEL[id] ?? -9, !['tracks', 'click'].includes(id), id === 'guitarra' ? 18 : id === 'perc' ? -15 : 0);
  for (const id of EXTRA[scene]) chans[id] = { ...chans[id], mute: false };
  const sound = SCENE_SOUND[scene];
  const layers = layersFor(sound);
  const applied = applyLayers(chans, layers);
  layers.forEach((l, i) => (applied[l.ch] = { ...applied[l.ch], fader: i === 0 ? -7.3 : -10.5 }));
  return { sound, layers, chans: applied, macros: { ...MACROS[scene] } };
}

export function defaultMix(songs: Song[]): Record<string, Record<SceneId, SceneMix>> {
  const all: Record<string, Record<SceneId, SceneMix>> = {};
  songs.forEach((s) => {
    all[s.id] = {} as Record<SceneId, SceneMix>;
    SCENES.forEach((sc) => (all[s.id][sc.id] = sceneMix(sc.id)));
  });
  return all;
}

export const defaultFx = (): Fx => ({ reverbOn: true, reverbSend: -12, reverbWet: 0.28, delayOn: true, delaySend: -18, delayWet: 0.22, delayFb: 0.35, rotary: 'slow', drawbars: [8, 8, 6, 0, 0, 0, 0, 0, 0] });

export const defaultMidi = (): MidiMap[] => [
  { id: 'ambience', label: 'Ambiente', cc: 91, ch: 1 },
  { id: 'brightness', label: 'Brillo', cc: 74, ch: 1 },
  { id: 'expression', label: 'Expresión', cc: 11, ch: 1 },
  { id: 'master', label: 'Volumen principal', cc: 7, ch: 1 },
  { id: 'sustain', label: 'Pedal de sustain', cc: 64, ch: 1 },
  { id: 'prev', label: 'Escena anterior', cc: 85, ch: 1 },
  { id: 'next', label: 'Escena siguiente', cc: 86, ch: 1 },
  { id: 'play', label: 'Reproducir / pausa', cc: 87, ch: 1 },
  { id: 'panic', label: 'Panic MIDI', cc: 123, ch: 1 },
];

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
export const PRESETS: ChanPreset[] = [
  { id: 'flat', name: 'Plano', for: 'all', gains: [0, 0, 0, 0, 0, 0] },
  { id: 'mud', name: 'Quitar lodo', for: 'all', gains: [0, -1.5, -4, 0, 0.5, 0] },
  { id: 'warm', name: 'Cálido', for: 'all', gains: [2, 1.5, 0, -1, -1.5, -2] },
  { id: 'bright', name: 'Brillante', for: 'all', gains: [-1, 0, -1, 2, 3, 4] },
  { id: 'vocwarm', name: 'Voz cálida', for: ['voz'], gains: [-2, 1.5, -2, 1.5, 1, 1.5], hpf: 110, comp: { on: true, threshold: -22, ratio: 3, attack: 10, release: 160, makeup: 4 } },
  { id: 'vocfront', name: 'Voz al frente', for: ['voz'], gains: [-3, -1, -2.5, 3.5, 2, 3], hpf: 130, comp: { on: true, threshold: -24, ratio: 4, attack: 6, release: 120, makeup: 6 } },
  { id: 'pianobright', name: 'Piano brillante', for: ['piano'], gains: [-1, -1.5, -2, 2, 3, 3.5], hpf: 70 },
  { id: 'pianowarm', name: 'Piano cálido', for: ['piano'], gains: [2, 1, -1, -0.5, -1, -2], hpf: 50 },
  { id: 'padsoft', name: 'Pad suave', for: ['pad', 'strings'], gains: [-2, -1, -1, -1, -2, -3], hpf: 120, lpf: 9000 },
  { id: 'padair', name: 'Pad aireado', for: ['pad', 'strings', 'voz'], gains: [-3, -2, -1.5, 0.5, 2, 5], hpf: 160 },
  { id: 'basbody', name: 'Bajo con cuerpo', for: ['bajo'], gains: [3.5, 1.5, -3, 1.5, 0, -2], comp: { on: true, threshold: -18, ratio: 4, attack: 20, release: 180, makeup: 3 } },
  { id: 'basfunk', name: 'Bajo funk', for: ['bajo'], gains: [2, -2, -3, 3, 4, 1], comp: { on: true, threshold: -20, ratio: 5, attack: 8, release: 120, makeup: 4 } },
  { id: 'kitpunch', name: 'Batería pegada', for: ['drums', 'perc'], gains: [3, -1, -4, 2, 2, 3], comp: { on: true, threshold: -16, ratio: 4, attack: 25, release: 140, makeup: 3 } },
  { id: 'gtclean', name: 'Guitarra limpia', for: ['guitarra'], gains: [-3, -1, -1.5, 2, 2.5, 1.5], hpf: 120 },
  { id: 'organfat', name: 'Órgano gordo', for: ['organ'], gains: [2.5, 2, -1, 1, 0, -1.5] },
];

export const presetsFor = (id: ChId) => PRESETS.filter((p) => p.for === 'all' || p.for.includes(id));
export const isPlayable = (id: ChId) => PLAYABLE.includes(id);

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const noteName = (n: number) => `${NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
export const isBlack = (n: number) => [1, 3, 6, 8, 10].includes(((n % 12) + 12) % 12);
