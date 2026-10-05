import { memo } from 'react';
import type { Channel, MixId } from '../types';
import { MIXES } from '../types';
import { fmtPan, clamp } from '../util';
import { Fader } from './Fader';
import { HSlider } from './HSlider';
import { Btn, DbField } from './ui';
import { setPer } from '../ctx';

interface Props {
  ch: Channel;
  index: number;
  mix: MixId;
  selected: boolean;
  edit: (id: string, fn: (c: Channel) => Channel) => void;
  select: (id: string) => void;
}

export const ChannelStrip = memo(function ChannelStrip({ ch, index, mix, selected, edit, select }: Props) {
  const info = MIXES[mix];
  const routed = ch.route[mix];
  const hue = `hsl(${ch.hue} 55% 58%)`;
  const lockedMain = ch.id === 'click' && mix === 'main';

  return (
    <div
      className={`strip${selected ? ' selected' : ''}${routed ? '' : ' unrouted'}`}
      style={{ ['--mix' as string]: info.color, ['--chc' as string]: hue }}
      onPointerDown={() => select(ch.id)}
    >
      <div className="strip-name">
        <span className="strip-idx">{String(index + 1).padStart(2, '0')}</span>
        <input
          className="strip-input"
          value={ch.name}
          maxLength={16}
          aria-label={`Nombre del canal ${index + 1}`}
          onFocus={() => select(ch.id)}
          onChange={(e) => edit(ch.id, (c) => ({ ...c, name: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
      </div>
      <div className="strip-ms">
        <Btn kind="mute" on={ch.mute[mix]} onClick={() => edit(ch.id, (c) => ({ ...c, mute: setPer(c.mute, mix, !c.mute[mix]) }))}>
          MUTE
        </Btn>
        <Btn kind="solo" on={ch.solo} onClick={() => edit(ch.id, (c) => ({ ...c, solo: !c.solo }))}>
          SOLO
        </Btn>
      </div>
      <div className="strip-pan">
        <HSlider
          label={`Panorama ${ch.name}`}
          value={ch.pan[mix]}
          bipolar
          toPos={(v) => (clamp(v, -100, 100) + 100) / 200}
          fromPos={(p) => p * 200 - 100}
          snap={(v) => (Math.abs(v) < 6 ? 0 : Math.round(v))}
          onChange={(v) => edit(ch.id, (c) => ({ ...c, pan: setPer(c.pan, mix, v) }))}
          disabled={!routed}
          color={info.color}
        />
        <span className="pan-val">{fmtPan(ch.pan[mix])}</span>
      </div>
      <div className="strip-fader">
        <Fader
          label={`Nivel ${ch.name} en ${info.label}`}
          value={ch.fader[mix]}
          disabled={!routed}
          color={info.color}
          meterKey={`ch:${ch.id}`}
          onChange={(v) => edit(ch.id, (c) => ({ ...c, fader: setPer(c.fader, mix, v) }))}
        />
        {!routed && <div className="strip-lock">{lockedMain ? 'Solo monitores' : 'Sin ruta'}</div>}
      </div>
      <div className="strip-db">
        <DbField
          label={`Nivel en dB de ${ch.name}`}
          value={ch.fader[mix]}
          disabled={!routed}
          onChange={(v) => edit(ch.id, (c) => ({ ...c, fader: setPer(c.fader, mix, v) }))}
        />
        <span className="unit">dB</span>
      </div>
    </div>
  );
});
