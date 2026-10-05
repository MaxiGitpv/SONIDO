import type { Channel, FxState, MixId, MixSnapshot, Scene, ViewId, Master } from './types';
import { sampleScenes } from './data';
import { clone } from './util';

export interface State {
  snap: MixSnapshot;
  scenes: Scene[];
  activeScene: string;
  view: ViewId;
  mixId: MixId;
  selected: string;
  bank: number;
  demo: boolean;
  toast: { id: number; text: string } | null;
}

export type Action =
  | { type: 'view'; view: ViewId }
  | { type: 'mix'; mix: MixId }
  | { type: 'select'; id: string }
  | { type: 'bank'; bank: number }
  | { type: 'demo'; on: boolean }
  | { type: 'ch'; id: string; fn: (c: Channel) => Channel }
  | { type: 'master'; mix: MixId; patch: Partial<Master> }
  | { type: 'fx'; fn: (f: FxState) => FxState }
  | { type: 'clearSolo' }
  | { type: 'loadScene'; id: string }
  | { type: 'saveScene'; id: string }
  | { type: 'newScene'; name: string }
  | { type: 'renameScene'; id: string; name: string }
  | { type: 'toast'; text: string };

const SCENES_KEY = 'sonido.scenes.v1';

export function loadScenes(): Scene[] {
  try {
    const raw = localStorage.getItem(SCENES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Scene[];
      if (Array.isArray(parsed) && parsed.length && parsed.every((s) => s.data && s.data.channels?.length === 12)) return parsed;
    }
  } catch {
    /* sin almacenamiento: se usan las escenas de ejemplo */
  }
  return sampleScenes();
}

export function persistScenes(scenes: Scene[]) {
  try {
    localStorage.setItem(SCENES_KEY, JSON.stringify(scenes));
  } catch {
    /* ignorado */
  }
}

export function initState(): State {
  const scenes = loadScenes();
  const active = scenes.find((s) => s.id === 'alabanza') ?? scenes[0];
  return {
    snap: clone(active.data),
    scenes,
    activeScene: active.id,
    view: 'mix',
    mixId: 'main',
    selected: 'voz',
    bank: 0,
    demo: false,
    toast: null,
  };
}

let toastSeq = 0;
const say = (s: State, text: string): State => ({ ...s, toast: { id: ++toastSeq, text } });
const nowIso = () => new Date().toISOString().slice(0, 19);

export function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'view':
      return { ...s, view: a.view };
    case 'mix':
      return { ...s, mixId: a.mix };
    case 'select':
      return { ...s, selected: a.id };
    case 'bank':
      return { ...s, bank: a.bank };
    case 'demo':
      return say({ ...s, demo: a.on }, a.on ? 'DEMO activado: los medidores son simulados' : 'DEMO desactivado');
    case 'ch':
      return { ...s, snap: { ...s.snap, channels: s.snap.channels.map((c) => (c.id === a.id ? a.fn(c) : c)) } };
    case 'master':
      return { ...s, snap: { ...s.snap, masters: { ...s.snap.masters, [a.mix]: { ...s.snap.masters[a.mix], ...a.patch } } } };
    case 'fx':
      return { ...s, snap: { ...s.snap, fx: a.fn(s.snap.fx) } };
    case 'clearSolo':
      return { ...s, snap: { ...s.snap, channels: s.snap.channels.map((c) => (c.solo ? { ...c, solo: false } : c)) } };
    case 'loadScene': {
      const sc = s.scenes.find((x) => x.id === a.id);
      if (!sc) return s;
      return say({ ...s, snap: clone(sc.data), activeScene: sc.id }, `Escena «${sc.name}» cargada`);
    }
    case 'saveScene': {
      const scenes = s.scenes.map((x) => (x.id === a.id ? { ...x, data: clone(s.snap), savedAt: nowIso() } : x));
      const name = scenes.find((x) => x.id === a.id)?.name ?? '';
      return say({ ...s, scenes, activeScene: a.id }, `Escena «${name}» guardada`);
    }
    case 'newScene': {
      const name = a.name.trim();
      if (!name) return s;
      const id = `u${Date.now().toString(36)}`;
      const scenes = [...s.scenes, { id, name, savedAt: nowIso(), data: clone(s.snap) }];
      return say({ ...s, scenes, activeScene: id }, `Escena «${name}» creada`);
    }
    case 'renameScene':
      return { ...s, scenes: s.scenes.map((x) => (x.id === a.id ? { ...x, name: a.name } : x)) };
    case 'toast':
      return say(s, a.text);
  }
}
