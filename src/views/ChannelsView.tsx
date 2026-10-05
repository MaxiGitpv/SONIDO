import { useStore, useChannelEdit } from '../ctx';
import { Knob } from '../components/Knob';
import { Btn } from '../components/ui';
import { fmtHz } from '../util';

export function ChannelsView() {
  const { state, dispatch } = useStore();
  const edit = useChannelEdit();
  return (
    <div className="page">
      <h2 className="page-h">Canales <small>Entradas, nombres y preparación de cada canal. Toque un número para abrirlo en la mezcla.</small></h2>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Canal</th><th>Nombre</th><th>Ganancia</th><th>Pasa altos</th><th>+48V</th><th>Fase Ø</th><th>EQ</th><th>Compresor</th>
            </tr>
          </thead>
          <tbody>
            {state.snap.channels.map((c, i) => (
              <tr key={c.id} className={c.id === state.selected ? 'sel' : ''}>
                <td>
                  <button className="chnum" style={{ ['--chc' as string]: `hsl(${c.hue} 55% 58%)` }}
                    onClick={() => { dispatch({ type: 'select', id: c.id }); dispatch({ type: 'view', view: 'mix' }); }}>
                    {String(i + 1).padStart(2, '0')}
                  </button>
                </td>
                <td>
                  <input className="name-input" aria-label={`Nombre del canal ${i + 1}`} value={c.name} maxLength={16}
                    onChange={(e) => edit(c.id, (x) => ({ ...x, name: e.target.value }))} />
                </td>
                <td className="kc"><Knob label="" value={c.gain} min={0} max={60} step={0.5} def={24} format={(v) => `${v.toFixed(1)} dB`} onChange={(v) => edit(c.id, (x) => ({ ...x, gain: v }))} /></td>
                <td className="kc">
                  <div className="inline">
                    <Btn kind="cyan" on={c.hpf.on} onClick={() => edit(c.id, (x) => ({ ...x, hpf: { ...x.hpf, on: !x.hpf.on } }))}>HPF</Btn>
                    <Knob label="" value={c.hpf.freq} min={20} max={400} log step={1} def={80} format={fmtHz} disabled={!c.hpf.on} onChange={(v) => edit(c.id, (x) => ({ ...x, hpf: { ...x.hpf, freq: Math.round(v) } }))} />
                  </div>
                </td>
                <td><Btn kind="cyan" on={c.phantom} onClick={() => edit(c.id, (x) => ({ ...x, phantom: !x.phantom }))}>+48V</Btn></td>
                <td><Btn kind="cyan" on={c.polarity} onClick={() => edit(c.id, (x) => ({ ...x, polarity: !x.polarity }))}>Ø</Btn></td>
                <td><Btn kind="cyan" on={c.eqOn} onClick={() => edit(c.id, (x) => ({ ...x, eqOn: !x.eqOn }))}>{c.eqOn ? 'ON' : 'OFF'}</Btn></td>
                <td><Btn kind="cyan" on={c.comp.on} onClick={() => edit(c.id, (x) => ({ ...x, comp: { ...x.comp, on: !x.comp.on } }))}>{c.comp.on ? 'ON' : 'OFF'}</Btn></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
