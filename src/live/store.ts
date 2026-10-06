import type { Bus, Chan, ChId, EndAction, EqTab, Fx, InId, InputCfg, LiveState, Macros, MidiMap, MixScene, MusicLevel, Outputs, PlayMode, RecallMask, SampleZone, SamplerCfg, SceneId, SectionDef, SectionKind, Send, Song, SoundCat, SoundId, SrcMode, StripGroup, Style, Tab, View, Zone } from './types';
import { CH_IDS } from './types';
import { BUS_COLORS, STYLE_BPM, applyLayers, defaultChan, layersFor, mixDataOf, musicScene, newSong, PRESETS } from './data';
import { normalize } from './persist';
import type { SavedData } from './persist';
import { clone } from '../util';
import type { Project } from './types';
import { applyOp, isSetting } from './studio/ops';
import type { ProjOp } from './studio/ops';
import { arrFromMarkers } from './studio/model';
import { meter } from './engine';

export type LAction =
  | { type: 'tab'; tab: Tab }
  | { type: 'view'; view: View }
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
  | { type: 'music'; id: ChId; patch: Partial<MusicLevel> }
  | { type: 'ch'; id: ChId; fn: (c: Chan) => Chan }
  | { type: 'chput'; id: ChId; value: Chan }
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
  | { type: 'midi'; id: string; patch: Partial<MidiMap> }
  | { type: 'songEdit'; id: string; patch: Partial<Song> }
  | { type: 'style'; style: Style }
  | { type: 'bars'; index: number; bars: number }
  | { type: 'end'; end: EndAction }
  | { type: 'songAdd' }
  | { type: 'secAdd'; label: string; kind: SectionKind }
  | { type: 'secEdit'; id: SceneId; patch: Partial<SectionDef> }
  | { type: 'secRemove'; id: SceneId }
  | { type: 'arrAdd'; scene: SceneId; bars: number; marker?: string; after?: number }
  | { type: 'arrRemove'; index: number }
  | { type: 'arrMove'; index: number; dir: 1 | -1 }
  | { type: 'arrScene'; index: number; scene: SceneId }
  | { type: 'proj'; op: ProjOp }
  | { type: 'projUndo' }
  | { type: 'projRedo' }
  | { type: 'zoneAdd'; zone: SampleZone }
  | { type: 'zoneEdit'; id: string; patch: Partial<SampleZone> }
  | { type: 'zoneRemove'; id: string }
  | { type: 'samplerEdit'; patch: Partial<SamplerCfg> }
  | { type: 'busAdd' }
  | { type: 'busEdit'; id: string; patch: Partial<Bus> }
  | { type: 'busRemove'; id: string }
  | { type: 'aux'; ch: ChId; bus: string; patch: Partial<Send> }
  | { type: 'outputs'; patch: Partial<Outputs> }
  | { type: 'mixSave'; id?: string; name?: string; full?: boolean }
  | { type: 'mixLoad'; id: string }
  | { type: 'mixRename'; id: string; name: string }
  | { type: 'mixDelete'; id: string }
  | { type: 'mixUndo' }
  | { type: 'mixDup'; id: string }
  | { type: 'mask'; patch: Partial<RecallMask> }
  | { type: 'protect'; ch: ChId; on: boolean }
  | { type: 'clearSolo' }
  | { type: 'editor'; id: ChId | null }
  | { type: 'input'; id: InId; patch: Partial<InputCfg> }
  | { type: 'group'; group: StripGroup }
  | { type: 'playPanel'; panel: 'keys' | 'pads' }
  | { type: 'import'; data: SavedData }
  | { type: 'replace'; data: SavedData }
  | { type: 'saved' }
  | { type: 'left'; open: boolean }
  | { type: 'toast'; text: string };

/** Historial de edición del proyecto de la canción actual (no se guarda ni se comparte). */
export interface ProjHist {
  song: string;
  past: Project[];
  future: Project[];
}
export type LState = LiveState & { trash: MixScene | null; hist?: ProjHist };

