import { useEffect, useRef, useState } from 'react';
import { useLive, Icon } from './ctx';
import { ModuleHead } from './nav';
import { CH_META, chIcon, chName, kindLabel, soundById, layerInfo } from './data';
import { CH_IDS, IN_IDS, IN_TYPES, INST_IDS, MUSIC_IDS } from './types';
import { KIND_COLOR } from './Timeline';
import type { ChId, InId, InputCfg } from './types';
import { engine } from './engine';
import { meterBus } from '../meterEngine';
import { Repertoire, SoundBank } from './Left';
import { SceneBar, SongHeader, SoundLayers, LiveKeyboard } from './Center';
import { PadsGrid } from './PadsGrid';
import { RightPanel } from './Right';
import { ChannelEditor } from './ChannelEditor';
import { Knob } from '../components/Knob';
import { HSlider } from '../components/HSlider';
import { dbToPos, fmtDb, posToDb } from '../util';

/* ---------- Escenas y repertorio ---------- */
export function ScenesPage() {
  const { s, mix: cur, goScene, song } = useLive();
  return (
    <div className="mpage">
      <ModuleHead title="Escenas musicales y repertorio" desc="Arme cualquier estructura: secciones con nombre propio, orden, repeticiones, compases y compás (2/4 a 12/8). Cada sección guarda el sonido, las capas, los niveles musicales y las macros del director; nunca la mezcla del sonidista." />
      <div className="scenes-layout">
        <div className="lcol static">
          <Repertoire />
        </div>
        <div className="scenes-main">
          <section className="lpanel songpanel">
            <SongHeader />
            <SceneBar edit />
          </section>
          <div className="scenecards">
            {song.sections.map((sc) => {
              const m = s.mix[s.songId][sc.id];
              const on = s.sceneId === sc.id;
              const bars = song.arr.filter((x) => x.scene === sc.id).reduce((a, x) => a + x.bars, 0);
              const active = MUSIC_IDS.filter((id) => m.music[id]?.on);
              return (
                <article key={sc.id} className={`scenecard${on ? ' on' : ''}`} style={{ ['--sc' as string]: KIND_COLOR[sc.kind] }}>
                  <header>
                    <h3>{sc.label}</h3>
                    <span>{bars ? `${bars} compases` : 'fuera del orden'}</span>
                  </header>
                  <p className="sc-kind">{kindLabel(sc.kind)}</p>
                  <p className="sc-sound">{soundById(m.sound).name}</p>
                  <p className="sc-layers">{m.layers.map((l) => layerInfo(m.sound, l.ch).name).join(' + ')}</p>
                  <div className="sc-bars" aria-label="Niveles musicales">
                    {INST_IDS.map((id) => {
                      const ml = m.music[id];
                      const onx = !!ml?.on;
                      return (
                        <i key={id} title={`${CH_META[id].name}: ${onx ? `${fmtDb(ml!.db)} dB` : 'apagado'}`}
                          style={{ background: CH_META[id].color, height: `${onx ? Math.max(8, dbToPos(ml!.db - 6) * 100) : 4}%`, opacity: onx ? 1 : 0.25 }} />
                      );
                    })}
                  </div>
                  <dl>
                    <div><dt>Instrumentos activos</dt><dd>{active.length}</dd></div>
                    <div><dt>Ambiente</dt><dd>{Math.round(m.macros.ambience * 100)} %</dd></div>
                    <div><dt>Brillo</dt><dd>{Math.round(m.macros.brightness * 100)} %</dd></div>
                    <div><dt>Expresión</dt><dd>{Math.round(m.macros.expression * 100)} %</dd></div>
                  </dl>
                  <button className={`mini${on ? ' on' : ''}`} onClick={() => goScene(sc.id)}>{on ? 'Sección actual' : 'Ir a esta sección'}</button>
                </article>
              );
            })}
          </div>
          <p className="hint2">Sección actual: <b>{song.sections.find((x) => x.id === s.sceneId)?.label}</b> · {soundById(cur.sound).name}. Use «Guardar» para conservar los cambios en este navegador.</p>
        </div>
      </div>
    </div>
  );
}

