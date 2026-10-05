import { useRef } from 'react';
import { clamp } from '../util';

interface Props {
  value: number;
  onChange: (v: number) => void;
  toPos: (v: number) => number;
  fromPos: (p: number) => number;
  label: string;
  bipolar?: boolean;
  disabled?: boolean;
  color?: string;
  snap?: (v: number) => number;
}

/** Control horizontal de 44 px de alto para envíos, panorama y niveles. */
export function HSlider({ value, onChange, toPos, fromPos, label, bipolar, disabled, color, snap }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const set = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    const v = fromPos(clamp((x - r.left - 7) / (r.width - 14), 0, 1));
    onChange(snap ? snap(v) : v);
  };
  const p = toPos(value);
  const fillStyle = bipolar
    ? { left: `${Math.min(p, 0.5) * 100}%`, width: `${Math.abs(p - 0.5) * 100}%` }
    : { left: 0, width: `${p * 100}%` };
  return (
    <div
      ref={ref}
      className={`hslider${disabled ? ' is-disabled' : ''}`}
      style={{ ['--ac' as string]: color }}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuenow={Math.round(value * 10) / 10}
      aria-disabled={disabled}
      onPointerDown={(e) => {
        if (disabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        active.current = true;
        set(e.clientX);
      }}
      onPointerMove={(e) => active.current && set(e.clientX)}
      onPointerUp={() => (active.current = false)}
      onPointerCancel={() => (active.current = false)}
      onKeyDown={(e) => {
        if (disabled) return;
        const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const v = fromPos(clamp(p + d * (e.shiftKey ? 0.01 : 0.03), 0, 1));
        onChange(snap ? snap(v) : v);
      }}
      onDoubleClick={() => !disabled && bipolar && onChange(0)}
    >
      <div className="hs-rail">
        <div className="hs-fill" style={fillStyle} />
        {bipolar && <i className="hs-center" />}
      </div>
      <div className="hs-thumb" style={{ left: `calc(7px + (100% - 14px) * ${p})` }} />
    </div>
  );
}
