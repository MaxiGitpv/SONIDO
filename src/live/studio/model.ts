/*
 * Modelo del estudio multitrack: funciones puras, sin audio ni DOM (se prueban en Node).
 *
 * Tiempos en segundos del proyecto. No hay warp: el audio no se estira; el BPM y el compás solo
 * definen la rejilla. Un clip tiene dos coordenadas que no se mezclan:
 *   pos = dónde suena en el proyecto · off = desde dónde se lee el archivo · len = cuánto suena.
 * Solapes en una pista: los clips suenan a la vez (se mezclan) y la interfaz lo marca; nunca se descartan.
 */
import type { AssetInfo, Clip, Marker, Project, Section, SectionDef, Stem, StemCat, Track } from '../types';

export const MIN_LEN = 0.01;
export const DECLICK = 0.005;

export const CAT_COLOR: Record<StemCat, string> = {
  bateria: '#f2a53a', bajo: '#3fcf8e', teclados: '#1ab8f5', guitarras: '#e58fb3', voces: '#a06bff', ambiente: '#5b9bd5', click: '#8a96b0', guia: '#c0c8d8', otro: '#6f7fa8',
};

export const emptyProject = (): Project => ({ v: 1, tracks: [], clips: [], markers: [], assets: {}, loop: { on: false, a: 0, b: 8 }, snap: true, accomp: true, countIn: 0 });

let seq = 0;
export const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const clipEnd = (c: Clip) => c.pos + c.len;
export const projectEnd = (p: Project) => p.clips.reduce((a, c) => Math.max(a, clipEnd(c)), 0);
export const routeOf = (cat: StemCat): Track['route'] => (cat === 'click' || cat === 'guia' ? 'click' : 'tracks');

export function newTrack(name: string, cat: StemCat, extra: Partial<Track> = {}): Track {
  return { id: uid('t'), name, cat, color: CAT_COLOR[cat], route: routeOf(cat), db: 0, pan: 0, mute: false, solo: false, ...extra };
}

/** C1–C5 guardaban un stem por archivo con `offset` (positivo = empieza más tarde). Se convierte sin perder nada. */
export function projectFromStems(stems: Stem[] = [], stemsOnly = false): Project {
  const p = emptyProject();
  p.accomp = !(stemsOnly && stems.length > 0);
  const group = stems.length > 1 ? uid('g') : undefined;
  for (const st of stems) {
    const t = newTrack(st.name, st.cat, { db: st.db, mute: st.mute, id: `t${st.id}` });
    const off = Math.max(0, -st.offset);
    p.tracks.push(t);
    p.clips.push({ id: `c${st.id}`, track: t.id, asset: st.asset, pos: Math.max(0, st.offset), off, len: Math.max(MIN_LEN, st.duration - off), gain: 0, fadeIn: 0, fadeOut: 0, group });
    p.assets[st.asset] = { name: st.name, duration: st.duration, channels: 0, sampleRate: 0, bytes: 0 };
  }
  return p;
}

/** Completa un proyecto guardado sin perder campos desconocidos de versiones nuevas. */
export function normalizeProject(p: Partial<Project> | undefined, stems?: Stem[], stemsOnly?: boolean): Project {
  // Datos viejos (o mezclados): si hay stems y el proyecto está vacío, los stems mandan.
  if (!p || (!p.clips?.length && stems?.length)) return projectFromStems(stems, stemsOnly);
  const base = emptyProject();
  return {
    ...base,
    ...p,
    v: 1,
    tracks: (p.tracks ?? []).map((t) => ({ ...newTrack(t.name ?? 'Pista', t.cat ?? 'otro'), ...t })),
    clips: (p.clips ?? []).filter((c) => c && c.asset && c.track).map((c) => ({ ...c, gain: c.gain ?? 0, fadeIn: c.fadeIn ?? 0, fadeOut: c.fadeOut ?? 0, len: Math.max(MIN_LEN, c.len), off: Math.max(0, c.off) })),
    markers: (p.markers ?? []).slice().sort((a, b) => a.at - b.at),
    assets: { ...(p.assets ?? {}) },
    loop: { ...base.loop, ...(p.loop ?? {}) },
  };
}

/* ---------- Rejilla musical ---------- */

export interface Grid {
  bar: number; // s por compás
  beat: number; // s por pulso
}
export const snapTo = (t: number, step: number) => (step > 0 ? Math.round(t / step) * step : t);

/* ---------- Edición (todas devuelven un proyecto nuevo) ---------- */

