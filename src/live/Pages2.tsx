import { useEffect, useMemo, useRef, useState } from 'react';
import { useLive, Icon } from './ctx';
import { ModuleHead } from './nav';
import { CH_META, chIcon, chName, mixDataOf } from './data';
import { CH_IDS, STEM_CATS } from './types';
import type { RecallMask, StemCat } from './types';
import { engine, meter } from './engine';
import { meterBus } from '../meterEngine';
import { HSlider } from '../components/HSlider';
import { dbToPos, fmtDb, posToDb } from '../util';
import { net, NetClient } from './net';
import type { Role } from './perms';
import { ROLE_LABEL } from './perms';
import { envCaps, whyNot } from './env';
import { MIXERS, dbToTrim, trimToDb, x32PreampLabel, xairPreampOf, dbToFader, dbToGain, faderToDb, gainToDb, modelFromInfo } from './mixers';
import type { MixerModel } from './mixers';

const dbSlider = (label: string, v: number, on: (x: number) => void, color?: string, disabled?: boolean) => (
  <HSlider label={label} value={v} toPos={dbToPos} fromPos={posToDb} snap={(x) => (Math.abs(x) < 1 ? 0 : Math.round(x * 2) / 2)} onChange={on} color={color} disabled={disabled} />
);

/** Medidor horizontal suscrito a una clave del bus de medición (dBFS digitales, no dBu). */
export function HMeter({ k, label }: { k: string; label?: string }) {
  const bar = useRef<HTMLDivElement>(null);
  const pk = useRef<HTMLDivElement>(null);
  useEffect(() => meterBus.subscribe(k, (lv) => {
    const v = lv ? Math.max(lv.l, lv.r) : -90;
    const p = lv ? Math.max(lv.pl, lv.pr) : -90;
    if (bar.current) bar.current.style.width = `${Math.max(0, (v + 60) / 60) * 100}%`;
    if (pk.current) {
      pk.current.style.left = `${Math.max(0, (p + 60) / 60) * 100}%`;
      pk.current.style.background = p > -1 ? '#e5483f' : p > -12 ? '#e0a93a' : '#e9f1f3';
    }
  }), [k]);
  return (
    <div className="inmeter" aria-label={label ?? 'Nivel (dBFS)'} title="dBFS digitales, medidos en el navegador">
      <div ref={bar} className="inm-bar" />
      <div ref={pk} className="inm-pk" />
    </div>
  );
}

