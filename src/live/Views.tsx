import { useRef } from 'react';
import { useLive, Icon, Art } from './ctx';
import { CH_META, SOUNDS, STYLE_BPM, chIcon, chName } from './data';
import { ModuleHead } from './nav';
import { CH_IDS, STYLES } from './types';
import type { ChId } from './types';
import { engine } from './engine';
import { StripRow } from './Strips';
import { HSlider } from '../components/HSlider';
import { clamp, dbToPos, fmtDb, posToDb } from '../util';

const DRAW_NAMES = ['16′', '5⅓′', '8′', '4′', '2⅔′', '2′', '1⅗′', '1⅓′', '1′'];
const DRAW_COLORS = ['#7a4a2b', '#7a4a2b', '#efe6d0', '#efe6d0', '#26282e', '#efe6d0', '#26282e', '#26282e', '#efe6d0'];

function Drawbar({ i, v }: { i: number; v: number }) {
  const { d } = useLive();
  const ref = useRef<HTMLDivElement>(null);
  const on = useRef(false);
  const set = (y: number) => {
    const r = ref.current!.getBoundingClientRect();
    d({ type: 'drawbar', index: i, value: Math.round(clamp((y - r.top) / r.height, 0, 1) * 8) });
  };
  return (
    <div className="dbar">
      <div ref={ref} className="dbar-t" role="slider" tabIndex={0} aria-label={`Drawbar ${DRAW_NAMES[i]}`} aria-valuemin={0} aria-valuemax={8} aria-valuenow={v}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); on.current = true; set(e.clientY); }}
        onPointerMove={(e) => on.current && set(e.clientY)} onPointerUp={() => (on.current = false)}
        onKeyDown={(e) => { if (e.key === 'ArrowDown') d({ type: 'drawbar', index: i, value: Math.min(8, v + 1) }); if (e.key === 'ArrowUp') d({ type: 'drawbar', index: i, value: Math.max(0, v - 1) }); }}>
        <i style={{ height: `${(v / 8) * 100}%`, background: DRAW_COLORS[i] }} />
      </div>
      <b>{v}</b>
      <small>{DRAW_NAMES[i]}</small>
    </div>
  );
}

function SourceCard({ id, title, desc }: { id: 'pad' | 'drums' | 'tracks'; title: string; desc: string }) {
  const { s, d, loadFile } = useLive();
  const input = useRef<HTMLInputElement>(null);
  const name = s.files[id];
  const mode = id === 'tracks' ? 'file' : s.src[id];
  return (
    <article className="srccard" style={{ ['--cc' as string]: CH_META[id].color }}>
      <h4><Icon name={id === 'tracks' ? 'tracks' : id} size={16} /> {title}</h4>
      <p>{desc}</p>
      <input ref={input} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(id, f); e.target.value = ''; }} />
      <div className="src-row">
        <button className="mini" onClick={() => input.current?.click()}><Icon name="upload" size={14} /> {name ? 'Cambiar archivo' : 'Cargar archivo'}</button>
        {id !== 'tracks' && (
          <div className="segx sm" role="group" aria-label={`Fuente de ${title}`}>
            <button className={mode === 'synth' ? 'on' : ''} onClick={() => d({ type: 'src', ch: id, mode: 'synth' })}>Sintetizado</button>
            <button className={mode === 'file' ? 'on' : ''} disabled={!name} onClick={() => d({ type: 'src', ch: id, mode: 'file' })}>Archivo</button>
          </div>
        )}
      </div>
      <small className="src-name">{name ? `Archivo: ${name}` : 'Sin archivo cargado'}</small>
    </article>
  );
}

