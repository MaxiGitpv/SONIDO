import type { EditTab, Fx, Inst, InstSetup, MidiMap, PerfState, SceneId, SceneMix, SoundId } from './types';
import { SCENE_LIST } from './types';
import { SONGS, defaultFx, defaultInst, defaultMidi, defaultMix, layersFor } from './data';
import { clone } from '../util';

export type PAction =
  | { type: 'song'; id: string }
  | { type: 'scene'; id: SceneId }
  | { type: 'step'; dir: 1 | -1 }
  | { type: 'sound'; id: SoundId }
  | { type: 'layerOn'; inst: Inst }
  | { type: 'layerLevel'; inst: Inst; level: number }
  | { type: 'macro'; key: keyof SceneMix['macros']; value: number }
  | { type: 'master'; value: number }
  | { type: 'inst'; inst: Inst; patch: Partial<InstSetup> }
  | { type: 'fx'; patch: Partial<Fx> }
  | { type: 'drawbar'; index: number; value: number }
  | { type: 'midi'; id: string; patch: Partial<MidiMap> }
  | { type: 'edit'; on: boolean }
  | { type: 'editTab'; tab: EditTab }
  | { type: 'test'; patch: Partial<PerfState['test']> }
  | { type: 'note'; note: number; down: boolean }
  | { type: 'panic' }
  | { type: 'resetSong' }
  | { type: 'toast'; text: string };

const KEY = 'sonido.perf.v1';
type Saved = Pick<PerfState, 'songId' | 'sceneId' | 'mix' | 'inst' | 'fx' | 'master' | 'midi'>;

export function perfInit(): PerfState {
  const base: Saved = { songId: SONGS[0].id, sceneId: 'verso', mix: defaultMix(), inst: defaultInst(), fx: defaultFx(), master: 0.8, midi: defaultMidi() };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Saved;
      if (s.mix && s.inst && s.fx && s.midi && SONGS.every((x) => s.mix[x.id])) Object.assign(base, s);
    }
  } catch {
    /* sin almacenamiento: se parte de los valores de ejemplo */
  }
  return { ...base, edit: false, editTab: 'ranges', test: { on: false, t: 0, auto: false }, held: [], toast: null };
}

export function perfSave(s: PerfState) {
  const out: Saved = { songId: s.songId, sceneId: s.sceneId, mix: s.mix, inst: s.inst, fx: s.fx, master: s.master, midi: s.midi };
  try {
    localStorage.setItem(KEY, JSON.stringify(out));
  } catch {
    /* ignorado */
  }
}

let seq = 0;
const say = (s: PerfState, text: string): PerfState => ({ ...s, toast: { id: ++seq, text } });

const editScene = (s: PerfState, fn: (m: SceneMix) => SceneMix): PerfState => ({
  ...s,
  mix: { ...s.mix, [s.songId]: { ...s.mix[s.songId], [s.sceneId]: fn(s.mix[s.songId][s.sceneId]) } },
});

export function perfReducer(s: PerfState, a: PAction): PerfState {
  switch (a.type) {
    case 'song':
      return { ...s, songId: a.id, sceneId: 'intro', test: { ...s.test, on: false, auto: false }, held: [] };
    case 'scene':
      return { ...s, sceneId: a.id, test: { ...s.test, on: false, auto: false } };
    case 'step': {
      const si = SCENE_LIST.findIndex((x) => x.id === s.sceneId);
      const sg = SONGS.findIndex((x) => x.id === s.songId);
      let ni = si + a.dir;
      let ng = sg;
      if (ni >= SCENE_LIST.length) {
        if (sg === SONGS.length - 1) return say(s, 'Última escena del repertorio');
        ng = sg + 1;
        ni = 0;
      } else if (ni < 0) {
        if (sg === 0) return say(s, 'Primera escena del repertorio');
        ng = sg - 1;
        ni = SCENE_LIST.length - 1;
      }
      return { ...s, songId: SONGS[ng].id, sceneId: SCENE_LIST[ni].id, test: { ...s.test, on: false, auto: false } };
    }
    case 'sound':
      return editScene(s, (m) => ({ ...m, sound: a.id, layers: layersFor(a.id, m.layers) }));
    case 'layerOn':
      return editScene(s, (m) => ({ ...m, layers: { ...m.layers, [a.inst]: { ...m.layers[a.inst], on: !m.layers[a.inst].on } } }));
    case 'layerLevel':
      return editScene(s, (m) => ({ ...m, layers: { ...m.layers, [a.inst]: { on: a.level > 0.001 ? true : m.layers[a.inst].on, level: a.level } } }));
    case 'macro':
      return editScene(s, (m) => ({ ...m, macros: { ...m.macros, [a.key]: a.value } }));
    case 'master':
      return { ...s, master: a.value };
    case 'inst':
      return { ...s, inst: { ...s.inst, [a.inst]: { ...s.inst[a.inst], ...a.patch } } };
    case 'fx':
      return { ...s, fx: { ...s.fx, ...a.patch } };
    case 'drawbar':
      return { ...s, fx: { ...s.fx, drawbars: s.fx.drawbars.map((v, i) => (i === a.index ? a.value : v)) } };
    case 'midi':
      return { ...s, midi: s.midi.map((m) => (m.id === a.id ? { ...m, ...a.patch } : m)) };
    case 'edit':
      return { ...s, edit: a.on };
    case 'editTab':
      return { ...s, editTab: a.tab };
    case 'test':
      return { ...s, test: { ...s.test, ...a.patch } };
    case 'note':
      return { ...s, held: a.down ? (s.held.includes(a.note) ? s.held : [...s.held, a.note]) : s.held.filter((n) => n !== a.note) };
    case 'panic':
      return say({ ...s, held: [] }, 'Panic MIDI: todas las notas apagadas (simulado, sin salida MIDI)');
    case 'resetSong':
      return say({ ...s, mix: { ...s.mix, [s.songId]: clone(defaultMix()[s.songId]) } }, 'Escenas de la canción restablecidas');
    case 'toast':
      return say(s, a.text);
  }
}
