import { useRef } from 'react';
import { useLive, Icon } from './ctx';
import { CH_META, chIcon, chName } from './data';
import { CH_IDS, INST_IDS, IN_IDS, isInput } from './types';
import type { ChId, StripGroup } from './types';
import { Expand } from './nav';
import { Fader } from '../components/Fader';
import { Knob } from '../components/Knob';
import { fmtDb } from '../util';

const panFmt = (v: number) => (Math.round(v) === 0 ? 'C' : v < 0 ? `L${-Math.round(v)}` : `R${Math.round(v)}`);

function Source({ id }: { id: ChId }) {
  const { s, d, loadFile } = useLive();
  const input = useRef<HTMLInputElement>(null);
  const name = s.files[id];
  if (id === 'click') return <div className={`ls-badge${s.clickMonitor ? ' live' : ''}`}><Icon name="headphones" size={12} />Monitor</div>;
  if (isInput(id)) return <div className={`ls-badge${s.inputs[id].device ? ' live' : ''}`}>{s.inputs[id].device ? 'Entrada activa' : 'Sin entrada'}</div>;
  if (id !== 'pad' && id !== 'drums' && id !== 'tracks') return <div className="ls-badge">{CH_META[id].badge}</div>;
  const pick = (
    <input ref={input} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(id, f); e.target.value = ''; }} />
  );
  if (id === 'tracks' || !name) {
    return (
      <button className="ls-badge btn-badge" title={name ? `Archivo: ${name}. Toque para cambiarlo` : 'Cargar un archivo de audio en este canal'} onClick={() => input.current?.click()}>
        {pick}
        <Icon name="upload" size={12} />
        {name ? 'Archivo' : id === 'tracks' ? 'Sin archivo' : 'Sinte'}
      </button>
    );
  }
  const mode = s.src[id];
  return (
    <button className={`ls-badge btn-badge${mode === 'file' ? ' live' : ''}`} title={`Cambiar entre sintetizador y el archivo «${name}»`} onClick={() => d({ type: 'src', ch: id, mode: mode === 'file' ? 'synth' : 'file' })}>
      {mode === 'file' ? 'Archivo' : 'Sinte'} ⇄
    </button>
  );
}

function Strip({ id }: { id: ChId }) {
  const { s, d, mix } = useLive();
  const c = mix.chans[id];
  const meta = { ...CH_META[id], name: chName(s, id) };
  const sel = s.selected === id;
  return (
    <div className={`lstrip${sel ? ' sel' : ''}${c.mute ? ' muted' : ''}`} style={{ ['--cc' as string]: meta.color }}>
      <button className="ls-head" onClick={() => d({ type: 'select', id })} onDoubleClick={() => d({ type: 'editor', id })} aria-pressed={sel} title="Seleccionar canal. Doble toque: abrir el editor">
        <Icon name={chIcon(id)} size={15} />
        <span>{meta.name}</span>
      </button>
      <div className="ls-pan">
        <Knob label="" value={c.pan} min={-100} max={100} step={1} def={0} format={panFmt} onChange={(v) => d({ type: 'ch', id, fn: (x) => ({ ...x, pan: Math.abs(v) < 4 ? 0 : v }) })} />
      </div>
      <div className="ls-ms">
        <button className={`ms m${c.mute ? ' on' : ''}`} aria-pressed={c.mute} aria-label={`Mute ${meta.name}`} onClick={() => d({ type: 'ch', id, fn: (x) => ({ ...x, mute: !x.mute }) })}>M</button>
        <button className={`ms s${c.solo ? ' on' : ''}`} aria-pressed={c.solo} aria-label={`Solo ${meta.name}`} onClick={() => d({ type: 'ch', id, fn: (x) => ({ ...x, solo: !x.solo }) })}>S</button>
      </div>
      <div className="ls-fader" onPointerDown={() => d({ type: 'select', id })}>
        <Fader label={`Nivel de ${meta.name}`} value={c.fader} color={meta.color} meterKey={`live:${id}`} onChange={(v) => d({ type: 'ch', id, fn: (x) => ({ ...x, fader: v }) })} />
      </div>
      <div className="ls-db">{fmtDb(c.fader)} dB</div>
      <div className="ls-foot">
        <Source id={id} />
        <button className="ls-eq" aria-label={`Editor de ${meta.name}`} title="Abrir el editor de canal" onClick={() => d({ type: 'editor', id })}>
          <Icon name="expand" size={12} />
        </button>
      </div>
    </div>
  );
}

export function MasterStrip() {
  const { s, d } = useLive();
  return (
    <div className="lstrip mstr" style={{ ['--cc' as string]: '#dfe9f7' }}>
      <div className="ls-head static">
        <Icon name="master" size={15} />
        <span>Master</span>
      </div>
      <div className="ls-pan lr"><span>L</span><span>R</span></div>
      <div className="ls-ms single">
        <button className={`ms m${s.masterMute ? ' on' : ''}`} aria-pressed={s.masterMute} aria-label="Mute master" onClick={() => d({ type: 'master', mute: !s.masterMute })}>M</button>
      </div>
      <div className="ls-fader">
        <Fader label="Master" value={s.master} color="#dfe9f7" meterKey="live:master" stereo onChange={(v) => d({ type: 'master', db: v })} />
      </div>
      <div className="ls-db">{fmtDb(s.master)} dB</div>
      <div className="ls-foot"><div className="ls-badge">Salida</div></div>
    </div>
  );
}

const GROUPS: { id: StripGroup; label: string; ids: ChId[] }[] = [
  { id: 'all', label: 'Todos', ids: CH_IDS },
  { id: 'inst', label: 'Instrumentos', ids: INST_IDS },
  { id: 'inputs', label: 'Micrófonos y entradas', ids: IN_IDS },
  { id: 'tracks', label: 'Pistas', ids: ['tracks', 'click'] },
];

export function StripRow({ tall }: { tall?: boolean }) {
  const { s, mix, d } = useLive();
  const anySolo = Object.values(mix.chans).some((c) => c.solo);
  const ids = GROUPS.find((g) => g.id === s.stripGroup)?.ids ?? CH_IDS;
  return (
    <div className={`stripscroll${tall ? ' tall' : ''}`}>
      <div className="stripbar">
        <div className="segx sm" role="tablist" aria-label="Grupo de canales">
          {GROUPS.map((g) => (
            <button key={g.id} role="tab" aria-selected={s.stripGroup === g.id} className={s.stripGroup === g.id ? 'on' : ''} onClick={() => d({ type: 'group', group: g.id })}>{g.label}</button>
          ))}
        </div>
        {!tall && <Expand tab="mixer" label="Mezcla" />}
      </div>
      <div className="striprow">
        {ids.map((id) => <Strip key={id} id={id} />)}
        <i className="sep" aria-hidden="true" />
        <MasterStrip />
      </div>
      {anySolo && <button className="solo-clear" onClick={() => d({ type: 'clearSolo' })}>Quitar solos</button>}
    </div>
  );
}