export function liveInit(data: SavedData): LState {
  return {
    ...data, selected: 'piano', tab: 'live', eqTab: 'eq', soundCat: 'Pianos', playing: false, files: {}, octave: 0, sustain: false,
    dirty: false, leftOpen: false, stripGroup: 'all', playPanel: 'keys', toast: null, trash: null,
  };
}

let seq = 0;
const say = (s: LState, text: string): LState => ({ ...s, toast: { id: ++seq, text } });
const songOf = (s: LState) => s.songs.find((x) => x.id === s.songId)!;
const scene = (s: LState) => s.mix[s.songId][s.sceneId];
const editScene = (s: LState, fn: (m: LState['mix'][string][string]) => LState['mix'][string][string]): LState => ({
  ...s, dirty: true, mix: { ...s.mix, [s.songId]: { ...s.mix[s.songId], [s.sceneId]: fn(scene(s)) } },
});
const editSong = (s: LState, fn: (sg: Song) => Song): LState => ({ ...s, dirty: true, songs: s.songs.map((x) => (x.id === s.songId ? fn(x) : x)) });
const editCh = (s: LState, id: ChId, fn: (c: Chan) => Chan): LState => ({ ...s, dirty: true, console: { ...s.console, [id]: fn(s.console[id]) } });
/** Con marcadores, el orden de la canción sale del audio (y se conservan repeticiones y orden armados). */
const withArr = (sg: Song): Song => {
  const had = sg.arr.some((x) => x.marker);
  if (!sg.project.markers.length && !had) return sg;
  return { ...sg, arr: arrFromMarkers(sg.project, sg.arr, meter(sg.ts, sg.bpm).bar) };
};
const firstScene = (sg: Song) => sg.arr[0]?.scene ?? sg.sections[0].id;
const slug = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'seccion';

/** Recupera una escena de mezcla respetando la máscara y los canales protegidos. */
function recall(s: LState, ms: MixScene): LState {
  const m = s.recallMask;
  const src = ms.data;
  const consoleOut = { ...s.console };
  for (const id of CH_IDS) {
    if (s.protectedCh.includes(id) || !src.console[id]) continue;
    const a = src.console[id];
    const c = { ...consoleOut[id] };
    if (m.faders) c.fader = a.fader;
    if (m.mutes) c.mute = a.mute;
    if (m.pans) c.pan = a.pan;
    if (m.proc) {
      c.hpf = a.hpf;
      c.lpf = a.lpf;
      c.eqOn = a.eqOn;
      c.eq = a.eq;
      c.comp = a.comp;
    }
    if (m.sends) {
      c.sendRev = a.sendRev;
      c.sendDly = a.sendDly;
      c.aux = { ...c.aux, ...a.aux };
    }
    consoleOut[id] = c;
  }
  let out: LState = { ...s, console: consoleOut, activeMix: ms.id, dirty: true };
  if (m.buses) out.buses = s.buses.map((b) => src.buses.find((x) => x.id === b.id) ?? b);
  if (m.master) out = { ...out, master: src.master, masterMute: src.masterMute };
  if (m.fx) out.fx = { ...src.fx, rotary: s.fx.rotary, drawbars: s.fx.drawbars };
  if (m.trims) out.inputs = Object.fromEntries(Object.entries(s.inputs).map(([k, v]) => [k, { ...v, trim: src.trims[k as InId] ?? v.trim }])) as LState['inputs'];
  return out;
}

