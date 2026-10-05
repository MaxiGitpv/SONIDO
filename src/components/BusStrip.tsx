import type { MixId } from '../types';
import { MIXES } from '../types';
import { useStore } from '../ctx';
import { Fader } from './Fader';
import { Btn, DbField } from './ui';

/** Fader maestro estéreo de una mezcla. */
export function BusStrip({ mix, primary }: { mix: MixId; primary?: boolean }) {
  const { state, dispatch } = useStore();
  const m = state.snap.masters[mix];
  const info = MIXES[mix];
  return (
    <div className={`strip bus${primary ? ' primary' : ''}`} style={{ ['--mix' as string]: info.color }}>
      <div className="strip-name bus-name">
        <span className="bus-title">{mix === 'main' ? 'MASTER' : 'MASTER MON'}</span>
        <span className="bus-sub">{mix === 'main' ? 'Principal L-R' : `${info.short} · ${info.sub}`}</span>
      </div>
      <div className="strip-ms single">
        <Btn kind="mute" on={m.mute} onClick={() => dispatch({ type: 'master', mix, patch: { mute: !m.mute } })}>
          MUTE
        </Btn>
      </div>
      <div className="strip-pan lr-label">
        <span>L</span>
        <span>R</span>
      </div>
      <div className="strip-fader">
        <Fader
          label={`Master ${info.label}`}
          value={m.level}
          color={info.color}
          meterKey={`master:${mix}`}
          stereo
          onChange={(v) => dispatch({ type: 'master', mix, patch: { level: v } })}
        />
      </div>
      <div className="strip-db">
        <DbField label={`Master ${info.label} en dB`} value={m.level} onChange={(v) => dispatch({ type: 'master', mix, patch: { level: v } })} />
        <span className="unit">dB</span>
      </div>
    </div>
  );
}
