import type { Channel, MixId } from '../types';
import { MIXES, MONITOR_IDS } from '../types';
import { compOut } from '../dsp';
import { dbToPos, fmtDb, posToDb } from '../util';
import { EqPanel } from './EqPanel';
import { HSlider } from './HSlider';
import { Knob } from './Knob';
import { Btn, Panel } from './ui';
import { setPer } from '../ctx';

type Edit = (fn: (c: Channel) => Channel) => void;

function InputPanel({ ch, index, edit }: { ch: Channel; index: number; edit: Edit }) {
  return (
    <Panel title={<>Entrada <em>{String(index + 1).padStart(2, '0')}</em></>} className="p-in">
      <div className="in-grid">
        <Knob label="Gan." value={ch.gain} min={0} max={60} step={0.5} def={24} format={(v) => `${v.toFixed(0)} dB`} onChange={(v) => edit((c) => ({ ...c, gain: v }))} />
        <Knob label="HPF" value={ch.hpf.freq} min={20} max={400} log step={1} def={80} format={(v) => `${Math.round(v)} Hz`} disabled={!ch.hpf.on}
          onChange={(v) => edit((c) => ({ ...c, hpf: { ...c.hpf, freq: Math.round(v) } }))} />
        <Btn kind="cyan" on={ch.hpf.on} className="wide" onClick={() => edit((c) => ({ ...c, hpf: { ...c.hpf, on: !c.hpf.on } }))}>HPF {ch.hpf.on ? 'ON' : 'OFF'}</Btn>
        <Btn kind="cyan" on={ch.phantom} onClick={() => edit((c) => ({ ...c, phantom: !c.phantom }))}>+48V</Btn>
        <Btn kind="cyan" on={ch.polarity} onClick={() => edit((c) => ({ ...c, polarity: !c.polarity }))}>Ø</Btn>
      </div>
    </Panel>
  );
}

function CompPanel({ ch, edit }: { ch: Channel; edit: Edit }) {
  const c = ch.comp;
  const S = 120;
  const pt = (inDb: number) => {
    const x = ((inDb + 60) / 60) * S;
    const y = S - ((Math.max(-60, Math.min(0, compOut(c, inDb))) + 60) / 60) * S;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  const path = Array.from({ length: 61 }, (_, i) => pt(-60 + i)).join('L');
  const set = (p: Partial<Channel['comp']>) => edit((x) => ({ ...x, comp: { ...x.comp, ...p } }));
  return (
    <Panel title="Compresor" className="p-comp" right={<Btn kind="cyan" on={c.on} onClick={() => set({ on: !c.on })}>{c.on ? 'ON' : 'OFF'}</Btn>}>
      <div className="comp-grid">
        <svg viewBox={`-2 -2 ${S + 4} ${S + 4}`} className={`comp-curve${c.on ? '' : ' off'}`} role="img" aria-label="Curva del compresor">
          {[0.25, 0.5, 0.75].map((k) => (
            <g key={k}>
              <line x1={k * S} x2={k * S} y1="0" y2={S} className="g-line" />
              <line y1={k * S} y2={k * S} x1="0" x2={S} className="g-line" />
            </g>
          ))}
          <rect x="0" y="0" width={S} height={S} className="g-frame" />
          <line x1="0" y1={S} x2={S} y2="0" className="g-zero" />
          <line x1={((c.threshold + 60) / 60) * S} x2={((c.threshold + 60) / 60) * S} y1="0" y2={S} className="thr" />
          <path d={`M${path}`} className="eq-curve" />
        </svg>
        <Knob label="Umbral" value={c.threshold} min={-60} max={0} step={0.5} def={-20} format={(v) => `${v.toFixed(1)} dB`} onChange={(v) => set({ threshold: v })} disabled={!c.on} />
        <Knob label="Ratio" value={c.ratio} min={1} max={20} log step={0.1} def={3} format={(v) => (v >= 19.5 ? '∞:1' : `${v.toFixed(1)}:1`)} onChange={(v) => set({ ratio: v })} disabled={!c.on} />
        <Knob label="Ataque" value={c.attack} min={1} max={200} log step={1} def={15} format={(v) => `${Math.round(v)} ms`} onChange={(v) => set({ attack: v })} disabled={!c.on} />
        <Knob label="Relé" value={c.release} min={20} max={1000} log step={5} def={200} format={(v) => `${Math.round(v)} ms`} onChange={(v) => set({ release: v })} disabled={!c.on} />
        <Knob label="Ganancia" value={c.makeup} min={0} max={18} step={0.5} def={0} format={(v) => `${v.toFixed(1)} dB`} onChange={(v) => set({ makeup: v })} disabled={!c.on} />
      </div>
    </Panel>
  );
}

function SendsPanel({ ch, mix, edit }: { ch: Channel; mix: MixId; edit: Edit }) {
  const dbSlider = (label: string, value: number, onChange: (v: number) => void, color?: string, disabled?: boolean) => (
    <HSlider label={label} value={value} toPos={dbToPos} fromPos={posToDb} snap={(v) => (Math.abs(v) < 1.2 ? 0 : Math.round(v * 2) / 2)} onChange={onChange} color={color} disabled={disabled} />
  );
  return (
    <Panel title="Envíos auxiliares" className="p-send">
      <div className="sends">
        {MONITOR_IDS.map((m) => {
          const on = ch.route[m];
          return (
            <div key={m} className={`send${mix === m ? ' current' : ''}`}>
              <span className="send-l" style={{ color: MIXES[m].color }}>{MIXES[m].short}</span>
              {dbSlider(`Envío a ${MIXES[m].label}`, ch.fader[m], (v) => edit((c) => ({ ...c, fader: setPer(c.fader, m, v) })), MIXES[m].color, !on)}
              <span className="send-v">{on ? fmtDb(ch.fader[m]) : '—'}</span>
            </div>
          );
        })}
        <div className="send fxs">
          <span className="send-l">Reverb</span>
          {dbSlider('Envío a reverb', ch.fx.rev, (v) => edit((c) => ({ ...c, fx: { ...c.fx, rev: v } })))}
          <span className="send-v">{fmtDb(ch.fx.rev)}</span>
        </div>
        <div className="send fxs">
          <span className="send-l">Delay</span>
          {dbSlider('Envío a delay', ch.fx.dly, (v) => edit((c) => ({ ...c, fx: { ...c.fx, dly: v } })))}
          <span className="send-v">{fmtDb(ch.fx.dly)}</span>
        </div>
      </div>
    </Panel>
  );
}

export function DetailPanel({ ch, index, mix, edit }: { ch: Channel; index: number; mix: MixId; edit: Edit }) {
  return (
    <div className="detail">
      <InputPanel ch={ch} index={index} edit={edit} />
      <EqPanel ch={ch} edit={edit} />
      <CompPanel ch={ch} edit={edit} />
      <SendsPanel ch={ch} mix={mix} edit={edit} />
    </div>
  );
}
