import { useCallback, useEffect } from 'react';
import type { Channel } from '../types';
import { MIXES, MIX_IDS } from '../types';
import { useMedia, useStore } from '../ctx';
import { ChannelStrip } from '../components/ChannelStrip';
import { BusStrip } from '../components/BusStrip';
import { DetailPanel } from '../components/DetailPanel';

export function MixView() {
  const { state, dispatch } = useStore();
  const { snap, mixId, selected, bank } = state;
  const wide = useMedia('(min-width: 1280px)');
  const bankSize = wide ? 12 : 6;
  const banks = 12 / bankSize;
  const bankIdx = Math.min(bank, banks - 1);
  const visible = snap.channels.slice(bankIdx * bankSize, bankIdx * bankSize + bankSize);
  const info = MIXES[mixId];
  const anySolo = snap.channels.some((c) => c.solo);

  const edit = useCallback((id: string, fn: (c: Channel) => Channel) => dispatch({ type: 'ch', id, fn }), [dispatch]);
  const select = useCallback((id: string) => dispatch({ type: 'select', id }), [dispatch]);

  // Al cambiar de banco, la selección sigue a un canal visible.
  useEffect(() => {
    if (!visible.some((c) => c.id === selected)) dispatch({ type: 'select', id: visible[0].id });
  }, [bankIdx, bankSize]); // eslint-disable-line react-hooks/exhaustive-deps

  const selIdx = Math.max(0, snap.channels.findIndex((c) => c.id === selected));
  const selCh = snap.channels[selIdx];

  return (
    <div className="mixview" style={{ ['--mix' as string]: info.color }}>
      <div className="mixbar">
        <div className="mixsel" role="tablist" aria-label="Mezcla en edición">
          {MIX_IDS.map((m) => (
            <button key={m} role="tab" aria-selected={m === mixId} className={`mixbtn${m === mixId ? ' on' : ''}`}
              style={{ ['--mc' as string]: MIXES[m].color }} onClick={() => dispatch({ type: 'mix', mix: m })}>
              <i />
              <span className="mb-t">{MIXES[m].label}</span>
              <span className="mb-s">{m === mixId ? 'Editando' : MIXES[m].sub}</span>
            </button>
          ))}
        </div>
        <div className="editing" aria-live="polite">
          <b>EDITANDO</b>
          <span>
            {info.label} · {info.sub}
          </span>
          <small>{mixId === 'main' ? 'Los faders ajustan lo que oye la sala' : 'Cada fader es el envío del canal a este monitor'}</small>
        </div>
        {state.demo && <span className="simchip">SIMULACIÓN · no es audio real</span>}
        {anySolo && (
          <button className="solochip" onClick={() => dispatch({ type: 'clearSolo' })}>
            SOLO activo · borrar
          </button>
        )}
        {banks > 1 && (
          <div className="banks" role="tablist" aria-label="Banco de canales">
            {Array.from({ length: banks }, (_, i) => (
              <button key={i} role="tab" aria-selected={i === bankIdx} className={`bankbtn${i === bankIdx ? ' on' : ''}`} onClick={() => dispatch({ type: 'bank', bank: i })}>
                {i * bankSize + 1}–{i * bankSize + bankSize}
              </button>
            ))}
          </div>
        )}
      </div>

      <DetailPanel ch={selCh} index={selIdx} mix={mixId} edit={(fn) => edit(selCh.id, fn)} />

      <div className="strips">
        {visible.map((c) => (
          <ChannelStrip key={c.id} ch={c} index={snap.channels.indexOf(c)} mix={mixId} selected={c.id === selected} edit={edit} select={select} />
        ))}
      </div>

      <aside className="masters" aria-label="Masters">
        <BusStrip mix="main" primary />
        {mixId !== 'main' && <BusStrip mix={mixId} />}
      </aside>
    </div>
  );
}