/* ---------- Monitores: buses con envíos pre/post ---------- */
export function BusesPage() {
  const { s, d, can, netState, role } = useLive();
  const own = role === 'musico' ? netState.ownBus : '';
  const visible = own ? s.buses.filter((b) => b.id === own) : s.buses;
  const [sel, setSel] = useState(visible[0]?.id ?? '');
  const bus = s.buses.find((b) => b.id === sel) ?? visible[0];
  const edit = can('buses');
  const editSends = edit || (!!own && bus?.id === own);
  const physical = (id: string) => {
    const pair = s.outputs.buses[id] ?? -1;
    const ch = engine.outputInfo().channels;
    return pair >= 0 && ch >= (pair + 1) * 2 ? `salida ${pair * 2 + 1}-${pair * 2 + 2}` : 'sin salida física';
  };
  return (
    <div className="mpage">
      <ModuleHead title="Monitores y buses" desc="Cada bus es una mezcla independiente. Los envíos PRE no dependen del fader de sala (habituales en monitores); los POST sí. El mute del canal corta ambos." >
        {edit && <button className="mini" onClick={() => d({ type: 'busAdd' })}><Icon name="plus" size={14} /> Añadir bus</button>}
      </ModuleHead>
      <div className="buscards">
        {visible.map((b) => (
          <article key={b.id} className={`buscard${bus?.id === b.id ? ' on' : ''}`} style={{ ['--cc' as string]: b.color }}>
            <header>
              <input aria-label="Nombre del bus" value={b.name} maxLength={28} disabled={!edit} onChange={(e) => d({ type: 'busEdit', id: b.id, patch: { name: e.target.value } })} />
              <button className={`mini${bus?.id === b.id ? ' on' : ''}`} onClick={() => setSel(b.id)}>{bus?.id === b.id ? 'Editando' : 'Editar envíos'}</button>
            </header>
            <div className="bus-master">
              <span>Master</span>
              {dbSlider(`Master de ${b.name}`, b.level, (v) => d({ type: 'busEdit', id: b.id, patch: { level: v } }), b.color, !edit)}
              <b>{fmtDb(b.level)}</b>
              <button className={`ms m${b.mute ? ' on' : ''}`} disabled={!edit} aria-pressed={b.mute} onClick={() => d({ type: 'busEdit', id: b.id, patch: { mute: !b.mute } })}>M</button>
            </div>
            <HMeter k={`bus:${b.id}`} label={`Nivel de ${b.name}`} />
            <footer>
              <small>{physical(b.id)}</small>
              {edit && s.buses.length > 1 && <button className="mini" onClick={() => d({ type: 'busRemove', id: b.id })}>Quitar</button>}
            </footer>
          </article>
        ))}
      </div>
      {bus && (
        <section className="lpanel">
          <header className="ph"><Icon name="headphones" /><h3>Envíos a «{bus.name}»</h3><span className="chip">Bus en edición</span></header>
          <div className="sendtable">
            {CH_IDS.map((id) => {
              const snd = s.console[id].aux[bus.id] ?? { db: -90, pre: true };
              return (
                <div key={id} className="send-row" style={{ ['--cc' as string]: CH_META[id].color }}>
                  <span className="rt-n"><Icon name={chIcon(id)} size={15} /> {chName(s, id)}</span>
                  {dbSlider(`${chName(s, id)} a ${bus.name}`, snd.db, (v) => d({ type: 'aux', ch: id, bus: bus.id, patch: { db: v } }), bus.color, !editSends)}
                  <b>{fmtDb(snd.db)}</b>
                  <div className="segx sm" role="group" aria-label="Punto de toma">
                    <button className={snd.pre ? 'on' : ''} disabled={!editSends} onClick={() => d({ type: 'aux', ch: id, bus: bus.id, patch: { pre: true } })}>PRE</button>
                    <button className={!snd.pre ? 'on' : ''} disabled={!editSends} onClick={() => d({ type: 'aux', ch: id, bus: bus.id, patch: { pre: false } })}>POST</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/* ---------- Salidas físicas y escucha ---------- */
export function OutputsPage() {
  const { s, d, can, audioOn } = useLive();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [, force] = useState(0);
  const info = engine.outputInfo();
  const pairs = Math.max(1, Math.floor(info.channels / 2));
  const edit = can('outputs');
  useEffect(() => {
    void engine.outputDevices().then(setDevices);
    engine.onDevices = () => force((x) => x + 1);
    return () => {
      engine.onDevices = null;
    };
  }, []);
  const pairOpts = (allowNone: boolean) => [
    ...(allowNone ? [<option key="-1" value={-1}>Sin salida física</option>] : []),
    ...Array.from({ length: pairs }, (_, i) => <option key={i} value={i}>Salidas {i * 2 + 1}-{i * 2 + 2}</option>),
  ];
  return (
    <div className="mpage">
      <ModuleHead title="Salidas, escucha y grabación" desc="Asigne el master, la escucha del operador y cada monitor a las salidas reales del dispositivo. Un bus lógico no es una salida física: si el dispositivo tiene un solo par, los monitores no salen por separado." />
      {!envCaps().sink && <p className="inwarn">{whyNot(envCaps(), 'sink')}</p>}
      <div className="outgrid">
        <section className="ced-card">
          <h3>Dispositivo de salida</h3>
          {info.sinkSupported ? (
            <select aria-label="Dispositivo de salida" disabled={!edit} value={s.outputs.sink} onChange={async (e) => {
              const v = e.target.value;
              try {
                await engine.setSink(v);
                d({ type: 'outputs', patch: { sink: v } });
              } catch {
                d({ type: 'toast', text: 'No se pudo usar ese dispositivo de salida' });
              }
            }}>
              <option value="">Predeterminado del sistema</option>
              {devices.filter((x) => x.deviceId && x.deviceId !== 'default').map((x) => <option key={x.deviceId} value={x.deviceId}>{x.label || 'Salida de audio'}</option>)}
            </select>
          ) : <p className="hint2">Este navegador no permite elegir la salida desde la página; se usa la del sistema. Chrome y Edge sí lo permiten.</p>}
          <p className="outinfo">{audioOn ? <>Canales de salida detectados: <b>{info.channels}</b> ({pairs} {pairs === 1 ? 'par' : 'pares'}).</> : 'Active el audio (toque cualquier control) para detectar los canales de salida.'}</p>
          {info.channels <= 2 && audioOn && <p className="inwarn">Con un solo par estéreo, los monitores y la escucha no tienen salida propia. Use una interfaz con más salidas, o envíe los monitores desde su mesa.</p>}
        </section>
        <section className="ced-card">
          <h3>Asignación</h3>
          <label className="outrow">Master (sala)
            <select disabled={!edit} value={s.outputs.main} onChange={(e) => d({ type: 'outputs', patch: { main: Number(e.target.value) } })}>{pairOpts(false)}</select>
          </label>
          <label className="outrow">Escucha del operador (solo / PFL)
            <select disabled={!edit} value={s.outputs.cue} onChange={(e) => d({ type: 'outputs', patch: { cue: Number(e.target.value) } })}>{pairOpts(true)}</select>
          </label>
          {s.buses.map((b) => (
            <label key={b.id} className="outrow" style={{ ['--cc' as string]: b.color }}>{b.name}
              <select disabled={!edit} value={s.outputs.buses[b.id] ?? -1} onChange={(e) => d({ type: 'outputs', patch: { buses: { ...s.outputs.buses, [b.id]: Number(e.target.value) } } })}>{pairOpts(true)}</select>
            </label>
          ))}
        </section>
        <section className="ced-card">
          <h3>Escucha (solo)</h3>
          <p className="hint2">El botón S de cada canal envía su señal antes del fader (PFL) a la escucha. Nunca silencia la sala.</p>
          <HMeter k="cue" label="Nivel de la escucha" />
          <label className="chk">
            <input type="checkbox" disabled={!edit} checked={s.outputs.cueReplacesMain} onChange={(e) => d({ type: 'outputs', patch: { cueReplacesMain: e.target.checked } })} />
            Solo en ensayo: con un único par de salida, la escucha reemplaza al master mientras haya un solo activo
          </label>
          {s.outputs.cueReplacesMain && <p className="inerr">Atención: con esta opción, activar un solo cambia lo que oye la sala. Desactívela antes del servicio.</p>}
        </section>
        <section className="ced-card">
          <h3>Grabación</h3>
          <label className="outrow">Graba
            <select disabled={!edit} value={s.outputs.rec} onChange={(e) => d({ type: 'outputs', patch: { rec: e.target.value } })}>
              <option value="main">Master de sala (sin click ni guía)</option>
              {s.buses.map((b) => <option key={b.id} value={b.id}>{b.name} (monitor)</option>)}
            </select>
          </label>
          <p className="hint2">Formato real del navegador (WebM/Opus en Chrome y Edge, M4A en Safari). No se renombra a WAV. Graba solo la mezcla elegida, no multipista.</p>
        </section>
      </div>
    </div>
  );
}

/* ---------- Escenas de mezcla ---------- */
const MASK_LABEL: Record<keyof RecallMask, string> = { faders: 'Faders', mutes: 'Mutes', pans: 'Panoramas', proc: 'Filtros, EQ y compresor', sends: 'Envíos a monitores y efectos', buses: 'Buses (nombres y masters)', fx: 'Efectos', master: 'Master de sala', trims: 'Trim de entradas' };

export function MixScenesPage() {
  const { s, d, can } = useLive();
  const [name, setName] = useState('');
  const [full, setFull] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const edit = can('mixscenes');
  const areas = (Object.keys(MASK_LABEL) as (keyof RecallMask)[]).filter((k) => s.recallMask[k]).map((k) => MASK_LABEL[k].toLowerCase());
  const current = useMemo(() => JSON.stringify(mixDataOf(s)), [s.console, s.buses, s.master, s.masterMute, s.fx, s.inputs]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = s.mixScenes.find((m) => m.id === s.activeMix);
  const changed = !!active && JSON.stringify(active.data) !== current;
  return (
    <div className="mpage">
      <ModuleHead title="Escenas de mezcla" desc="Guardan la consola del sonidista: faders, mutes, panoramas, procesamiento, envíos, buses y efectos. Las escenas musicales del director nunca las modifican." />
      <div className="mixsc-layout">
        <section className="lpanel">
          <header className="ph"><Icon name="save" /><h3>Biblioteca</h3>{active && <span className={`badge${changed ? ' warn' : ''}`}>{changed ? `«${active.name}» con cambios` : `«${active.name}» cargada`}</span>}</header>
          <form className="gp-row" onSubmit={(e) => { e.preventDefault(); d({ type: 'mixSave', name, full }); setName(''); }}>
            <input id="mix-new" aria-label="Nombre de la nueva escena de mezcla" placeholder="Ej.: Domingo con banda completa" value={name} maxLength={32} disabled={!edit} onChange={(e) => setName(e.target.value)} />
            <button className="mini on" type="submit" disabled={!edit}>Guardar como nueva</button>
          </form>
          <label className="chk"><input type="checkbox" checked={full} disabled={!edit} onChange={(e) => setFull(e.target.checked)} /> Escena completa: recordar también la canción y la sección actuales</label>
          {s.trash && <button className="mini" onClick={() => d({ type: 'mixUndo' })}>Deshacer eliminación de «{s.trash.name}»</button>}
          <div className="mixlist">
            {s.mixScenes.length === 0 && <p className="hint2">Todavía no hay escenas de mezcla. Ajuste la consola y guárdela con un nombre.</p>}
            {s.mixScenes.map((m) => (
              <article key={m.id} className={`mixitem${m.id === s.activeMix ? ' on' : ''}`}>
                <input aria-label="Nombre" value={m.name} maxLength={32} disabled={!edit} onChange={(e) => d({ type: 'mixRename', id: m.id, name: e.target.value })} />
                <small>{m.ref ? 'Completa · ' : 'Mezcla · '}v{m.version} · {new Date(m.savedAt).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}{m.ref ? ` · ${s.songs.find((x) => x.id === m.ref!.songId)?.title ?? 'canción no disponible'}` : ''}</small>
                {confirm === m.id && (
                  <div className="gp-confirm">
                    <p>Se aplicará: {areas.join(', ') || 'nada (máscara vacía)'}{m.ref ? `; y se irá a «${s.songs.find((x) => x.id === m.ref!.songId)?.title ?? '?'}»` : ''}. Canales protegidos: {s.protectedCh.length ? s.protectedCh.map((c) => chName(s, c)).join(', ') : 'ninguno'}.</p>
                    <div className="gp-row"><button className="mini on" onClick={() => { d({ type: 'mixLoad', id: m.id }); setConfirm(null); }}>Aplicar</button><button className="mini" onClick={() => setConfirm(null)}>Cancelar</button></div>
                  </div>
                )}
                <div className="gp-row">
                  <button className="mini on" disabled={!edit} onClick={() => (m.ref ? setConfirm(m.id) : d({ type: 'mixLoad', id: m.id }))}>Recuperar</button>
                  <button className={`mini${armed === m.id ? ' warn' : ''}`} disabled={!edit} onClick={() => {
                    if (armed === m.id) {
                      d({ type: 'mixSave', id: m.id });
                      setArmed(null);
                    } else {
                      setArmed(m.id);
                      window.setTimeout(() => setArmed((a) => (a === m.id ? null : a)), 3500);
                    }
                  }}>{armed === m.id ? 'Confirmar sobrescribir' : 'Actualizar con la mezcla actual'}</button>
                  <button className="mini" disabled={!edit} onClick={() => d({ type: 'mixDup', id: m.id })}>Duplicar</button>
                  <button className="mini" disabled={!edit} onClick={() => d({ type: 'mixDelete', id: m.id })}>Eliminar</button>
                </div>
              </article>
            ))}
          </div>
        </section>
        <section className="lpanel">
          <header className="ph"><Icon name="sliders" /><h3>Qué se recupera</h3></header>
          <div className="maskgrid">
            {(Object.keys(MASK_LABEL) as (keyof RecallMask)[]).map((k) => (
              <label key={k} className="chk">
                <input type="checkbox" disabled={!edit} checked={s.recallMask[k]} onChange={(e) => d({ type: 'mask', patch: { [k]: e.target.checked } })} /> {MASK_LABEL[k]}
              </label>
            ))}
          </div>
          <h4 className="sub">Canales protegidos (no cambian al recuperar)</h4>
          <div className="protgrid">
            {CH_IDS.map((id) => (
              <button key={id} className={`mini${s.protectedCh.includes(id) ? ' on' : ''}`} disabled={!edit} aria-pressed={s.protectedCh.includes(id)} onClick={() => d({ type: 'protect', ch: id, on: !s.protectedCh.includes(id) })} style={{ ['--cc' as string]: CH_META[id].color }}>
                {s.protectedCh.includes(id) ? '🔒 ' : ''}{chName(s, id)}
              </button>
            ))}
          </div>
          <p className="hint2">Por defecto se protege al pastor y no se recuperan el master ni el trim: así una escena no sorprende a la sala ni a los micrófonos.</p>
        </section>
      </div>
    </div>
  );
}

/* ---------- Multitrack ---------- */
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function StemsPage() {
  const { d, song, can, assets, addStems, remote } = useLive();
  const input = useRef<HTMLInputElement>(null);
  const edit = can('music');
  const total = song.arr.reduce((a, x) => a + x.bars, 0) * meter(song.ts, song.bpm).bar;
  const missing = song.stems.filter((st) => assets[st.asset] === 'missing' || assets[st.asset] === 'error');
  const loading = song.stems.filter((st) => !assets[st.asset] || assets[st.asset] === 'loading');
  const ready = song.stems.length > 0 && !missing.length && !loading.length;
  return (
    <div className="mpage">
      <ModuleHead title={`Multitrack · ${song.title}`} desc="Varios stems de la canción que arrancan en el mismo instante del reloj de audio y siguen alineados al pausar, cambiar de sección o repetir. El click y la guía van solo a monitores.">
        <input ref={input} type="file" accept="audio/*" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) void addStems(f); e.target.value = ''; }} />
        <button className="mini on" disabled={!edit || remote} onClick={() => input.current?.click()}><Icon name="upload" size={14} /> Importar stems…</button>
      </ModuleHead>
      <p className={ready ? 'inok' : song.stems.length ? 'inwarn' : 'hint2'}>
        {song.stems.length === 0 ? 'Esta canción todavía no tiene stems. Importe varios archivos a la vez (batería, bajo, teclados, guitarras, voces, ambiente, click, guía).' : ready ? `Arreglo listo: ${song.stems.length} stems cargados.` : `${missing.length ? `Faltan ${missing.length} archivos (${missing.map((x) => x.name).join(', ')}). ` : ''}${loading.length ? `Cargando ${loading.length}…` : ''}`}
      </p>
      <label className="chk">
        <input type="checkbox" disabled={!edit} checked={song.stemsOnly} onChange={(e) => d({ type: 'stemsOnly', on: e.target.checked })} />
        Usar solo las pistas en esta canción (silencia los instrumentos sintetizados; los micrófonos siguen igual)
      </label>
      <div className="stemlist">
        {song.stems.map((st) => {
          const status = assets[st.asset] ?? 'loading';
          const short = st.duration + st.offset < total - 0.5;
          return (
            <div key={st.id} className={`stem-row ${status}`}>
              <input aria-label="Nombre del stem" value={st.name} maxLength={32} disabled={!edit} onChange={(e) => d({ type: 'stemEdit', id: st.id, patch: { name: e.target.value } })} />
              <select aria-label="Categoría" value={st.cat} disabled={!edit} onChange={(e) => d({ type: 'stemEdit', id: st.id, patch: { cat: e.target.value as StemCat } })}>
                {STEM_CATS.map((c) => <option key={c.id} value={c.id}>{c.label}{c.id === 'click' || c.id === 'guia' ? ' (solo monitores)' : ''}</option>)}
              </select>
              {dbSlider(`Nivel de ${st.name}`, st.db, (v) => d({ type: 'stemEdit', id: st.id, patch: { db: v } }), undefined, !edit)}
              <b>{fmtDb(st.db)}</b>
              <button className={`ms m${st.mute ? ' on' : ''}`} disabled={!edit} aria-pressed={st.mute} onClick={() => d({ type: 'stemEdit', id: st.id, patch: { mute: !st.mute } })}>M</button>
              <label className="offset">Inicio
                <input type="number" step="0.01" value={st.offset} disabled={!edit} onChange={(e) => d({ type: 'stemEdit', id: st.id, patch: { offset: Number(e.target.value) || 0 } })} />s
              </label>
              <small>{mmss(st.duration)}{short ? ' · termina antes que la canción' : ''} · {status === 'ready' ? 'listo' : status === 'loading' ? 'cargando' : status === 'missing' ? 'falta el archivo' : 'error al decodificar'}</small>
              <button className="iconbtn" aria-label={`Quitar ${st.name}`} disabled={!edit} onClick={() => d({ type: 'stemRemove', id: st.id })}><Icon name="x" size={14} /></button>
            </div>
          );
        })}
      </div>
      <p className="hint2">Duración del arreglo: {mmss(total)} a {song.bpm} BPM. Cambiar el BPM o la tonalidad no estira ni transpone el audio grabado: solo cambia la parte sintetizada. Un stem más corto simplemente se calla al terminar.</p>
    </div>
  );
}

/* ---------- Red: colaboración y mesa digital ---------- */
export function NetworkPage() {
  const { s, netState, role, remote, can } = useLive();
  const [url, setUrl] = useState(NetClient.defaultUrl());
  const [pin, setPin] = useState('');
  const [asRole, setAsRole] = useState<Role>('mixer');
  const [host, setHost] = useState(true);
  const [ownBus, setOwnBus] = useState(s.buses[0]?.id ?? '');
  const [name, setName] = useState('');
  const connected = netState.status === 'on';
  const https = window.location.protocol === 'https:';
  return (
    <div className="mpage">
      <ModuleHead title="Red: colaboración y mesa digital" desc="Para controlar desde tablets y para manejar una mesa digital por IP se usa el puente local de SONIDO en el computador anfitrión (Ethernet o Wi-Fi). Ver docs/RED-Y-MESAS.md." />
      <CapsCard />
      {https && <p className="inwarn">Esta página se abrió por HTTPS. Desde aquí solo puede conectarse a un puente en este mismo computador (127.0.0.1). Para tablets, abra la app desde el puente: <b>http://IP-del-computador:8790</b>.</p>}
      <div className="outgrid">
        <section className="ced-card">
          <h3>Puente local {connected ? `· conectado como ${ROLE_LABEL[role]}${netState.host ? ' (anfitrión)' : ''}` : ''}</h3>
          {!connected ? (
            <form className="netform" onSubmit={(e) => {
              e.preventDefault();
              net.connect(url, { role: host ? 'all' : asRole, pin, host, name: name || (host ? 'Anfitrión' : ROLE_LABEL[asRole]), ownBus: asRole === 'musico' ? ownBus : undefined });
            }}>
              <label>Dirección<input value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Dirección del puente" /></label>
              <label className="chk"><input type="checkbox" checked={host} onChange={(e) => setHost(e.target.checked)} /> Este equipo es el anfitrión (produce el audio y aplica las órdenes)</label>
              {!host && (
                <label>Rol
                  <select value={asRole} onChange={(e) => setAsRole(e.target.value as Role)}>
                    <option value="mixer">Sonidista</option>
                    <option value="director">Director de alabanza</option>
                    <option value="musico">Músico (su mezcla de monitor)</option>
                  </select>
                </label>
              )}
              {!host && asRole === 'musico' && (
                <label>Su monitor<select value={ownBus} onChange={(e) => setOwnBus(e.target.value)}>{s.buses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
              )}
              <label>PIN del rol<input value={pin} onChange={(e) => setPin(e.target.value)} inputMode="numeric" aria-label="PIN" placeholder="Lo muestra el puente al iniciar" /></label>
              <label>Nombre de este equipo<input value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="Ej.: Tablet del director" /></label>
              <button className="mini on" type="submit">Conectar</button>
              {netState.status === 'error' && <p className="inerr">{netState.detail || 'No se pudo conectar.'}</p>}
              {netState.status === 'connecting' && <p className="hint2">Conectando…</p>}
            </form>
          ) : (
            <>
              <p className="hint2">{netState.host ? 'Este equipo produce el audio. Las tablets envían órdenes; aquí se validan y se aplican.' : netState.hostPresent ? 'Este equipo controla al anfitrión: no produce audio.' : 'Esperando al equipo anfitrión…'}</p>
              <ul className="peers">
                {netState.peers.map((p) => <li key={p.id}><i className={p.host ? 'host' : ''} /> {p.name} · {ROLE_LABEL[p.role]}{p.host ? ' · anfitrión' : ''}</li>)}
              </ul>
              <button className="mini" onClick={() => net.close()}>Desconectar</button>
            </>
          )}
        </section>
        <MixerCard connected={connected} canControl={!remote ? can('console') : role === 'mixer' || role === 'all'} />
      </div>
    </div>
  );
}

/** Lo que este dispositivo puede hacer de verdad, según la dirección y el navegador. */
function CapsCard() {
  const { remote, netState } = useLive();
  const c = envCaps();
  const row = (label: string, ok: boolean, why?: string | null) => (
    <li className={ok ? 'ok' : 'no'}><b>{ok ? 'Sí' : 'No'}</b> {label}{!ok && why ? <small> — {why}</small> : null}</li>
  );
  return (
    <section className="ced-card capscard">
      <h3>Este dispositivo</h3>
      <p className="hint2">
        Papel: <b>{remote ? 'control remoto (no produce audio)' : netState.status === 'on' && netState.host ? 'anfitrión (produce el audio)' : 'equipo local (produce el audio)'}</b> · Dirección {c.origin} · {c.secure ? 'contexto seguro' : 'sin contexto seguro'}
      </p>
      <ul className="caps">
        {row('Micrófonos e interfaz de audio', c.capture && !remote, remote ? 'en un control remoto las entradas son las del anfitrión' : whyNot(c, 'capture'))}
        {row('Teclado MIDI', c.midi && !remote, remote ? 'el MIDI se conecta al anfitrión' : whyNot(c, 'midi'))}
        {row('Elegir salida de audio', c.sink && !remote, remote ? 'la salida es la del anfitrión' : whyNot(c, 'sink'))}
        {row('Controlar al anfitrión por la red', true)}
      </ul>
      {!c.secure && !remote && c.hostUrl && <p className="hint2">¿Este es el PC anfitrión? Ábralo como <a href={c.hostUrl}>{c.hostUrl}</a>.</p>}
    </section>
  );
}

function MixerCard({ connected, canControl }: { connected: boolean; canControl: boolean }) {
  const { netState } = useLive();
  const [ip, setIp] = useState('192.168.1.');
  const [model, setModel] = useState<MixerModel>('xair');
  const mixer = netState.mixer;
  return (
    <section className="ced-card">
      <h3>Mesa digital por IP</h3>
      {!connected ? (
        <p className="hint2">Conecte primero el puente local. Mesas analógicas: no tienen control remoto; SONIDO trabaja con ellas como interfaz de audio (USB o entradas/salidas de línea). Ver la matriz de compatibilidad.</p>
      ) : !mixer ? (
        <>
          <div className="gp-row">
            <button className="mini on" disabled={!canControl} onClick={() => net.mixer({ op: 'discover' })}>Buscar mesas en la red</button>
          </div>
          <ul className="peers">
            {netState.mixers.map((m) => (
              <li key={m.ip}>
                <i className="host" /> {m.name} · {m.model} · {m.ip}
                <button className="mini" disabled={!canControl} onClick={() => net.mixer({ op: 'connect', ip: m.ip, port: m.port, model: m.model })}>Conectar</button>
              </li>
            ))}
          </ul>
          <form className="netform" onSubmit={(e) => { e.preventDefault(); net.mixer({ op: 'connect', ip, port: MIXERS[model].port, model: model === 'x32' ? 'X32' : 'XR18' }); }}>
            <label>IP de la mesa<input value={ip} onChange={(e) => setIp(e.target.value)} aria-label="IP de la mesa" /></label>
            <label>Modelo
              <select value={model} onChange={(e) => setModel(e.target.value as MixerModel)}>
                {Object.values(MIXERS).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <button className="mini" type="submit" disabled={!canControl}>Conectar por IP</button>
          </form>
          {netState.detail && <p className="inerr">{netState.detail}</p>}
        </>
      ) : (
        <ExternalMixer canControl={canControl} />
      )}
    </section>
  );
}

/** Superficie de control de la mesa externa: lo que se mueve aquí cambia la mesa física. */
function ExternalMixer({ canControl }: { canControl: boolean }) {
  const { netState } = useLive();
  const mixer = netState.mixer!;
  const spec = MIXERS[modelFromInfo(mixer.model)];
  const [bank, setBank] = useState(0);
  const [send, setSend] = useState(0); // 0 = sala; 1..n = bus
  const v = netState.values;
  const chs = Array.from({ length: 8 }, (_, i) => bank * 8 + i + 1).filter((n) => n <= spec.channels);
  // Qué preamp físico alimenta cada canal. Sin saberlo no se envían ganancia ni +48V.
  const mapKey = `sonido.x32.preamps.${mixer.name}`;
  const [map, setMap] = useState<Record<number, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem(mapKey) ?? '{}') as Record<number, number>;
    } catch {
      return {};
    }
  });
  const assign = (n: number, idx: number) => {
    const next = { ...map, [n]: idx };
    setMap(next);
    try {
      localStorage.setItem(mapKey, JSON.stringify(next));
    } catch {
      /* sin almacenamiento: vale para esta sesión */
    }
  };
  const preampOf = (n: number): number | null =>
    spec.preampMode === 'insrc' ? xairPreampOf(v[`${spec.ch(n)}/config/insrc`]) : (map[n] ?? -1) >= 0 ? map[n] : null;
  const known = chs.map((n) => preampOf(n) ?? -1).join(',');
  useEffect(() => {
    const addrs: string[] = [];
    for (const n of chs) {
      const c = spec.ch(n);
      addrs.push(`${c}/config/name`, `${c}/mix/fader`, `${c}/mix/on`, `${c}/mix/pan`);
      if (spec.preampMode === 'insrc') addrs.push(`${c}/config/insrc`);
      const p = preampOf(n);
      if (p !== null) addrs.push(`${spec.headampAt(p)}/gain`, `${spec.headampAt(p)}/phantom`);
      if (spec.trim) addrs.push(spec.trim(n));
      if (send > 0) addrs.push(spec.sendLevel(n, send));
    }
    addrs.push(`${spec.main}/mix/fader`, `${spec.main}/mix/on`);
    net.mixer({ op: 'get', addresses: addrs });
  }, [bank, send, mixer.ip, known]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (address: string, type: 'f' | 'i', value: number) => net.mixer({ op: 'set', address, type, value });
  const num = (a: string, def = 0) => (typeof v[a] === 'number' ? (v[a] as number) : def);
  return (
    <div className="xmixer">
      <p className="hint2">Conectado a <b>{mixer.name}</b> ({mixer.model}, {mixer.ip}). Los cambios se aplican en la <b>mesa física</b>, no en el audio de este computador.</p>
      <p className="xtested">{spec.tested}</p>
      <div className="gp-row">
        <div className="segx sm" role="group" aria-label="Banco">
          {Array.from({ length: Math.ceil(spec.channels / 8) }, (_, i) => <button key={i} className={bank === i ? 'on' : ''} onClick={() => setBank(i)}>{i * 8 + 1}-{Math.min(spec.channels, i * 8 + 8)}</button>)}
        </div>
        <label className="outrow inline">Mezcla
          <select value={send} onChange={(e) => setSend(Number(e.target.value))}>
            <option value={0}>Sala (LR)</option>
            {Array.from({ length: spec.buses }, (_, i) => <option key={i} value={i + 1}>Bus {i + 1}</option>)}
          </select>
        </label>
        <button className="mini" onClick={() => net.mixer({ op: 'disconnect' })}>Desconectar mesa</button>
      </div>
      <div className="xstrips">
        {chs.map((n) => {
          const c = spec.ch(n);
          const pre = preampOf(n);
          const h = pre === null ? null : spec.headampAt(pre);
          const insrc = v[`${c}/config/insrc`];
          const lvlAddr = send > 0 ? spec.sendLevel(n, send) : `${c}/mix/fader`;
          const lvl = num(lvlAddr);
          const on = num(`${c}/mix/on`, 1) === 1;
          const meterDb = netState.meters[n - 1];
          return (
            <div key={n} className="xstrip">
              <b className="xname" title={String(v[`${c}/config/name`] ?? '')}>{String(v[`${c}/config/name`] || `Ch ${n}`)}</b>
              {spec.preampMode === 'manual' && (
                <label className="xg">Preamp
                  <select aria-label={`Preamp físico del canal ${n}`} value={map[n] ?? -1} disabled={!canControl} onChange={(e) => assign(n, Number(e.target.value))}>
                    {[-1, ...Array.from({ length: 128 }, (_, i) => i)].map((i) => <option key={i} value={i}>{x32PreampLabel(i)}</option>)}
                  </select>
                </label>
              )}
              {!h && (
                <small className="xnote">
                  {spec.preampMode === 'insrc'
                    ? insrc === undefined ? 'Fuente sin leer: ganancia y +48V bloqueados' : 'Fuente sin preamp (USB/aux): sin ganancia ni +48V'
                    : 'Asigne el preamp para ganancia y +48V'}
                </small>
              )}
              {h && (
                <>
                  {spec.preampMode === 'manual' && <small className="xnote">{x32PreampLabel(pre!)}</small>}
                  <label className="xg">Gan. {gainToDb(num(`${h}/gain`, 0.17)).toFixed(0)} dB
                    <HSlider label={`Ganancia canal ${n}`} value={gainToDb(num(`${h}/gain`, 0.17))} toPos={(x) => (x + 12) / 72} fromPos={(p) => p * 72 - 12} snap={(x) => Math.round(x * 2) / 2} disabled={!canControl} onChange={(x) => set(`${h}/gain`, 'f', dbToGain(x))} />
                  </label>
                  <button className={`mini${num(`${h}/phantom`) === 1 ? ' warn' : ''}`} disabled={!canControl} aria-pressed={num(`${h}/phantom`) === 1} onClick={() => set(`${h}/phantom`, 'i', num(`${h}/phantom`) === 1 ? 0 : 1)}>+48V {num(`${h}/phantom`) === 1 ? 'ON' : 'OFF'}</button>
                </>
              )}
              {spec.trim && (
                <label className="xg">Trim digital {fmtDb(trimToDb(num(spec.trim(n), 0.5)))}
                  <HSlider label={`Trim digital canal ${n}`} value={trimToDb(num(spec.trim(n), 0.5))} toPos={(x) => (x + 18) / 36} fromPos={(p) => p * 36 - 18} snap={(x) => Math.round(x * 2) / 2} disabled={!canControl} onChange={(x) => set(spec.trim!(n), 'f', dbToTrim(x))} />
                </label>
              )}
              <button className={`ms m${!on ? ' on' : ''}`} disabled={!canControl} aria-pressed={!on} onClick={() => set(`${c}/mix/on`, 'i', on ? 0 : 1)}>M</button>
              <label className="xg">{send > 0 ? `Envío bus ${send}` : 'Fader'} {fmtDb(faderToDb(lvl))}
                <HSlider label={`Nivel canal ${n}`} value={faderToDb(lvl)} toPos={dbToPos} fromPos={posToDb} snap={(x) => Math.round(x * 2) / 2} disabled={!canControl} onChange={(x) => set(lvlAddr, 'f', dbToFader(x))} />
              </label>
              {send === 0 && (() => {
                const pan = Math.round((num(`${c}/mix/pan`, 0.5) - 0.5) * 200);
                return (
                  <label className="xg">Pan {pan === 0 ? 'C' : pan < 0 ? `I${-pan}` : `D${pan}`}
                    <HSlider label={`Panorama canal ${n}`} value={pan} toPos={(x) => (x + 100) / 200} fromPos={(p) => p * 200 - 100} snap={(x) => Math.round(x / 2) * 2} disabled={!canControl} onChange={(x) => set(`${c}/mix/pan`, 'f', x / 200 + 0.5)} />
                  </label>
                );
              })()}
              <div className="xmeter" title="Medidor enviado por la mesa"><i style={{ width: `${meterDb === undefined ? 0 : Math.max(0, (meterDb + 60) / 60) * 100}%` }} /></div>
            </div>
          );
        })}
        <div className="xstrip master">
          <b className="xname">Master LR</b>
          <button className={`ms m${num(`${spec.main}/mix/on`, 1) !== 1 ? ' on' : ''}`} disabled={!canControl} onClick={() => set(`${spec.main}/mix/on`, 'i', num(`${spec.main}/mix/on`, 1) === 1 ? 0 : 1)}>M</button>
          <label className="xg">Fader {fmtDb(faderToDb(num(`${spec.main}/mix/fader`)))}
            <HSlider label="Master LR de la mesa" value={faderToDb(num(`${spec.main}/mix/fader`))} toPos={dbToPos} fromPos={posToDb} snap={(x) => Math.round(x * 2) / 2} disabled={!canControl} onChange={(x) => set(`${spec.main}/mix/fader`, 'f', dbToFader(x))} />
          </label>
        </div>
      </div>
    </div>
  );
}


