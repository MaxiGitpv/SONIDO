import { useEffect, useState } from 'react';
import { useLive, Icon } from './ctx';
import { BASIC_EQ, CH_META, EQ_NAMES, chIcon, chName, presetsFor } from './data';
import { CH_IDS } from './types';
import type { Chan, ChId } from './types';
import { BAND_COLORS, BandKnobs, CompCurve, CompKnobs, EqGraph, GrMeter } from './Center';
import { Fader } from '../components/Fader';
import { Knob } from '../components/Knob';
import { HSlider } from '../components/HSlider';
import { clone, dbToPos, fmtDb, fmtHz, posToDb } from '../util';

/** Editor completo de un canal: EQ grande con zonas, mezclas rápidas, presets, filtros, compresor y A/B. */
export function ChannelEditor({ id }: { id: ChId }) {
  const { s, d, mix, can } = useLive();
  const ch = mix.chans[id];
  const lock = !can('console');
  const ml = mix.music[id];
  const meta = CH_META[id];
  const [sel, setSel] = useState(3);
  const [ab, setAb] = useState<{ A: Chan | null; B: Chan | null; cur: 'A' | 'B' | null }>({ A: null, B: null, cur: null });
  const set = (fn: (c: Chan) => Chan) => d({ type: 'ch', id, fn });

  useEffect(() => setAb({ A: null, B: null, cur: null }), [id]);

  const store = (slot: 'A' | 'B') => setAb((x) => ({ ...x, [slot]: clone(ch), cur: slot }));
  const recall = (slot: 'A' | 'B') => {
    const snap = ab[slot];
    if (!snap) return;
    set((c) => ({ ...snap, mute: c.mute, solo: c.solo }));
    setAb((x) => ({ ...x, cur: slot }));
  };

  return (
    <div className="ced-page" aria-label={`Editor de canal: ${chName(s, id)}`}>
      <div className="ced" style={{ ['--cc' as string]: meta.color }}>
        <header className="ced-h">
          <button className="backbtn" onClick={() => d({ type: 'tab', tab: 'live' })}><Icon name="prev" size={18} /> Inicio</button>
          <h2><Icon name={chIcon(id)} size={20} /> {chName(s, id)} <small>Editor de canal</small></h2>
          <nav className="ced-chs" aria-label="Canales">
            {CH_IDS.map((c) => (
              <button key={c} className={c === id ? 'on' : ''} style={{ ['--cc' as string]: CH_META[c].color }} onClick={() => d({ type: 'editor', id: c })}>
                {chName(s, c)}
              </button>
            ))}
          </nav>
          <div className="ced-acts">
            <button className={`mini${ch.solo ? ' on' : ''}`} aria-pressed={ch.solo} onClick={() => set((c) => ({ ...c, solo: !c.solo }))}>Solo</button>
            <button className={`mini${ch.mute ? ' warn' : ''}`} aria-pressed={ch.mute} onClick={() => set((c) => ({ ...c, mute: !c.mute }))}>{ch.mute ? 'Silenciado' : 'Mute'}</button>
          </div>
        </header>

        {lock && <p className="inwarn ced-lock">Consola del sonidista: en esta vista puede ver el canal pero no cambiarlo.</p>}
        <div className={`ced-body${lock ? ' locked' : ''}`}>
          <section className="ced-eq">
            <EqGraph ch={ch} id={id} sel={sel} setSel={setSel} W={900} H={300} big />
            <p className="hint2">Arrastre los puntos de color para cada banda y los cuadrados grises para los filtros pasa altos y pasa bajos. Con la rueda del ratón sobre una campana se cambia su ancho (Q).</p>
            <div className="ced-bands" role="tablist" aria-label="Banda">
              {ch.eq.map((b, i) => (
                <button key={i} role="tab" aria-selected={sel === i} className={`bandchip${sel === i ? ' on' : ''}${b.on ? '' : ' off'}`} style={{ ['--bc' as string]: BAND_COLORS[i] }} onClick={() => setSel(i)}>
                  <i /> {EQ_NAMES[i]} <small>{fmtHz(b.freq)} · {b.gain > 0 ? '+' : ''}{b.gain.toFixed(1)}</small>
                </button>
              ))}
            </div>
            <div className="eqctl wide">
              <BandKnobs id={id} ch={ch} sel={sel} />
              <div className="filters">
                <Knob label="Pasa altos" value={ch.hpf.freq} min={20} max={800} log step={1} def={80} format={fmtHz} disabled={!ch.hpf.on} onChange={(v) => set((c) => ({ ...c, hpf: { ...c.hpf, freq: Math.round(v) } }))} />
                <button className={`mini${ch.hpf.on ? ' on' : ''}`} aria-pressed={ch.hpf.on} onClick={() => set((c) => ({ ...c, hpf: { ...c.hpf, on: !c.hpf.on } }))}>HPF</button>
                <Knob label="Pasa bajos" value={ch.lpf.freq} min={2000} max={20000} log step={10} def={18000} format={fmtHz} disabled={!ch.lpf.on} onChange={(v) => set((c) => ({ ...c, lpf: { ...c.lpf, freq: Math.round(v) } }))} />
                <button className={`mini${ch.lpf.on ? ' on' : ''}`} aria-pressed={ch.lpf.on} onClick={() => set((c) => ({ ...c, lpf: { ...c.lpf, on: !c.lpf.on } }))}>LPF</button>
              </div>
            </div>
          </section>

          <aside className="ced-side">
            <section className="ced-card">
              <h3>EQ básico</h3>
              <p className="hint2">Son las bandas Graves, Presencia y Brillo del EQ avanzado: un solo EQ, dos formas de verlo.</p>
              <div className="beq">
                {BASIC_EQ.map((b) => (
                  <Knob key={b.band} label={b.label} value={ch.eq[b.band].gain} min={-15} max={15} step={0.5} def={0} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} disabled={lock} color={BAND_COLORS[b.band]}
                    onChange={(v) => set((c) => ({ ...c, eqOn: true, eq: c.eq.map((q, i) => (i === b.band ? { ...q, gain: v, on: true } : q)) }))} />
                ))}
              </div>
            </section>
            <section className="ced-card">
              <h3>Envíos a monitores</h3>
              {s.buses.map((b) => {
                const snd = ch.aux[b.id] ?? { db: -90, pre: true };
                return (
                  <div key={b.id} className="auxrow" style={{ ['--cc' as string]: b.color }}>
                    <span>{b.name}</span>
                    <HSlider label={`Envío a ${b.name}`} value={snd.db} toPos={dbToPos} fromPos={posToDb} snap={(x) => Math.round(x * 2) / 2} color={b.color} disabled={lock} onChange={(v) => d({ type: 'aux', ch: id, bus: b.id, patch: { db: v } })} />
                    <b>{fmtDb(snd.db)}</b>
                    <button className={`mini${snd.pre ? ' on' : ''}`} disabled={lock} onClick={() => d({ type: 'aux', ch: id, bus: b.id, patch: { pre: !snd.pre } })} title="PRE: antes del fader de sala. POST: después.">{snd.pre ? 'PRE' : 'POST'}</button>
                  </div>
                );
              })}
              <p className="hint2">{ch.toMain ? 'Este canal va a la sala.' : 'Este canal no va a la sala: solo a monitores y escucha.'}{ml ? ` Nivel musical en esta sección (director): ${ml.on ? `${fmtDb(ml.db)} dB` : 'apagado'}.` : ''}</p>
            </section>
            <section className="ced-card">
              <h3>Mezclas rápidas</h3>
              <div className="tone">
                {ch.eq.map((b, i) => (
                  <div key={i} className="tone-row" style={{ ['--ac' as string]: BAND_COLORS[i] }}>
                    <span>{EQ_NAMES[i]}</span>
                    <HSlider label={`${EQ_NAMES[i]} en dB`} value={b.gain} bipolar toPos={(v) => (v + 12) / 24} fromPos={(p) => p * 24 - 12} snap={(v) => (Math.abs(v) < 0.4 ? 0 : Math.round(v * 2) / 2)} color={BAND_COLORS[i]}
                      onChange={(v) => { setSel(i); set((c) => ({ ...c, eqOn: true, eq: c.eq.map((x, j) => (j === i ? { ...x, gain: v, on: true } : x)) })); }} />
                    <b>{b.gain > 0 ? '+' : ''}{b.gain.toFixed(1)}</b>
                  </div>
                ))}
              </div>
            </section>
            <section className="ced-card">
              <h3>Presets</h3>
              <div className="presets">
                {presetsFor(id).map((p) => (
                  <button key={p.id} className="mini" onClick={() => d({ type: 'preset', id, preset: p.id })}>{p.name}</button>
                ))}
              </div>
            </section>
            <section className="ced-card">
              <h3>Comparar A / B</h3>
              <div className="abrow">
                {(['A', 'B'] as const).map((slot) => (
                  <div key={slot} className={`abslot${ab.cur === slot ? ' on' : ''}`}>
                    <b>{slot}</b>
                    <button className="mini" onClick={() => store(slot)}>Guardar</button>
                    <button className="mini" disabled={!ab[slot]} onClick={() => recall(slot)}>Escuchar</button>
                  </div>
                ))}
              </div>
            </section>
          </aside>

          <section className="ced-card ced-comp">
            <h3>Compresor</h3>
            <div className="ced-comp-b">
              <CompCurve comp={ch.comp} size={130} />
              <CompKnobs id={id} comp={ch.comp} />
            </div>
            <GrMeter id={id} />
          </section>

          <section className="ced-card ced-out">
            <h3>Salida</h3>
            <div className="ced-out-b">
              <div className="ced-fader">
                <Fader label={`Nivel de ${chName(s, id)}`} value={ch.fader} color={meta.color} meterKey={`live:${id}`} onChange={(v) => set((c) => ({ ...c, fader: v }))} />
                <b>{fmtDb(ch.fader)} dB</b>
              </div>
              <div className="ced-sends">
                <Knob label="Pan" value={ch.pan} min={-100} max={100} step={1} def={0} format={(v) => (Math.round(v) === 0 ? 'C' : v < 0 ? `L${-Math.round(v)}` : `R${Math.round(v)}`)} onChange={(v) => set((c) => ({ ...c, pan: Math.abs(v) < 4 ? 0 : v }))} />
                <label>Reverb
                  <HSlider label="Envío a reverb" value={ch.sendRev} toPos={dbToPos} fromPos={posToDb} snap={(x) => Math.round(x * 2) / 2} onChange={(v) => set((c) => ({ ...c, sendRev: v }))} />
                  <b>{fmtDb(ch.sendRev)}</b>
                </label>
                <label>Delay
                  <HSlider label="Envío a delay" value={ch.sendDly} toPos={dbToPos} fromPos={posToDb} snap={(x) => Math.round(x * 2) / 2} onChange={(v) => set((c) => ({ ...c, sendDly: v }))} />
                  <b>{fmtDb(ch.sendDly)}</b>
                </label>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
