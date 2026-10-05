import { useMemo, useState } from 'react';
import { useStore } from '../ctx';
import { Btn } from '../components/ui';
import type { Scene } from '../types';
import { fmtDb } from '../util';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function summary(s: Scene) {
  const open = s.data.channels.filter((c) => c.route.main && !c.mute.main && c.fader.main > -89.5).length;
  return { open, master: s.data.masters.main.level };
}

export function ScenesView() {
  const { state, dispatch } = useStore();
  const [name, setName] = useState('');
  const [armed, setArmed] = useState<string | null>(null);
  const active = state.scenes.find((s) => s.id === state.activeScene);
  const dirty = useMemo(() => !!active && JSON.stringify(active.data) !== JSON.stringify(state.snap), [active, state.snap]);

  return (
    <div className="page">
      <h2 className="page-h">Escenas <small>Una escena guarda niveles, mutes, solos, paneles, EQ, compresores, envíos, rutas, efectos y nombres.</small></h2>
      <div className="scene-grid">
        {state.scenes.map((s) => {
          const isActive = s.id === state.activeScene;
          const sm = summary(s);
          return (
            <article key={s.id} className={`scene${isActive ? ' active' : ''}`}>
              <header>
                <input className="name-input" aria-label="Nombre de la escena" value={s.name} maxLength={20}
                  onChange={(e) => dispatch({ type: 'renameScene', id: s.id, name: e.target.value })} />
                {isActive && <span className={`badge${dirty ? ' warn' : ''}`}>{dirty ? 'Con cambios' : 'Cargada'}</span>}
              </header>
              <dl>
                <div><dt>Guardada</dt><dd>{fmtDate(s.savedAt)}</dd></div>
                <div><dt>Canales abiertos en sala</dt><dd>{sm.open} de 12</dd></div>
                <div><dt>Master L-R</dt><dd>{fmtDb(sm.master)} dB</dd></div>
              </dl>
              <div className="scene-actions">
                <Btn kind="cyan" on={isActive && !dirty} onClick={() => dispatch({ type: 'loadScene', id: s.id })}>Cargar</Btn>
                <Btn
                  kind="plain"
                  className={armed === s.id ? 'armed' : ''}
                  onClick={() => {
                    if (armed === s.id) {
                      dispatch({ type: 'saveScene', id: s.id });
                      setArmed(null);
                    } else {
                      setArmed(s.id);
                      window.setTimeout(() => setArmed((a) => (a === s.id ? null : a)), 3500);
                    }
                  }}
                >
                  {armed === s.id ? 'Confirmar: sobrescribir' : 'Guardar aquí'}
                </Btn>
              </div>
            </article>
          );
        })}
        <form className="scene new" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { dispatch({ type: 'newScene', name }); setName(''); } }}>
          <h3>Nueva escena</h3>
          <p>Guarda el estado actual de la mezcla con otro nombre.</p>
          <input id="new-scene" className="name-input" placeholder="Ej.: Santa Cena" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} aria-label="Nombre de la nueva escena" />
          <Btn kind="cyan" disabled={!name.trim()} onClick={() => { dispatch({ type: 'newScene', name }); setName(''); }}>Guardar como nueva</Btn>
        </form>
      </div>
    </div>
  );
}
