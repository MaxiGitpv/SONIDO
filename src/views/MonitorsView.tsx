import { useStore, useChannelEdit, setPer } from '../ctx';
import { MIXES, MONITOR_IDS } from '../types';
import { HSlider } from '../components/HSlider';
import { Btn } from '../components/ui';
import { dbToPos, fmtDb, posToDb } from '../util';

export function MonitorsView() {
  const { state, dispatch } = useStore();
  const edit = useChannelEdit();
  const snap = state.snap;
  return (
    <div className="page">
      <h2 className="page-h">Monitores <small>Nivel de cada canal en cada mezcla de monitor. El click solo existe aquí.</small></h2>
      <div className="mon-grid">
        {MONITOR_IDS.map((m) => {
          const info = MIXES[m];
          const M = snap.masters[m];
          return (
            <section key={m} className="mon-card" style={{ ['--mix' as string]: info.color }}>
              <header>
                <div><h3>{info.label}</h3><span>{info.sub}</span></div>
                <Btn kind="cyan" onClick={() => { dispatch({ type: 'mix', mix: m }); dispatch({ type: 'view', view: 'mix' }); }}>Editar en consola</Btn>
              </header>
              <div className="mon-master">
                <span>Master</span>
                <HSlider label={`Master ${info.label}`} value={M.level} toPos={dbToPos} fromPos={posToDb} color={info.color} snap={(v) => (Math.abs(v) < 1.2 ? 0 : Math.round(v * 2) / 2)}
                  onChange={(v) => dispatch({ type: 'master', mix: m, patch: { level: v } })} />
                <b>{fmtDb(M.level)}</b>
                <Btn kind="mute" on={M.mute} onClick={() => dispatch({ type: 'master', mix: m, patch: { mute: !M.mute } })}>M</Btn>
              </div>
              <ul>
                {snap.channels.map((c) => (
                  <li key={c.id} className={c.route[m] ? '' : 'dim'}>
                    <span className="n">{c.name}</span>
                    <HSlider label={`${c.name} en ${info.label}`} value={c.fader[m]} toPos={dbToPos} fromPos={posToDb} color={info.color} disabled={!c.route[m]}
                      snap={(v) => (Math.abs(v) < 1.2 ? 0 : Math.round(v * 2) / 2)}
                      onChange={(v) => edit(c.id, (x) => ({ ...x, fader: setPer(x.fader, m, v) }))} />
                    <b>{c.route[m] ? fmtDb(c.fader[m]) : '—'}</b>
                    <Btn kind="mute" on={c.mute[m]} disabled={!c.route[m]} onClick={() => edit(c.id, (x) => ({ ...x, mute: setPer(x.mute, m, !x.mute[m]) }))}>M</Btn>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
