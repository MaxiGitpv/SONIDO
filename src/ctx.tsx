import { createContext, useContext, useEffect, useState } from 'react';
import type { Dispatch } from 'react';
import type { Action, State } from './store';
import type { Channel, MixId } from './types';

export const StoreCtx = createContext<{ state: State; dispatch: Dispatch<Action> } | null>(null);

export function useStore() {
  const v = useContext(StoreCtx);
  if (!v) throw new Error('StoreCtx ausente');
  return v;
}

/** Atajo para modificar un canal. */
export function useChannelEdit() {
  const { dispatch } = useStore();
  return (id: string, fn: (c: Channel) => Channel) => dispatch({ type: 'ch', id, fn });
}

export const setPer = <T,>(rec: Record<MixId, T>, mix: MixId, v: T): Record<MixId, T> => ({ ...rec, [mix]: v });

export function useMedia(query: string): boolean {
  const [m, setM] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}