export function SoundsView() {
  const { s, d, mix } = useLive();
  const song = s.songs.find((x) => x.id === s.songId)!;
  const preview = (ids: ChId[]) => {
    const rel = engine.noteOn(ids, 60);
    const rel2 = engine.noteOn(ids, 64);
    const rel3 = engine.noteOn(ids, 67);
    window.setTimeout(() => { rel(); rel2(); rel3(); }, 1400);
  };
  return (
    <div className="mpage">
      <ModuleHead title="Sonidos, ritmos y fuentes" desc="Pruebe cada sonido y asígnelo a la escena actual, elija el ritmo y cargue pads, loops o pistas propias." />
      <div className="sgrid">
        {SOUNDS.map((x) => (
          <article key={x.id} className={`scard2${mix.sound === x.id ? ' on' : ''}`}>
            <Art ch={x.layers[0].ch} big />
            <div>
              <span className="eyebrow2">{x.cat}</span>
              <h3>{x.name}</h3>
              <p>{x.layers.map((l) => l.name).join(' + ')}</p>
            </div>
            <div className="sc-act">
              <button className="mini" onClick={() => preview(x.layers.map((l) => l.ch))}><Icon name="play" size={14} /> Probar</button>
              <button className={`mini${mix.sound === x.id ? ' on' : ''}`} onClick={() => d({ type: 'sound', id: x.id })}>{mix.sound === x.id ? 'En uso' : 'Usar en esta escena'}</button>
            </div>
          </article>
        ))}
      </div>
      <section className="organ2">
        <h3>Ritmos de «{song.title}»</h3>
        <p className="hint2">Batería, bajo y percusión sintetizados para cada estilo. Al elegir uno se ajusta el BPM sugerido; luego puede cambiarlo.</p>
        <div className="styles">
          {STYLES.map((x) => (
            <button key={x.id} className={`stylebtn${song.style === x.id ? ' on' : ''}`} aria-pressed={song.style === x.id} onClick={() => d({ type: 'style', style: x.id })}>
              <b>{x.label}</b>
              <small>{STYLE_BPM[x.id]} BPM</small>
            </button>
          ))}
        </div>
      </section>
      <section className="organ2">
        <h3>Pads de fondo, pistas y batería desde archivo</h3>
        <p className="hint2">Cargue sus propios pads profesionales (por ejemplo un pad en la tonalidad de la canción), un loop de batería o una pista completa. Suenan en bucle, sincronizados con ▶. Los archivos se quedan en este navegador mientras la página esté abierta.</p>
        <div className="srcgrid">
          <SourceCard id="pad" title="Pad / fondo" desc="Reemplaza el pad sintetizado por su archivo." />
          <SourceCard id="drums" title="Batería" desc="Use un loop de batería en lugar de la batería sintetizada." />
          <SourceCard id="tracks" title="Tracks" desc="Pista completa, multitrack mezclado o secuencia." />
        </div>
      </section>
      <section className="organ2">
        <h3>Gospel Organ · rotary y drawbars</h3>
        <div className="organ2-row">
          <div className="segx" role="group" aria-label="Rotary">
            {(['stop', 'slow', 'fast'] as const).map((r) => (
              <button key={r} className={s.fx.rotary === r ? 'on' : ''} aria-pressed={s.fx.rotary === r} onClick={() => d({ type: 'fx', patch: { rotary: r } })}>{r === 'stop' ? 'Parado' : r === 'slow' ? 'Lento' : 'Rápido'}</button>
            ))}
          </div>
          <div className="dbars">{s.fx.drawbars.map((v, i) => <Drawbar key={i} i={i} v={v} />)}</div>
        </div>
        <p className="hint2">Los drawbars se aplican a las notas nuevas; el rotary cambia en el momento.</p>
      </section>
    </div>
  );
}

export function MixerView() {
  return (
    <div className="mpage mixer">
      <ModuleHead title="Mezcla" desc="Todos los canales con su medidor real. Doble toque en el nombre o ⤢ abre el editor del canal." />
      <StripRow tall />
    </div>
  );
}

