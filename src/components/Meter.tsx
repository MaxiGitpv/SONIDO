import { useEffect, useRef } from 'react';
import { meterBus, type Level } from '../meterEngine';
import { dbToPos } from '../util';

const stops = () => {
  const g = (db: number) => (dbToPos(db) * 100).toFixed(1);
  return `linear-gradient(to top, var(--sig) 0, var(--sig) ${g(-20)}%, var(--warn) ${g(-9)}%, var(--warn) ${g(-5)}%, var(--clip) ${g(-2)}%, var(--clip) 100%)`;
};
const GRADIENT = stops();

/** Medidor segmentado. Sin DEMO no recibe niveles y se queda vacío. */
export function Meter({ id, stereo }: { id: string; stereo?: boolean }) {
  const covers = useRef<(HTMLDivElement | null)[]>([]);
  const peaks = useRef<(HTMLDivElement | null)[]>([]);
  const clip = useRef<HTMLButtonElement>(null);
  const clipped = useRef(false);

  useEffect(() => {
    const paint = (lv: Level | undefined) => {
      const vals = lv ? [lv.l, lv.r] : [-90, -90];
      const pk = lv ? [lv.pl, lv.pr] : [-90, -90];
      (stereo ? [0, 1] : [0]).forEach((i) => {
        const c = covers.current[i];
        const p = peaks.current[i];
        if (c) c.style.height = `${(1 - dbToPos(vals[i])) * 100}%`;
        if (p) {
          p.style.bottom = `${dbToPos(pk[i]) * 100}%`;
          p.style.opacity = pk[i] > -80 ? '1' : '0';
        }
      });
      if (lv && Math.max(lv.l, lv.r) > -1) clipped.current = true;
      clip.current?.classList.toggle('on', clipped.current);
    };
    return meterBus.subscribe(id, paint);
  }, [id, stereo]);

  return (
    <div className={`meter${stereo ? ' stereo' : ''}`}>
      <button ref={clip} className="clip" aria-label="Borrar indicador de clip" onClick={() => {
        clipped.current = false;
        clip.current?.classList.remove('on');
      }} />
      <div className="meter-bars">
        {(stereo ? [0, 1] : [0]).map((i) => (
          <div key={i} className="bar" style={{ background: GRADIENT }}>
            <div ref={(el) => { covers.current[i] = el; }} className="cover" style={{ height: '100%' }} />
            <div ref={(el) => { peaks.current[i] = el; }} className="peak" />
            <div className="seg" />
          </div>
        ))}
      </div>
    </div>
  );
}
