/*
 * Persistencia local versionada (schemaVersion 3), perfiles locales y exportación/importación.
 * Un perfil local separa configuraciones en este navegador; no es autenticación ni aislamiento seguro.
 */
import type { Bus, Chan, ChId, LiveState, MusicScene, SceneId, SectionDef, Song } from './types';
import { CH_IDS, IN_IDS, MUSIC_IDS, TIME_SIGS } from './types';
import { DEFAULT_SECTIONS, SONGS, defaultBuses, defaultChan, defaultFx, defaultInputs, defaultMask, defaultMidi, defaultMix, defaultOutputs, defaultSampler, musicScene } from './data';
import { clone } from '../util';

export const SCHEMA = 3;
export const SAVED_KEYS = ['songs', 'songId', 'sceneId', 'mix', 'console', 'buses', 'outputs', 'mixScenes', 'activeMix', 'recallMask', 'protectedCh', 'fx', 'master', 'masterMute', 'midi', 'split', 'transpose', 'playMode', 'src', 'inputs', 'sampler', 'view'] as const;
export type SavedData = Pick<LiveState, (typeof SAVED_KEYS)[number]>;
export interface SavedFile {
  schemaVersion: number;
  app: 'SONIDO LIVE WORKSPACE';
  savedAt: string;
  profile: string;
  data: SavedData;
  assets?: { id: string; name: string; type: string; bytes: number; usedBy: string }[];
}

const PROFILES = 'sonido.profiles';
const ACTIVE = 'sonido.profile.active';
const dataKey = (p: string) => `sonido.p.${p}.v3`;
const V2 = 'sonido.live.v2';
const V2_BACKUP = 'sonido.live.v2.backup';

const ls = {
  get(k: string): string | null {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string): boolean {
    try {
      localStorage.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  },
  del(k: string) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignorado */
    }
  },
};

export function listProfiles(): string[] {
  try {
    const p = JSON.parse(ls.get(PROFILES) ?? '[]') as string[];
    return Array.isArray(p) && p.length ? p : ['Principal'];
  } catch {
    return ['Principal'];
  }
}
export const activeProfile = () => ls.get(ACTIVE) ?? listProfiles()[0];
export function setActiveProfile(name: string) {
  const all = listProfiles();
  if (!all.includes(name)) ls.set(PROFILES, JSON.stringify([...all, name]));
  ls.set(ACTIVE, name);
}
export function deleteProfile(name: string) {
  const all = listProfiles().filter((p) => p !== name);
  ls.set(PROFILES, JSON.stringify(all.length ? all : ['Principal']));
  ls.del(dataKey(name));
  if (activeProfile() === name) ls.set(ACTIVE, all[0] ?? 'Principal');
}

export function defaults(): SavedData {
  const buses = defaultBuses();
  return {
    songs: clone(SONGS), songId: 's2', sceneId: 'coro', mix: defaultMix(SONGS), console: defaultConsoleFor(buses), buses, outputs: defaultOutputs(),
    mixScenes: [], activeMix: null, recallMask: defaultMask(), protectedCh: ['in1'], fx: defaultFx(), master: -4.2, masterMute: false,
    midi: defaultMidi(), split: 48, transpose: 0, playMode: 'follow', src: { pad: 'synth', drums: 'synth' }, inputs: defaultInputs(), sampler: defaultSampler(), view: 'all',
  };
}
const defaultConsoleFor = (buses: Bus[]) => Object.fromEntries(CH_IDS.map((id) => [id, defaultChan(id, buses)])) as Record<ChId, Chan>;

/* ---------- Migración del esquema 2 (escena = todo) al 3 (música y consola separadas) ---------- */

interface V2Song { id: string; title: string; key: string; bpm: number; ts?: string; style?: Song['style']; arr?: { scene: string; bars: number }[]; end?: Song['end'] }
interface V2Scene { sound: MusicScene['sound']; layers: MusicScene['layers']; macros: MusicScene['macros']; chans: Record<string, Partial<Chan>> }
interface V2Data { songs: V2Song[]; songId: string; sceneId: string; mix: Record<string, Record<string, V2Scene>>; fx?: Partial<LiveState['fx']>; master?: number; midi?: LiveState['midi']; split?: number; transpose?: number; playMode?: LiveState['playMode']; src?: LiveState['src']; inputs?: Partial<LiveState['inputs']> }

