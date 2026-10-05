import { useEffect, useRef, useState } from 'react';
import { usePerf, effLevel, pct } from './ctx';
import { INST_META, SONGS, SOUNDS, soundById } from './data';
import { INSTS, SCENE_LIST } from './types';
import { Knob } from '../components/Knob';
import { HSlider } from '../components/HSlider';
import { PerfFader } from './PerfFader';

/* ---------- Escenas ---------- */
export function SceneBar() {
  const { s, d } = usePerf();
  const mixes = s.mix[s.songId];
  return (
    <div className="scenes" role="tablist" aria-label="Escenas de la canción">
      {SCENE_LIST.map((sc) => {
        const m = mixes[sc.id];
        const on = s.sceneId === sc.id && !s.test.on;
        const testing = s.test.on && (sc.id === 'verso' || sc.id === 'coro');
        return (
          <button key={sc.id} role="tab" aria-selected={s.sceneId === sc.id} className={`scene-btn${on ? ' on' : ''}${testing ? ' testing' : ''}`} onClick={() => d({ type: 'scene', id: sc.id })}>
            <span className="sb-name">{sc.label}</span>
            <span className="sb-sound">{soundById(m.sound).name}</span>
            <span className="sb-mix" aria-hidden="true">
              {INSTS.map((i) => (
                <i key={i} style={{ ['--ic' as string]: INST_META[i].color, height: `${Math.max(6, effLevel(m, i) * 100)}%`, opacity: m.layers[i].on ? 1 : 0.18 }} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Repertorio ---------- */
export function Repertoire({ onPick }: { onPick?: () => void }) {
  const { s, d } = usePerf();
  return (
    <ul className="rep" aria-label="Repertorio">
      {SONGS.map((song, i) => (
        <li key={song.id}>
          <button className={`song${song.id === s.songId ? ' on' : ''}`} aria-current={song.id === s.songId} onClick={() => { d({ type: 'song', id: song.id }); onPick?.(); }}>
            <span className="song-n">{i + 1}</span>
            <span className="song-t">{song.title}</span>
            <span className="song-k">{song.key}</span>
            <span className="song-b">{song.bpm}<small>BPM</small></span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------- Sonido activo ---------- */
export function SoundPanel() {
  const { s, d, view } = usePerf();
  const sound = soundById(view.sound);
  return (
    <section className="sound">
      <header className="sound-head">
        <div>
          <span className="eyebrow">Sonido activo · {SCENE_LIST.find((x) => x.id === s.sceneId)?.label}</span>
          <h2>{sound.name}</h2>
          <p>{sound.tag}</p>
        </div>
        <div className="layer-chips" role="group" aria-label="Capas">
          {INSTS.map((i) => (
            <button key={i} className={`chip${view.layers[i].on ? ' on' : ''}`} style={{ ['--ic' as string]: INST_META[i].color }} aria-pressed={view.layers[i].on} disabled={s.test.on} onClick={() => d({ type: 'layerOn', inst: i })}>
              <i /> {INST_META[i].label}
            </button>
          ))}
        </div>
      </header>
      <div className="sound-cards" role="listbox" aria-label="Banco de sonidos">
        {SOUNDS.map((x, n) => (
          <button key={x.id} role="option" aria-selected={x.id === view.sound} disabled={s.test.on} className={`scard${x.id === view.sound ? ' on' : ''}`} onClick={() => d({ type: 'sound', id: x.id })}>
            <span className="scard-n">{n + 1}</span>
            <b>{x.name}</b>
            <small>{x.tag}</small>
            <span className="scard-dots" aria-hidden="true">
              {INSTS.filter((i) => x.layers[i] !== undefined).map((i) => <i key={i} style={{ background: INST_META[i].color }} />)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------- Modo prueba Verso ⇄ Coro ---------- */
export function TestPanel() {
  const { s, d, view } = usePerf();
  const A = s.mix[s.songId].verso;
  const B = s.mix[s.songId].coro;
  const raf = useRef(0);
  const tRef = useRef(s.test.t);
  tRef.current = s.test.t;
  const [target, setTarget] = useState<0 | 1 | null>(s.test.t > 0.5 ? 1 : 0);

  // Transición suave hacia el objetivo (0 = Verso, 1 = Coro).
  useEffect(() => {
    if (target === null) return;
    let start = 0;
    const from = tRef.current;
    const step = (now: number) => {
      if (!start) start = now;
      const k = Math.min(1, (now - start) / 900);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      d({ type: 'test', patch: { t: from + (target - from) * e } });
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, d]);

  useEffect(() => {
    if (!s.test.auto) return;
    const id = window.setInterval(() => setTarget((t) => (t === 1 ? 0 : 1)), 3200);
    return () => window.clearInterval(id);
  }, [s.test.auto]);

  const t = s.test.t;
  return (
    <section className="testp" aria-label="Modo de prueba Verso a Coro">
      <header>
        <h3>Prueba · cómo cambia la mezcla</h3>
        <div className="testp-btns">
          <button className={`tbtn${target === 0 && !s.test.auto ? ' on' : ''}`} onClick={() => { d({ type: 'test', patch: { auto: false } }); setTarget(0); }}>Verso</button>
          <button className={`tbtn${target === 1 && !s.test.auto ? ' on' : ''}`} onClick={() => { d({ type: 'test', patch: { auto: false } }); setTarget(1); }}>Coro</button>
          <button className={`tbtn auto${s.test.auto ? ' on' : ''}`} aria-pressed={s.test.auto} onClick={() => d({ type: 'test', patch: { auto: !s.test.auto } })}>{s.test.auto ? 'Detener' : 'Alternar solo'}</button>
        </div>
      </header>
      <div className="testp-blend">
        <span>Verso</span>
        <HSlider label="Mezcla entre Verso y Coro" value={t} toPos={(v) => v} fromPos={(p) => p} onChange={(v) => { d({ type: 'test', patch: { t: v, auto: false } }); setTarget(null); }} />
        <span>Coro</span>
      </div>
      <div className="testp-rows">
        {INSTS.map((i) => {
          const a = effLevel(A, i);
          const b = effLevel(B, i);
          const now = effLevel(view, i);
          const diff = Math.round((b - a) * 100);
          return (
            <div key={i} className="trow" style={{ ['--ic' as string]: INST_META[i].color }}>
              <span className="trow-l">{INST_META[i].label}</span>
              <div className="trow-bar">
                <i className="a" style={{ width: `${a * 100}%` }} />
                <i className="b" style={{ width: `${b * 100}%` }} />
                <i className="now" style={{ width: `${now * 100}%` }} />
              </div>
              <span className="trow-d" data-sign={Math.sign(diff)}>{diff === 0 ? '=' : `${diff > 0 ? '+' : ''}${diff}`}</span>
            </div>
          );
        })}
      </div>
      <footer>
        <span>Verso: {soundById(A.sound).name}</span>
        <span>Coro: {soundById(B.sound).name}</span>
      </footer>
    </section>
  );
}

/* ---------- Macros y volumen ---------- */
export function MacroPanel() {
  const { s, d, view } = usePerf();
  const dis = s.test.on;
  const mk = (key: 'ambience' | 'brightness' | 'expression', label: string) => (
    <Knob label={label} value={view.macros[key]} min={0} max={1} step={0.01} def={0.5} format={(v) => `${pct(v)}`} disabled={dis} onChange={(v) => d({ type: 'macro', key, value: v })} color="#9db4ff" />
  );
  return (
    <aside className="macros" aria-label="Macros">
      <h3 className="eyebrow">Macros de la escena</h3>
      <div className="macro-grid">
        {mk('ambience', 'Ambiente')}
        {mk('brightness', 'Brillo')}
        {mk('expression', 'Expresión')}
      </div>
      <div className="master">
        <div className="master-h">
          <span className="eyebrow">Volumen principal</span>
          <b>{pct(s.master)}</b>
        </div>
        <HSlider label="Volumen principal" value={s.master} toPos={(v) => v} fromPos={(p) => p} snap={(v) => Math.round(v * 100) / 100} onChange={(v) => d({ type: 'master', value: v })} color="#e7ecff" />
      </div>
      <p className="engine-note">Motor de audio pendiente. Los controles guardan la configuración del preset; todavía no suenan.</p>
    </aside>
  );
}

/* ---------- Cuatro faders ---------- */
export function FaderRow() {
  const { s, d, view } = usePerf();
  return (
    <div className="faders">
      {INSTS.map((i) => {
        const l = view.layers[i];
        const meta = INST_META[i];
        const eff = effLevel(view, i);
        return (
          <div key={i} className={`fmod${l.on ? '' : ' off'}`} style={{ ['--ic' as string]: meta.color }}>
            <button className="fmod-name" aria-pressed={l.on} disabled={s.test.on} onClick={() => d({ type: 'layerOn', inst: i })}>
              <i /> {meta.label}
              <small>{l.on ? 'ON' : 'OFF'}</small>
            </button>
            <PerfFader label={`Nivel de ${meta.label}`} value={l.level} ghost={l.on ? eff : undefined} color={meta.color} disabled={s.test.on} onChange={(v) => d({ type: 'layerLevel', inst: i, level: v })} />
            <div className="fmod-val">{l.on ? pct(l.level) : '—'}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Anterior / Siguiente / Panic ---------- */
export function Transport() {
  const { s, d } = usePerf();
  const si = SCENE_LIST.findIndex((x) => x.id === s.sceneId);
  const sg = SONGS.findIndex((x) => x.id === s.songId);
  const target = (dir: 1 | -1) => {
    let ni = si + dir;
    let ng = sg;
    if (ni >= SCENE_LIST.length) { ng++; ni = 0; }
    if (ni < 0) { ng--; ni = SCENE_LIST.length - 1; }
    if (ng < 0 || ng >= SONGS.length) return 'Fin del repertorio';
    return `${ng !== sg ? SONGS[ng].title + ' · ' : ''}${SCENE_LIST[ni].label}`;
  };
  return (
    <>
      <div className="navpair">
        <button className="bigbtn" onClick={() => d({ type: 'step', dir: -1 })}>
          <span className="bb-arrow">‹</span>
          <span className="bb-t">Anterior<small>{target(-1)}</small></span>
        </button>
        <button className="bigbtn next" onClick={() => d({ type: 'step', dir: 1 })}>
          <span className="bb-t">Siguiente<small>{target(1)}</small></span>
          <span className="bb-arrow">›</span>
        </button>
      </div>
      <div className="panicwrap">
        <button className="panic" onClick={() => d({ type: 'panic' })}>
          Panic MIDI
          <small>Apagar todas las notas</small>
        </button>
      </div>
    </>
  );
}
