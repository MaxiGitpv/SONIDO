import { useLive, Icon, fmtPct } from './ctx';
import { Expand } from './nav';
import { Knob } from '../components/Knob';
import { fmtDb } from '../util';
import type { Macros } from './types';

function Macro({ k, label }: { k: keyof Macros; label: string }) {
  const { mix, d, can } = useLive();
  return (
    <div className="macro">
      <Knob label="" value={mix.macros[k]} min={0} max={1} step={0.01} def={0.5} format={() => ''} disabled={!can('music')} onChange={(v) => d({ type: 'macro', key: k, value: v })} />
      <div className="macro-t">
        <b>{label}</b>
        <span className="vbox">{fmtPct(mix.macros[k])}</span>
      </div>
    </div>
  );
}

export function RightPanel({ wide }: { wide?: boolean }) {
  const { s, d, panic, can } = useLive();
  const lockFx = !can('fx');
  const fx = s.fx;
  return (
    <aside className={`rpanel${wide ? ' wide' : ''}`}>
      <section className="lpanel">
        <header className="ph">
          <Icon name="sliders" />
          <h3>Espacio y expresión</h3>
          {!wide && <Expand tab="fx" label="Espacio y efectos" />}
        </header>
        <Macro k="ambience" label="Ambiente" />
        <Macro k="brightness" label="Brillo" />
        <Macro k="expression" label="Expresión" />
      </section>

      <section className={`rack${fx.reverbOn ? ' on' : ''}`}>
        <header>
          <button className="pwr" aria-pressed={fx.reverbOn} aria-label="Encender o apagar Hall Reverb" disabled={lockFx} onClick={() => d({ type: 'fx', patch: { reverbOn: !fx.reverbOn } })}>
            <Icon name="power" size={16} />
          </button>
          <b>Hall Reverb</b>
        </header>
        <div className="rack-k">
          <Knob label="Send" value={fx.reverbSend} min={-60} max={0} step={0.5} def={-12} format={(v) => `${fmtDb(v)} dB`} onChange={(v) => d({ type: 'fx', patch: { reverbSend: v } })} disabled={lockFx || !fx.reverbOn} />
          <Knob label="Wet" value={fx.reverbWet} min={0} max={1} step={0.01} def={0.28} format={fmtPct} onChange={(v) => d({ type: 'fx', patch: { reverbWet: v } })} disabled={lockFx || !fx.reverbOn} />
          {wide && (
            <>
              <Knob label="Tamaño" value={fx.reverbSize} min={0.6} max={6} step={0.1} def={2.8} format={(v) => `${v.toFixed(1)} s`} onChange={(v) => d({ type: 'fx', patch: { reverbSize: v } })} disabled={lockFx || !fx.reverbOn} />
              <Knob label="Pre-delay" value={fx.reverbPre} min={0} max={150} step={1} def={20} format={(v) => `${Math.round(v)} ms`} onChange={(v) => d({ type: 'fx', patch: { reverbPre: v } })} disabled={lockFx || !fx.reverbOn} />
              <Knob label="Amortig." value={fx.reverbDamp} min={1500} max={16000} log step={100} def={9000} format={(v) => `${(v / 1000).toFixed(1)} k`} onChange={(v) => d({ type: 'fx', patch: { reverbDamp: v } })} disabled={lockFx || !fx.reverbOn} />
            </>
          )}
        </div>
      </section>

      <section className={`rack${fx.delayOn ? ' on' : ''}`}>
        <header>
          <button className="pwr" aria-pressed={fx.delayOn} aria-label="Encender o apagar Delay" disabled={lockFx} onClick={() => d({ type: 'fx', patch: { delayOn: !fx.delayOn } })}>
            <Icon name="power" size={16} />
          </button>
          <b>Delay · {fx.delayDiv}</b>
        </header>
        <div className="rack-k three">
          <Knob label="Send" value={fx.delaySend} min={-60} max={0} step={0.5} def={-18} format={(v) => `${fmtDb(v)} dB`} onChange={(v) => d({ type: 'fx', patch: { delaySend: v } })} disabled={lockFx || !fx.delayOn} />
          <Knob label="Wet" value={fx.delayWet} min={0} max={1} step={0.01} def={0.22} format={fmtPct} onChange={(v) => d({ type: 'fx', patch: { delayWet: v } })} disabled={lockFx || !fx.delayOn} />
          <Knob label="Feedback" value={fx.delayFb} min={0} max={0.9} step={0.01} def={0.35} format={fmtPct} onChange={(v) => d({ type: 'fx', patch: { delayFb: v } })} disabled={lockFx || !fx.delayOn} />
          {wide && (
            <>
              <Knob label="Tono" value={fx.delayTone} min={1000} max={12000} log step={100} def={4200} format={(v) => `${(v / 1000).toFixed(1)} k`} onChange={(v) => d({ type: 'fx', patch: { delayTone: v } })} disabled={lockFx || !fx.delayOn} />
              <label className="divsel">División
                <select value={fx.delayDiv} disabled={lockFx || !fx.delayOn} onChange={(e) => d({ type: 'fx', patch: { delayDiv: e.target.value as typeof fx.delayDiv } })}>
                  {(['1/4', '1/8', '1/8.', '1/4.', '1/2'] as const).map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              </label>
            </>
          )}
        </div>
      </section>

      <button className="panic2" onClick={panic} title="Suelta todas las voces musicales y reinicia el sustain. No silencia micrófonos ni la sala.">
        <Icon name="warn" size={22} />
        Panic MIDI
      </button>
    </aside>
  );
}
