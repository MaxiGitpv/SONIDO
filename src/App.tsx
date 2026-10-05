import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { StoreCtx } from './ctx';
import { initState, persistScenes, reducer } from './store';
import { startDemo } from './meterEngine';
import { NAV } from './types';
import { MixView } from './views/MixView';
import { ChannelsView } from './views/ChannelsView';
import { MonitorsView } from './views/MonitorsView';
import { FxView } from './views/FxView';
import { ScenesView } from './views/ScenesView';
import { RoutesView } from './views/RoutesView';
import { PerfApp } from './perf/PerfApp';

function Logo() {
  return (
    <div className="logo" aria-label="SONIDO">
      <svg viewBox="0 0 28 28" width="26" height="26" aria-hidden="true">
        <rect x="3" y="12" width="3" height="10" rx="1" />
        <rect x="9" y="6" width="3" height="16" rx="1" />
        <rect x="15" y="9" width="3" height="13" rx="1" />
        <rect x="21" y="3" width="3" height="19" rx="1" />
      </svg>
      <b>SONIDO</b>
    </div>
  );
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initState);
  const [mode, setMode] = useState<'consola' | 'performance'>('consola');
  const ref = useRef(state);
  ref.current = state;
  const ctx = useMemo(() => ({ state, dispatch }), [state]);

  useEffect(() => (state.demo ? startDemo(() => ref.current) : undefined), [state.demo]);
  useEffect(() => persistScenes(state.scenes), [state.scenes]);
  useEffect(() => {
    if (!state.toast) return;
    const t = window.setTimeout(() => dispatch({ type: 'toast', text: '' }), 2600);
    return () => window.clearTimeout(t);
  }, [state.toast?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = state.scenes.find((s) => s.id === state.activeScene);
  const dirty = !!active && JSON.stringify(active.data) !== JSON.stringify(state.snap);

  return (
    <StoreCtx.Provider value={ctx}>
      <div className="app">
        <header className="topbar">
          <Logo />
          <div className="modes" role="tablist" aria-label="Modo">
            <button role="tab" aria-selected={mode === 'consola'} className={`modebtn${mode === 'consola' ? ' on' : ''}`} onClick={() => setMode('consola')}>Consola</button>
            <button role="tab" aria-selected={mode === 'performance'} className={`modebtn${mode === 'performance' ? ' on' : ''}`} onClick={() => setMode('performance')}>Performance</button>
          </div>
          {mode === 'consola' ? (
            <>
              <nav className="nav" aria-label="Secciones">
                {NAV.map((n) => (
                  <button key={n.id} className={`navbtn${state.view === n.id ? ' on' : ''}`} aria-current={state.view === n.id ? 'page' : undefined} onClick={() => dispatch({ type: 'view', view: n.id })}>
                    {n.label}
                  </button>
                ))}
              </nav>
              <button className="scenechip" onClick={() => dispatch({ type: 'view', view: 'scenes' })} title="Ir a Escenas">
                <span>Escena</span>
                <b>{active?.name ?? '—'}</b>
                {dirty && <i className="dirty" aria-label="con cambios sin guardar" />}
              </button>
              <button className={`demo${state.demo ? ' on' : ''}`} role="switch" aria-checked={state.demo} onClick={() => dispatch({ type: 'demo', on: !state.demo })}>
                <span className="sw"><i /></span>
                <span className="demo-t"><b>DEMO</b><small>{state.demo ? 'niveles simulados' : 'medidores en reposo'}</small></span>
              </button>
            </>
          ) : (
            <span className="engine-chip">Motor de audio pendiente</span>
          )}
        </header>
        <main className="main">
          {mode === 'performance' && <PerfApp />}
          {mode === 'consola' && state.view === 'mix' && <MixView />}
          {mode === 'consola' && state.view === 'channels' && <ChannelsView />}
          {mode === 'consola' && state.view === 'monitors' && <MonitorsView />}
          {mode === 'consola' && state.view === 'fx' && <FxView />}
          {mode === 'consola' && state.view === 'scenes' && <ScenesView />}
          {mode === 'consola' && state.view === 'routes' && <RoutesView />}
        </main>
        <div className="toast" role="status" aria-live="polite">{state.toast?.text}</div>
      </div>
    </StoreCtx.Provider>
  );
}
