import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { LiveCtx, Icon } from './ctx';
import type { LiveCtxValue } from './ctx';
import { liveInit, liveReducer } from './store';
import { KEY_SEMI, soundById } from './data';
import type { Tab } from './types';
import { engine } from './engine';
import { Repertoire, SoundBank } from './Left';
import { ChannelFx, LiveKeyboard, SceneBar, SongHeader, SoundLayers } from './Center';
import { StripRow } from './Strips';
import { RightPanel } from './Right';
import { Footer } from './Footer';
import { MidiView, MixerView, RoutesView, SoundsView } from './Views';
import { useMedia } from '../ctx';

const TABS: [Tab, string][] = [['live', 'En vivo'], ['sounds', 'Sonidos'], ['mixer', 'Mezcla'], ['routes', 'Rutas'], ['midi', 'MIDI']];
const PC_KEYS: Record<string, number> = { a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72 };

export function LiveApp({ onLegacy }: { onLegacy: (m: 'consola' | 'performance') => void }) {
  const [s, d] = useReducer(liveReducer, undefined, liveInit);
  const [audioOn, setAudioOn] = useState(false);
  const [held, setHeld] = useState<number[]>([]);
  const [gear, setGear] = useState(false);
  const rel = useRef(new Map<number, () => void>());
  const wide = useMedia('(min-width: 1280px)');
  const mix = s.mix[s.songId][s.sceneId];
  const song = s.songs.find((x) => x.id === s.songId)!;

  // Estado -> motor de audio
  useEffect(() => {
    engine.info = { bpm: song.bpm, key: KEY_SEMI[song.key] ?? 0, scene: s.sceneId, rhodes: mix.sound === 'rhodes', drawbars: s.fx.drawbars };
    engine.apply({ mix, fx: s.fx, master: s.master, masterMute: s.masterMute, clickMonitor: s.clickMonitor });
  }, [mix, s.fx, s.master, s.masterMute, s.clickMonitor, song.bpm, song.key, s.sceneId]);

  useEffect(() => {
    engine.onState = () => {
      d({ type: 'playing', on: engine.playing });
      setAudioOn(engine.ready);
    };
    return () => {
      engine.onState = null;
      engine.stop();
    };
  }, []);

  useEffect(() => {
    if (!s.toast) return;
    const t = window.setTimeout(() => d({ type: 'toast', text: '' }), 2800);
    return () => window.clearTimeout(t);
  }, [s.toast?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Notas: bajo el split suena la primera capa; desde el split, todas las capas.
  const ref = useRef({ s, mix });
  ref.current = { s, mix };
  const down = (n: number) => {
    if (rel.current.has(n)) return;
    const { s: st, mix: m } = ref.current;
    const layers = soundById(m.sound).layers.map((l) => l.ch);
    const ids = layers.length > 1 && n < st.split ? [layers[0]] : layers;
    rel.current.set(n, engine.noteOn(ids, n + st.transpose));
    setAudioOn(true);
    setHeld((h) => [...h, n]);
  };
  const up = (n: number) => {
    rel.current.get(n)?.();
    rel.current.delete(n);
    setHeld((h) => h.filter((x) => x !== n));
  };

  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
    };
    const kd = (e: KeyboardEvent) => {
      if (typing(e) || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const n = PC_KEYS[e.key.toLowerCase()];
      if (n !== undefined) down(n);
      else if (e.code === 'Space') {
        e.preventDefault();
        if (engine.playing) engine.pause();
        else engine.play();
      }
    };
    const ku = (e: KeyboardEvent) => {
      const n = PC_KEYS[e.key.toLowerCase()];
      if (n !== undefined) up(n);
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = useMemo<LiveCtxValue>(() => ({ s, d, mix, audioOn }), [s, mix, audioOn]);
  const sr = engine.sampleRate;
  const lat = engine.latencySamples;
  const left = (
    <div className="lcol">
      <Repertoire />
      <SoundBank />
    </div>
  );

  return (
    <LiveCtx.Provider value={ctx}>
      <div
        className={`live ${wide ? 'wide' : 'narrow'}`}
        onPointerDownCapture={() => {
          if (!audioOn) {
            engine.ensure();
            setAudioOn(true);
          }
        }}
      >
        <header className="lhead">
          {!wide && (
            <button className="iconbtn big" aria-label="Repertorio y banco de sonidos" onClick={() => d({ type: 'left', open: !s.leftOpen })}>
              <Icon name="menu" />
            </button>
          )}
          <div className="brand">
            <svg viewBox="0 0 28 28" width="30" height="30" aria-hidden="true">
              {[3, 8, 13, 18, 23].map((x, i) => <rect key={x} x={x} y={[11, 6, 3, 7, 12][i]} width="2.6" height={[8, 16, 22, 14, 6][i]} rx="1.3" />)}
            </svg>
            <div>
              <b>SONIDO</b>
              <small>LIVE WORKSPACE</small>
            </div>
          </div>
          <nav className="ltabs" aria-label="Secciones">
            {TABS.map(([id, label]) => (
              <button key={id} className={s.tab === id ? 'on' : ''} aria-current={s.tab === id ? 'page' : undefined} onClick={() => d({ type: 'tab', tab: id })}>
                {label}
              </button>
            ))}
          </nav>
          <div className="lstat">
            <span className="chip" title="Los instrumentos se sintetizan en el navegador; no son muestras de una librería ni hay hardware conectado">DEMO</span>
            <span className="chip">{audioOn && sr ? `${+(sr / 1000).toFixed(1)} kHz` : 'Audio en espera'}</span>
            {wide && <span className="chip">{audioOn && lat ? `${lat} samples` : 'Latencia auto'}</span>}
          </div>
          <div className="gearwrap">
            <button className="iconbtn big" aria-label="Ajustes" aria-expanded={gear} onClick={() => setGear((g) => !g)}>
              <Icon name="gear" size={22} />
            </button>
            {gear && (
              <div className="gearpop" role="menu">
                <p>Versiones anteriores del prototipo</p>
                <button role="menuitem" onClick={() => onLegacy('consola')}>Consola de 12 canales</button>
                <button role="menuitem" onClick={() => onLegacy('performance')}>Performance (tecladista)</button>
              </div>
            )}
          </div>
          <button className="savebtn" onClick={() => d({ type: 'save' })}>
            <Icon name="save" />
            Guardar escena
            {s.dirty && <i className="dirtydot" aria-label="Hay cambios sin guardar" />}
          </button>
        </header>

        <div className={`lbody tab-${s.tab}`}>
          {wide && left}
          {!wide && s.leftOpen && (
            <>
              <div className="lscrim" onClick={() => d({ type: 'left', open: false })} />
              <div className="ldrawer">{left}</div>
            </>
          )}

          {s.tab === 'live' ? (
            <>
              <main className="lcenter">
                <section className="lpanel songpanel">
                  <SongHeader />
                  <SceneBar />
                </section>
                <div className="midrow">
                  <section className="lpanel selsound">
                    <header className="ph">
                      <Icon name="layers" />
                      <h3>Sonido seleccionado</h3>
                    </header>
                    <SoundLayers />
                    <LiveKeyboard held={held} onDown={down} onUp={up} />
                  </section>
                  <ChannelFx />
                </div>
                <section className="lpanel stripspanel">
                  <StripRow />
                </section>
              </main>
              <RightPanel />
            </>
          ) : (
            <main className="lcenter wideview">
              {s.tab === 'sounds' && <SoundsView />}
              {s.tab === 'mixer' && <MixerView />}
              {s.tab === 'routes' && <RoutesView />}
              {s.tab === 'midi' && <MidiView />}
            </main>
          )}
        </div>
        <Footer />
        <div className="toast live-toast" role="status" aria-live="polite">{s.toast?.text}</div>
      </div>
    </LiveCtx.Provider>
  );
}
