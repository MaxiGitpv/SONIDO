import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { LiveCtx, Icon } from './ctx';
import type { LiveCtxValue } from './ctx';
import { liveInit, liveReducer } from './store';
import { CH_META, KEY_SEMI } from './data';
import type { ChId, InId, InputCfg, SceneId, Tab } from './types';
import { IN_IDS } from './types';
import { engine } from './engine';
import { Repertoire, SoundBank } from './Left';
import { ChannelFx, PlayPanel, SceneBar, SongHeader } from './Center';
import { Expand } from './nav';
import { ChannelPage, FxPage, InputsPage, PlayPage, ScenesPage } from './Pages';
import { StripRow } from './Strips';
import { RightPanel } from './Right';
import { Footer } from './Footer';
import { MidiView, MixerView, RoutesView, SoundsView } from './Views';
import { useMedia } from '../ctx';

const TABS: [Tab, string, string][] = [
  ['live', 'Inicio', 'master'], ['scenes', 'Escenas', 'list'], ['play', 'Tocar', 'keys'], ['sounds', 'Sonidos', 'layers'], ['mixer', 'Mezcla', 'sliders'],
  ['channel', 'Canal', 'expand'], ['fx', 'Efectos', 'pad'], ['inputs', 'Entradas', 'voz'], ['routes', 'Rutas', 'next'], ['midi', 'MIDI', 'keys'],
];
const PC_KEYS: Record<string, number> = { a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74 };

