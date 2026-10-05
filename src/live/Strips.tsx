import { useLive, Icon } from './ctx';
import { CH_META } from './data';
import { CH_IDS } from './types';
import type { ChId } from './types';
import { Fader } from '../components/Fader';
import { Knob } from '../components/Knob';
import { fmtDb } from '../util';

const panFmt = (v: number) => (Math.round(v) === 0 ? 'C' : v < 0 ? `L${-Math.round(v)}` : `R${Math.round(v)}`);

function Strip({ id }: { id: ChId }) {
  const { s, d, mix } = useLive();
  const c = mix.chans[id];
  const meta = CH_META[id];
  const sel = s.selected === id;
  const badge = id === 'tracks' ? (s.trackName ? 'Archivo' : 'Sin archivo') : id === 'click' ? 'Solo monitores' : meta.badge;
  return (
    <div className={`lstrip${sel ? ' sel' : ''}${c.mute ? ' muted' : ''}`} style={{ ['--cc' as string]: meta.color }}>
      <button className="ls-head" onClick={() => d({ type: 'select', id })} aria-pressed={sel} title="Seleccionar canal (EQ y dinámica)">
        <Icon name={id} size={16} />
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
      <div className={`ls-badge${id === 'click' && s.clickMonitor ? ' live' : ''}`}>{id === 'click' && <Icon name="headphones" size={12} />}{badge}</div>
    </div>
  );
}

export function MasterStrip() {
  const { s, d } = useLive();
  return (
    <div className="lstrip mstr" style={{ ['--cc' as string]: '#dfe9f7' }}>
      <div className="ls-head static">
        <Icon name="master" size={16} />
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
      <div className="ls-badge">Salida</div>
    </div>
  );
}

export function StripRow({ tall }: { tall?: boolean }) {
  const { mix, d } = useLive();
  const anySolo = Object.values(mix.chans).some((c) => c.solo);
  return (
    <div className={`striprow${tall ? ' tall' : ''}`}>
      {CH_IDS.map((id) => <Strip key={id} id={id} />)}
      <i className="sep" aria-hidden="true" />
      <MasterStrip />
      {anySolo && <button className="solo-clear" onClick={() => d({ type: 'clearSolo' })}>Quitar solos</button>}
    </div>
  );
}
