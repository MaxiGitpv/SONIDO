import { useRef } from 'react';
import { usePerf } from './ctx';
import { INST_META, noteName } from './data';
import { INSTS, NOTE_HI, NOTE_LO } from './types';
import type { EditTab } from './types';
import { Knob } from '../components/Knob';
import { Keyboard } from './Keyboard';
import { clamp } from '../util';

const TABS: { id: EditTab; label: string }[] = [
  { id: 'ranges', label: 'Rangos y transposición' },
  { id: 'velocity', label: 'Velocidad' },
  { id: 'fx', label: 'Efectos' },
  { id: 'midi', label: 'Asignaciones MIDI' },
];

function Stepper({ value, min, max, onChange, format, label }: { value: number; min: number; max: number; onChange: (v: number) => void; format?: (v: number) => string; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button aria-label={`${label}: menos`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
      <output>{format ? format(value) : value}</output>
      <button aria-label={`${label}: más`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
    </div>
  );
}

/** Barra con dos manijas para fijar el rango de un instrumento sobre C2–C7. */
function RangeBar({ lo, hi, color, onChange, label }: { lo: number; hi: number; color: string; onChange: (lo: number, hi: number) => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<'lo' | 'hi' | null>(null);
  const span = NOTE_HI - NOTE_LO;
  const noteAt = (x: number) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.round(NOTE_LO + clamp((x - r.left) / r.width, 0, 1) * span);
  };
  const apply = (x: number) => {
    const n = noteAt(x);
    if (drag.current === 'lo') onChange(Math.min(n, hi - 1), hi);
    else if (drag.current === 'hi') onChange(lo, Math.max(n, lo + 1));
  };
  const pos = (n: number) => `${((n - NOTE_LO) / span) * 100}%`;
  return (
    <div
      ref={ref}
      className="rbar"
      style={{ ['--ic' as string]: color }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const n = noteAt(e.clientX);
        drag.current = Math.abs(n - lo) <= Math.abs(n - hi) ? 'lo' : 'hi';
        apply(e.clientX);
      }}
      onPointerMove={(e) => drag.current && apply(e.clientX)}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <div className="rbar-rail" />
      <div className="rbar-fill" style={{ left: pos(lo), width: `${((hi - lo) / span) * 100}%` }} />
      <div className="rbar-h" role="slider" tabIndex={0} aria-label={`${label}: nota inicial`} aria-valuetext={noteName(lo)} style={{ left: pos(lo) }}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft') onChange(Math.max(NOTE_LO, lo - 1), hi); if (e.key === 'ArrowRight') onChange(Math.min(hi - 1, lo + 1), hi); }} />
      <div className="rbar-h" role="slider" tabIndex={0} aria-label={`${label}: nota final`} aria-valuetext={noteName(hi)} style={{ left: pos(hi) }}
        onKeyDown={(e) => { if (e.key === 'ArrowLeft') onChange(lo, Math.max(lo + 1, hi - 1)); if (e.key === 'ArrowRight') onChange(lo, Math.min(NOTE_HI, hi + 1)); }} />
    </div>
  );
}

function RangesTab() {
  const { s, d, view } = usePerf();
  return (
    <div className="ed-ranges">
      <Keyboard setup={s.inst} mix={view} held={s.held} compact />
      <div className="ed-rows">
        {INSTS.map((i) => {
          const st = s.inst[i];
          return (
            <div key={i} className="ed-row" style={{ ['--ic' as string]: INST_META[i].color }}>
              <span className="ed-name"><i /> {INST_META[i].label}</span>
              <RangeBar lo={st.lo} hi={st.hi} color={INST_META[i].color} label={`Rango de ${INST_META[i].label}`} onChange={(lo, hi) => d({ type: 'inst', inst: i, patch: { lo, hi } })} />
              <span className="ed-range">{noteName(st.lo)} – {noteName(st.hi)}</span>
              <Stepper label={`Transposición de ${INST_META[i].label}`} value={st.transpose} min={-12} max={12} format={(v) => `${v > 0 ? '+' : ''}${v} st`} onChange={(v) => d({ type: 'inst', inst: i, patch: { transpose: v } })} />
            </div>
          );
        })}
      </div>
      <p className="hint">Arrastre las manijas para fijar el rango. La transposición se mide en semitonos (st).</p>
    </div>
  );
}

function CurveGraph({ gamma, color }: { gamma: number; color: string }) {
  const S = 100;
  const pts = Array.from({ length: 33 }, (_, k) => {
    const x = k / 32;
    return `${(x * S).toFixed(1)},${(S - Math.pow(x, gamma) * S).toFixed(1)}`;
  }).join('L');
  return (
    <svg viewBox="-4 -4 108 108" className="curve" role="img" aria-label="Curva de velocidad">
      <rect x="0" y="0" width={S} height={S} className="g-frame" />
      {[0.25, 0.5, 0.75].map((k) => (
        <g key={k}>
          <line x1={k * S} x2={k * S} y1="0" y2={S} className="g-line" />
          <line y1={k * S} y2={k * S} x1="0" x2={S} className="g-line" />
        </g>
      ))}
      <line x1="0" y1={S} x2={S} y2="0" className="g-zero" />
      <path d={`M${pts}`} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" />
    </svg>
  );
}

function VelocityTab() {
  const { s, d } = usePerf();
  const presets: [string, number][] = [['Suave', 0.65], ['Lineal', 1], ['Dura', 1.5]];
  return (
    <div className="ed-vel">
      {INSTS.map((i) => {
        const g = s.inst[i].gamma;
        return (
          <div key={i} className="vel-card" style={{ ['--ic' as string]: INST_META[i].color }}>
            <h4><i /> {INST_META[i].label}</h4>
            <div className="vel-body">
              <CurveGraph gamma={g} color={INST_META[i].color} />
              <div className="vel-ctl">
                <div className="pseg" role="group" aria-label={`Curva de ${INST_META[i].label}`}>
                  {presets.map(([n, v]) => (
                    <button key={n} className={Math.abs(g - v) < 0.03 ? 'on' : ''} onClick={() => d({ type: 'inst', inst: i, patch: { gamma: v } })}>{n}</button>
                  ))}
                </div>
                <Knob label="Curvatura" value={g} min={0.4} max={2} step={0.05} def={1} format={(v) => v.toFixed(2)} onChange={(v) => d({ type: 'inst', inst: i, patch: { gamma: v } })} color={INST_META[i].color} />
              </div>
            </div>
            <small>Eje horizontal: fuerza al tocar. Eje vertical: fuerza enviada al sonido.</small>
          </div>
        );
      })}
    </div>
  );
}

const DRAWBAR_NAMES = ['16′', '5⅓′', '8′', '4′', '2⅔′', '2′', '1⅗′', '1⅓′', '1′'];
const DRAWBAR_COLORS = ['#7a4a2b', '#7a4a2b', '#efe6d0', '#efe6d0', '#2b2b30', '#efe6d0', '#2b2b30', '#2b2b30', '#efe6d0'];

function Drawbar({ index, value }: { index: number; value: number }) {
  const { d } = usePerf();
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef(false);
  const set = (y: number) => {
    const r = ref.current!.getBoundingClientRect();
    d({ type: 'drawbar', index, value: Math.round(clamp((y - r.top) / r.height, 0, 1) * 8) });
  };
  return (
    <div className="db">
      <div
        ref={ref}
        className="db-track"
        role="slider"
        tabIndex={0}
        aria-label={`Drawbar ${DRAWBAR_NAMES[index]}`}
        aria-valuemin={0}
        aria-valuemax={8}
        aria-valuenow={value}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); active.current = true; set(e.clientY); }}
        onPointerMove={(e) => active.current && set(e.clientY)}
        onPointerUp={() => (active.current = false)}
        onKeyDown={(e) => { if (e.key === 'ArrowUp') d({ type: 'drawbar', index, value: Math.max(0, value - 1) }); if (e.key === 'ArrowDown') d({ type: 'drawbar', index, value: Math.min(8, value + 1) }); }}
      >
        <i className="db-bar" style={{ top: `${(value / 8) * 100}%`, background: DRAWBAR_COLORS[index] }} />
      </div>
      <b>{value}</b>
      <small>{DRAWBAR_NAMES[index]}</small>
    </div>
  );
}

