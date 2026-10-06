import { createContext, useContext } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { ChId, LiveState, SceneId, SceneMix, Song } from './types';
import type { LAction } from './store';
import type { MidiDevice } from './midi';
import type { Area, Role } from './perms';
import type { MixerInfo, NetStatus, Peer } from './net';

export interface MidiState {
  status: 'off' | 'on' | 'error';
  devices: MidiDevice[];
  last: string;
  learn: string | null;
  error: string;
}
export interface RecState {
  on: boolean;
  secs: number;
  url: string | null;
  ext: string;
  mime: string;
}
export type AssetState = Record<string, 'loading' | 'ready' | 'missing' | 'error'>;
export interface NetState {
  status: NetStatus;
  detail: string;
  role: Role;
  host: boolean;
  hostPresent: boolean;
  peers: Peer[];
  ownBus: string;
  mixers: MixerInfo[];
  mixer: MixerInfo | null;
  values: Record<string, number | string>;
  meters: number[];
  levels: Record<string, number>;
}

export interface LiveCtxValue {
  s: LiveState;
  d: Dispatch<LAction>;
  mix: SceneMix;
  audioOn: boolean;
  loadFile: (ch: ChId, file: File) => Promise<void>;
  /** Cambia de sección: al instante si está detenido, en el compás siguiente si suena. */
  goScene: (scene: SceneId) => void;
  midi: MidiState;
  connectMidi: () => void;
  setLearn: (id: string | null) => void;
  rec: RecState;
  toggleRec: () => void;
  /** Vista local activa (no es autenticación) o rol asignado por el puente si este equipo es remoto. */
  role: Role;
  can: (area: Area) => boolean;
  remote: boolean;
  song: Song;
  assets: AssetState;
  addStems: (files: File[]) => Promise<void>;
  addSamples: (files: File[]) => Promise<void>;
  netState: NetState;
  setNetState: Dispatch<SetStateAction<NetState>>;
  transport: (op: 'play' | 'pause' | 'stop') => void;
  panic: () => void;
  save: () => void;
  profile: string;
}
export const LiveCtx = createContext<LiveCtxValue | null>(null);
export function useLive() {
  const v = useContext(LiveCtx);
  if (!v) throw new Error('LiveCtx ausente');
  return v;
}

const P = (d: string) => <path d={d} />;

/** Iconos de trazo simple (24×24). */
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const body: Record<string, ReactNode> = {
    piano: <>{P('M3 5h18v14H3z')}{P('M8 5v14M13 5v14M18 5v14')}{P('M6.5 5v7M11.5 5v7M16.5 5v7')}</>,
    pad: <>{P('M2 12h3l2-6 3 12 3-9 2 6 2-3h5')}</>,
    organ: <>{P('M4 20V9M8 20V6M12 20V4M16 20V6M20 20V9')}{P('M3 20h18')}</>,
    strings: <>{P('M15 3l6 6-9 9-4 1 1-4z')}{P('M4 20l4-4')}</>,
    voz: <>{P('M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z')}{P('M5 11a7 7 0 0 0 14 0M12 18v3')}</>,
    guitarra: <>{P('M14 10l6-6M18 2l4 4')}{P('M10 8a4 4 0 0 0-5.6 1.4L3 12a5 5 0 0 0 9 9l2.6-1.4A4 4 0 0 0 16 14z')}</>,
    tracks: <>{P('M7 4l13 8-13 8z')}</>,
    click: <>{P('M4 14v-2a8 8 0 0 1 16 0v2')}{P('M4 14h3v6H4zM17 14h3v6h-3z')}</>,
    master: <>{P('M5 20V10M10 20V4M15 20V8M20 20V13')}</>,
    list: <>{P('M8 6h13M8 12h13M8 18h13M3 6h1M3 12h1M3 18h1')}</>,
    layers: <>{P('M12 3l9 5-9 5-9-5z')}{P('M3 13l9 5 9-5')}</>,
    sliders: <>{P('M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0')}{P('M14 4v4M8 10v4M16 16v4')}</>,
    gear: <>{P('M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z')}{P('M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z')}</>,
    save: <>{P('M5 3h11l3 3v15H5z')}{P('M8 3v5h7V3M8 21v-7h8v7')}</>,
    play: <>{P('M7 4l13 8-13 8z')}</>,
    pause: <>{P('M7 4h3v16H7zM14 4h3v16h-3z')}</>,
    stop: <>{P('M6 6h12v12H6z')}</>,
    prev: <>{P('M15 5l-7 7 7 7')}</>,
    next: <>{P('M9 5l7 7-7 7')}</>,
    power: <>{P('M12 3v9')}{P('M6.3 7.5a8 8 0 1 0 11.4 0')}</>,
    warn: <>{P('M12 3l10 18H2z')}{P('M12 10v5M12 18v.5')}</>,
    plus: <>{P('M12 5v14M5 12h14')}</>,
    dots: <>{P('M5 12h.5M12 12h.5M19 12h.5')}</>,
    headphones: <>{P('M4 15v-3a8 8 0 0 1 16 0v3')}{P('M4 15h3v5H4zM17 15h3v5h-3z')}</>,
    upload: <>{P('M12 16V4M7 9l5-5 5 5')}{P('M4 20h16')}</>,
    menu: <>{P('M4 6h16M4 12h16M4 18h16')}</>,
    bajo: <>{P('M17 3l4 4-7 7')}{P('M13 9a5 5 0 1 0-6 8l-3 3h4l1-2a5 5 0 0 0 4-9z')}</>,
    drums: <>{P('M3 9c0-2 4-4 9-4s9 2 9 4-4 4-9 4-9-2-9-4z')}{P('M3 9v6c0 2 4 4 9 4s9-2 9-4V9')}{P('M8 3l3 5M16 3l-3 5')}</>,
    perc: <>{P('M8 4h8l-1 16H9z')}{P('M8 8h8M9 14h6')}</>,
    expand: <>{P('M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7')}</>,
    x: <>{P('M6 6l12 12M18 6L6 18')}</>,
    loop: <>{P('M17 2l3 3-3 3')}{P('M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3')}{P('M20 13v2a4 4 0 0 1-4 4H4')}</>,
    keys: <>{P('M3 5h18v14H3zM8 5v9M13 5v9M18 5v9')}</>,
    grid: <>{P('M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z')}</>,
    brass: <>{P('M3 10v4h3l7 4V6l-7 4z')}{P('M13 9h4l4-3v12l-4-3h-4')}</>,
  };
  return (
    <svg className="ic" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {body[name]}
    </svg>
  );
}

