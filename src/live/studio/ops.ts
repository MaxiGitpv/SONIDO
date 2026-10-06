/*
 * Operaciones de edición del proyecto multitrack (puras). Las usa el reductor del estado, que guarda el
 * historial de deshacer/rehacer solo del proyecto: deshacer una edición nunca revierte micrófonos ni master.
 */
import type { AssetInfo, Clip, Marker, Project, ProjVersion, Track } from '../types';
import { applyToLinked, duplicate, moveClips, moveTrack, removeClips, splitAt, trimEnd, trimStart, uid } from './model';

export type ProjOp =
  | { k: 'addAudio'; tracks: Track[]; clips: Clip[]; assets: Record<string, AssetInfo> }
  | { k: 'asset'; id: string; info: AssetInfo }
  | { k: 'track'; id: string; patch: Partial<Track> }
  | { k: 'trackMove'; id: string; dir: -1 | 1 }
  | { k: 'trackRemove'; id: string }
  | { k: 'move'; ids: string[]; dt: number }
  | { k: 'trimStart'; ids: string[]; d: number }
  | { k: 'trimEnd'; ids: string[]; d: number }
  | { k: 'split'; t: number; ids?: string[] }
  | { k: 'dup'; ids: string[] }
  | { k: 'remove'; ids: string[] }
  | { k: 'clip'; id: string; patch: Partial<Pick<Clip, 'gain' | 'fadeIn' | 'fadeOut'>> }
  | { k: 'group'; ids: string[]; on: boolean }
  | { k: 'marker'; m: Marker }
  | { k: 'markerRemove'; id: string }
  | { k: 'settings'; patch: Partial<Pick<Project, 'snap' | 'accomp' | 'countIn' | 'loop'>> }
  /** Cambia todo el proyecto a otra versión de sus archivos: tiempos × factor (clips, fundidos, marcadores, A/B). */
  | { k: 'retime'; map: Record<string, string>; factor: number; assets: Record<string, AssetInfo>; version: ProjVersion | null };

/** Etiqueta corta para el aviso de deshacer. */
export const OP_LABEL: Record<ProjOp['k'], string> = {
  addAudio: 'importar', asset: 'archivo', track: 'pista', trackMove: 'ordenar pistas', trackRemove: 'quitar pista', move: 'mover', trimStart: 'recortar inicio',
  trimEnd: 'recortar final', retime: 'tempo y tono', split: 'dividir', dup: 'duplicar', remove: 'eliminar', clip: 'ganancia/fundidos', group: 'grupo', marker: 'marcador', markerRemove: 'quitar marcador', settings: 'ajustes',
};

const dur = (p: Project, c: Clip) => p.assets[c.asset]?.duration || c.off + c.len;

export function applyOp(p: Project, op: ProjOp): Project {
  switch (op.k) {
    case 'addAudio':
      return { ...p, tracks: [...p.tracks, ...op.tracks], clips: [...p.clips, ...op.clips], assets: { ...p.assets, ...op.assets } };
    case 'asset':
      return { ...p, assets: { ...p.assets, [op.id]: op.info } };
    case 'track':
      return { ...p, tracks: p.tracks.map((t) => (t.id === op.id ? { ...t, ...op.patch, id: t.id } : t)) };
    case 'trackMove':
      return moveTrack(p, op.id, op.dir);
    case 'trackRemove':
      return { ...p, tracks: p.tracks.filter((t) => t.id !== op.id), clips: p.clips.filter((c) => c.track !== op.id) };
    case 'move':
      return moveClips(p, op.ids, op.dt);
    case 'trimStart':
      return applyToLinked(p, op.ids, (c) => trimStart(c, c.pos + op.d));
    case 'trimEnd':
      return applyToLinked(p, op.ids, (c) => trimEnd(c, c.pos + c.len + op.d, dur(p, c)));
    case 'split':
      return splitAt(p, op.t, op.ids);
    case 'dup':
      return duplicate(p, op.ids).p;
    case 'remove':
      return removeClips(p, op.ids);
    case 'clip':
      return {
        ...p,
        clips: p.clips.map((c) => {
          if (c.id !== op.id) return c;
          const n = { ...c, ...op.patch };
          // Los fundidos no pueden superar la duración del clip ni pisarse.
          n.fadeIn = Math.max(0, Math.min(n.fadeIn, n.len));
          n.fadeOut = Math.max(0, Math.min(n.fadeOut, n.len - n.fadeIn));
          n.gain = Math.max(-60, Math.min(12, n.gain));
          return n;
        }),
      };
    case 'group': {
      const g = op.on ? uid('g') : undefined;
      const set = new Set(op.ids);
      return { ...p, clips: p.clips.map((c) => (set.has(c.id) ? { ...c, group: g } : c)) };
    }
    case 'marker': {
      const m = { ...op.m, at: Math.max(0, op.m.at) };
      const exists = p.markers.some((x) => x.id === m.id);
      const markers = (exists ? p.markers.map((x) => (x.id === m.id ? m : x)) : [...p.markers, m]).sort((a, b) => a.at - b.at);
      return { ...p, markers };
    }
    case 'markerRemove':
      return { ...p, markers: p.markers.filter((m) => m.id !== op.id) };
    case 'settings':
      return { ...p, ...op.patch, loop: op.patch.loop ? { ...p.loop, ...op.patch.loop } : p.loop };
    case 'retime': {
      const f = op.factor;
      const out: Project = {
        ...p,
        assets: { ...p.assets, ...op.assets },
        clips: p.clips.map((c) => ({ ...c, asset: op.map[c.asset] ?? c.asset, pos: c.pos * f, off: c.off * f, len: c.len * f, fadeIn: c.fadeIn * f, fadeOut: c.fadeOut * f })),
        markers: p.markers.map((m) => ({ ...m, at: m.at * f })),
        loop: { ...p.loop, a: p.loop.a * f, b: p.loop.b * f },
      };
      if (op.version) out.version = op.version;
      else delete out.version;
      return out;
    }
  }
}

/** Ajustes que no se guardan en el historial (no son ediciones del audio). */
export const isSetting = (op: ProjOp) => op.k === 'settings' || op.k === 'asset' || (op.k === 'track' && Object.keys(op.patch).every((k) => k === 'solo'));
