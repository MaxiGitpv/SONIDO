import { useStore, useChannelEdit, setPer } from '../ctx';
import { MIXES, MIX_IDS } from '../types';

export function RoutesView() {
  const { state } = useStore();
  const edit = useChannelEdit();
  return (
    <div className="page">
      <h2 className="page-h">Rutas <small>A qué mezcla envía cada canal. El click no puede enviarse a la mezcla principal.</small></h2>
      <div className="table-wrap">
        <table className="tbl routes">
          <thead>
            <tr>
              <th>Canal</th>
              {MIX_IDS.map((m) => (
                <th key={m} style={{ ['--mix' as string]: MIXES[m].color }} className="mixcol">
                  <i /> {MIXES[m].label}<small>{MIXES[m].sub}</small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.snap.channels.map((c, i) => (
              <tr key={c.id}>
                <td className="rname"><span className="chnum static" style={{ ['--chc' as string]: `hsl(${c.hue} 55% 58%)` }}>{String(i + 1).padStart(2, '0')}</span> {c.name}</td>
                {MIX_IDS.map((m) => {
                  const locked = c.id === 'click' && m === 'main';
                  return (
                    <td key={m} style={{ ['--mix' as string]: MIXES[m].color }}>
                      <button
                        className={`cell${c.route[m] ? ' on' : ''}`}
                        disabled={locked}
                        aria-pressed={c.route[m]}
                        aria-label={`${c.name} a ${MIXES[m].label}${locked ? ' (bloqueado)' : ''}`}
                        onClick={() => edit(c.id, (x) => ({ ...x, route: setPer(x.route, m, !x.route[m]) }))}
                      >
                        {locked ? 'Bloqueado' : c.route[m] ? 'Enviado' : '—'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