/** Miniatura ilustrada de un sonido (sin fotos: dibujo vectorial por instrumento). */
export function Art({ ch, big }: { ch: ChId; big?: boolean }) {
  const w = big ? 96 : 64;
  const h = big ? 72 : 48;
  const grad: Record<string, [string, string]> = {
    piano: ['#1b2433', '#4a3828'],
    pad: ['#2a1a5e', '#6a3fd6'],
    organ: ['#3a2410', '#a8621c'],
    strings: ['#2b1638', '#8a3fa0'],
  };
  const [a, b] = grad[ch] ?? ['#16243a', '#2c4a74'];
  const id = `g-${ch}-${big ? 'b' : 's'}`;
  return (
    <svg className="art" width={w} height={h} viewBox="0 0 64 48" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
      </defs>
      <rect width="64" height="48" rx="6" fill={`url(#${id})`} />
      {ch === 'piano' && (
        <g>
          <path d="M10 30 Q30 12 54 22 L54 30 Z" fill="#0b0d12" opacity=".85" />
          {Array.from({ length: 9 }, (_, i) => <rect key={i} x={10 + i * 5} y="31" width="4.4" height="10" fill="#efe9dc" />)}
          {[0, 1, 3, 4, 5, 7].map((i) => <rect key={i} x={13 + i * 5} y="31" width="2.6" height="6" fill="#111" />)}
        </g>
      )}
      {ch === 'pad' && <path d="M0 30 C10 18 18 40 28 28 S46 16 64 26" stroke="#c9b5ff" strokeWidth="2" fill="none" opacity=".9" />}
      {ch === 'pad' && <path d="M0 36 C12 26 22 44 34 34 S52 24 64 32" stroke="#8fe0ff" strokeWidth="1.2" fill="none" opacity=".6" />}
      {ch === 'organ' && [8, 4, 2, 6, 3, 7, 5, 1, 4].map((v, i) => <rect key={i} x={7 + i * 5.6} y="8" width="3.4" height={8 + v * 3.4} rx="1" fill={i < 2 ? '#7a4a2b' : i % 3 === 1 ? '#22252b' : '#efe6d0'} />)}
      {ch === 'strings' && (
        <g stroke="#f1d6ff" strokeWidth="1.4" fill="none" opacity=".85">
          <path d="M16 40 L44 10" />
          <path d="M22 40 C22 30 34 22 40 30 C46 38 34 44 28 40" />
          <path d="M12 16 L52 36" stroke="#fff" strokeWidth=".8" />
        </g>
      )}
    </svg>
  );
}

export const fmtPct = (v: number) => `${Math.round(v * 100)} %`;
