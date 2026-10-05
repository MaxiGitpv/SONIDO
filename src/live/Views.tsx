import { useRef } from 'react';
import { useLive, Icon, Art } from './ctx';
import { CH_META, SOUNDS } from './data';
import { CH_IDS } from './types';
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

export function SoundsView() {
  const { s, d, mix } = useLive();
  const preview = (ids: ChId[]) => {
    const rel = engine.noteOn(ids, 60);
    const rel2 = engine.noteOn(ids, 64);
    const rel3 = engine.noteOn(ids, 67);
    window.setTimeout(() => { rel(); rel2(); rel3(); }, 1400);
  };
  return (
    <div className="lview">
      <h2>Sonidos <small>Pruebe cada sonido y asígnelo a la escena actual. Todos se sintetizan en el navegador.</small></h2>
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
    <div className="lview mixer">
      <h2>Mezcla <small>Todos los canales con su medidor real. Toque el nombre de un canal para editar su EQ en «En vivo».</small></h2>
      <StripRow tall />
    </div>
  );
}

export function RoutesView() {
  const { mix, d, s } = useLive();
  const sl = (label: string, v: number, on: (x: number) => void) => <HSlider label={label} value={v} toPos={dbToPos} fromPos={posToDb} snap={(x) => (Math.abs(x) < 1 ? 0 : Math.round(x * 2) / 2)} onChange={on} />;
  return (
    <div className="lview">
      <h2>Rutas <small>Qué recibe el master y cuánto envía cada canal a los efectos.</small></h2>
      <div className="routes2">
        <div className="rt-h"><span>Canal</span><span>Master</span><span>Envío a Hall Reverb</span><span>Envío a Delay</span></div>
        {CH_IDS.map((id) => {
          const c = mix.chans[id];
          const isClick = id === 'click';
          return (
            <div key={id} className="rt-row" style={{ ['--cc' as string]: CH_META[id].color }}>
              <span className="rt-n"><Icon name={id} size={16} /> {CH_META[id].name}</span>
              {isClick ? (
                <button className={`mini${s.clickMonitor ? ' on' : ''}`} onClick={() => d({ type: 'clickMon', on: !s.clickMonitor })}>Solo monitor {s.clickMonitor ? 'ON' : 'OFF'}</button>
              ) : (
                <button className={`mini${!c.mute ? ' on' : ''}`} aria-pressed={!c.mute} onClick={() => d({ type: 'ch', id, fn: (x) => ({ ...x, mute: !x.mute }) })}>{c.mute ? 'Cortado' : 'Enviado'}</button>
              )}
              <span className="rt-s">{sl(`${CH_META[id].name} a reverb`, c.sendRev, (v) => d({ type: 'ch', id, fn: (x) => ({ ...x, sendRev: v }) }))}<b>{fmtDb(c.sendRev)}</b></span>
              <span className="rt-s">{sl(`${CH_META[id].name} a delay`, c.sendDly, (v) => d({ type: 'ch', id, fn: (x) => ({ ...x, sendDly: v }) }))}<b>{fmtDb(c.sendDly)}</b></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MidiView() {
  const { s, d } = useLive();
  const step = (id: string, key: 'cc' | 'ch', v: number, min: number, max: number) => (
    <span className="stepper2">
      <button aria-label="Menos" disabled={v <= min} onClick={() => d({ type: 'midi', id, patch: { [key]: v - 1 } })}>−</button>
      <output>{key === 'cc' ? `CC ${v}` : `Canal ${v}`}</output>
      <button aria-label="Más" disabled={v >= max} onClick={() => d({ type: 'midi', id, patch: { [key]: v + 1 } })}>+</button>
    </span>
  );
  return (
    <div className="lview">
      <h2>MIDI <small>Asignaciones guardadas. No hay ningún controlador MIDI conectado: hoy se usa el teclado en pantalla o el del computador (teclas A a K).</small></h2>
      <div className="midi2">
        {s.midi.map((m) => (
          <div key={m.id} className="midi2-row">
            <b>{m.label}</b>
            {step(m.id, 'cc', m.cc, 0, 127)}
            {step(m.id, 'ch', m.ch, 1, 16)}
          </div>
        ))}
      </div>
    </div>
  );
}