export function RoutesView() {
  const { mix, d, s } = useLive();
  const sl = (label: string, v: number, on: (x: number) => void) => <HSlider label={label} value={v} toPos={dbToPos} fromPos={posToDb} snap={(x) => (Math.abs(x) < 1 ? 0 : Math.round(x * 2) / 2)} onChange={on} />;
  return (
    <div className="mpage">
      <ModuleHead title="Rutas" desc="Qué recibe el master y cuánto envía cada canal a los efectos." />
      <div className="routes2">
        <div className="rt-h"><span>Canal</span><span>Master</span><span>Envío a Hall Reverb</span><span>Envío a Delay</span></div>
        {CH_IDS.map((id) => {
          const c = mix.chans[id];
          const isClick = id === 'click';
          return (
            <div key={id} className="rt-row" style={{ ['--cc' as string]: CH_META[id].color }}>
              <span className="rt-n"><Icon name={chIcon(id)} size={16} /> {chName(s, id)}</span>
              {isClick ? (
                <button className={`mini${s.clickMonitor ? ' on' : ''}`} onClick={() => d({ type: 'clickMon', on: !s.clickMonitor })}>Solo monitor {s.clickMonitor ? 'ON' : 'OFF'}</button>
              ) : (
                <button className={`mini${!c.mute ? ' on' : ''}`} aria-pressed={!c.mute} onClick={() => d({ type: 'ch', id, fn: (x) => ({ ...x, mute: !x.mute }) })}>{c.mute ? 'Cortado' : 'Enviado'}</button>
              )}
              <span className="rt-s">{sl(`${chName(s, id)} a reverb`, c.sendRev, (v) => d({ type: 'ch', id, fn: (x) => ({ ...x, sendRev: v }) }))}<b>{fmtDb(c.sendRev)}</b></span>
              <span className="rt-s">{sl(`${chName(s, id)} a delay`, c.sendDly, (v) => d({ type: 'ch', id, fn: (x) => ({ ...x, sendDly: v }) }))}<b>{fmtDb(c.sendDly)}</b></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MidiView() {
  const { s, d, midi, connectMidi, setLearn } = useLive();
  const step = (id: string, key: 'cc' | 'ch', v: number, min: number, max: number) => (
    <span className="stepper2">
      <button aria-label="Menos" disabled={v <= min} onClick={() => d({ type: 'midi', id, patch: { [key]: v - 1 } })}>−</button>
      <output>{key === 'cc' ? `CC ${v}` : `Canal ${v}`}</output>
      <button aria-label="Más" disabled={v >= max} onClick={() => d({ type: 'midi', id, patch: { [key]: v + 1 } })}>+</button>
    </span>
  );
  const on = midi.status === 'on';
  return (
    <div className="mpage">
      <ModuleHead title="MIDI" desc="Conecte su teclado o controlador por USB. Las notas tocan el sonido de la escena con su velocidad; el pedal, las perillas y los botones se asignan abajo.">
        <button className={`savebtn small${on ? ' ok' : ''}`} onClick={connectMidi}>
          <Icon name="keys" /> {on ? `MIDI activo · ${midi.devices.length} dispositivo${midi.devices.length === 1 ? '' : 's'}` : 'Conectar teclado MIDI'}
        </button>
      </ModuleHead>
      {midi.error && <p className={midi.status === 'error' ? 'inerr' : 'inwarn'} role="status">{midi.error}</p>}
      <div className="midi-top">
        <section className="ced-card">
          <h3>Dispositivos</h3>
          {midi.devices.length ? (
            <ul className="mdev">
              {midi.devices.map((dv) => <li key={dv.id}><i className={dv.state === 'connected' ? 'ok' : ''} /> {dv.name}</li>)}
            </ul>
          ) : (
            <p className="hint2">{on ? 'Ningún dispositivo conectado todavía.' : 'Pulse «Conectar teclado MIDI» y acepte el permiso del navegador.'}</p>
          )}
        </section>
        <section className="ced-card">
          <h3>Último mensaje</h3>
          <p className="mlast">{midi.last || '—'}</p>
          <p className="hint2">Program Change 1 a 5 cambia a Intro, Verso, Coro, Puente y Final (al compás si está sonando).</p>
        </section>
      </div>
      <div className="midi2">
        {s.midi.map((m) => (
          <div key={m.id} className={`midi2-row${midi.learn === m.id ? ' learning' : ''}`}>
            <b>{m.label}</b>
            {step(m.id, 'cc', m.cc, 0, 127)}
            {step(m.id, 'ch', m.ch, 1, 16)}
            <button className={`mini${midi.learn === m.id ? ' on' : ''}`} disabled={!on} onClick={() => setLearn(midi.learn === m.id ? null : m.id)}>
              {midi.learn === m.id ? 'Mueva un control…' : 'Aprender'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
