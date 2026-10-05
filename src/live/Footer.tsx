import { useEffect, useRef, useState } from 'react';
import { useLive, Icon } from './ctx';
import { engine } from './engine';
import { SCENES } from './types';
import { clamp } from '../util';

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function Footer() {
  const { s, d, loadFile } = useLive();
  const file = useRef<HTMLInputElement>(null);
  const taps = useRef<number[]>([]);
  const [tt, setTt] = useState('');
  const song = s.songs.find((x) => x.id === s.songId)!;
  const track = s.files.tracks;

  useEffect(() => {
    if (!track) return;
    const id = window.setInterval(() => {
      const { pos, dur } = engine.fileTime('tracks');
      setTt(`${mmss(pos)} / ${mmss(dur)}`);
    }, 250);
    return () => window.clearInterval(id);
  }, [track]);

  const tap = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 3000), now].slice(-6);
    if (taps.current.length >= 3) {
      const iv = taps.current.slice(1).map((t, i) => t - taps.current[i]);
      const bpm = Math.round(60000 / (iv.reduce((a, b) => a + b, 0) / iv.length));
      d({ type: 'songEdit', id: song.id, patch: { bpm: clamp(bpm, 40, 200) } });
    }
  };

  return (
    <footer className="lfoot">
      <input ref={file} type="file" accept="audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile('tracks', f); e.target.value = ''; }} />
      <button className="fbtn tracks" onClick={() => file.current?.click()} title="Cargar un archivo de audio en el canal Tracks">
        <Icon name="upload" />
        <span className="tr-t">
          <b>Tracks</b>
          <small>{track ? `${track} · ${tt}` : 'Cargar audio…'}</small>
        </span>
      </button>
      <div className="transport">
        <button className={`tp play${s.playing ? ' on' : ''}`} aria-label="Reproducir" onClick={() => engine.play()}><Icon name="play" size={22} /></button>
        <button className="tp" aria-label="Pausa" onClick={() => engine.pause()}><Icon name="pause" size={20} /></button>
        <button className="tp" aria-label="Detener y volver al inicio" onClick={() => { engine.stop(); d({ type: 'scene', id: song.arr[0]?.scene ?? 'intro' }); }}><Icon name="stop" size={18} /></button>
      </div>
      <button className="fbtn tap" onClick={tap}>Tap tempo <b>{song.bpm}</b></button>
      <button className={`fbtn mon${s.clickMonitor ? ' on' : ''}`} aria-pressed={s.clickMonitor} onClick={() => d({ type: 'clickMon', on: !s.clickMonitor })} title="Oír el click (canal solo para monitores)">
        <Icon name="headphones" /> Monitor <i className="led" />
      </button>
      <div className="scene-now">Escena: <b>{SCENES.find((x) => x.id === s.sceneId)?.label}</b></div>
      <button className="fnav" onClick={() => d({ type: 'step', dir: -1 })}><Icon name="prev" size={22} /> Anterior</button>
      <button className="fnav next" onClick={() => d({ type: 'step', dir: 1 })}>Siguiente <Icon name="next" size={22} /></button>
    </footer>
  );
}
