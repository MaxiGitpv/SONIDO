import { useStore, useChannelEdit } from '../ctx';
import { HSlider } from '../components/HSlider';
import { Knob } from '../components/Knob';
import { Btn, Panel } from '../components/ui';
import type { FxState } from '../types';
import { dbToPos, fmtDb, fmtHz, posToDb } from '../util';

export function FxView() {
  const { state, dispatch } = useStore();
  const edit = useChannelEdit();
  const fx = state.snap.fx;
  const set = (fn: (f: FxState) => FxState) => dispatch({ type: 'fx', fn });
  const rev = fx.rev;
  const dly = fx.dly;
  return (
    <div className="page">
      <h2 className="page-h">Efectos <small>Dos procesadores de envío. El retorno va a la mezcla principal.</small></h2>
      <div className="fx-grid">
        <Panel title="Reverb · Hall" right={<Btn kind="cyan" on={rev.on} onClick={() => set((f) => ({ ...f, rev: { ...f.rev, on: !f.rev.on } }))}>{rev.on ? 'ON' : 'OFF'}</Btn>}>
          <div className="fx-knobs">
            <Knob label="Tiempo" value={rev.time} min={0.3} max={6} log step={0.1} def={1.8} format={(v) => `${v.toFixed(1)} s`} onChange={(v) => set((f) => ({ ...f, rev: { ...f.rev, time: v } }))} />
            <Knob label="Pre-delay" value={rev.preDelay} min={0} max={200} step={1} def={30} format={(v) => `${Math.round(v)} ms`} onChange={(v) => set((f) => ({ ...f, rev: { ...f.rev, preDelay: v } }))} />
            <Knob label="Amortig." value={rev.damp} min={2000} max={16000} log step={100} def={7500} format={fmtHz} onChange={(v) => set((f) => ({ ...f, rev: { ...f.rev, damp: v } }))} />
            <Knob label="Retorno" value={rev.ret} min={-60} max={6} step={0.5} def={-12} format={(v) => `${fmtDb(v)} dB`} onChange={(v) => set((f) => ({ ...f, rev: { ...f.rev, ret: v } }))} />
          </div>
          {sends('rev')}
        </Panel>
        <Panel title="Delay · Negra al tempo" right={<Btn kind="cyan" on={dly.on} onClick={() => set((f) => ({ ...f, dly: { ...f.dly, on: !f.dly.on } }))}>{dly.on ? 'ON' : 'OFF'}</Btn>}>
          <div className="fx-knobs">
            <Knob label="Tiempo" value={dly.time} min={60} max={1000} log step={1} def={416} format={(v) => `${Math.round(v)} ms`} onChange={(v) => set((f) => ({ ...f, dly: { ...f.dly, time: v } }))} />
            <Knob label="Repeticiones" value={dly.feedback} min={0} max={90} step={1} def={28} format={(v) => `${Math.round(v)} %`} onChange={(v) => set((f) => ({ ...f, dly: { ...f.dly, feedback: v } }))} />
            <Knob label="Tono" value={dly.tone} min={1000} max={12000} log step={100} def={4500} format={fmtHz} onChange={(v) => set((f) => ({ ...f, dly: { ...f.dly, tone: v } }))} />
            <Knob label="Retorno" value={dly.ret} min={-60} max={6} step={0.5} def={-16} format={(v) => `${fmtDb(v)} dB`} onChange={(v) => set((f) => ({ ...f, dly: { ...f.dly, ret: v } }))} />
          </div>
          {sends('dly')}
        </Panel>
      </div>
    </div>
  );

  function sends(which: 'rev' | 'dly') {
    return (
      <ul className="fx-sends">
        {state.snap.channels.map((c) => (
          <li key={c.id}>
            <span className="n">{c.name}</span>
            <HSlider label={`${c.name} a ${which === 'rev' ? 'reverb' : 'delay'}`} value={c.fx[which]} toPos={dbToPos} fromPos={posToDb} snap={(v) => Math.round(v * 2) / 2}
              onChange={(v) => edit(c.id, (x) => ({ ...x, fx: { ...x.fx, [which]: v } }))} />
            <b>{fmtDb(c.fx[which])}</b>
          </li>
        ))}
      </ul>
    );
  }
}