export function migrateV2(old: V2Data): SavedData {
  const base = defaults();
  const songs: Song[] = old.songs.map((sg) => {
    const ids = [...new Set((sg.arr ?? []).map((a) => a.scene))];
    const sections: SectionDef[] = (ids.length ? ids : DEFAULT_SECTIONS.map((x) => x.id)).map((id) => DEFAULT_SECTIONS.find((x) => x.id === id) ?? { id, label: id, kind: 'otro' });
    return {
      id: sg.id, title: sg.title, key: sg.key, bpm: sg.bpm, ts: TIME_SIGS.includes(sg.ts as never) ? (sg.ts as Song['ts']) : '4/4', style: sg.style ?? 'worship',
      sections, arr: sg.arr?.length ? sg.arr : sections.map((x) => ({ scene: x.id, bars: 4 })), end: sg.end ?? 'stop', stems: [], stemsOnly: false,
    };
  });
  // La consola se toma de la escena que estaba abierta: era la mezcla vigente del operador.
  const cur = old.mix[old.songId]?.[old.sceneId] ?? Object.values(Object.values(old.mix)[0] ?? {})[0];
  const consoleOut = clone(base.console);
  if (cur) {
    for (const id of CH_IDS) {
      const o = cur.chans?.[id];
      if (!o) continue;
      const d = consoleOut[id];
      consoleOut[id] = {
        ...d,
        fader: typeof o.fader === 'number' ? o.fader : d.fader,
        pan: typeof o.pan === 'number' ? o.pan : d.pan,
        // El mute antiguo de los instrumentos era el arreglo musical: pasa al nivel musical, no a la consola.
        mute: IN_IDS.includes(id as never) ? !!o.mute : false,
        hpf: o.hpf ?? d.hpf,
        lpf: o.lpf ?? d.lpf,
        eqOn: o.eqOn ?? d.eqOn,
        eq: Array.isArray(o.eq) && o.eq.length === 6 ? o.eq : d.eq,
        comp: o.comp ?? d.comp,
        sendRev: typeof o.sendRev === 'number' ? o.sendRev : d.sendRev,
        sendDly: typeof o.sendDly === 'number' ? o.sendDly : d.sendDly,
      };
    }
  }
  const mix: SavedData['mix'] = {};
  for (const sg of songs) {
    mix[sg.id] = {};
    for (const sec of sg.sections) {
      const os = old.mix[sg.id]?.[sec.id];
      const fresh = musicScene(sec.kind);
      if (!os) {
        mix[sg.id][sec.id] = fresh;
        continue;
      }
      const music: MusicScene['music'] = {};
      for (const id of MUSIC_IDS) music[id] = { db: 0, on: os.chans?.[id] ? !os.chans[id].mute : !!fresh.music[id]?.on };
      mix[sg.id][sec.id] = { sound: os.sound ?? fresh.sound, layers: os.layers ?? fresh.layers, macros: os.macros ?? fresh.macros, music };
    }
  }
  return {
    ...base, songs, songId: old.songId, sceneId: old.sceneId, mix, console: consoleOut,
    fx: { ...base.fx, ...(old.fx ?? {}) }, master: old.master ?? base.master, midi: old.midi?.length ? mergeMidi(old.midi) : base.midi,
    split: old.split ?? base.split, transpose: old.transpose ?? 0, playMode: old.playMode ?? 'follow', src: old.src ?? base.src,
    inputs: { ...base.inputs, ...(old.inputs ?? {}) } as SavedData['inputs'],
  };
}
const mergeMidi = (m: LiveState['midi']) => defaultMidi().map((d) => ({ ...d, ...(m.find((x) => x.id === d.id) ?? {}), label: d.label }));

