import { useRef } from 'react';
import { clamp } from '../util';

interface Props {
  value: number; // 0..1
  ghost?: number; // nivel efectivo (0..1), por ejemplo tras aplicar expresión
  onChange: (v: number) => void;
  color: string;
  label: string;
  disabled?: boolean;
}

/** Fader vertical grande para una capa. Mouse, toque y teclado. */
export function PerfFader({ value, ghost, onChange, color, label, disabled }: Props) {
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);
  const grab = useRef<number | null>(null);

  const at = (y: number, off: number) => {
    const r = track.current!.getBoundingClientRect();
    const th = thumb.current!.offsetHeight;
    return clamp(1 - (y - off - r.top - th / 2) / (r.height - th), 0, 1);
  };
  const snap = (v: number) => (Math.abs(v - 0.75) < 0.025 ? 0.75 : Math.round(v * 100) / 100);

  return (
    <div className={`pf${disabled ? ' is-disabled' : ''}`} style={{ ['--ic' as string]: color }}>
      <div
        ref={track}
        className="pf-track"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-disabled={disabled}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const tr = thumb.current!.getBoundingClientRect();
          const cy = tr.top + tr.height / 2;
          grab.current = Math.abs(e.clientY - cy) <= tr.height / 2 ? e.clientY - cy : 0;
          onChange(snap(at(e.clientY, grab.current)));
        }}
        onPointerMove={(e) => grab.current !== null && onChange(snap(at(e.clientY, grab.current)))}
        onPointerUp={() => (grab.current = null)}
        onPointerCancel={() => (grab.current = null)}
        onKeyDown={(e) => {
          if (disabled) return;
          const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          onChange(clamp(Math.round((value + d * (e.shiftKey ? 0.01 : 0.05)) * 100) / 100, 0, 1));
        }}
      >
        <div className="pf-rail">
          <div className="pf-fill" style={{ height: `${value * 100}%` }} />
        </div>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <i key={t} className={`pf-tick${t === 0.75 ? ' ref' : ''}`} style={{ bottom: `calc((100% - var(--pth)) * ${t} + var(--pth) / 2)` }} />
        ))}
        {ghost !== undefined && Math.abs(ghost - value) > 0.01 && (
          <i className="pf-ghost" style={{ bottom: `calc((100% - var(--pth)) * ${ghost} + var(--pth) / 2)` }} title="Nivel con expresión" />
        )}
        <div ref={thumb} className="pf-thumb" style={{ bottom: `calc((100% - var(--pth)) * ${value})` }}>
          <b />
        </div>
      </div>
    </div>
  );
}
