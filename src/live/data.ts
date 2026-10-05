import type { Chan, ChId, Fx, MidiMap, Song, SceneId, SceneMix, SoundCat, SoundId } from './types';
import { CH_IDS, KEY_CH, SCENES } from './types';

export const CH_META: Record<ChId, { name: string; color: string; badge: string }> = {
  piano: { name: 'Piano', color: '#35b4ff', badge: 'Sinte' },
  pad: { name: 'Pad', color: '#a06bff', badge: 'Sinte' },
  organ: { name: 'Órgano', color: '#f0a23a', badge: 'Sinte' },
  strings: { name: 'Cuerdas', color: '#c75bd6', badge: 'Sinte' },
  voz: { name: 'Voz', color: '#ef5b73', badge: 'Sinte' },
  guitarra: { name: 'Guitarra', color: '#3fcf8e', badge: 'Sinte' },
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

export const SONGS: Song[] = [
  { id: 's1', title: 'Apertura', key: 'D', bpm: 72, ts: '4/4' },
  { id: 's2', title: 'Bondad de Dios', key: 'A', bpm: 68, ts: '4/4' },
  { id: 's3', title: 'Cuán grande es Él', key: 'E', bpm: 76, ts: '4/4' },
  { id: 's4', title: 'Momento de oración', key: 'C', bpm: 60, ts: '4/4' },
];
export const KEY_SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const KEY_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const mk = (id: ChId, fader: number, mute: boolean, pan = 0): Chan => ({
  id,
  fader,
  pan,
  mute,
  solo: false,
  hpf: { on: id !== 'click', freq: id === 'piano' || id === 'organ' ? 60 : id === 'guitarra' ? 110 : 40 },
  eqOn: true,
  eq: [
    { freq: 100, gain: 0, q: 0.9, on: true },
    { freq: 400, gain: 0, q: 1, on: true },
    { freq: 2500, gain: 0, q: 1, on: true },
    { freq: 9000, gain: 0, q: 0.9, on: true },
  ],
  comp: { on: id === 'voz' || id === 'guitarra', threshold: -20, ratio: 3, attack: 15, release: 200, makeup: 2 },
  sendRev: id === 'pad' || id === 'strings' ? -14 : id === 'piano' || id === 'voz' ? -20 : -90,
  sendDly: id === 'voz' || id === 'guitarra' ? -22 : -90,
});

const SCENE_SOUND: Record<SceneId, SoundId> = { intro: 'ambient', verso: 'grandpad', coro: 'pianostrings', puente: 'gospel', final: 'grandpad' };
const EXTRA: Record<SceneId, ChId[]> = { intro: [], verso: ['guitarra'], coro: ['voz', 'guitarra'], puente: ['voz'], final: ['voz', 'guitarra'] };
const MACROS: Record<SceneId, SceneMix['macros']> = {
  intro: { ambience: 0.7, brightness: 0.25, expression: 0.6 },
  verso: { ambience: 0.35, brightness: 0.35, expression: 0.65 },
  coro: { ambience: 0.42, brightness: 0.18, expression: 0.76 },
  puente: { ambience: 0.5, brightness: 0.4, expression: 0.8 },
  final: { ambience: 0.6, brightness: 0.5, expression: 0.9 },
};

export function applySound(chans: SceneMix['chans'], sound: SoundId): SceneMix['chans'] {
  const layers = soundById(sound).layers.map((l) => l.ch);
  const out = { ...chans };
  for (const id of KEY_CH) {
    const on = layers.includes(id);
    out[id] = { ...out[id], mute: !on, fader: on ? (layers[0] === id ? -7.3 : -10.5) : out[id].fader };
  }
  return out;
}

export function sceneMix(scene: SceneId): SceneMix {
  const chans = {} as SceneMix['chans'];
  for (const id of CH_IDS) chans[id] = mk(id, id === 'tracks' ? -9 : id === 'click' ? -14 : -9, id !== 'tracks', id === 'guitarra' ? 18 : 0);
  for (const id of EXTRA[scene]) chans[id] = { ...chans[id], mute: false, fader: id === 'voz' ? -6 : -9 };
  chans.click.mute = false;
  const sound = SCENE_SOUND[scene];
  return { sound, chans: applySound(chans, sound), macros: { ...MACROS[scene] } };
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
  { id: 'prev', label: 'Escena anterior', cc: 85, ch: 1 },
  { id: 'next', label: 'Escena siguiente', cc: 86, ch: 1 },
  { id: 'play', label: 'Reproducir / pausa', cc: 87, ch: 1 },
  { id: 'panic', label: 'Panic MIDI', cc: 123, ch: 1 },
];

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const noteName = (n: number) => `${NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
export const isBlack = (n: number) => [1, 3, 6, 8, 10].includes(((n % 12) + 12) % 12);