/** Completa campos ausentes sin mezclar canales por índice: todo se resuelve por identificador. */
export function normalize(d: Partial<SavedData>): SavedData {
  const base = defaults();
  const out = { ...base, ...d } as SavedData;
  out.buses = Array.isArray(out.buses) && out.buses.length ? out.buses : base.buses;
  out.console = { ...defaultConsoleFor(out.buses), ...(out.console ?? {}) };
  for (const id of CH_IDS) {
    const c = { ...defaultChan(id, out.buses), ...out.console[id] };
    c.aux = { ...c.aux };
    for (const b of out.buses) if (!c.aux[b.id]) c.aux[b.id] = { db: -90, pre: true };
    if (id === 'click') {
      c.toMain = false;
      c.sendRev = c.sendDly = -90;
    }
    out.console[id] = c;
  }
  out.songs = (out.songs ?? base.songs).map((s) => ({ ...base.songs[1], ...s, sections: s.sections?.length ? s.sections : clone(DEFAULT_SECTIONS), stems: s.stems ?? [], ts: TIME_SIGS.includes(s.ts) ? s.ts : '4/4' }));
  for (const sg of out.songs) {
    out.mix[sg.id] = out.mix[sg.id] ?? {};
    for (const sec of sg.sections) if (!out.mix[sg.id][sec.id]) out.mix[sg.id][sec.id] = musicScene(sec.kind);
  }
  if (!out.songs.some((s) => s.id === out.songId)) out.songId = out.songs[0].id;
  const song = out.songs.find((s) => s.id === out.songId)!;
  if (!song.sections.some((x) => x.id === out.sceneId)) out.sceneId = song.sections[0].id as SceneId;
  out.fx = { ...base.fx, ...out.fx };
  out.inputs = { ...base.inputs, ...out.inputs };
  for (const id of IN_IDS) out.inputs[id] = { ...base.inputs[id], ...out.inputs[id], device: null }; // los dispositivos se resuelven en cada equipo
  out.outputs = { ...base.outputs, ...out.outputs };
  out.recallMask = { ...base.recallMask, ...out.recallMask };
  out.sampler = { ...base.sampler, ...out.sampler };
  out.midi = mergeMidi(out.midi ?? []);
  return out;
}

export function loadProfile(profile: string): { data: SavedData; note: string } {
  const raw = ls.get(dataKey(profile));
  if (raw) {
    try {
      const f = JSON.parse(raw) as SavedFile;
      if (f.schemaVersion === SCHEMA && f.data) return { data: normalize(f.data), note: '' };
    } catch {
      /* archivo dañado: se usan valores por defecto y se avisa */
      return { data: defaults(), note: 'Los datos guardados de este perfil estaban dañados; se cargaron valores iniciales.' };
    }
  }
  // Primera vez con el esquema 3: migrar los datos del esquema 2 sin destruirlos.
  const v2 = profile === listProfiles()[0] ? ls.get(V2) : null;
  if (v2) {
    try {
      if (!ls.get(V2_BACKUP)) ls.set(V2_BACKUP, v2);
      const data = normalize(migrateV2(JSON.parse(v2) as V2Data));
      return { data, note: 'Sus escenas anteriores se migraron al nuevo formato. La copia original quedó guardada.' };
    } catch {
      return { data: defaults(), note: 'No se pudieron migrar los datos anteriores; la copia original sigue intacta.' };
    }
  }
  return { data: defaults(), note: '' };
}

export function saveProfile(profile: string, data: SavedData): boolean {
  const file: SavedFile = { schemaVersion: SCHEMA, app: 'SONIDO LIVE WORKSPACE', savedAt: new Date().toISOString(), profile, data };
  return ls.set(dataKey(profile), JSON.stringify(file));
}

export function pickSaved(s: LiveState): SavedData {
  const o = {} as Record<string, unknown>;
  for (const k of SAVED_KEYS) o[k] = s[k];
  return o as unknown as SavedData;
}

export function exportFile(s: LiveState, profile: string, assets: SavedFile['assets']): string {
  const data = pickSaved(s);
  const file: SavedFile = { schemaVersion: SCHEMA, app: 'SONIDO LIVE WORKSPACE', savedAt: new Date().toISOString(), profile, data, assets };
  return JSON.stringify(file, null, 1);
}

/** Valida y migra un archivo importado. Devuelve los datos y los archivos de audio que faltan. */
export function importFile(text: string): { data: SavedData; missing: string[] } {
  const f = JSON.parse(text) as Partial<SavedFile> & { songs?: unknown };
  if (f.schemaVersion === SCHEMA && f.data) {
    const data = normalize(f.data);
    const needed = new Set<string>();
    data.songs.forEach((s) => s.stems.forEach((st) => needed.add(`${s.title}: ${st.name}`)));
    data.sampler.zones.forEach((z) => needed.add(`Sampler: ${z.name}`));
    return { data, missing: [...needed] };
  }
  if (f.songs && (f as unknown as V2Data).mix) return { data: normalize(migrateV2(f as unknown as V2Data)), missing: [] };
  throw new Error('formato');
}
