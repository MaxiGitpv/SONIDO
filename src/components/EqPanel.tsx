import { useRef, useState } from 'react';
import type { Channel, EqBand } from '../types';
import { bandResponse } from '../dsp';
import { clamp, fmtHz } from '../util';
import { Knob } from './Knob';
import { Btn, Panel } from './ui';

const W = 360;
const H = 150;
const PAD = { l: 26, r: 8, t: 8, b: 16 };
const F0 = 20;
const F1 = 20000;
const GR = 15;
const BAND_NAMES = ['LF', 'LMF', 'HMF', 'HF'];
const BAND_COLORS = ['#3cc8dc', '#7fd6a4', '#e3b15b', '#a98bf2'];

const fx = (f: number) => PAD.l + (Math.log(f / F0) / Math.log(F1 / F0)) * (W - PAD.l - PAD.r);
const fy = (g: number) => PAD.t + (1 - (g + GR) / (2 * GR)) * (H - PAD.t - PAD.b);
const xf = (x: number) => F0 * Math.pow(F1 / F0, (x - PAD.l) / (W - PAD.l - PAD.r));
const yg = (y: number) => GR - ((y - PAD.t) / (H - PAD.t - PAD.b)) * 2 * GR;

export function EqPanel({ ch, edit }: { ch: Channel; edit: (fn: (c: Channel) => Channel) => void }) {
  const [sel, setSel] = useState(1);
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);

  const setBand = (i: number, p: Partial<EqBand>) =>
    edit((c) => ({ ...c, eq: c.eq.map((b, j) => (j === i ? { ...b, ...p } : b)) as Channel['eq'] }));

  const pointer = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    return { x, y };
  };
  const moveBand = (e: React.PointerEvent) => {
    const i = dragging.current;
    if (i === null) return;
    const { x, y } = pointer(e);
    const lo = [20, 60, 400, 1500][i];
    const hi = [800, 3000, 12000, 20000][i];
    setBand(i, { freq: Math.round(clamp(xf(x), lo, hi)), gain: Math.round(clamp(yg(y), -GR, GR) * 2) / 2 });
  };

  const pts: string[] = [];
  const N = 96;
  for (let k = 0; k <= N; k++) {
    const f = F0 * Math.pow(F1 / F0, k / N);
    pts.push(`${fx(f).toFixed(1)},${fy(clamp(bandResponse(ch, f), -GR, GR)).toFixed(1)}`);
  }
  const curve = `M${pts.join('L')}`;
  const area = `${curve}L${fx(F1)},${fy(0)}L${fx(F0)},${fy(0)}Z`;
  const b = ch.eq[sel];

  return (
    <Panel
      title="Ecualizador paramétrico"
      className="p-eq"
      right={<Btn kind="cyan" on={ch.eqOn} onClick={() => edit((c) => ({ ...c, eqOn: !c.eqOn }))}>EQ {ch.eqOn ? 'ON' : 'OFF'}</Btn>}
    >
      <svg ref={svg} className={`eq-graph${ch.eqOn ? '' : ' off'}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Curva de ecualización"
        onPointerMove={moveBand} onPointerUp={() => (dragging.current = null)} onPointerCancel={() => (dragging.current = null)}>
        {[100, 1000, 10000].map((f) => (
          <g key={f}>
            <line x1={fx(f)} x2={fx(f)} y1={PAD.t} y2={H - PAD.b} className="g-line" />
            <text x={fx(f)} y={H - 4} className="g-txt" textAnchor="middle">{f >= 1000 ? `${f / 1000}k` : f}</text>
          </g>
        ))}
        {[-12, -6, 0, 6, 12].map((g) => (
          <g key={g}>
            <line x1={PAD.l} x2={W - PAD.r} y1={fy(g)} y2={fy(g)} className={g === 0 ? 'g-zero' : 'g-line'} />
            <text x={PAD.l - 4} y={fy(g) + 3} className="g-txt" textAnchor="end">{g > 0 ? `+${g}` : g}</text>
          </g>
        ))}
        <path d={area} className="eq-area" />
        <path d={curve} className="eq-curve" />
        {ch.eq.map((band, i) => (
          <g
            key={i}
            className={`eq-node${sel === i ? ' sel' : ''}${band.on ? '' : ' off'}`}
            style={{ ['--bc' as string]: BAND_COLORS[i] }}
            onPointerDown={(e) => {
              e.stopPropagation();
              svg.current!.setPointerCapture(e.pointerId);
              dragging.current = i;
              setSel(i);
            }}
          >
            <circle cx={fx(band.freq)} cy={fy(clamp(band.gain, -GR, GR))} r="22" className="hit" />
            <circle cx={fx(band.freq)} cy={fy(clamp(band.gain, -GR, GR))} r="6.5" className="dot" />
            <text x={fx(band.freq)} y={fy(clamp(band.gain, -GR, GR)) + 3} textAnchor="middle" className="n">{i + 1}</text>
          </g>
        ))}
      </svg>
      <div className="eq-controls">
        <div className="eq-bands" role="group" aria-label="Banda (toque la banda activa para encenderla o apagarla)">
          {ch.eq.map((band, i) => (
            <button key={i} aria-pressed={sel === i} title={sel === i ? 'Encender o apagar la banda' : 'Elegir banda'}
              className={`band${sel === i ? ' sel' : ''}${band.on ? '' : ' off'}`}
              style={{ ['--bc' as string]: BAND_COLORS[i] }} onClick={() => (sel === i ? setBand(i, { on: !band.on }) : setSel(i))}>
              {BAND_NAMES[i]}
              <small>{band.on ? 'ON' : 'OFF'}</small>
            </button>
          ))}
        </div>
        <Knob label="Frec." value={b.freq} min={20} max={20000} log def={[100, 400, 2500, 9000][sel]} format={fmtHz} onChange={(v) => setBand(sel, { freq: Math.round(v) })} color={BAND_COLORS[sel]} />
        <Knob label="Gan." value={b.gain} min={-15} max={15} step={0.5} def={0} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} onChange={(v) => setBand(sel, { gain: v })} color={BAND_COLORS[sel]} />
        <Knob label="Q" value={b.q} min={0.3} max={8} log step={0.1} def={1} format={(v) => v.toFixed(1)} onChange={(v) => setBand(sel, { q: v })} color={BAND_COLORS[sel]} disabled={sel === 0 || sel === 3} />
      </div>
    </Panel>
  );
}