const linked = (p: Project, ids: string[]) => {
  // Los clips de un grupo de alineación se editan juntos.
  const groups = new Set(p.clips.filter((c) => ids.includes(c.id) && c.group).map((c) => c.group));
  return new Set(p.clips.filter((c) => ids.includes(c.id) || (c.group && groups.has(c.group))).map((c) => c.id));
};
export const linkedIds = (p: Project, ids: string[]) => [...linked(p, ids)];

export function moveClips(p: Project, ids: string[], dt: number): Project {
  const set = linked(p, ids);
  const minPos = Math.min(...p.clips.filter((c) => set.has(c.id)).map((c) => c.pos));
  const d = Math.max(dt, -minPos); // ningún clip antes del cero
  return { ...p, clips: p.clips.map((c) => (set.has(c.id) ? { ...c, pos: c.pos + d } : c)) };
}

/** Recorta el inicio a `t` (tiempo de proyecto): avanza pos y off juntos; el audio que queda suena igual que antes. */
export function trimStart(c: Clip, t: number): Clip {
  const nt = Math.min(Math.max(t, c.pos - c.off), clipEnd(c) - MIN_LEN);
  const d = nt - c.pos;
  return { ...c, pos: nt, off: c.off + d, len: c.len - d, fadeIn: Math.min(c.fadeIn, c.len - d) };
}
/** Recorta el final a `t`, sin pasar del final del archivo. */
export function trimEnd(c: Clip, t: number, sourceDur: number): Clip {
  const maxEnd = c.pos + (sourceDur - c.off);
  const len = Math.min(Math.max(t, c.pos + MIN_LEN), maxEnd) - c.pos;
  return { ...c, len, fadeOut: Math.min(c.fadeOut, len) };
}
export function applyToLinked(p: Project, ids: string[], fn: (c: Clip) => Clip): Project {
  const set = linked(p, ids);
  return { ...p, clips: p.clips.map((c) => (set.has(c.id) ? fn(c) : c)) };
}

/** Divide en `t` los clips indicados (o todos los que cruzan `t` si no se indica ninguno). */
export function splitAt(p: Project, t: number, ids?: string[]): Project {
  const set = ids?.length ? linked(p, ids) : null;
  const clips: Clip[] = [];
  for (const c of p.clips) {
    if ((set && !set.has(c.id)) || t <= c.pos + MIN_LEN || t >= clipEnd(c) - MIN_LEN) {
      clips.push(c);
      continue;
    }
    const a = c.len - (clipEnd(c) - t);
    clips.push({ ...c, len: a, fadeOut: 0 });
    clips.push({ ...c, id: uid('c'), pos: t, off: c.off + a, len: c.len - a, fadeIn: 0 });
  }
  return { ...p, clips };
}

/** Duplica los clips (y su grupo) justo después del último, conservando sus distancias. */
export function duplicate(p: Project, ids: string[]): { p: Project; ids: string[] } {
  const set = linked(p, ids);
  const src = p.clips.filter((c) => set.has(c.id));
  if (!src.length) return { p, ids: [] };
  const start = Math.min(...src.map((c) => c.pos));
  const end = Math.max(...src.map(clipEnd));
  const g = new Map<string, string>();
  const copies = src.map((c) => ({ ...c, id: uid('c'), pos: c.pos + (end - start), group: c.group ? (g.get(c.group) ?? (g.set(c.group, uid('g')), g.get(c.group))) : undefined }));
  return { p: { ...p, clips: [...p.clips, ...copies] }, ids: copies.map((c) => c.id) };
}

export const removeClips = (p: Project, ids: string[]): Project => {
  const set = new Set(ids); // borrar solo lo elegido: el grupo no se arrastra al borrar
  return { ...p, clips: p.clips.filter((c) => !set.has(c.id)) };
};

