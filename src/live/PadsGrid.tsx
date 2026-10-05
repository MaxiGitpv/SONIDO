import { useRef, useState } from 'react';
import { useLive } from './ctx';
import { engine } from './engine';
import { KEY_SEMI } from './data';
import type { Hit } from './rhythm';
import type { Zone } from './types';

const DEGREES: { label: string; deg: number; minor: boolean }[] = [
  { label: 'I', deg: 0, minor: false },
  { label: 'ii', deg: 2, minor: true },
  { label: 'iii', deg: 4, minor: true },
  { label: 'IV', deg: 5, minor: false },
  { label: 'V', deg: 7, minor: false },
  { label: 'vi', deg: 9, minor: true },
  { label: 'IV/V', deg: 7, minor: false },
  { label: 'I/3', deg: 0, minor: false },
];
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const DRUMS: { hit: Hit; label: string }[] = [
  { hit: 'kick', label: 'Bombo' },
  { hit: 'snare', label: 'Caja' },
  { hit: 'clap', label: 'Palmas' },
  { hit: 'hat', label: 'Hi-hat' },
  { hit: 'crash', label: 'Platillo' },
  { hit: 'tomL', label: 'Tom' },
  { hit: 'conga', label: 'Conga' },
  { hit: 'cowbell', label: 'Campana' },
];

/** Cuadros para tocar en vivo: acordes de la tonalidad, golpes y fondos. */
export function PadsGrid() {
  const { s, mix } = useLive();
  const song = s.songs.find((x) => x.id === s.songId)!;
  const key = KEY_SEMI[song.key] ?? 0;
  const [latch, setLatch] = useState(false);
  const [drone, setDrone] = useState(false);
  const [on, setOn] = useState<string | null>(null);
  const rel = useRef<(() => void) | null>(null);
  const ids = mix.layers.filter((l) => l.zone !== ('low' as Zone)).map((l) => l.ch);
  const bass = mix.layers.filter((l) => l.zone !== 'high').map((l) => l.ch);

  const chordOn = (i: number) => {
    rel.current?.();
    const g = DEGREES[i];
    const r = 60 + ((key + g.deg) % 12) - ((key + g.deg) % 12 > 7 ? 12 : 0);
    const third = r + (g.minor ? 3 : 4);
    const notes = g.label === 'IV/V' ? [r - 2, r + 2, r + 5] : g.label === 'I/3' ? [r, third, r + 7] : [r, third, r + 7];
    const bassNote = g.label === 'IV/V' ? r - 12 : g.label === 'I/3' ? third - 12 : r - 12;
    const rs = [...notes.map((n) => engine.noteOn(ids.length ? ids : ['piano'], n)), engine.noteOn(bass.length ? bass : ['piano'], bassNote)];
    rel.current = () => rs.forEach((f) => f());
    setOn(`c${i}`);
  };
  const chordOff = () => {
    if (latch) return;
    rel.current?.();
    rel.current = null;
    setOn(null);
  };
  const chordName = (i: number) => {
    const g = DEGREES[i];
    const n = NAMES[(key + g.deg) % 12];
    if (g.label === 'IV/V') return `${NAMES[(key + 5) % 12]}/${NAMES[(key + 7) % 12]}`;
    if (g.label === 'I/3') return `${NAMES[key % 12]}/${NAMES[(key + 4) % 12]}`;
    return `${n}${g.minor ? 'm' : ''}`;
  };

  return (
    <div className="padsgrid">
      <div className="pg-row chords">
        {DEGREES.map((g, i) => (
          <button key={i} className={`pg chord${on === `c${i}` ? ' on' : ''}`}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); if (latch && on === `c${i}`) { rel.current?.(); rel.current = null; setOn(null); } else chordOn(i); }}
            onPointerUp={chordOff} onPointerCancel={chordOff}>
            <b>{chordName(i)}</b>
            <small>{g.label}</small>
          </button>
        ))}
      </div>
      <div className="pg-row drums">
        {DRUMS.map((x) => (
          <button key={x.hit} className="pg hit" onPointerDown={() => engine.hit(x.hit, undefined, 1, true)}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="pg-row fxrow">
        <button className="pg fx" onPointerDown={() => engine.swell()}>Subida<small>2 compases</small></button>
        <button className="pg fx" onPointerDown={() => engine.impact()}>Impacto</button>
        <button className={`pg fx${drone ? ' on' : ''}`} aria-pressed={drone} onClick={() => { engine.setDrone(!drone); setDrone(!drone); }}>
          Fondo {song.key}<small>{drone ? 'sonando' : 'continuo'}</small>
        </button>
        <button className={`pg fx${latch ? ' on' : ''}`} aria-pressed={latch} onClick={() => { setLatch(!latch); if (latch) { rel.current?.(); rel.current = null; setOn(null); } }}>
          Retener<small>{latch ? 'acordes fijos' : 'mientras toca'}</small>
        </button>
      </div>
    </div>
  );
}
