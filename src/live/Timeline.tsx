import { useEffect, useRef, useState } from 'react';
import { useLive, Icon } from './ctx';
import { engine, meter } from './engine';
import { KINDS } from './types';
import type { EndAction, SectionKind } from './types';

export const KIND_COLOR: Record<SectionKind, string> = {
  intro: '#5b6f8f', verso: '#2f86c9', precoro: '#2fa6b9', coro: '#1ab8f5', puente: '#a06bff', interludio: '#6f7fa8', tag: '#e58fb3', vamp: '#f2a53a', final: '#3fcf8e', otro: '#8a96b0',
};
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** Línea de tiempo de la canción. Con `edit`, permite armar cualquier estructura: secciones propias, orden, repeticiones y compases. */
export function Timeline({ edit }: { edit?: boolean }) {
  const { s, d, goScene, can } = useLive();
  const song = s.songs.find((x) => x.id === s.songId)!;
  const canMusic = can('music');
  const total = song.arr.reduce((a, x) => a + x.bars, 0);
  const barSec = meter(song.ts, song.bpm).bar;
  const head = useRef<HTMLDivElement>(null);
  const info = useRef<HTMLSpanElement>(null);
  const pend = useRef<HTMLSpanElement>(null);
  const [newName, setNewName] = useState('');
  const [newKind, setNewKind] = useState<SectionKind>('precoro');
  const secOf = (id: string) => song.sections.find((x) => x.id === id);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const p = engine.position();
      const songBar = p.songBar + (engine.playing ? p.beat / Math.max(1, p.beats) : 0);
      if (head.current) head.current.style.left = `${Math.min(100, (songBar / Math.max(1, total)) * 100)}%`;
      if (info.current) info.current.textContent = `Compás ${p.songBar + 1}/${total} · Pulso ${p.beat + 1}/${p.beats} · ${song.ts} · ${mmss(songBar * barSec)} / ${mmss(total * barSec)}`;
      if (pend.current) {
        const nxt = p.pending !== null ? song.arr[p.pending] : null;
        pend.current.textContent = nxt ? `→ ${secOf(nxt.scene)?.label ?? ''} en el próximo compás` : '';
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [total, barSec, song]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="timeline">
      <div className="tl-top">
        <div className="segx sm" role="group" aria-label="Modo de reproducción">
          <button className={s.playMode === 'follow' ? 'on' : ''} aria-pressed={s.playMode === 'follow'} disabled={!canMusic} onClick={() => d({ type: 'playMode', mode: 'follow' })} title="Avanza solo por las secciones de la canción">
            <Icon name="next" size={14} /> Seguir arreglo
          </button>
          <button className={s.playMode === 'loop' ? 'on' : ''} aria-pressed={s.playMode === 'loop'} disabled={!canMusic} onClick={() => d({ type: 'playMode', mode: 'loop' })} title="Repite la sección actual a tempo; los cambios entran al compás">
            <Icon name="loop" size={14} /> Repetir sección
          </button>
        </div>
        <span ref={info} className="tl-info" />
        <span ref={pend} className="tl-pend" />
        <label className="tl-end">
          Al final
          <select value={song.end} disabled={!canMusic} onChange={(e) => d({ type: 'end', end: e.target.value as EndAction })}>
            <option value="stop">Detener</option>
            <option value="loop">Repetir canción</option>
            <option value="next">Siguiente canción</option>
          </select>
        </label>
      </div>
      <div className="tl-track">
        <span className="tl-flag start">Inicio</span>
        {song.arr.map((it, i) => {
          const sec = secOf(it.scene);
          const on = it.scene === s.sceneId;
          return (
            <div key={i} className={`tl-seg${on ? ' on' : ''}`} style={{ flexGrow: it.bars, ['--sc' as string]: KIND_COLOR[sec?.kind ?? 'otro'] }}>
              <button className="tl-name" onClick={() => goScene(it.scene)} title={`Ir a ${sec?.label}`}>{sec?.label ?? '?'}</button>
              <span className="tl-bars">
                <button aria-label="Menos compases" disabled={!canMusic || it.bars <= 1} onClick={() => d({ type: 'bars', index: i, bars: it.bars - 1 })}>−</button>
                <b>{it.bars}</b>
                <button aria-label="Más compases" disabled={!canMusic || it.bars >= 64} onClick={() => d({ type: 'bars', index: i, bars: it.bars + 1 })}>+</button>
              </span>
            </div>
          );
        })}
        <span className="tl-flag end">Fin</span>
        <div ref={head} className="tl-head" aria-hidden="true" />
      </div>
      {edit && (
        <div className="arr-edit">
          <div className="arr-list" aria-label="Orden de la canción">
            {song.arr.map((it, i) => (
              <div key={i} className="arr-item" style={{ ['--sc' as string]: KIND_COLOR[secOf(it.scene)?.kind ?? 'otro'] }}>
                <span className="arr-n">{i + 1}</span>
                <select aria-label={`Sección del paso ${i + 1}`} value={it.scene} disabled={!canMusic} onChange={(e) => d({ type: 'arrScene', index: i, scene: e.target.value })}>
                  {song.sections.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                </select>
                <span className="arr-bars">{it.bars} c.</span>
                <button className="iconbtn" aria-label="Mover antes" disabled={!canMusic || i === 0} onClick={() => d({ type: 'arrMove', index: i, dir: -1 })}><Icon name="prev" size={14} /></button>
                <button className="iconbtn" aria-label="Mover después" disabled={!canMusic || i === song.arr.length - 1} onClick={() => d({ type: 'arrMove', index: i, dir: 1 })}><Icon name="next" size={14} /></button>
                <button className="iconbtn" aria-label="Quitar del orden" disabled={!canMusic || song.arr.length <= 1} onClick={() => d({ type: 'arrRemove', index: i })}><Icon name="x" size={14} /></button>
              </div>
            ))}
            <div className="arr-add">
              <select id="arr-add-sel" aria-label="Sección a repetir" disabled={!canMusic} defaultValue="">
                <option value="" disabled>Repetir una sección…</option>
                {song.sections.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
              <button className="mini" disabled={!canMusic} onClick={() => {
                const sel = document.getElementById('arr-add-sel') as HTMLSelectElement | null;
                if (sel?.value) d({ type: 'arrAdd', scene: sel.value, bars: song.arr.find((x) => x.scene === sel.value)?.bars ?? 4 });
              }}><Icon name="plus" size={14} /> Añadir al orden</button>
            </div>
          </div>
          <div className="sec-list" aria-label="Secciones de la canción">
            <h4>Secciones</h4>
            {song.sections.map((x) => (
              <div key={x.id} className="sec-item" style={{ ['--sc' as string]: KIND_COLOR[x.kind] }}>
                <i />
                <input aria-label="Nombre de la sección" value={x.label} maxLength={20} disabled={!canMusic} onChange={(e) => d({ type: 'secEdit', id: x.id, patch: { label: e.target.value } })} />
                <select aria-label="Tipo de sección" value={x.kind} disabled={!canMusic} onChange={(e) => d({ type: 'secEdit', id: x.id, patch: { kind: e.target.value as SectionKind } })}>
                  {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
                <button className="iconbtn" aria-label={`Eliminar ${x.label}`} disabled={!canMusic || song.sections.length <= 1} onClick={() => d({ type: 'secRemove', id: x.id })}><Icon name="x" size={14} /></button>
              </div>
            ))}
            <form className="sec-new" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) { d({ type: 'secAdd', label: newName.trim(), kind: newKind }); setNewName(''); } }}>
              <input id="sec-new-name" aria-label="Nombre de la nueva sección" placeholder="Ej.: Pre-coro 2, Tag, Vamp" value={newName} maxLength={20} disabled={!canMusic} onChange={(e) => setNewName(e.target.value)} />
              <select aria-label="Tipo" value={newKind} disabled={!canMusic} onChange={(e) => setNewKind(e.target.value as SectionKind)}>
                {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <button className="mini" type="submit" disabled={!canMusic || !newName.trim()}><Icon name="plus" size={14} /> Nueva sección</button>
            </form>
            <p className="hint2">El tipo define el acompañamiento sintetizado (intro, verso, coro…). El nombre es libre.</p>
          </div>
        </div>
      )}
    </div>
  );
}
