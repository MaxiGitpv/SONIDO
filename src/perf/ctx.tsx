import { createContext, useContext } from 'react';
import type { Dispatch } from 'react';
import type { Inst, PerfState, SceneMix } from './types';
import { INSTS } from './types';
import type { PAction } from './store';

export interface PerfCtxValue {
  s: PerfState;
  d: Dispatch<PAction>;
  /** Mezcla que se muestra: la de la escena, o la mezcla intermedia Verso/Coro en modo prueba. */
  view: SceneMix;
  tablet: boolean;
}

export const PerfCtx = createContext<PerfCtxValue | null>(null);
export function usePerf() {
  const v = useContext(PerfCtx);
  if (!v) throw new Error('PerfCtx ausente');
  return v;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function blend(a: SceneMix, b: SceneMix, t: number): SceneMix {
  const layers = {} as SceneMix['layers'];
  for (const i of INSTS) {
    const la = a.layers[i].on ? a.layers[i].level : 0;
    const lb = b.layers[i].on ? b.layers[i].level : 0;
    const l = lerp(la, lb, t);
    layers[i] = { on: l > 0.005, level: l };
  }
  return {
    sound: t < 0.5 ? a.sound : b.sound,
    layers,
    macros: {
      ambience: lerp(a.macros.ambience, b.macros.ambience, t),
      brightness: lerp(a.macros.brightness, b.macros.brightness, t),
      expression: lerp(a.macros.expression, b.macros.expression, t),
    },
  };
}

/** Nivel real de una capa, con la expresión aplicada donde el sonido la usa. */
export function effLevel(m: SceneMix, inst: Inst): number {
  const l = m.layers[inst];
  if (!l.on) return 0;
  if (m.sound === 'pianostrings' && inst === 'strings') return l.level * (0.15 + 0.85 * m.macros.expression);
  if (m.sound === 'organ' && inst === 'organ') return l.level * (0.4 + 0.6 * m.macros.expression);
  return l.level;
}

export const pct = (v: number) => `${Math.round(v * 100)}`;