function FxTab() {
  const { s, d } = usePerf();
  const fx = s.fx;
  const k = (label: string, key: keyof typeof fx, min: number, max: number, fmt: (v: number) => string, step = 0.01) => (
    <Knob label={label} value={fx[key] as number} min={min} max={max} step={step} format={fmt} def={(min + max) / 2} onChange={(v) => d({ type: 'fx', patch: { [key]: v } })} color="#9db4ff" />
  );
  return (
    <div className="ed-fx">
      <section className="fxcard">
        <h4>Reverb</h4>
        <div className="fxk">
          {k('Tamaño', 'reverbSize', 0, 1, (v) => `${Math.round(v * 100)}`)}
          {k('Mezcla', 'reverbMix', 0, 1, (v) => `${Math.round(v * 100)} %`)}
          {k('Pre-delay', 'reverbPre', 0, 120, (v) => `${Math.round(v)} ms`, 1)}
        </div>
      </section>
      <section className="fxcard">
        <h4>Chorus <small>Velvet Rhodes</small></h4>
        <div className="fxk">
          {k('Velocidad', 'chorusRate', 0.1, 3, (v) => `${v.toFixed(1)} Hz`, 0.1)}
          {k('Profundidad', 'chorusDepth', 0, 1, (v) => `${Math.round(v * 100)} %`)}
        </div>
      </section>
      <section className="fxcard">
        <h4>Tremolo <small>Velvet Rhodes</small></h4>
        <div className="fxk">
          {k('Velocidad', 'tremRate', 0.5, 10, (v) => `${v.toFixed(1)} Hz`, 0.1)}
          {k('Profundidad', 'tremDepth', 0, 1, (v) => `${Math.round(v * 100)} %`)}
        </div>
      </section>
      <section className="fxcard wide">
        <h4>Gospel Organ <small>Rotary y drawbars</small></h4>
        <div className="organ">
          <div className="pseg big" role="group" aria-label="Rotary">
            {(['stop', 'slow', 'fast'] as const).map((r) => (
              <button key={r} className={fx.rotary === r ? 'on' : ''} aria-pressed={fx.rotary === r} onClick={() => d({ type: 'fx', patch: { rotary: r } })}>
                {r === 'stop' ? 'Parado' : r === 'slow' ? 'Lento' : 'Rápido'}
              </button>
            ))}
          </div>
          <div className="drawbars" role="group" aria-label="Drawbars">
            {fx.drawbars.map((v, i) => <Drawbar key={i} index={i} value={v} />)}
          </div>
        </div>
      </section>
    </div>
  );
}

