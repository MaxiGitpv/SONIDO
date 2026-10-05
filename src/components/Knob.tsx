import { useEffect, useRef } from 'react';
import { clamp } from '../util';

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  def?: number;
  log?: boolean;
  step?: number;
  disabled?: boolean;
  color?: string;
}

const toNorm = (v: number, min: number, max: number, log?: boolean) =>
  log ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min);
const fromNorm = (n: number, min: number, max: number, log?: boolean) =>
  log ? min * Math.pow(max / min, n) : min + n * (max - min);

/** Potenciómetro rotativo: arrastre vertical, rueda, teclado y doble toque para restaurar. */
export function Knob({ label, value, min, max, onChange, format, def, log, step = 0, disabled, color }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; n: number } | null>(null);
  const latest = useRef({ value, onChange });
  latest.current = { value, onChange };

  const commit = (n: number) => {
    let v = fromNorm(clamp(n, 0, 1), min, max, log);
    if (step) v = Math.round(v / step) * step;
    onChange(clamp(v, min, max));
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const n = toNorm(latest.current.value, min, max, log) - Math.sign(e.deltaY) * 0.03;
      let v = fromNorm(clamp(n, 0, 1), min, max, log);
      if (step) v = Math.round(v / step) * step;
      latest.current.onChange(clamp(v, min, max));
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, [min, max, log, step]);

  const n = clamp(toNorm(value, min, max, log), 0, 1);
  const a0 = 135;
  const sweep = 270;
  const ang = a0 + n * sweep;
  const pt = (deg: number, r: number) => [22 + r * Math.cos((deg * Math.PI) / 180), 22 + r * Math.sin((deg * Math.PI) / 180)];
  const arc = (from: number, to: number, r: number) => {
    const [x0, y0] = pt(from, r);
    const [x1, y1] = pt(to, r);
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  };
  const [px, py] = pt(ang, 11);
  const [qx, qy] = pt(ang, 5);

  return (
    <div className={`knob${disabled ? ' is-disabled' : ''}`} style={{ ['--ac' as string]: color }}>
      <span className="knob-label">{label}</span>
      <div
        ref={ref}
        className="knob-dial"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { y: e.clientY, n };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const k = e.shiftKey ? 600 : 180;
          commit(drag.current.n + (drag.current.y - e.clientY) / k);
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onDoubleClick={() => def !== undefined && !disabled && onChange(def)}
        onKeyDown={(e) => {
          if (disabled) return;
          const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          commit(n + d * (e.shiftKey ? 0.01 : 0.04));
        }}
      >
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <path d={arc(a0, a0 + sweep, 18)} className="knob-track" />
          <path d={arc(a0, Math.max(a0 + 0.5, ang), 18)} className="knob-arc" />
          <circle cx="22" cy="22" r="13" className="knob-cap" />
          <line x1={qx} y1={qy} x2={px} y2={py} className="knob-ptr" />
        </svg>
      </div>
      <span className="knob-value">{format(value)}</span>
    </div>
  );
}
