import type { Chan, ChId, EndAction, EqTab, Fx, InId, InputCfg, LiveState, Macros, MidiMap, PlayMode, SceneId, SceneMix, Song, SoundCat, SoundId, SrcMode, StripGroup, Style, Tab, Zone } from './types';
import { CH_IDS, SCENES } from './types';
import { SONGS, STYLE_BPM, applyLayers, defaultChan, defaultFx, defaultInputs, defaultMidi, defaultMix, layersFor, PRESETS } from './data';
import { clone } from '../util';

export type LAction =
  | { type: 'tab'; tab: Tab }
  | { type: 'eqTab'; tab: EqTab }
  | { type: 'cat'; cat: SoundCat }
  | { type: 'song'; id: string }
  | { type: 'songStep'; dir: 1 | -1 }
  | { type: 'scene'; id: SceneId }
  | { type: 'step'; dir: 1 | -1 }
  | { type: 'select'; id: ChId }
  | { type: 'sound'; id: SoundId }
  | { type: 'layerAdd'; ch: ChId }
  | { type: 'layerRemove'; ch: ChId }
  | { type: 'layerZone'; ch: ChId; zone: Zone }
  | { type: 'ch'; id: ChId; fn: (c: Chan) => Chan }
  | { type: 'preset'; id: ChId; preset: string }
  | { type: 'macro'; key: keyof Macros; value: number }
  | { type: 'fx'; patch: Partial<Fx> }
  | { type: 'drawbar'; index: number; value: number }
  | { type: 'master'; db?: number; mute?: boolean }
  | { type: 'split'; value: number }
  | { type: 'transpose'; value: number }
  | { type: 'octave'; value: number }
  | { type: 'sustain'; on: boolean }
  | { type: 'playMode'; mode: PlayMode }
  | { type: 'src'; ch: 'pad' | 'drums'; mode: SrcMode }
  | { type: 'file'; ch: ChId; name: string | null }
  | { type: 'playing'; on: boolean }
  | { type: 'clickMon'; on: boolean }
  | { type: 'midi'; id: string; patch: Partial<MidiMap> }
  | { type: 'songEdit'; id: string; patch: Partial<Song> }
  | { type: 'style'; style: Style }
  | { type: 'bars'; index: number; bars: number }
  | { type: 'end'; end: EndAction }
  | { type: 'songAdd' }
  | { type: 'clearSolo' }
  | { type: 'editor'; id: ChId | null }
  | { type: 'input'; id: InId; patch: Partial<InputCfg> }
  | { type: 'group'; group: StripGroup }
  | { type: 'playPanel'; panel: 'keys' | 'pads' }
  | { type: 'save' }
  | { type: 'left'; open: boolean }
  | { type: 'toast'; text: string };

const KEY = 'sonido.live.v2';
type Saved = Pick<LiveState, 'songs' | 'songId' | 'sceneId' | 'mix' | 'fx' | 'master' | 'midi' | 'split' | 'transpose' | 'playMode' | 'src' | 'inputs'>;

export function liveInit(): LiveState {
  const base: Saved = { songs: SONGS, songId: 's2', sceneId: 'coro', mix: defaultMix(SONGS), fx: defaultFx(), master: -4.2, midi: defaultMidi(), split: 48, transpose: 0, playMode: 'follow', src: { pad: 'synth', drums: 'synth' }, inputs: defaultInputs() };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Saved;
      if (s.songs?.length && s.mix && s.fx && s.songs.every((x) => s.mix[x.id] && x.arr)) Object.assign(base, s);
    }
  } catch {
    /* sin almacenamiento */
  }
  // Completa canales que no existían cuando se guardaron las escenas.
  for (const sg of Object.values(base.mix)) for (const m of Object.values(sg)) for (const id of CH_IDS) if (!m.chans[id]) m.chans[id] = defaultChan(id);
  base.inputs = { ...defaultInputs(), ...(base.inputs ?? {}) };
  for (const cfg of Object.values(base.inputs)) cfg.device = null; // los dispositivos se eligen en cada sesión
  return {
    ...base, selected: 'piano', tab: 'live', eqTab: 'eq', soundCat: 'Pianos', playing: false, files: {}, octave: 0, sustain: false,
    clickMonitor: false, masterMute: false, dirty: false, leftOpen: false, stripGroup: 'all', playPanel: 'keys', toast: null,
  };
}