export function LiveApp({ onLegacy }: { onLegacy: (m: 'consola' | 'performance') => void }) {
  const [s, d] = useReducer(liveReducer, undefined, liveInit);
  const [audioOn, setAudioOn] = useState(false);
  const [held, setHeld] = useState<number[]>([]);
  const [gear, setGear] = useState(false);
  const rel = useRef(new Map<number, () => void>());
  const sustained = useRef<(() => void)[]>([]);
  const wide = useMedia('(min-width: 1280px)');
  const mix = s.mix[s.songId][s.sceneId];
  const song = s.songs.find((x) => x.id === s.songId)!;
  const ref = useRef({ s, mix, song });
  ref.current = { s, mix, song };

  // Estado -> motor de audio
  useEffect(() => {
    engine.info = { bpm: song.bpm, key: KEY_SEMI[song.key] ?? 0, rhodes: mix.sound === 'rhodes', drawbars: s.fx.drawbars, style: song.style, arr: song.arr, mode: s.playMode, end: song.end, src: s.src };
    engine.apply({ mix, fx: s.fx, master: s.master, masterMute: s.masterMute, clickMonitor: s.clickMonitor });
  }, [mix, s.fx, s.master, s.masterMute, s.clickMonitor, song, s.playMode, s.src]);
  useEffect(() => engine.syncSources(), [s.src]);

  // Entradas físicas: se reconectan solo las que cambiaron.
  const lastIn = useRef<Partial<Record<InId, string>>>({});
  useEffect(() => {
    for (const id of IN_IDS) {
      const cfg: InputCfg = s.inputs[id];
      const key = JSON.stringify([cfg.device, cfg.side, cfg.trim, cfg.polarity]);
      if (lastIn.current[id] === key) continue;
      lastIn.current[id] = key;
      engine.setInput(id, cfg).catch((e: unknown) => {
        const name = e instanceof Error ? e.name : '';
        d({ type: 'toast', text: name === 'NotAllowedError' ? 'El navegador no dio permiso para esa entrada de audio' : `No se pudo abrir la entrada de ${cfg.name}` });
      });
    }
  }, [s.inputs]);

  // Al cambiar de canción detenida, el cabezal vuelve al inicio de su arreglo.
  useEffect(() => {
    if (!engine.playing) {
      const i = song.arr.findIndex((x) => x.scene === ref.current.s.sceneId);
      engine.setSection(Math.max(0, i));
    }
  }, [s.songId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    engine.onState = () => {
      d({ type: 'playing', on: engine.playing });
      setAudioOn(engine.ready);
    };
    engine.onSection = (sec) => {
      const sc = ref.current.song.arr[sec]?.scene;
      if (sc && sc !== ref.current.s.sceneId) d({ type: 'scene', id: sc });
    };
    engine.onEnd = (a) => {
      if (a === 'next') d({ type: 'songStep', dir: 1 });
      if (a === 'stop') d({ type: 'scene', id: ref.current.song.arr[0]?.scene ?? 'intro' });
    };
    return () => {
      engine.onState = engine.onSection = engine.onEnd = null;
      engine.stop();
    };
  }, []);

  useEffect(() => {
    if (!s.toast) return;
    const t = window.setTimeout(() => d({ type: 'toast', text: '' }), 2800);
    return () => window.clearTimeout(t);
  }, [s.toast?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const goScene = useCallback((scene: SceneId) => {
    const arr = ref.current.song.arr;
    const i = arr.findIndex((x) => x.scene === scene);
    if (engine.playing && i >= 0) {
      engine.setSection(i);
      d({ type: 'toast', text: `${scene[0].toUpperCase() + scene.slice(1)} entra en el próximo compás` });
    } else {
      d({ type: 'scene', id: scene });
      if (i >= 0) engine.setSection(i);
    }
  }, []);

  const loadFile = useCallback(async (ch: ChId, file: File) => {
    try {
      const dur = await engine.loadFile(ch, file);
      d({ type: 'file', ch, name: file.name });
      if (ch === 'pad' || ch === 'drums') d({ type: 'src', ch, mode: 'file' });
      d({ type: 'ch', id: ch, fn: (c) => ({ ...c, mute: false }) });
      d({ type: 'toast', text: `«${file.name}» (${Math.round(dur)} s) cargado en ${CH_META[ch].name}` });
    } catch {
      d({ type: 'toast', text: 'No se pudo leer ese archivo. Pruebe con MP3, WAV, M4A u OGG.' });
    }
  }, []);

  // Notas: cada capa suena en su zona (todo, izquierda o derecha del split).
  const down = useCallback((n: number) => {
    if (rel.current.has(n)) return;
    const { s: st, mix: m } = ref.current;
    const ids = m.layers.filter((l) => l.zone === 'all' || (l.zone === 'low' ? n < st.split : n >= st.split)).map((l) => l.ch);
    rel.current.set(n, engine.noteOn(ids.length ? ids : [m.layers[0].ch], n + st.transpose));
    setAudioOn(true);
    setHeld((h) => [...h, n]);
  }, []);
  const up = useCallback((n: number) => {
    const r = rel.current.get(n);
    if (r) {
      if (ref.current.s.sustain) sustained.current.push(r);
      else r();
    }
    rel.current.delete(n);
    setHeld((h) => h.filter((x) => x !== n));
  }, []);
  useEffect(() => {
    if (s.sustain) return;
    sustained.current.forEach((r) => r());
    sustained.current = [];
  }, [s.sustain]);

  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
    };
    const key = (e: KeyboardEvent) => PC_KEYS[e.key.toLowerCase()];
    const kd = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Shift') return !e.repeat && d({ type: 'sustain', on: true });
      if (e.repeat) return;
      const n = key(e);
      const oct = ref.current.s.octave;
      if (n !== undefined) down(n + oct * 12);
      else if (e.key === 'z' || e.key === 'Z') d({ type: 'octave', value: Math.max(-2, oct - 1) });
      else if (e.key === 'x' || e.key === 'X') d({ type: 'octave', value: Math.min(2, oct + 1) });
      else if (e.code === 'Space') {
        e.preventDefault();
        if (engine.playing) engine.pause();
        else engine.play();
      }
    };
    const ku = (e: KeyboardEvent) => {
      if (e.key === 'Shift') return d({ type: 'sustain', on: false });
      const n = key(e);
      if (n === undefined) return;
      for (let o = -2; o <= 2; o++) if (rel.current.has(n + o * 12)) up(n + o * 12);
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [down, up]);

  const ctx = useMemo<LiveCtxValue>(() => ({ s, d, mix, audioOn, loadFile, goScene }), [s, mix, audioOn, loadFile, goScene]);
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
            {TABS.map(([id, label, icon]) => (
              <button key={id} className={s.tab === id ? 'on' : ''} aria-current={s.tab === id ? 'page' : undefined} onClick={() => d({ type: 'tab', tab: id })}>
                <Icon name={icon} size={15} />
                <span>{label}</span>
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
          {wide && s.tab === 'live' && left}
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
                  <div className="songpanel-x"><Expand tab="scenes" label="Escenas y repertorio" /></div>
                  <SongHeader />
                  <SceneBar />
                </section>
                <div className="midrow">
                  <PlayPanel held={held} onDown={down} onUp={up} />
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
              {s.tab === 'scenes' && <ScenesPage />}
              {s.tab === 'play' && <PlayPage held={held} onDown={down} onUp={up} />}
              {s.tab === 'channel' && <ChannelPage />}
              {s.tab === 'fx' && <FxPage />}
              {s.tab === 'inputs' && <InputsPage />}
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
