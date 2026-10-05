import { useEffect, useRef } from 'react';
import { useLive, Icon } from './ctx';
import { engine } from './engine';
import { SCENES } from './types';
import type { EndAction } from './types';

const SCENE_COLOR: Record<string, string> = { intro: '#5b6f8f', verso: '#2f86c9', coro: '#1ab8f5', puente: '#a06bff', final: '#3fcf8e' };
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** Línea de tiempo de la canción: secciones, inicio, fin y cabezal de reproducción. */
export function Timeline() {
  const { s, d, goScene } = useLive();
  const song = s.songs.find((x) => x.id === s.songId)!;
  const total = song.arr.reduce((a, x) => a + x.bars, 0);
  const barSec = (60 / song.bpm) * 4;
  const head = useRef<HTMLDivElement>(null);
  const info = useRef<HTMLSpanElement>(null);
  const pend = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const p = engine.position();
      const songBar = p.songBar + (engine.playing ? p.beat / 4 : 0);
      if (head.current) head.current.style.left = `${Math.min(100, (songBar / Math.max(1, total)) * 100)}%`;
      if (info.current) info.current.textContent = `Compás ${p.songBar + 1}/${total} · Tiempo ${p.beat + 1} · ${mmss(songBar * barSec)} / ${mmss(total * barSec)}`;
      if (pend.current) {
        const nxt = p.pending !== null ? song.arr[p.pending] : null;
        pend.current.textContent = nxt ? `→ ${SCENES.find((x) => x.id === nxt.scene)?.label} en el próximo compás` : '';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [total, barSec, song.arr]);

  return (
    <div className="timeline">
      <div className="tl-top">
        <div className="segx sm" role="group" aria-label="Modo de reproducción">
          <button className={s.playMode === 'follow' ? 'on' : ''} aria-pressed={s.playMode === 'follow'} onClick={() => d({ type: 'playMode', mode: 'follow' })} title="Avanza solo por las secciones de la canción">
            <Icon name="next" size={14} /> Seguir arreglo
          </button>
          <button className={s.playMode === 'loop' ? 'on' : ''} aria-pressed={s.playMode === 'loop'} onClick={() => d({ type: 'playMode', mode: 'loop' })} title="Repite la sección actual a tempo; los cambios entran al compás">
            <Icon name="loop" size={14} /> Repetir sección
          </button>
        </div>
        <span ref={info} className="tl-info" />
        <span ref={pend} className="tl-pend" />
        <label className="tl-end">
          Al final
          <select value={song.end} onChange={(e) => d({ type: 'end', end: e.target.value as EndAction })}>
            <option value="stop">Detener</option>
            <option value="loop">Repetir canción</option>
            <option value="next">Siguiente canción</option>
          </select>
        </label>
      </div>
      <div className="tl-track">
        <span className="tl-flag start">Inicio</span>
        {song.arr.map((sec, i) => {
          const on = sec.scene === s.sceneId;
          return (
            <div key={i} className={`tl-seg${on ? ' on' : ''}`} style={{ flexGrow: sec.bars, ['--sc' as string]: SCENE_COLOR[sec.scene] }}>
              <button className="tl-name" onClick={() => goScene(sec.scene)}>
                {SCENES.find((x) => x.id === sec.scene)?.label}
              </button>
              <span className="tl-bars">
                <button aria-label="Menos compases" disabled={sec.bars <= 1} onClick={() => d({ type: 'bars', index: i, bars: sec.bars - 1 })}>−</button>
                <b>{sec.bars}</b>
                <button aria-label="Más compases" disabled={sec.bars >= 32} onClick={() => d({ type: 'bars', index: i, bars: sec.bars + 1 })}>+</button>
              </span>
            </div>
          );
        })}
        <span className="tl-flag end">Fin</span>
        <div ref={head} className="tl-head" aria-hidden="true" />
      </div>
    </div>
  );
}
