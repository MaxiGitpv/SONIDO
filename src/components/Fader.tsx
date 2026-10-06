import { useRef } from 'react';
import { FADER_TICKS as FADER_TICKS_ALL, clamp, dbToPos, posToDb } from '../util';
import { useMedia } from '../ctx';
import { Meter } from './Meter';

const TICKS_COMPACT = [10, 0, -10, -20, -40, -60];

interface Props {
  value: number;
  onChange: (db: number) => void;
  disabled?: boolean;
  label: string;
  color?: string;
  meterKey?: string;
  stereo?: boolean;
  ticks?: boolean;
}

/** Fader vertical con escala, medidor alineado y soporte de mouse, toque y teclado. */
export function Fader({ value, onChange, disabled, label, color, meterKey, stereo, ticks = true }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  
  // Arrastre relativo: tocar el carril no hace saltar el nivel; el fader se mueve con el dedo desde donde estaba.
  // Mayús/Ctrl (o mantener dos dedos fuera) da movimiento fino ×0,25. Doble clic/toque vuelve a 0 dB.
  const drag = useRef<{ y: number; pos: number; moved: boolean } | null>(null);
  const pending = useRef(false);
  const span = () => {
    const r = trackRef.current!.getBoundingClientRect();
    return Math.max(1, r.height - thumbRef.current!.offsetHeight);
  };
  // Último valor emitido: varias teclas seguidas no deben partir de un valor viejo antes del siguiente render.
  const cur = useRef(value);
  cur.current = drag.current || pending.current ? cur.current : value;
  const emit = (db: number) => {
    const v = Math.round(clamp(db, -90, 10) * 10) / 10;
    cur.current = v;
    pending.current = true;
    queueMicrotask(() => (pending.current = false));
    onChange(v);
  };

  const down = (e: React.PointerEvent) => {
    if (disabled || e.button > 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* puntero sintético o ya liberado */
    }
    drag.current = { y: e.clientY, pos: dbToPos(cur.current), moved: false };
  };
  const move = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const fine = e.shiftKey || e.ctrlKey || e.metaKey ? 0.25 : 1;
    const dy = (g.y - e.clientY) * fine;
    if (!g.moved && Math.abs(g.y - e.clientY) < 3) return; // tolerancia: un toque no cambia nada
    g.moved = true;
    g.y = e.clientY;
    g.pos = clamp(g.pos + dy / span(), 0, 1);
    let db = posToDb(g.pos);
    if (Math.abs(db) < 0.35 && fine === 1) db = 0; // imán suave en 0 dB
    emit(db);
  };
  const up = () => {
    drag.current = null;
  };
  const key = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const v = cur.current;
    const step = e.shiftKey ? 0.1 : e.ctrlKey || e.metaKey ? 3 : 0.5;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') emit(v <= -89.5 ? -60 : v + step);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') emit(v <= -60 ? -90 : v - step);
    else if (e.key === 'PageUp') emit(v <= -89.5 ? -40 : v + 6);
    else if (e.key === 'PageDown') emit(v - 6 < -60 ? -90 : v - 6);
    else if (e.key === 'Home') emit(10);
    else if (e.key === 'End') emit(-90);
    else if (e.key === '0') emit(0);
    else return;
    e.preventDefault();
  };
  const compact = useMedia('(max-width: 1279px)');
  const FADER_TICKS = compact ? TICKS_COMPACT : FADER_TICKS_ALL;
  const pos = dbToPos(value);
  const at = (p: number) => `calc((100% - var(--th)) * ${p} + var(--th) / 2)`;

  return (
    <div className={`fader${disabled ? ' is-disabled' : ''}`} style={{ ['--ac' as string]: color }}>
      {ticks && (
        <div className="fader-scale" aria-hidden="true">
          {FADER_TICKS.map((t) => (
            <span key={t} className={t === 0 ? 'zero' : ''} style={{ bottom: at(dbToPos(t)) }}>
              {t > 0 ? `+${t}` : t}
            </span>
          ))}
        </div>
      )}
      <div
        ref={trackRef}
        className="fader-track"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={-90}
        aria-valuemax={10}
        aria-valuenow={Math.round(value * 10) / 10}
        aria-valuetext={value <= -89.5 ? 'menos infinito' : `${value > 0 ? '+' : ''}${value.toFixed(1)} dB`}
        aria-disabled={disabled}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        onDoubleClick={() => !disabled && onChange(0)}
        title={disabled ? undefined : 'Arrastrar: nivel · Mayús: fino · Doble clic: 0 dB'}
      >
        <div className="fader-rail" />
        {ticks && FADER_TICKS.map((t) => <i key={t} className={`tick${t === 0 ? ' zero' : ''}`} style={{ bottom: at(dbToPos(t)) }} />)}
        <div ref={thumbRef} className="fader-thumb" style={{ bottom: `calc((100% - var(--th)) * ${pos})` }}>
          <b />
        </div>
      </div>
      {meterKey && <Meter id={meterKey} stereo={stereo} />}
    </div>
  );
}
