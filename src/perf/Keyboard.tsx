import { useMemo } from 'react';
import type { InstSetup, Inst, SceneMix } from './types';
import { INSTS, NOTE_HI, NOTE_LO } from './types';
import { INST_META, isBlack, noteName } from './data';
import { effLevel } from './ctx';

const KW = 24;
const KH = 150;
const BW = 15;
const BH = 92;

interface Geo {
  n: number;
  x: number;
  w: number;
  black: boolean;
}

const GEO: Geo[] = (() => {
  const out: Geo[] = [];
  let wi = 0;
  for (let n = NOTE_LO; n <= NOTE_HI; n++) {
    if (isBlack(n)) out.push({ n, x: wi * KW - BW / 2, w: BW, black: true });
    else {
      out.push({ n, x: wi * KW, w: KW, black: false });
      wi++;
    }
  }
  return out;
})();
const WIDTH = GEO.filter((g) => !g.black).length * KW;
const xOf = (n: number) => GEO.find((g) => g.n === n)?.x ?? 0;

interface Props {
  setup: Record<Inst, InstSetup>;
  mix: SceneMix;
  held: number[];
  onNote?: (n: number, down: boolean) => void;
  compact?: boolean;
}

/** Teclado de 61 teclas (C2–C7). Las tapas de color muestran qué capas suenan en cada tecla. Solo ilumina: no produce audio. */
export function Keyboard({ setup, mix, held, onNote, compact }: Props) {
  const active = useMemo(() => INSTS.filter((i) => effLevel(mix, i) > 0.01), [mix]);
  const sounding = (n: number) => active.filter((i) => n + setup[i].transpose >= setup[i].lo && n + setup[i].transpose <= setup[i].hi);
  const dots = (g: Geo) => {
    const list = sounding(g.n);
    const cw = g.w / 4;
    return list.map((i) => {
      const k = INSTS.indexOf(i);
      const off = g.black ? (g.w - cw * list.length) / 2 + list.indexOf(i) * cw : k * cw;
      return <rect key={i} x={g.x + off + 1} y={(g.black ? BH : KH) - 9} width={cw - 2} height={5} rx="1.5" fill={INST_META[i].color} />;
    });
  };
  const keyFill = (g: Geo) => {
    const down = held.includes(g.n);
    if (down) {
      const first = sounding(g.n)[0];
      return first ? INST_META[first].color : '#9db4ff';
    }
    return g.black ? 'url(#kb-black)' : 'url(#kb-white)';
  };

  const handlers = (n: number) =>
    onNote
      ? {
          onPointerDown: (e: React.PointerEvent) => {
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            onNote(n, true);
          },
          onPointerUp: () => onNote(n, false),
          onPointerCancel: () => onNote(n, false),
        }
      : {};

  return (
    <div className={`kb${compact ? ' compact' : ''}`}>
      <svg viewBox={`0 0 ${WIDTH} ${KH}`} preserveAspectRatio={compact ? 'none' : undefined} role="img" aria-label="Teclado de 61 teclas con el rango de cada instrumento">
        <defs>
          <linearGradient id="kb-white" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#f6f1e4" />
            <stop offset="1" stopColor="#d8d0bd" />
          </linearGradient>
          <linearGradient id="kb-black" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2a2d36" />
            <stop offset="1" stopColor="#0b0c10" />
          </linearGradient>
        </defs>
        {GEO.filter((g) => !g.black).map((g) => (
          <rect key={g.n} x={g.x + 0.5} y="0" width={g.w - 1} height={KH} rx="2" fill={keyFill(g)} stroke="#6b6757" strokeWidth="0.6" {...handlers(g.n)} />
        ))}
        {GEO.filter((g) => !g.black && g.n % 12 === 0).map((g) => (
          <text key={`l${g.n}`} x={g.x + g.w / 2} y={KH - 16} textAnchor="middle" className="kb-c" pointerEvents="none">{noteName(g.n)}</text>
        ))}
        {GEO.filter((g) => !g.black).map((g) => <g key={`d${g.n}`} pointerEvents="none">{dots(g)}</g>)}
        {GEO.filter((g) => g.black).map((g) => (
          <rect key={g.n} x={g.x} y="0" width={g.w} height={BH} rx="2" fill={keyFill(g)} stroke="#000" strokeWidth="0.6" {...handlers(g.n)} />
        ))}
        {GEO.filter((g) => g.black).map((g) => <g key={`d${g.n}`} pointerEvents="none">{dots(g)}</g>)}
      </svg>
      <div className="kb-ranges" aria-label="Rangos de cada instrumento">
        {INSTS.map((i) => {
          const lo = xOf(setup[i].lo - setup[i].transpose);
          const hi = xOf(setup[i].hi - setup[i].transpose) + (isBlack(setup[i].hi - setup[i].transpose) ? BW / 2 : KW);
          const on = effLevel(mix, i) > 0.01;
          return (
            <div key={i} className={`kb-range${on ? '' : ' off'}`} style={{ ['--ic' as string]: INST_META[i].color }}>
              <i style={{ left: `${(lo / WIDTH) * 100}%`, width: `${Math.max(0, hi - lo) / WIDTH * 100}%` }}>
                <b>{INST_META[i].label}</b>
              </i>
            </div>
          );
        })}
      </div>
    </div>
  );
}