export function moveTrack(p: Project, id: string, dir: -1 | 1): Project {
  const i = p.tracks.findIndex((t) => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= p.tracks.length) return p;
  const tracks = p.tracks.slice();
  [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
  return { ...p, tracks };
}

/** Clips de la misma pista que se pisan: se mezclan; la interfaz los señala. */
export function overlaps(p: Project): Set<string> {
  const out = new Set<string>();
  for (const t of p.tracks) {
    const cs = p.clips.filter((c) => c.track === t.id).sort((a, b) => a.pos - b.pos);
    for (let i = 1; i < cs.length; i++) for (let j = 0; j < i; j++) if (clipEnd(cs[j]) > cs[i].pos + MIN_LEN) out.add(cs[i].id).add(cs[j].id);
  }
  return out;
}

/* ---------- Reproducción ---------- */

/** Ganancia de envolvente (0..1, sin la ganancia de clip) en el instante `t` del proyecto. */
export function envelopeAt(c: Clip, t: number): number {
  if (t < c.pos || t > clipEnd(c)) return 0;
  const a = t - c.pos;
  const b = clipEnd(c) - t;
  const fi = c.fadeIn > 0 ? Math.min(1, a / c.fadeIn) : 1;
  const fo = c.fadeOut > 0 ? Math.min(1, b / c.fadeOut) : 1;
  return Math.min(fi, fo);
}

export interface PlanItem {
  clip: Clip;
  /** Segundos desde el arranque hasta que empieza a sonar (0 si ya está sonando en `from`). */
  delay: number;
  /** Desde dónde se lee el archivo. */
  srcOff: number;
  /** Cuánto suena. */
  dur: number;
}
/** Qué debe sonar al arrancar en `from`: clips en curso (con su offset) y los que empiezan después. */
export function planFrom(p: Project, from: number): PlanItem[] {
  const out: PlanItem[] = [];
  for (const c of p.clips) {
    const end = clipEnd(c);
    if (end <= from + 1e-6) continue;
    const start = Math.max(from, c.pos);
    out.push({ clip: c, delay: start - from, srcOff: c.off + (start - c.pos), dur: end - start });
  }
  return out;
}

/* ---------- Secciones sobre el audio ---------- */

/** Región de cada marcador: desde su posición hasta el siguiente (o el final del proyecto). */
export function markerRegions(p: Project): { marker: Marker; start: number; end: number }[] {
  const ms = p.markers.slice().sort((a, b) => a.at - b.at);
  const end = Math.max(projectEnd(p), (ms[ms.length - 1]?.at ?? 0) + 1);
  return ms.map((m, i) => ({ marker: m, start: m.at, end: ms[i + 1]?.at ?? end }));
}

/**
 * Orden de la canción con marcadores. Cada paso dura un número entero de compases (los saltos ocurren
 * en el compás, igual para el audio y el acompañamiento); la interfaz dibuja esa misma duración.
 * Se conservan las repeticiones y el orden que el usuario armó; los marcadores nuevos se agregan en orden temporal.
 */
export function arrFromMarkers(p: Project, prev: Section[], barSec: number): Section[] {
  const regs = markerRegions(p);
  // Sin marcadores, el orden vuelve a ser solo musical (compases), como antes del estudio.
  if (!regs.length) return prev.map(({ scene, bars }) => ({ scene, bars }));
  const byId = new Map(regs.map((r) => [r.marker.id, r]));
  const step = (r: (typeof regs)[number]): Section => ({ scene: r.marker.sec, bars: Math.max(1, Math.round((r.end - r.start) / barSec)), at: r.start, marker: r.marker.id });
  const kept = prev.filter((x) => x.marker && byId.has(x.marker)).map((x) => step(byId.get(x.marker!)!));
  const used = new Set(kept.map((x) => x.marker));
  if (!kept.length) return regs.map(step);
  for (const r of regs) if (!used.has(r.marker.id)) kept.push(step(r));
  return kept;
}

/** Posición de proyecto donde empieza el paso `i` del orden (con marcadores, su `at`; si no, compases acumulados). */
export const stepStart = (arr: Section[], i: number, barSec: number) => arr[i]?.at ?? arr.slice(0, i).reduce((a, x) => a + x.bars, 0) * barSec;

/** Paso del orden y compás que corresponden a una posición del proyecto. */
export function locate(arr: Section[], pos: number, barSec: number): { index: number; bar: number; within: number } {
  for (let i = 0; i < arr.length; i++) {
    const a = stepStart(arr, i, barSec);
    const len = arr[i].bars * barSec;
    if (pos >= a - 1e-6 && pos < a + len - 1e-6) {
      const bar = Math.floor((pos - a + 1e-6) / barSec);
      return { index: i, bar, within: Math.max(0, pos - a - bar * barSec) };
    }
  }
  return { index: 0, bar: 0, within: 0 };
}

export const sectionLabel = (sections: SectionDef[], id: string) => sections.find((x) => x.id === id)?.label ?? id;

/** Activos que el proyecto necesita y no están listos (para avisar antes de reproducir). */
export function missingAssets(p: Project, ready: (asset: string) => boolean): { asset: string; name: string }[] {
  const seen = new Set<string>();
  const out: { asset: string; name: string }[] = [];
  for (const c of p.clips) {
    if (seen.has(c.asset) || ready(c.asset)) continue;
    seen.add(c.asset);
    out.push({ asset: c.asset, name: p.assets[c.asset]?.name ?? c.asset });
  }
  return out;
}
export type { AssetInfo };