/* ---------- Tocar en vivo ---------- */
export function PlayPage({ held, onDown, onUp }: { held: number[]; onDown: (n: number) => void; onUp: (n: number) => void }) {
  const { s, d } = useLive();
  return (
    <div className="mpage">
      <ModuleHead title="Tocar en vivo" desc="Capas del sonido, teclado completo y cuadros. Teclas A a L del computador, Z y X cambian de octava, Shift es el sustain.">
        <span className="chip">Octava {s.octave > 0 ? `+${s.octave}` : s.octave}</span>
        <button className="mini" onClick={() => d({ type: 'octave', value: Math.max(-2, s.octave - 1) })}>Oct −</button>
        <button className="mini" onClick={() => d({ type: 'octave', value: Math.min(2, s.octave + 1) })}>Oct +</button>
      </ModuleHead>
      <div className="play-layout">
        <section className="lpanel">
          <header className="ph"><Icon name="layers" /><h3>Capas del sonido</h3></header>
          <SoundLayers />
        </section>
        <section className="lpanel bigkb">
          <header className="ph"><Icon name="keys" /><h3>Teclado</h3></header>
          <LiveKeyboard held={held} onDown={onDown} onUp={onUp} />
        </section>
        <section className="lpanel bigpads">
          <header className="ph"><Icon name="grid" /><h3>Cuadros</h3></header>
          <PadsGrid />
        </section>
        <div className="play-bank">
          <SoundBank />
        </div>
      </div>
    </div>
  );
}