export function liveSave(s: LiveState): boolean {
  const out: Saved = { songs: s.songs, songId: s.songId, sceneId: s.sceneId, mix: s.mix, fx: s.fx, master: s.master, midi: s.midi, split: s.split, transpose: s.transpose, playMode: s.playMode, src: s.src, inputs: s.inputs };
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
const song = (s: LiveState) => s.songs.find((x) => x.id === s.songId)!;
const editSong = (s: LiveState, patch: Partial<Song>): LiveState => ({ ...s, dirty: true, songs: s.songs.map((x) => (x.id === s.songId ? { ...x, ...patch } : x)) });

export function liveReducer(s: LiveState, a: LAction): LiveState {
  switch (a.type) {
    case 'tab': return { ...s, tab: a.tab, leftOpen: false };
    case 'eqTab': return { ...s, eqTab: a.tab };
    case 'cat': return { ...s, soundCat: a.cat };
    case 'song': return { ...s, songId: a.id, sceneId: song({ ...s, songId: a.id }).arr[0]?.scene ?? 'intro', leftOpen: false };
    case 'songStep': {
      const i = s.songs.findIndex((x) => x.id === s.songId) + a.dir;
      if (i < 0 || i >= s.songs.length) return say(s, a.dir < 0 ? 'Es la primera canción del repertorio' : 'Es la última canción del repertorio');
      return { ...s, songId: s.songs[i].id, sceneId: s.songs[i].arr[0]?.scene ?? 'intro' };
    }
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
    case 'sound': return edit(s, (m) => {
      const layers = layersFor(a.id);
      return { ...m, sound: a.id, layers, chans: applyLayers(m.chans, layers) };
    });
    case 'layerAdd': return edit(s, (m) => {
      if (m.layers.some((l) => l.ch === a.ch) || m.layers.length >= 4) return m;
      const layers = [...m.layers, { ch: a.ch, zone: (a.ch === 'bajo' ? 'low' : 'all') as Zone }];
      return { ...m, layers, chans: applyLayers(m.chans, layers) };
    });
    case 'layerRemove': return edit(s, (m) => {
      if (m.layers.length <= 1) return m;
      const layers = m.layers.filter((l) => l.ch !== a.ch);
      return { ...m, layers, chans: applyLayers(m.chans, layers) };
    });
    case 'layerZone': return edit(s, (m) => ({ ...m, layers: m.layers.map((l) => (l.ch === a.ch ? { ...l, zone: a.zone } : l)) }));
    case 'ch': return edit(s, (m) => ({ ...m, chans: { ...m.chans, [a.id]: a.fn(m.chans[a.id]) } }));
    case 'preset': {
      const p = PRESETS.find((x) => x.id === a.preset);
      if (!p) return s;
      return say(edit(s, (m) => {
        const c = m.chans[a.id];
        return {
          ...m,
          chans: {
            ...m.chans,
            [a.id]: {
              ...c,
              eqOn: true,
              eq: c.eq.map((b, i) => ({ ...b, gain: p.gains[i] ?? 0, on: true })),
              hpf: p.hpf ? { on: true, freq: p.hpf } : c.hpf,
              lpf: p.lpf ? { on: true, freq: p.lpf } : { ...c.lpf, on: false },
              comp: p.comp ? { ...c.comp, ...p.comp } : c.comp,
            },
          },
        };
      }), `Preset «${p.name}» aplicado`);
    }
    case 'macro': return edit(s, (m) => ({ ...m, macros: { ...m.macros, [a.key]: a.value } }));
    case 'fx': return { ...s, fx: { ...s.fx, ...a.patch }, dirty: true };
    case 'drawbar': return { ...s, fx: { ...s.fx, drawbars: s.fx.drawbars.map((v, i) => (i === a.index ? a.value : v)) }, dirty: true };
    case 'master': return { ...s, master: a.db ?? s.master, masterMute: a.mute ?? s.masterMute, dirty: true };
    case 'split': return { ...s, split: a.value };
    case 'transpose': return { ...s, transpose: a.value };
    case 'octave': return { ...s, octave: a.value };
    case 'sustain': return { ...s, sustain: a.on };
    case 'playMode': return { ...s, playMode: a.mode };
    case 'src': return { ...s, src: { ...s.src, [a.ch]: a.mode } };
    case 'file': return { ...s, files: { ...s.files, [a.ch]: a.name ?? undefined } };
    case 'playing': return { ...s, playing: a.on };
    case 'clickMon': return { ...s, clickMonitor: a.on };
    case 'midi': return { ...s, midi: s.midi.map((m) => (m.id === a.id ? { ...m, ...a.patch } : m)), dirty: true };
    case 'songEdit': return { ...s, songs: s.songs.map((x) => (x.id === a.id ? { ...x, ...a.patch } : x)), dirty: true };
    case 'style': return say(editSong(s, { style: a.style, bpm: STYLE_BPM[a.style] }), `Ritmo ${a.style === 'jubilo' ? 'Júbilo' : a.style[0].toUpperCase() + a.style.slice(1)} a ${STYLE_BPM[a.style]} BPM`);
    case 'bars': return editSong(s, { arr: song(s).arr.map((x, i) => (i === a.index ? { ...x, bars: a.bars } : x)) });
    case 'end': return editSong(s, { end: a.end });
    case 'songAdd': {
      const id = `u${Date.now().toString(36)}`;
      const sg: Song = { ...clone(SONGS[1]), id, title: `Canción ${s.songs.length + 1}`, key: 'G', bpm: 72 };
      return say({ ...s, songs: [...s.songs, sg], mix: { ...s.mix, [id]: clone(defaultMix([sg])[id]) }, songId: id, sceneId: 'intro', dirty: true }, 'Canción añadida al repertorio');
    }
    case 'clearSolo': return edit(s, (m) => ({ ...m, chans: Object.fromEntries(Object.entries(m.chans).map(([k, c]) => [k, { ...c, solo: false }])) as SceneMix['chans'] }));
    case 'editor': return a.id ? { ...s, selected: a.id, tab: 'channel' } : { ...s, tab: 'live' };
    case 'input': return { ...s, dirty: true, inputs: { ...s.inputs, [a.id]: { ...s.inputs[a.id], ...a.patch } } };
    case 'group': return { ...s, stripGroup: a.group };
    case 'playPanel': return { ...s, playPanel: a.panel };
    case 'save': {
      const ok = liveSave(s);
      return say({ ...s, dirty: ok ? false : s.dirty }, ok ? 'Escenas y ajustes guardados en este navegador' : 'No se pudo guardar: el navegador bloquea el almacenamiento');
    }
    case 'left': return { ...s, leftOpen: a.open };
    case 'toast': return say(s, a.text);
  }
}
