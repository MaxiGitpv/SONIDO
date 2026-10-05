import { useLive, Icon, fmtPct } from './ctx';
import { Expand } from './nav';
import { Knob } from '../components/Knob';
import { engine } from './engine';
import { fmtDb } from '../util';
import type { Macros } from './types';

function Macro({ k, label }: { k: keyof Macros; label: string }) {
  const { mix, d } = useLive();
  return (
    <div className="macro">
      <Knob label="" value={mix.macros[k]} min={0} max={1} step={0.01} def={0.5} format={() => ''} onChange={(v) => d({ type: 'macro', key: k, value: v })} />
      <div className="macro-t">
        <b>{label}</b>
        <span className="vbox">{fmtPct(mix.macros[k])}</span>
      </div>
    </div>
  );
}

export function RightPanel({ wide }: { wide?: boolean }) {
  const { s, d } = useLive();
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
          <button className="pwr" aria-pressed={fx.reverbOn} aria-label="Encender o apagar Hall Reverb" onClick={() => d({ type: 'fx', patch: { reverbOn: !fx.reverbOn } })}>
            <Icon name="power" size={16} />
          </button>
          <b>Hall Reverb</b>
        </header>
        <div className="rack-k">
          <Knob label="Send" value={fx.reverbSend} min={-60} max={0} step={0.5} def={-12} format={(v) => `${fmtDb(v)} dB`} onChange={(v) => d({ type: 'fx', patch: { reverbSend: v } })} disabled={!fx.reverbOn} />
          <Knob label="Wet" value={fx.reverbWet} min={0} max={1} step={0.01} def={0.28} format={fmtPct} onChange={(v) => d({ type: 'fx', patch: { reverbWet: v } })} disabled={!fx.reverbOn} />
        </div>
      </section>

      <section className={`rack${fx.delayOn ? ' on' : ''}`}>
        <header>
          <button className="pwr" aria-pressed={fx.delayOn} aria-label="Encender o apagar Delay" onClick={() => d({ type: 'fx', patch: { delayOn: !fx.delayOn } })}>
            <Icon name="power" size={16} />
          </button>
          <b>Delay · 1/4</b>
        </header>
        <div className="rack-k three">
          <Knob label="Send" value={fx.delaySend} min={-60} max={0} step={0.5} def={-18} format={(v) => `${fmtDb(v)} dB`} onChange={(v) => d({ type: 'fx', patch: { delaySend: v } })} disabled={!fx.delayOn} />
          <Knob label="Wet" value={fx.delayWet} min={0} max={1} step={0.01} def={0.22} format={fmtPct} onChange={(v) => d({ type: 'fx', patch: { delayWet: v } })} disabled={!fx.delayOn} />
          <Knob label="Feedback" value={fx.delayFb} min={0} max={0.9} step={0.01} def={0.35} format={fmtPct} onChange={(v) => d({ type: 'fx', patch: { delayFb: v } })} disabled={!fx.delayOn} />
        </div>
      </section>

      <button className="panic2" onClick={() => { engine.panic(); d({ type: 'toast', text: 'Panic: todas las notas apagadas' }); }}>
        <Icon name="warn" size={22} />
        Panic MIDI
      </button>
    </aside>
  );
}
