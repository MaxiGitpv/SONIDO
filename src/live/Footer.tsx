import { useEffect, useRef, useState } from 'react';
import { useLive, Icon } from './ctx';
import { engine } from './engine';
import { clamp } from '../util';

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function Footer() {
  const { s, d, loadFile, rec, toggleRec, transport, song, tpNow } = useLive();
  const posRef = useRef<HTMLElement>(null);
  // Vista compacta del transporte único: la misma posición que el estudio multitrack y las tablets.
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = tpNow();
      if (posRef.current) posRef.current.textContent = `${mmss(t.pos)}${song.project.clips.length ? ` · ${song.project.tracks.length} pistas` : ''}`;
    }, 200);
    return () => window.clearInterval(id);
  }, [tpNow, song.project.clips.length, song.project.tracks.length]);
  const file = useRef<HTMLInputElement>(null);
  const taps = useRef<number[]>([]);
  const [tt, setTt] = useState('');
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
        <button className={`tp play${s.playing ? ' on' : ''}`} aria-label="Reproducir" onClick={() => transport('play')}><Icon name="play" size={22} /></button>
        <button className="tp" aria-label="Pausa" onClick={() => transport('pause')}><Icon name="pause" size={20} /></button>
        <button className="tp" aria-label="Detener pistas y volver al inicio" title="Detiene pistas y acompañamiento; micrófonos, master y notas en vivo siguen" onClick={() => transport('stop')}><Icon name="stop" size={18} /></button>
        <b ref={posRef} className="fpos" aria-label="Posición del transporte" />
        <button className={`tp rec${rec.on ? ' on' : ''}`} aria-pressed={rec.on} aria-label={rec.on ? 'Detener grabación' : 'Grabar el master'} title={rec.on ? 'Detener grabación' : 'Grabar el master'} onClick={toggleRec}>
          <i className="recdot" />{rec.on && <small>{mmss(rec.secs)}</small>}
        </button>
      </div>
      <button className="fbtn tap" onClick={tap}>Tap tempo <b>{song.bpm}</b></button>
      <button className={`fbtn mon${s.console.click.solo ? ' on' : ''}`} aria-pressed={s.console.click.solo} onClick={() => d({ type: 'ch', id: 'click', fn: (c) => ({ ...c, solo: !c.solo }) })} title="Escuchar el click por la salida de escucha. Nunca va a la sala.">
        <Icon name="headphones" /> Click en escucha <i className="led" />
      </button>
      {rec.url && !rec.on && (
        <div className="recout">
          <audio controls src={rec.url} aria-label="Grabación del master" />
          <a className="mini" href={rec.url} download={`SONIDO-${song.title}.${rec.ext}`}>Descargar</a>
        </div>
      )}
      <div className="scene-now">Escena: <b>{song.sections.find((x) => x.id === s.sceneId)?.label}</b></div>
      <button className="fnav" onClick={() => d({ type: 'step', dir: -1 })}><Icon name="prev" size={22} /> Anterior</button>
      <button className="fnav next" onClick={() => d({ type: 'step', dir: 1 })}>Siguiente <Icon name="next" size={22} /></button>
    </footer>
  );
}