export function liveReducer(s: LState, a: LAction): LState {
  switch (a.type) {
    case 'tab': return { ...s, tab: a.tab, leftOpen: false };
    case 'view': return { ...s, view: a.view, tab: 'live' };
    case 'eqTab': return { ...s, eqTab: a.tab };
    case 'cat': return { ...s, soundCat: a.cat };
    case 'song': {
      const sg = s.songs.find((x) => x.id === a.id);
      return sg ? { ...s, songId: a.id, sceneId: firstScene(sg), leftOpen: false } : s;
    }
    case 'songStep': {
      const i = s.songs.findIndex((x) => x.id === s.songId) + a.dir;
      if (i < 0 || i >= s.songs.length) return say(s, a.dir < 0 ? 'Es la primera canción del repertorio' : 'Es la última canción del repertorio');
      return { ...s, songId: s.songs[i].id, sceneId: firstScene(s.songs[i]) };
    }
    case 'scene': return songOf(s).sections.some((x) => x.id === a.id) ? { ...s, sceneId: a.id } : s;
    case 'step': {
      // Avanza por las secciones de la canción; al final pasa a la siguiente canción.
      const sg = songOf(s);
      const ids = sg.sections.map((x) => x.id);
      const ni = ids.indexOf(s.sceneId) + a.dir;
      if (ni >= 0 && ni < ids.length) return { ...s, sceneId: ids[ni] };
      const gi = s.songs.findIndex((x) => x.id === s.songId) + a.dir;
      if (gi < 0 || gi >= s.songs.length) return say(s, gi < 0 ? 'Primera sección del repertorio' : 'Última sección del repertorio');
      const ng = s.songs[gi];
      return { ...s, songId: ng.id, sceneId: a.dir > 0 ? ng.sections[0].id : ng.sections[ng.sections.length - 1].id };
    }
    case 'select': return { ...s, selected: a.id };
    case 'sound': return editScene(s, (m) => {
      const layers = layersFor(a.id);
      return { ...m, sound: a.id, layers, music: applyLayers(m.music, layers) };
    });
    case 'layerAdd': return editScene(s, (m) => {
      if (m.layers.some((l) => l.ch === a.ch) || m.layers.length >= 4) return m;
      const layers = [...m.layers, { ch: a.ch, zone: (a.ch === 'bajo' ? 'low' : 'all') as Zone }];
      return { ...m, layers, music: { ...m.music, [a.ch]: { db: m.music[a.ch]?.db ?? 0, on: true } } };
    });
    case 'layerRemove': return editScene(s, (m) => {
      if (m.layers.length <= 1) return m;
      const layers = m.layers.filter((l) => l.ch !== a.ch);
      return { ...m, layers, music: applyLayers(m.music, layers) };
    });
    case 'layerZone': return editScene(s, (m) => ({ ...m, layers: m.layers.map((l) => (l.ch === a.ch ? { ...l, zone: a.zone } : l)) }));
    case 'music': return editScene(s, (m) => ({ ...m, music: { ...m.music, [a.id]: { db: 0, on: true, ...m.music[a.id], ...a.patch } } }));
    case 'ch': return editCh(s, a.id, a.fn);
    case 'chput': return editCh(s, a.id, () => ({ ...a.value, id: a.id, toMain: a.id === 'click' ? false : a.value.toMain }));
    case 'preset': {
      const p = PRESETS.find((x) => x.id === a.preset);
      if (!p) return s;
      return say(editCh(s, a.id, (c) => ({
        ...c, eqOn: true, eq: c.eq.map((b, i) => ({ ...b, gain: p.gains[i] ?? 0, on: true })),
        hpf: p.hpf ? { on: true, freq: p.hpf } : c.hpf, lpf: p.lpf ? { on: true, freq: p.lpf } : { ...c.lpf, on: false }, comp: p.comp ? { ...c.comp, ...p.comp } : c.comp,
      })), `Preset «${p.name}» aplicado`);
    }
    case 'macro': return editScene(s, (m) => ({ ...m, macros: { ...m.macros, [a.key]: a.value } }));
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
    case 'midi': {
      // Evita que dos funciones queden con el mismo CC y canal sin avisar.
      const cur = s.midi.find((m) => m.id === a.id)!;
      const next = { ...cur, ...a.patch };
      const clash = s.midi.find((m) => m.id !== a.id && m.cc === next.cc && m.ch === next.ch);
      const midi = s.midi.map((m) => (m.id === a.id ? next : clash && m.id === clash.id ? { ...m, cc: -1 } : m));
      const out = { ...s, midi, dirty: true };
      return clash ? say(out, `CC ${next.cc} estaba asignado a «${clash.label}»; esa función quedó sin asignar`) : out;
    }
    case 'songEdit': return { ...s, songs: s.songs.map((x) => (x.id === a.id ? withArr({ ...x, ...a.patch }) : x)), dirty: true };
    case 'style': return say(editSong(s, (sg) => ({ ...sg, style: a.style, bpm: STYLE_BPM[a.style] })), `Ritmo cambiado a ${STYLE_BPM[a.style]} BPM`);
    case 'bars':
      if (songOf(s).arr[a.index]?.marker) return say(s, 'Con marcadores, la duración la da el audio: mueva el marcador en Multitrack o repita la sección');
      return editSong(s, (sg) => ({ ...sg, arr: sg.arr.map((x, i) => (i === a.index ? { ...x, bars: Math.max(1, Math.min(64, a.bars)) } : x)) }));
    case 'end': return editSong(s, (sg) => ({ ...sg, end: a.end }));
    case 'songAdd': {
      const id = `u${Date.now().toString(36)}`;
      const sg = newSong(id, `Canción ${s.songs.length + 1}`);
      const mix = { ...s.mix, [id]: Object.fromEntries(sg.sections.map((x) => [x.id, musicScene(x.kind)])) };
      return say({ ...s, songs: [...s.songs, sg], mix, songId: id, sceneId: sg.sections[0].id, dirty: true }, 'Canción añadida al repertorio');
    }
    case 'secAdd': {
      const sg = songOf(s);
      let id = slug(a.label);
      while (sg.sections.some((x) => x.id === id)) id += '2';
      const out = editSong(s, (x) => ({ ...x, sections: [...x.sections, { id, label: a.label, kind: a.kind }], arr: [...x.arr, { scene: id, bars: 4 }] }));
      return { ...out, sceneId: id, mix: { ...out.mix, [s.songId]: { ...out.mix[s.songId], [id]: musicScene(a.kind) } } };
    }
    case 'secEdit': return editSong(s, (x) => ({ ...x, sections: x.sections.map((sec) => (sec.id === a.id ? { ...sec, ...a.patch, id: sec.id } : sec)) }));
    case 'secRemove': {
      const sg = songOf(s);
      if (sg.sections.length <= 1) return say(s, 'La canción necesita al menos una sección');
      const out = editSong(s, (x) => {
        const sections = x.sections.filter((sec) => sec.id !== a.id);
        const arr = x.arr.filter((it) => it.scene !== a.id);
        const project = { ...x.project, markers: x.project.markers.filter((m) => m.sec !== a.id) };
        return withArr({ ...x, sections, project, arr: arr.length ? arr : [{ scene: sections[0].id, bars: 4 }] });
      });
      return { ...out, sceneId: s.sceneId === a.id ? songOf(out).sections[0].id : s.sceneId };
    }
    case 'arrAdd': return editSong(s, (x) => {
      // Repetir un paso con marcador: se inserta una copia justo después (el audio salta atrás al repetir).
      const item = { scene: a.scene, bars: a.bars, ...(a.marker ? { marker: a.marker } : {}) };
      const arr = a.after !== undefined ? [...x.arr.slice(0, a.after + 1), item, ...x.arr.slice(a.after + 1)] : [...x.arr, item];
      return withArr({ ...x, arr });
    });
    case 'arrRemove': return editSong(s, (x) => (x.arr.length <= 1 ? x : { ...x, arr: x.arr.filter((_, i) => i !== a.index) }));
    case 'arrMove': return editSong(s, (x) => {
      const j = a.index + a.dir;
      if (j < 0 || j >= x.arr.length) return x;
      const arr = [...x.arr];
      [arr[a.index], arr[j]] = [arr[j], arr[a.index]];
      return { ...x, arr };
    });
    case 'arrScene': return editSong(s, (x) => ({ ...x, arr: x.arr.map((it, i) => (i === a.index ? { ...it, scene: a.scene } : it)) }));
    case 'proj': {
      const sg = songOf(s);
      const next = applyOp(sg.project, a.op);
      if (next === sg.project) return s;
      const out = editSong(s, (x) => withArr({ ...x, project: next }));
      if (isSetting(a.op)) return out;
      const h = s.hist?.song === s.songId ? s.hist : { song: s.songId, past: [], future: [] };
      return { ...out, hist: { song: s.songId, past: [...h.past, sg.project].slice(-100), future: [] } };
    }
    case 'projUndo':
    case 'projRedo': {
      const h = s.hist;
      const undo = a.type === 'projUndo';
      if (!h || h.song !== s.songId || !(undo ? h.past : h.future).length) return say(s, undo ? 'Nada que deshacer en el proyecto' : 'Nada que rehacer');
      const cur = songOf(s).project;
      const target = undo ? h.past[h.past.length - 1] : h.future[h.future.length - 1];
      const out = editSong(s, (x) => withArr({ ...x, project: target }));
      return {
        ...out,
        hist: undo ? { song: h.song, past: h.past.slice(0, -1), future: [...h.future, cur] } : { song: h.song, past: [...h.past, cur], future: h.future.slice(0, -1) },
        toast: { id: ++seq, text: undo ? 'Edición deshecha' : 'Edición rehecha' },
      };
    }
    case 'zoneAdd': return { ...s, dirty: true, sampler: { ...s.sampler, zones: [...s.sampler.zones, a.zone] } };
    case 'zoneEdit': return { ...s, dirty: true, sampler: { ...s.sampler, zones: s.sampler.zones.map((z) => (z.id === a.id ? { ...z, ...a.patch } : z)) } };
    case 'zoneRemove': return { ...s, dirty: true, sampler: { ...s.sampler, zones: s.sampler.zones.filter((z) => z.id !== a.id) } };
    case 'samplerEdit': return { ...s, dirty: true, sampler: { ...s.sampler, ...a.patch } };
    case 'busAdd': {
      if (s.buses.length >= 8) return say(s, 'Máximo 8 buses de monitor');
      let n = s.buses.length + 1;
      while (s.buses.some((b) => b.id === `m${n}`)) n++;
      const bus: Bus = { id: `m${n}`, name: `Monitor ${n}`, color: BUS_COLORS[(n - 1) % BUS_COLORS.length], level: -3, mute: false };
      const consoleOut = Object.fromEntries(CH_IDS.map((id) => [id, { ...s.console[id], aux: { ...s.console[id].aux, [bus.id]: { db: -90, pre: true } } }])) as LState['console'];
      return { ...s, buses: [...s.buses, bus], console: consoleOut, dirty: true };
    }
    case 'busEdit': return { ...s, dirty: true, buses: s.buses.map((b) => (b.id === a.id ? { ...b, ...a.patch, id: b.id } : b)) };
    case 'busRemove': {
      const buses = s.buses.filter((b) => b.id !== a.id);
      const outBuses = { ...s.outputs.buses };
      delete outBuses[a.id];
      return { ...s, buses, outputs: { ...s.outputs, buses: outBuses, rec: s.outputs.rec === a.id ? 'main' : s.outputs.rec }, dirty: true };
    }
    case 'aux': return editCh(s, a.ch, (c) => {
      const cur: Send = c.aux[a.bus] ?? { db: -90, pre: true };
      return { ...c, aux: { ...c.aux, [a.bus]: { ...cur, ...a.patch } } };
    });
    case 'outputs': return { ...s, outputs: { ...s.outputs, ...a.patch }, dirty: true };
    case 'mixSave': {
      const now = new Date().toISOString();
      const data = clone(mixDataOf(s));
      if (a.id) {
        const mixScenes = s.mixScenes.map((m) => (m.id === a.id ? { ...m, data, savedAt: now, version: m.version + 1 } : m));
        return say({ ...s, mixScenes, activeMix: a.id, dirty: true }, 'Escena de mezcla actualizada');
      }
      const id = `x${Date.now().toString(36)}`;
      const ms: MixScene = { id, name: a.name?.trim() || `Mezcla ${s.mixScenes.length + 1}`, savedAt: now, version: 1, data, ...(a.full ? { ref: { songId: s.songId, sceneId: s.sceneId } } : {}) };
      return say({ ...s, mixScenes: [...s.mixScenes, ms], activeMix: id, dirty: true }, `Escena de mezcla «${ms.name}» creada`);
    }
    case 'mixLoad': {
      const ms = s.mixScenes.find((m) => m.id === a.id);
      if (!ms) return s;
      let out = recall(s, ms);
      const sg = ms.ref && s.songs.find((x) => x.id === ms.ref!.songId);
      if (ms.ref && sg && sg.sections.some((x) => x.id === ms.ref!.sceneId)) out = { ...out, songId: ms.ref.songId, sceneId: ms.ref.sceneId };
      return say(out, `«${ms.name}» recuperada${s.protectedCh.length ? ` (protegidos: ${s.protectedCh.length})` : ''}`);
    }
    case 'mixRename': return { ...s, dirty: true, mixScenes: s.mixScenes.map((m) => (m.id === a.id ? { ...m, name: a.name } : m)) };
    case 'mixDelete': {
      const ms = s.mixScenes.find((m) => m.id === a.id);
      return ms ? say({ ...s, mixScenes: s.mixScenes.filter((m) => m.id !== a.id), trash: ms, activeMix: s.activeMix === a.id ? null : s.activeMix, dirty: true }, `«${ms.name}» eliminada. Puede deshacerlo.`) : s;
    }
    case 'mixUndo': return s.trash ? say({ ...s, mixScenes: [...s.mixScenes, s.trash], trash: null, dirty: true }, `«${s.trash.name}» recuperada`) : s;
    case 'mixDup': {
      const ms = s.mixScenes.find((m) => m.id === a.id);
      if (!ms) return s;
      const copy: MixScene = { ...clone(ms), id: `x${Date.now().toString(36)}`, name: `${ms.name} (copia)`, savedAt: new Date().toISOString(), version: 1 };
      return { ...s, mixScenes: [...s.mixScenes, copy], dirty: true };
    }
    case 'mask': return { ...s, recallMask: { ...s.recallMask, ...a.patch } };
    case 'protect': return { ...s, protectedCh: a.on ? [...new Set([...s.protectedCh, a.ch])] : s.protectedCh.filter((x) => x !== a.ch) };
    case 'clearSolo': return { ...s, console: Object.fromEntries(Object.entries(s.console).map(([k, c]) => [k, { ...c, solo: false }])) as LState['console'] };
    case 'editor': return a.id ? { ...s, selected: a.id, tab: 'channel' } : { ...s, tab: 'live' };
    case 'input': return { ...s, dirty: true, inputs: { ...s.inputs, [a.id]: { ...s.inputs[a.id], ...a.patch } } };
    case 'group': return { ...s, stripGroup: a.group };
    case 'playPanel': return { ...s, playPanel: a.panel };
    case 'import': return say({ ...liveInit(normalize(a.data)), tab: s.tab, view: s.view, dirty: true }, 'Sesión importada como copia local. Guarde para conservarla.');
    case 'replace': return { ...s, ...normalize(a.data) };
    case 'saved': return { ...s, dirty: false };
    case 'left': return { ...s, leftOpen: a.open };
    case 'toast': return say(s, a.text);
  }
}

export { defaultChan };