/* ---------- Efectos y envíos ---------- */
export function FxPage() {
  const { s, mix, d } = useLive();
  const sl = (label: string, v: number, on: (x: number) => void) => <HSlider label={label} value={v} toPos={dbToPos} fromPos={posToDb} snap={(x) => (Math.abs(x) < 1 ? 0 : Math.round(x * 2) / 2)} onChange={on} />;
  return (
    <div className="mpage">
      <ModuleHead title="Espacio, expresión y efectos" desc="Macros de la escena, Hall Reverb, Delay y cuánto envía cada canal." />
      <div className="fx-layout">
        <RightPanel wide />
        <section className="lpanel">
          <header className="ph"><Icon name="sliders" /><h3>Envíos por canal</h3></header>
          <div className="routes2">
            <div className="rt-h fx"><span>Canal</span><span>Hall Reverb</span><span>Delay 1/4</span></div>
            {CH_IDS.filter((id) => id !== 'click').map((id) => {
              const c = mix.chans[id];
              return (
                <div key={id} className="rt-row fx" style={{ ['--cc' as string]: CH_META[id].color }}>
                  <span className="rt-n"><Icon name={chIcon(id)} size={16} /> {chName(s, id)}</span>
                  <span className="rt-s">{sl(`${chName(s, id)} a reverb`, c.sendRev, (v) => d({ type: 'ch', id, fn: (x) => ({ ...x, sendRev: v }) }))}<b>{fmtDb(c.sendRev)}</b></span>
                  <span className="rt-s">{sl(`${chName(s, id)} a delay`, c.sendDly, (v) => d({ type: 'ch', id, fn: (x) => ({ ...x, sendDly: v }) }))}<b>{fmtDb(c.sendDly)}</b></span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------- Canal ---------- */
export function ChannelPage() {
  const { s } = useLive();
  return (
    <div className="mpage">
      <ChannelEditor id={s.selected} />
    </div>
  );
}

/* ---------- Entradas: micrófonos e instrumentos ---------- */
function InMeter({ id }: { id: InId }) {
  const bar = useRef<HTMLDivElement>(null);
  const pk = useRef<HTMLDivElement>(null);
  useEffect(() => meterBus.subscribe(`in:${id}`, (lv) => {
    const v = lv ? lv.l : -90;
    const p = lv ? lv.pl : -90;
    if (bar.current) bar.current.style.width = `${Math.max(0, (v + 60) / 60) * 100}%`;
    if (pk.current) {
      pk.current.style.left = `${Math.max(0, (p + 60) / 60) * 100}%`;
      pk.current.style.background = p > -3 ? '#e5483f' : p > -12 ? '#e0a93a' : '#e9f1f3';
    }
  }), [id]);
  return (
    <div className="inmeter" aria-label="Nivel de entrada">
      <div ref={bar} className="inm-bar" />
      <div ref={pk} className="inm-pk" />
      <span className="inm-s">-60</span><span className="inm-s mid">-12</span><span className="inm-s end">0</span>
    </div>
  );
}

const ERR: Record<string, string> = {
  NotAllowedError: 'El permiso para usar el micrófono fue rechazado o este visor no lo permite. Ábralo desde el enlace de GitHub Pages y acepte el permiso del navegador.',
  NotFoundError: 'No se encontró ningún micrófono ni interfaz de audio conectada.',
  NotReadableError: 'Otra aplicación está usando la entrada de audio. Ciérrela e intente de nuevo.',
  unsupported: 'Este navegador o este visor no da acceso a entradas de audio.',
};

export function InputsPage() {
  const { s, d, mix, can, remote } = useLive();
  const lock = !can('inputs');
  const shared = (dev: string | null) => (dev ? IN_IDS.filter((x) => s.inputs[x].device === dev) : []);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [err, setErr] = useState('');

  const enable = async () => {
    engine.ensure();
    try {
      const list = await engine.inputDevices(true);
      setDevices(list);
      setStatus('ok');
      if (!list.length) {
        setStatus('error');
        setErr(ERR.NotFoundError);
      }
    } catch (e) {
      const name = e instanceof Error ? (e.name === 'Error' ? e.message : e.name) : 'unsupported';
      setStatus('error');
      setErr(ERR[name] ?? `No se pudo abrir la entrada de audio (${name}).`);
    }
  };
  useEffect(() => {
    // Si ya hay permiso de una visita anterior, la lista llega sin preguntar.
    engine.inputDevices(false).then((l) => {
      if (l.some((x) => x.label)) {
        setDevices(l);
        setStatus('ok');
      }
    }).catch(() => undefined);
  }, []);

  const set = (id: InId, patch: Partial<InputCfg>) => d({ type: 'input', id, patch });
  return (
    <div className="mpage">
      <ModuleHead title="Entradas: micrófonos e instrumentos" desc="Asigne cada micrófono o instrumento a una entrada real del equipo o de la interfaz de audio. Cada entrada es un canal con su EQ, compresor y envíos.">
        <button className={`savebtn small${status === 'ok' ? ' ok' : ''}`} onClick={enable}>
          <Icon name="voz" /> {status === 'ok' ? `Entradas activas · ${devices.length}` : 'Activar entradas de audio'}
        </button>
      </ModuleHead>
      {status === 'error' && <p className="inerr" role="alert">{err}</p>}
      <p className="inwarn"><b>Evite el acople:</b> use audífonos o mantenga bajo el volumen de los parlantes al abrir un micrófono. Las entradas empiezan silenciadas (M). El +48V de los micrófonos de condensador se activa en la interfaz física; el navegador no puede controlarlo.</p>
      <div className="intable">
        <div className="in-h"><span>Canal</span><span>Tipo</span><span>Entrada del equipo</span><span>Lado</span><span>Ganancia</span><span>Nivel de entrada</span><span>Canal en la mezcla</span></div>
        {IN_IDS.map((id) => {
          const cfg = s.inputs[id];
          const c = mix.chans[id];
          return (
            <div key={id} className="in-row" style={{ ['--cc' as string]: CH_META[id].color }}>
              <input className="in-name" aria-label={`Nombre de la entrada ${id.slice(2)}`} value={cfg.name} maxLength={20} onChange={(e) => set(id, { name: e.target.value })} />
              <select aria-label="Tipo de fuente" value={cfg.type} onChange={(e) => set(id, { type: e.target.value as InputCfg['type'] })}>
                {IN_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <select aria-label="Entrada del equipo" value={cfg.device ?? ''} disabled={status !== 'ok' || lock || remote} onChange={(e) => set(id, { device: e.target.value || null })}>
                <option value="">{status === 'ok' ? 'Sin asignar' : 'Active las entradas primero'}</option>
                {devices.map((dv, i) => <option key={dv.deviceId || i} value={dv.deviceId}>{dv.label || `Entrada ${i + 1}`}</option>)}
              </select>
              <select aria-label="Lado de la entrada" value={cfg.side} onChange={(e) => set(id, { side: e.target.value as InputCfg['side'] })}>
                <option value="mix">Mono (suma)</option>
                <option value="L">Izquierdo / 1</option>
                <option value="R">Derecho / 2</option>
              </select>
              <div className="in-gain">
                <Knob label="" value={cfg.trim} min={-20} max={40} step={0.5} def={0} disabled={lock} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} onChange={(v) => set(id, { trim: v })} />
                <button className={`mini${cfg.polarity ? ' on' : ''}`} aria-pressed={cfg.polarity} title="Invertir polaridad" onClick={() => set(id, { polarity: !cfg.polarity })}>Ø</button>
              </div>
              <div className="in-cap">
                <InMeter id={id} />
                <small>{capText(cfg.device, cfg.side, shared(cfg.device).length)}</small>
              </div>
              <div className="in-ch">
                <button className={`ms m${c.mute ? ' on' : ''}`} aria-pressed={c.mute} onClick={() => d({ type: 'ch', id, fn: (x) => ({ ...x, mute: !x.mute }) })}>M</button>
                <HSlider label={`Nivel de ${cfg.name}`} value={c.fader} toPos={dbToPos} fromPos={posToDb} snap={(x) => (Math.abs(x) < 1 ? 0 : Math.round(x * 2) / 2)} color={CH_META[id].color} onChange={(v) => d({ type: 'ch', id, fn: (x) => ({ ...x, fader: v }) })} />
                <b>{fmtDb(c.fader)}</b>
                <button className="mini" onClick={() => d({ type: 'editor', id: id as ChId })}>Editor</button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="hint2">{cfgHint(s.inputs)}</p>
    </div>
  );
}

function capText(device: string | null, side: string, users: number) {
  if (!device) return 'Sin fuente asignada';
  const cap = engine.inputCaps(device);
  const parts: string[] = [];
  if (cap) {
    parts.push(`${cap.channels} ${cap.channels === 1 ? 'canal efectivo' : 'canales efectivos'}`);
    if (cap.channels < 2 && side !== 'mix') parts.push('sin lado L/R: se usa la suma');
    if (cap.settings.echoCancellation || cap.settings.noiseSuppression || cap.settings.autoGainControl) parts.push('el navegador mantiene procesamiento de voz');
    if (cap.settings.sampleRate) parts.push(`${cap.settings.sampleRate / 1000} kHz`);
  } else parts.push('abriendo…');
  if (users > 1) parts.push(`misma fuente que otras ${users - 1} entradas`);
  return parts.join(' · ');
}

function cfgHint(inputs: Record<InId, InputCfg>) {
  const cond = IN_IDS.filter((id) => inputs[id].type === 'condensador').map((id) => inputs[id].name);
  return cond.length ? `Recuerde activar +48V en la interfaz para: ${cond.join(', ')}.` : 'Ninguna entrada necesita +48V con la configuración actual.';
}
