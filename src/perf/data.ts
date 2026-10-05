import type { Fx, Inst, InstSetup, Layer, MidiMap, SceneId, SceneMix, Song, SoundId, Macros } from './types';
import { INSTS, SCENE_LIST } from './types';

export const INST_META: Record<Inst, { label: string; color: string }> = {
  piano: { label: 'Piano', color: '#efe6d0' },
  pad: { label: 'Pad', color: '#9b7bff' },
  organ: { label: 'Órgano', color: '#e8a53a' },
  strings: { label: 'Cuerdas', color: '#2fb5a8' },
};

export interface SoundInfo {
  id: SoundId;
  name: string;
  tag: string;
  layers: Partial<Record<Inst, number>>;
}

export const SOUNDS: SoundInfo[] = [
  { id: 'grand', name: 'Grand Worship', tag: 'Piano acústico y pad cálido', layers: { piano: 0.85, pad: 0.5 } },
  { id: 'rhodes', name: 'Velvet Rhodes', tag: 'Piano eléctrico, tremolo y chorus sutil', layers: { piano: 0.8 } },
  { id: 'organ', name: 'Gospel Organ', tag: 'Drawbars, rotary lento o rápido y expresión', layers: { organ: 0.85 } },
  { id: 'ambient', name: 'Ambient Prayer', tag: 'Pad de ataque lento y reverb amplia', layers: { pad: 0.85 } },
  { id: 'pianostrings', name: 'Piano + Strings', tag: 'Piano y cuerdas controladas por expresión', layers: { piano: 0.8, strings: 0.6 } },
];
export const soundById = (id: SoundId) => SOUNDS.find((s) => s.id === id)!;

export const SONGS: Song[] = [
  { id: 's1', title: 'Sublime gracia', key: 'G', bpm: 68 },
  { id: 's2', title: 'Cuán grande es Él', key: 'C', bpm: 72 },
  { id: 's3', title: 'Santo, santo, santo', key: 'D', bpm: 80 },
  { id: 's4', title: 'Rey de reyes', key: 'E', bpm: 76 },
  { id: 's5', title: 'Oh Dios, eterno', key: 'A', bpm: 64 },
];

const layer = (on: boolean, level: number): Layer => ({ on, level });

export function layersFor(sound: SoundId, prev?: SceneMix['layers']): SceneMix['layers'] {
  const preset = soundById(sound).layers;
  const out = {} as SceneMix['layers'];
  for (const i of INSTS) {
    const p = preset[i];
    out[i] = p !== undefined ? layer(true, p) : layer(false, prev?.[i].level ?? 0.5);
  }
  return out;
}

const macros = (ambience: number, brightness: number, expression: number): Macros => ({ ambience, brightness, expression });

function sceneMix(scene: SceneId, songIdx: number): SceneMix {
  switch (scene) {
    case 'intro':
      return { sound: 'ambient', layers: layersFor('ambient'), macros: macros(0.78, 0.35, 0.6) };
    case 'verso': {
      const sound: SoundId = songIdx === 2 ? 'rhodes' : 'grand';
      const layers = layersFor(sound);
      if (sound === 'grand') {
        layers.piano.level = 0.74;
        layers.pad.level = 0.32;
      }
      return { sound, layers, macros: macros(0.32, 0.45, 0.55) };
    }
    case 'coro': {
      const layers = layersFor('pianostrings');
      layers.piano.level = 0.86;
      layers.strings.level = 0.72;
      layers.pad = layer(true, 0.55);
      return { sound: 'pianostrings', layers, macros: macros(0.5, 0.72, 0.85) };
    }
    case 'puente': {
      const layers = layersFor('organ');
      layers.pad = layer(true, 0.4);
      return { sound: 'organ', layers, macros: macros(0.45, 0.55, 0.75) };
    }
    case 'final': {
      const layers = layersFor('grand');
      layers.pad.level = 0.62;
      layers.strings = layer(true, 0.38);
      return { sound: 'grand', layers, macros: macros(0.66, 0.78, 0.88) };
    }
  }
}

export function defaultMix(): Record<string, Record<SceneId, SceneMix>> {
  const all: Record<string, Record<SceneId, SceneMix>> = {};
  SONGS.forEach((s, i) => {
    all[s.id] = {} as Record<SceneId, SceneMix>;
    SCENE_LIST.forEach((sc) => (all[s.id][sc.id] = sceneMix(sc.id, i)));
  });
  return all;
}

export function defaultInst(): Record<Inst, InstSetup> {
  return {
    piano: { lo: 36, hi: 96, transpose: 0, gamma: 1 },
    pad: { lo: 36, hi: 72, transpose: 0, gamma: 0.8 },
    organ: { lo: 36, hi: 84, transpose: 0, gamma: 1 },
    strings: { lo: 60, hi: 96, transpose: 0, gamma: 0.7 },
  };
}

export function defaultFx(): Fx {
  return { reverbSize: 0.6, reverbMix: 0.35, reverbPre: 24, chorusRate: 0.8, chorusDepth: 0.25, tremRate: 4.5, tremDepth: 0.3, rotary: 'slow', drawbars: [8, 8, 6, 0, 0, 0, 0, 0, 0] };
}

export function defaultMidi(): MidiMap[] {
  return [
    { id: 'ambience', label: 'Ambiente', cc: 91, ch: 1 },
    { id: 'brightness', label: 'Brillo', cc: 74, ch: 1 },
    { id: 'expression', label: 'Expresión', cc: 11, ch: 1 },
    { id: 'master', label: 'Volumen principal', cc: 7, ch: 1 },
    { id: 'piano', label: 'Nivel Piano', cc: 20, ch: 1 },
    { id: 'pad', label: 'Nivel Pad', cc: 21, ch: 1 },
    { id: 'organ', label: 'Nivel Órgano', cc: 22, ch: 1 },
    { id: 'strings', label: 'Nivel Cuerdas', cc: 23, ch: 1 },
    { id: 'prev', label: 'Anterior', cc: 85, ch: 1 },
    { id: 'next', label: 'Siguiente', cc: 86, ch: 1 },
    { id: 'panic', label: 'Panic MIDI', cc: 123, ch: 1 },
  ];
}

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const noteName = (n: number) => `${NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
export const isBlack = (n: number) => [1, 3, 6, 8, 10].includes(n % 12);
