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
  const grab = useRef<number | null>(null);

  const posAt = (y: number, off: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    const th = thumbRef.current!.offsetHeight;
    return 1 - (y - off - r.top - th / 2) / (r.height - th);
  };

  const down = (e: React.PointerEvent) => {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const tr = thumbRef.current!.getBoundingClientRect();
    const cy = tr.top + tr.height / 2;
    grab.current = Math.abs(e.clientY - cy) <= tr.height / 2 ? e.clientY - cy : 0;
    onChange(Math.round(posToDb(posAt(e.clientY, grab.current)) * 10) / 10);
  };
  const move = (e: React.PointerEvent) => {
    if (grab.current === null) return;
    let db = posToDb(posAt(e.clientY, grab.current));
    if (Math.abs(db) < 1.2) db = 0; // imán en 0 dB
    onChange(Math.round(db * 10) / 10);
  };
  const up = () => {
    grab.current = null;
  };
  const key = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const step = e.shiftKey ? 0.5 : 1;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(clamp(value <= -89.5 ? -60 : value + step, -90, 10));
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(value <= -59 ? -90 : value - step);
    else if (e.key === 'Home') onChange(10);
    else if (e.key === 'End') onChange(-90);
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
        aria-disabled={disabled}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        onDoubleClick={() => !disabled && onChange(0)}
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
