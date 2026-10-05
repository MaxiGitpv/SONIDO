import type { Chan, ChId, Fx, LiveState, Macros, MidiMap, SceneId, SceneMix, SoundId, Song, Tab, EqTab, SoundCat } from './types';
import { SCENES } from './types';
import { SONGS, applySound, defaultFx, defaultMidi, defaultMix, sceneMix } from './data';
import { clone } from '../util';

export type LAction =
  | { type: 'tab'; tab: Tab }
  | { type: 'eqTab'; tab: EqTab }
  | { type: 'cat'; cat: SoundCat }
  | { type: 'song'; id: string }
  | { type: 'scene'; id: SceneId }
  | { type: 'step'; dir: 1 | -1 }
  | { type: 'select'; id: ChId }
  | { type: 'sound'; id: SoundId }
  | { type: 'ch'; id: ChId; fn: (c: Chan) => Chan }
  | { type: 'macro'; key: keyof Macros; value: number }
  | { type: 'fx'; patch: Partial<Fx> }
  | { type: 'drawbar'; index: number; value: number }
  | { type: 'master'; db?: number; mute?: boolean }
  | { type: 'split'; value: number }
  | { type: 'transpose'; value: number }
  | { type: 'playing'; on: boolean }
  | { type: 'track'; name: string | null }
  | { type: 'clickMon'; on: boolean }
  | { type: 'midi'; id: string; patch: Partial<MidiMap> }
  | { type: 'songEdit'; id: string; patch: Partial<Song> }
  | { type: 'songAdd' }
  | { type: 'clearSolo' }
  | { type: 'save' }
  | { type: 'left'; open: boolean }
  | { type: 'toast'; text: string };

const KEY = 'sonido.live.v1';
type Saved = Pick<LiveState, 'songs' | 'songId' | 'sceneId' | 'mix' | 'fx' | 'master' | 'midi' | 'split' | 'transpose'>;

export function liveInit(): LiveState {
  const base: Saved = { songs: SONGS, songId: 's2', sceneId: 'coro', mix: defaultMix(SONGS), fx: defaultFx(), master: -4.2, midi: defaultMidi(), split: 48, transpose: 0 };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Saved;
      if (s.songs?.length && s.mix && s.fx && s.songs.every((x) => s.mix[x.id])) Object.assign(base, s);
    }
  } catch {
    /* sin almacenamiento */
  }
  return {
    ...base, selected: 'piano', tab: 'live', eqTab: 'eq', soundCat: 'Pianos', playing: false, trackName: null,
    clickMonitor: false, masterMute: false, dirty: false, leftOpen: false, toast: null,
  };
}

export function liveSave(s: LiveState): boolean {
  const out: Saved = { songs: s.songs, songId: s.songId, sceneId: s.sceneId, mix: s.mix, fx: s.fx, master: s.master, midi: s.midi, split: s.split, transpose: s.transpose };
  try {
    localStorage.setItem(KEY, JSON.stringify(out));
    return true;
  } catch {
    return false;
  }
}

let seq = 0;
const say = (s: LiveState, text: string): LiveState => ({ ...s, toast: { id: ++seq, text } });
const edit = (s: LiveState, fn: (m: SceneMix) => SceneMix): LiveState => ({
  ...s,
  dirty: true,
  mix: { ...s.mix, [s.songId]: { ...s.mix[s.songId], [s.sceneId]: fn(s.mix[s.songId][s.sceneId]) } },
});

export function liveReducer(s: LiveState, a: LAction): LiveState {
  switch (a.type) {
    case 'tab': return { ...s, tab: a.tab, leftOpen: false };
    case 'eqTab': return { ...s, eqTab: a.tab };
    case 'cat': return { ...s, soundCat: a.cat };
    case 'song': return { ...s, songId: a.id, sceneId: 'intro', leftOpen: false };
    case 'scene': return { ...s, sceneId: a.id };
    case 'step': {
      const si = SCENES.findIndex((x) => x.id === s.sceneId);
      const gi = s.songs.findIndex((x) => x.id === s.songId);
      let ni = si + a.dir;
      let ng = gi;
      if (ni >= SCENES.length) { ng++; ni = 0; }
      if (ni < 0) { ng--; ni = SCENES.length - 1; }
      if (ng < 0 || ng >= s.songs.length) return say(s, ng < 0 ? 'Primera escena del repertorio' : 'Última escena del repertorio');
      return { ...s, songId: s.songs[ng].id, sceneId: SCENES[ni].id };
    }
    case 'select': return { ...s, selected: a.id };
    case 'sound': return edit(s, (m) => ({ ...m, sound: a.id, chans: applySound(m.chans, a.id) }));
    case 'ch': return edit(s, (m) => ({ ...m, chans: { ...m.chans, [a.id]: a.fn(m.chans[a.id]) } }));
    case 'macro': return edit(s, (m) => ({ ...m, macros: { ...m.macros, [a.key]: a.value } }));
    case 'fx': return { ...s, fx: { ...s.fx, ...a.patch }, dirty: true };
    case 'drawbar': return { ...s, fx: { ...s.fx, drawbars: s.fx.drawbars.map((v, i) => (i === a.index ? a.value : v)) }, dirty: true };
    case 'master': return { ...s, master: a.db ?? s.master, masterMute: a.mute ?? s.masterMute, dirty: true };
    case 'split': return { ...s, split: a.value };
    case 'transpose': return { ...s, transpose: a.value };
    case 'playing': return { ...s, playing: a.on };
    case 'track': return { ...s, trackName: a.name };
    case 'clickMon': return { ...s, clickMonitor: a.on };
    case 'midi': return { ...s, midi: s.midi.map((m) => (m.id === a.id ? { ...m, ...a.patch } : m)), dirty: true };
    case 'songEdit': return { ...s, songs: s.songs.map((x) => (x.id === a.id ? { ...x, ...a.patch } : x)), dirty: true };
    case 'songAdd': {
      const id = `u${Date.now().toString(36)}`;
      const song: Song = { id, title: `Canción ${s.songs.length + 1}`, key: 'G', bpm: 70, ts: '4/4' };
      return say({ ...s, songs: [...s.songs, song], mix: { ...s.mix, [id]: clone(defaultMix([song])[id]) }, songId: id, sceneId: 'intro', dirty: true }, 'Canción añadida al repertorio');
    }
    case 'clearSolo': return { ...s, mix: { ...s.mix, [s.songId]: { ...s.mix[s.songId], [s.sceneId]: { ...s.mix[s.songId][s.sceneId], chans: Object.fromEntries(Object.entries(s.mix[s.songId][s.sceneId].chans).map(([k, c]) => [k, { ...c, solo: false }])) as SceneMix['chans'] } } } };
    case 'save': {
      const ok = liveSave(s);
      return say({ ...s, dirty: ok ? false : s.dirty }, ok ? `Escena «${SCENES.find((x) => x.id === s.sceneId)?.label}» guardada en este navegador` : 'No se pudo guardar: el navegador bloquea el almacenamiento');
    }
    case 'left': return { ...s, leftOpen: a.open };
    case 'toast': return say(s, a.text);
  }
}

export { sceneMix };