function MidiTab() {
  const { s, d } = usePerf();
  return (
    <div className="ed-midi">
      <p className="hint">Asignaciones guardadas para cuando exista el motor de audio. No hay ningún teclado ni interfaz conectados.</p>
      <div className="midi-grid">
        {s.midi.map((m) => (
          <div key={m.id} className="midi-row">
            <span>{m.label}</span>
            <Stepper label={`CC de ${m.label}`} value={m.cc} min={0} max={127} format={(v) => `CC ${v}`} onChange={(v) => d({ type: 'midi', id: m.id, patch: { cc: v } })} />
            <Stepper label={`Canal de ${m.label}`} value={m.ch} min={1} max={16} format={(v) => `Canal ${v}`} onChange={(v) => d({ type: 'midi', id: m.id, patch: { ch: v } })} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function EditView({ drawer }: { drawer?: boolean }) {
  const { s, d } = usePerf();
  return (
    <section className={`editv${drawer ? ' drawer' : ''}`} aria-label="Edición">
      <header>
        <h2>Edición</h2>
        <div className="pseg tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={s.editTab === t.id} className={s.editTab === t.id ? 'on' : ''} onClick={() => d({ type: 'editTab', tab: t.id })}>{t.label}</button>
          ))}
        </div>
        <button className="tbtn" onClick={() => d({ type: 'edit', on: false })}>Cerrar</button>
      </header>
      <div className="editv-body">
        {s.editTab === 'ranges' && <RangesTab />}
        {s.editTab === 'velocity' && <VelocityTab />}
        {s.editTab === 'fx' && <FxTab />}
        {s.editTab === 'midi' && <MidiTab />}
      </div>
    </section>
  );
}
