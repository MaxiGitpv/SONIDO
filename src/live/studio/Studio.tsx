/*
 * Estudio multitrack (C6.4). Dos vistas sobre el mismo proyecto y el mismo transporte:
 * - Preparar: pistas apiladas, formas de onda reales, clips editables sin destruir el archivo, marcadores y A/B.
 * - En vivo: sección actual y siguiente, tiempo restante y controles grandes; sin edición estructural.
 * Cabeceras, regla, clips y cursor comparten un único contenedor de desplazamiento y la misma escala (px/s).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as RPE, ReactNode } from 'react';
import { useLive, Icon } from '../ctx';
import { ModuleHead } from '../nav';
import { engine, meter } from '../engine';
import { KIND_COLOR } from '../Timeline';
import { STEM_CATS } from '../types';
import type { Clip, Marker, Project, StemCat, Track } from '../types';
import { CAT_COLOR, clipEnd, envelopeAt, linkedIds, missingAssets, overlaps, projectEnd, snapTo, stepStart, trimEnd, trimStart, uid } from './model';
import { peaksStore, pickLevel, rangeAt } from './peaks';
import { HSlider } from '../../components/HSlider';
import { clamp, dbToLin, dbToPos, fmtDb, posToDb } from '../../util';
import type { ProjOp } from './ops';
import { TempoCard } from './TempoCard';

const HEAD_W = 220;
const RULER_H = 44;
const fmtT = (t: number) => {
  const s = Math.max(0, t);
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
};
const mmss = (t: number) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;

type Drag =
  | { kind: 'move'; ids: string[]; x0: number; dt: number }
  | { kind: 'trimStart' | 'trimEnd'; ids: string[]; x0: number; d: number }
  | { kind: 'fadeIn' | 'fadeOut'; id: string; x0: number; v0: number; v: number }
  | { kind: 'marker'; id: string; x0: number; at0: number; at: number }
  | { kind: 'loop'; x0: number; a: number; b: number }
  | null;

export function Studio() {
  const { d, song, can, remote } = useLive();
  const edit = can('music');
  const [mode, setMode] = useState<'prep' | 'live'>(() => (remote ? 'live' : 'prep'));
  const p = song.project;
  const m = meter(song.ts, song.bpm);
  return (
    <div className="mpage studio">
      <ModuleHead title={`Multitrack · ${song.title}`} desc="Pistas, clips y secciones sobre el audio real, con el mismo transporte que Inicio. Editar no modifica los archivos originales.">
        <div className="segx sm" role="tablist" aria-label="Vista del estudio">
          <button role="tab" aria-selected={mode === 'prep'} className={mode === 'prep' ? 'on' : ''} onClick={() => setMode('prep')}>Preparar</button>
          <button role="tab" aria-selected={mode === 'live'} className={mode === 'live' ? 'on' : ''} onClick={() => setMode('live')}>En vivo</button>
        </div>
      </ModuleHead>
      <div className="st-proj">
        <span><small>Estado</small> <TpState /></span>
        <span><small>Tempo de referencia</small> {song.bpm} BPM</span>
        <span><small>Compás</small> {song.ts}</span>
        <span><small>Tonalidad</small> {song.key}</span>
        <span><small>Duración</small> {mmss(projectEnd(p))}</span>
        <span><small>Pistas</small> {p.tracks.length} · {p.clips.length} clips</span>
        <label className="chk" title="Vínculo explícito: ritmos y partes sintetizadas de SONIDO junto al audio del proyecto. Lo tocado en vivo y el click no dependen de esto.">
          <input type="checkbox" checked={p.accomp} disabled={!edit} onChange={(e) => d({ type: 'proj', op: { k: 'settings', patch: { accomp: e.target.checked } } })} /> Acompañamiento sintetizado
        </label>
        {p.accomp && p.tracks.some((t) => t.cat === 'bateria') && <span className="st-warn">Hay una pista de batería y el acompañamiento sintetizado está activo: sonarán las dos baterías.</span>}
      </div>
      {mode === 'prep' ? <Arrange edit={edit} /> : <LiveOps />}
      <p className="hint2">
        Sin warp: cambiar el tempo de referencia ({song.bpm} BPM) mueve la rejilla, no estira el audio; la tonalidad tampoco transpone el audio grabado. Compás actual: {m.beats.length} pulsos de {(m.bar / m.beats.length).toFixed(2)} s. {remote ? 'Esta tablet ve picos reducidos que envía el anfitrión; el audio solo suena allí.' : ''}
      </p>
    </div>
  );
}

/** Estado textual del transporte, actualizado sin re-render global. */
function TpState() {
  const { tpNow } = useLive();
  const [txt, setTxt] = useState('');
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = tpNow();
      setTxt(`${t.playing ? 'sonando' : 'detenido'} · ${fmtT(t.pos)}`);
    }, 200);
    return () => window.clearInterval(id);
  }, [tpNow]);
  return <b>{txt}</b>;
}

/* ===================================================================== */
/*                          Vista Preparar                               */
/* ===================================================================== */

function Arrange({ edit }: { edit: boolean }) {
  const { s, d, song, remote, assets, addStems, transport, tpNow } = useLive();
  const p = song.project;
  const m = meter(song.ts, song.bpm);
  const scroller = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [pps, setPps] = useState(40);
  const [rowH, setRowH] = useState(100);
  const [sel, setSel] = useState<string[]>([]);
  const [selTrack, setSelTrack] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [follow, setFollow] = useState(true);
  const [view, setView] = useState({ left: 0, top: 0, w: 800, h: 400 });
  const [insp, setInsp] = useState(true);
  const [ask, setAsk] = useState<null | { kind: 'missing' } | { kind: 'preview'; asset: string; from: number }>(null);
  const [, rerender] = useState(0);
  useEffect(() => peaksStore.subscribe(() => rerender((x) => x + 1)), []);

  const end = Math.max(projectEnd(p), (p.markers[p.markers.length - 1]?.at ?? 0) + m.bar * 4, 30);
  const laneW = Math.ceil((end + 10) * pps);
  const gridStep = pps * m.bar / m.beats.length >= 14 ? m.bar / m.beats.length : m.bar;
  const snap = (t: number, fine: boolean) => (p.snap && !fine ? snapTo(t, gridStep) : t);
  const over = useMemo(() => overlaps(p), [p]);
  const op = (o: ProjOp) => d({ type: 'proj', op: o });

  // Clip tal como se ve durante un arrastre (lo que se suelte es exactamente lo que sonará).
  const shown = useCallback((c: Clip): Clip => {
    if (!drag) return c;
    const linked = 'ids' in drag ? new Set(linkedIds(p, drag.ids)) : null;
    if (drag.kind === 'move' && linked?.has(c.id)) return { ...c, pos: Math.max(0, c.pos + drag.dt) };
    if (drag.kind === 'trimStart' && linked?.has(c.id)) return trimStart(c, c.pos + drag.d);
    if (drag.kind === 'trimEnd' && linked?.has(c.id)) return trimEnd(c, clipEnd(c) + drag.d, p.assets[c.asset]?.duration || c.off + c.len);
    if (drag.kind === 'fadeIn' && drag.id === c.id) return { ...c, fadeIn: clamp(drag.v, 0, c.len - c.fadeOut) };
    if (drag.kind === 'fadeOut' && drag.id === c.id) return { ...c, fadeOut: clamp(drag.v, 0, c.len - c.fadeIn) };
    return c;
  }, [drag, p]);

  const markersShown = useMemo(() => (drag?.kind === 'marker' ? p.markers.map((x) => (x.id === drag.id ? { ...x, at: drag.at } : x)) : p.markers), [drag, p.markers]);
  const loopShown = drag?.kind === 'loop' ? { ...p.loop, a: Math.min(drag.a, drag.b), b: Math.max(drag.a, drag.b) } : p.loop;

  /* ---------- Desplazamiento, tamaño y cursor ---------- */
  const syncView = () => {
    const el = scroller.current;
    if (el) setView({ left: el.scrollLeft, top: el.scrollTop, w: el.clientWidth - HEAD_W, h: el.clientHeight });
  };
  useLayoutEffect(() => {
    syncView();
    const ro = new ResizeObserver(syncView);
    if (scroller.current) ro.observe(scroller.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = tpNow();
      if (head.current) head.current.style.transform = `translateX(${HEAD_W + t.pos * pps}px)`;
      const el = scroller.current;
      if (follow && t.playing && el) {
        const x = t.pos * pps;
        if (x < el.scrollLeft || x > el.scrollLeft + el.clientWidth - HEAD_W - 40) el.scrollLeft = Math.max(0, x - 80);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pps, follow, tpNow]);

  const zoomAt = (factor: number, anchorX?: number) => {
    const el = scroller.current;
    if (!el) return;
    const ax = anchorX ?? (el.clientWidth - HEAD_W) / 2;
    const t = (el.scrollLeft + ax) / pps;
    const np = clamp(pps * factor, 2, 2000);
    setPps(np);
    requestAnimationFrame(() => {
      el.scrollLeft = Math.max(0, t * np - ax);
      syncView();
    });
  };
  const fit = () => {
    const el = scroller.current;
    if (!el) return;
    setPps(clamp((el.clientWidth - HEAD_W - 30) / Math.max(1, projectEnd(p) || 30), 2, 2000));
    el.scrollLeft = 0;
  };
  const toSelection = () => {
    const el = scroller.current;
    const c = p.clips.find((x) => x.id === sel[0]);
    if (el && c) el.scrollLeft = Math.max(0, c.pos * pps - 60);
  };

  const timeAt = (clientX: number) => {
    const el = scroller.current!;
    const r = el.getBoundingClientRect();
    return Math.max(0, (clientX - r.left - HEAD_W + el.scrollLeft) / pps);
  };

  /* ---------- Gestos ---------- */
  const startDrag = (e: RPE, dr: NonNullable<Drag>) => {
    if (!edit) return;
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    setDrag(dr);
  };
  const onMove = (e: RPE) => {
    if (!drag) return;
    const fine = e.altKey;
    const dx = (e.clientX - drag.x0) / pps;
    if (drag.kind === 'move') {
      const lead = p.clips.find((c) => c.id === drag.ids[0])!;
      setDrag({ ...drag, dt: snap(lead.pos + dx, fine) - lead.pos });
    } else if (drag.kind === 'trimStart') {
      const lead = p.clips.find((c) => c.id === drag.ids[0])!;
      setDrag({ ...drag, d: snap(lead.pos + dx, fine) - lead.pos });
    } else if (drag.kind === 'trimEnd') {
      const lead = p.clips.find((c) => c.id === drag.ids[0])!;
      setDrag({ ...drag, d: snap(clipEnd(lead) + dx, fine) - clipEnd(lead) });
    } else if (drag.kind === 'fadeIn') setDrag({ ...drag, v: Math.max(0, drag.v0 + dx) });
    else if (drag.kind === 'fadeOut') setDrag({ ...drag, v: Math.max(0, drag.v0 - dx) });
    else if (drag.kind === 'marker') setDrag({ ...drag, at: Math.max(0, snap(drag.at0 + dx, fine)) });
    else if (drag.kind === 'loop') setDrag({ ...drag, b: snap(timeAt(e.clientX), fine) });
  };
  const onUp = () => {
    const dr = drag;
    setDrag(null);
    if (!dr) return;
    if (dr.kind === 'move' && Math.abs(dr.dt) > 1e-4) op({ k: 'move', ids: dr.ids, dt: dr.dt });
    if (dr.kind === 'trimStart' && Math.abs(dr.d) > 1e-4) op({ k: 'trimStart', ids: dr.ids, d: dr.d });
    if (dr.kind === 'trimEnd' && Math.abs(dr.d) > 1e-4) op({ k: 'trimEnd', ids: dr.ids, d: dr.d });
    if (dr.kind === 'fadeIn' || dr.kind === 'fadeOut') op({ k: 'clip', id: dr.id, patch: { [dr.kind]: dr.v } });
    if (dr.kind === 'marker' && Math.abs(dr.at - dr.at0) > 1e-4) {
      const mk = p.markers.find((x) => x.id === dr.id);
      if (mk) op({ k: 'marker', m: { ...mk, at: dr.at } });
    }
    if (dr.kind === 'loop' && Math.abs(dr.b - dr.a) > 0.05) op({ k: 'settings', patch: { loop: { on: true, a: Math.min(dr.a, dr.b), b: Math.max(dr.a, dr.b) } } });
  };

  const pickClip = (e: RPE, c: Clip) => {
    const add = e.shiftKey || e.ctrlKey || e.metaKey;
    const ids = add ? (sel.includes(c.id) ? sel.filter((x) => x !== c.id) : [...sel, c.id]) : sel.includes(c.id) ? sel : [c.id];
    setSel(ids);
    setSelTrack(c.track);
    startDrag(e, { kind: 'move', ids, x0: e.clientX, dt: 0 });
  };

  const cursorTo = (t: number) => transport('seek', t);

  /* ---------- Teclado (solo con el foco dentro del editor) ---------- */
  const onKey = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, select, textarea')) return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (k === ' ') transport('toggle');
    else if (mod && k === 'z') d({ type: e.shiftKey ? 'projRedo' : 'projUndo' });
    else if (mod && k === 'y') d({ type: 'projRedo' });
    else if (!edit) return;
    else if (k === 's' && !mod) op({ k: 'split', t: tpNow().pos, ids: sel.length ? sel : undefined });
    else if (mod && k === 'd') sel.length && op({ k: 'dup', ids: sel });
    else if (k === 'delete' || k === 'backspace') sel.length && (op({ k: 'remove', ids: sel }), setSel([]));
    else if (k === 'm' && !mod) addMarker();
    else if ((k === 'arrowleft' || k === 'arrowright') && sel.length) op({ k: 'move', ids: sel, dt: (k === 'arrowleft' ? -1 : 1) * (e.altKey ? 0.01 : gridStep) });
    else return;
    e.preventDefault();
  };

  const addMarker = () => {
    const t = snap(tpNow().pos, false);
    const used = new Set(p.markers.map((x) => x.sec));
    const sec = song.sections.find((x) => !used.has(x.id)) ?? song.sections[0];
    op({ k: 'marker', m: { id: uid('m'), at: t, sec: sec.id } });
  };

  const missing = missingAssets(p, (a) => (remote ? true : engine.hasAudio(a) || assets[a] === 'loading'));
  const play = () => {
    if (!tpNow().playing && missing.length && !remote) return setAsk({ kind: 'missing' });
    transport('toggle');
  };

  const selClips = p.clips.filter((c) => sel.includes(c.id));
  const track = p.tracks.find((t) => t.id === selTrack);

  return (
    <div className="st-wrap">
      <div className="st-tools" role="toolbar" aria-label="Transporte y edición">
        <div className="st-group">
          <button className="tp" aria-label="Ir al inicio" title="Ir al inicio (Inicio)" onClick={() => transport('seek', 0)}><Icon name="prev" size={18} /></button>
          <button className={`tp play${s.playing ? ' on' : ''}`} aria-label={s.playing ? 'Pausa' : 'Reproducir'} title="Reproducir / pausa (Espacio)" onClick={play}><Icon name={s.playing ? 'pause' : 'play'} size={20} /></button>
          <button className="tp" aria-label="Detener pistas y volver al inicio" title="Detener pistas (no corta micrófonos, master ni notas en vivo)" onClick={() => transport('stop')}><Icon name="stop" size={16} /></button>
          <PosReadout />
        </div>
        <div className="st-group">
          <label className="st-lbl">Cuenta
            <select value={p.countIn} disabled={!edit} onChange={(e) => op({ k: 'settings', patch: { countIn: Number(e.target.value) } })}>
              {[0, 1, 2].map((n) => <option key={n} value={n}>{n ? `${n} comp.` : 'sin cuenta'}</option>)}
            </select>
          </label>
          <button className={`mini${p.loop.on ? ' on' : ''}`} aria-pressed={p.loop.on} disabled={!edit} title="Bucle A/B (Mayús + arrastrar en la regla para marcarlo)" onClick={() => setLoopOn(!p.loop.on)}><Icon name="loop" size={14} /> A/B</button>
        </div>
        <div className="st-group">
          <input ref={file} type="file" accept="audio/*" multiple hidden onChange={(e) => { const fs = [...(e.target.files ?? [])]; if (fs.length) void addStems(fs); e.target.value = ''; }} />
          <button className="mini on" disabled={!edit || remote} title={remote ? 'Importe en el equipo anfitrión' : 'Varios archivos de una misma exportación quedan alineados en grupo'} onClick={() => file.current?.click()}><Icon name="upload" size={14} /> Importar</button>
          <button className="mini" disabled={!edit || !p.clips.length} title="Dividir en el cursor (S)" onClick={() => op({ k: 'split', t: tpNow().pos, ids: sel.length ? sel : undefined })}>Dividir</button>
          <button className="mini" disabled={!edit || !sel.length} title="Duplicar (Ctrl+D)" onClick={() => op({ k: 'dup', ids: sel })}>Duplicar</button>
          <button className="mini" disabled={!edit || !sel.length} title="Eliminar (Supr)" onClick={() => { op({ k: 'remove', ids: sel }); setSel([]); }}>Eliminar</button>
          <button className="mini" disabled={!edit} title="Deshacer (Ctrl+Z)" onClick={() => d({ type: 'projUndo' })}>Deshacer</button>
          <button className="mini" disabled={!edit} title="Rehacer (Ctrl+Y)" onClick={() => d({ type: 'projRedo' })}>Rehacer</button>
          <button className="mini" disabled={!edit} title="Marcador de sección en el cursor (M)" onClick={addMarker}><Icon name="plus" size={14} /> Marcador</button>
        </div>
        <div className="st-group">
          <button className={`mini${p.snap ? ' on' : ''}`} aria-pressed={p.snap} disabled={!edit} title="Ajustar a la rejilla (Alt mientras arrastra: movimiento fino)" onClick={() => op({ k: 'settings', patch: { snap: !p.snap } })}>Rejilla</button>
          <button className="mini" aria-label="Alejar" onClick={() => zoomAt(1 / 1.5)}>−</button>
          <button className="mini" aria-label="Acercar" onClick={() => zoomAt(1.5)}>+</button>
          <button className="mini" onClick={fit}>Ajustar todo</button>
          <button className={`mini${follow ? ' on' : ''}`} aria-pressed={follow} onClick={() => setFollow(!follow)}>Seguir</button>
          <button className="mini" disabled={!sel.length} onClick={toSelection}>Ir a selección</button>
          <label className="st-lbl">Alto
            <input type="range" min={56} max={180} value={rowH} onChange={(e) => setRowH(Number(e.target.value))} aria-label="Alto de las pistas" />
          </label>
          <button className={`mini${insp ? ' on' : ''}`} aria-pressed={insp} onClick={() => setInsp(!insp)}>Inspector</button>
        </div>
      </div>
      {ask?.kind === 'missing' && (
        <div className="st-ask" role="alertdialog" aria-label="Faltan archivos">
          <p>Faltan {missing.length} archivo(s): {missing.map((x) => x.name).join(', ')}. Esas pistas no sonarán.</p>
          <button className="mini on" onClick={() => { setAsk(null); transport('play'); }}>Reproducir igualmente</button>
          <button className="mini" onClick={() => setAsk(null)}>Cancelar</button>
        </div>
      )}
      {ask?.kind === 'preview' && (
        <div className="st-ask" role="alertdialog" aria-label="Preescucha">
          <p>No hay una salida de escucha separada de la sala. La preescucha se oiría en la sala (no se graba).</p>
          <button className="mini warn" onClick={() => { engine.previewStart(ask.asset, ask.from, true); setAsk(null); rerender((x) => x + 1); }}>Escuchar por la sala</button>
          <button className="mini" onClick={() => setAsk(null)}>Cancelar</button>
        </div>
      )}
      <div className={`st-main${insp ? ' insp' : ''}`}>
        <div
          ref={scroller}
          className="st-scroll"
          tabIndex={0}
          aria-label="Línea de tiempo del proyecto (Espacio: reproducir; S: dividir; M: marcador)"
          onScroll={syncView}
          onKeyDown={onKey}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onWheel={(e) => {
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              const r = scroller.current!.getBoundingClientRect();
              zoomAt(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left - HEAD_W);
            }
          }}
        >
          <div className="st-content" style={{ width: HEAD_W + laneW, ['--rowh' as string]: `${rowH}px` }}>
            <div className="st-row st-rulerrow" style={{ height: RULER_H }}>
              <div className="st-corner">
                <small>{p.tracks.length ? 'Pistas' : 'Sin pistas'}</small>
                {over.size > 0 && <small className="st-warn">Hay clips solapados: se mezclan</small>}
              </div>
              <div
                className="st-ruler"
                style={{ width: laneW }}
                onPointerDown={(e) => {
                  const t = timeAt(e.clientX);
                  if (e.shiftKey && edit) return startDrag(e, { kind: 'loop', x0: e.clientX, a: snap(t, e.altKey), b: snap(t, e.altKey) });
                  cursorTo(snap(t, e.altKey || !p.snap));
                }}
              >
                <RulerCanvas view={view} pps={pps} bar={m.bar} beats={m.beats.length} />
                <Regions song={song} markers={markersShown} pps={pps} bar={m.bar} />
                {(loopShown.on || drag?.kind === 'loop') && <div className="st-loop" style={{ left: loopShown.a * pps, width: (loopShown.b - loopShown.a) * pps }} title={`Bucle A/B ${fmtT(loopShown.a)}–${fmtT(loopShown.b)}`} />}
                {markersShown.map((mk) => (
                  <MarkerFlag key={mk.id} mk={mk} pps={pps} song={song} edit={edit}
                    onDown={(e) => startDrag(e, { kind: 'marker', id: mk.id, x0: e.clientX, at0: mk.at, at: mk.at })} />
                ))}
              </div>
            </div>
            {p.tracks.map((t, i) => (
              <div key={t.id} className={`st-row${selTrack === t.id ? ' sel' : ''}`} style={{ height: rowH }}>
                <TrackHead t={t} i={i} n={p.tracks.length} edit={edit} status={trackStatus(p, t, remote ? null : assets)} onSelect={() => setSelTrack(t.id)} />
                <div className="st-lane" style={{ width: laneW }} onPointerDown={(e) => { setSel([]); setSelTrack(t.id); cursorTo(snap(timeAt(e.clientX), e.altKey || !p.snap)); }}>
                  <LaneCanvas p={p} t={t} shown={shown} view={view} pps={pps} h={rowH} />
                  {p.clips.filter((c) => c.track === t.id).map((c0) => {
                    const c = shown(c0);
                    const isSel = sel.includes(c0.id) || (sel.length > 0 && linkedIds(p, sel).includes(c0.id));
                    return (
                      <div
                        key={c0.id}
                        className={`st-clip${isSel ? ' sel' : ''}${over.has(c0.id) ? ' over' : ''}${c0.group ? ' grouped' : ''}`}
                        style={{ left: c.pos * pps, width: Math.max(4, c.len * pps), ['--cc' as string]: t.color }}
                        onPointerDown={(e) => pickClip(e, c0)}
                        title={`${p.assets[c0.asset]?.name ?? 'Clip'} · ${fmtT(c.pos)} – ${fmtT(clipEnd(c))}${c0.group ? ' · en grupo de alineación' : ''}`}
                      >
                        <span className="st-cname">{c0.group ? '⛓ ' : ''}{p.assets[c0.asset]?.name ?? 'Clip'}{c.gain ? ` · ${fmtDb(c.gain)} dB` : ''}</span>
                        {edit && (
                          <>
                            <i className="st-h l" title="Recortar inicio" onPointerDown={(e) => startDrag(e, { kind: 'trimStart', ids: isSel ? sel : [c0.id], x0: e.clientX, d: 0 })} />
                            <i className="st-h r" title="Recortar final" onPointerDown={(e) => startDrag(e, { kind: 'trimEnd', ids: isSel ? sel : [c0.id], x0: e.clientX, d: 0 })} />
                            <i className="st-f l" style={{ left: c.fadeIn * pps }} title="Fundido de entrada" onPointerDown={(e) => startDrag(e, { kind: 'fadeIn', id: c0.id, x0: e.clientX, v0: c0.fadeIn, v: c0.fadeIn })} />
                            <i className="st-f r" style={{ right: c.fadeOut * pps }} title="Fundido de salida" onPointerDown={(e) => startDrag(e, { kind: 'fadeOut', id: c0.id, x0: e.clientX, v0: c0.fadeOut, v: c0.fadeOut })} />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {!p.tracks.length && (
              <div className="st-empty">
                <p>Importe los stems de la canción (WAV, MP3, M4A u OGG). Cada archivo será una pista; los de una misma importación quedan alineados en grupo.</p>
                <button className="savebtn small" disabled={!edit || remote} onClick={() => file.current?.click()}><Icon name="upload" /> Importar audio</button>
              </div>
            )}
            <div ref={head} className="st-playhead" aria-hidden="true" />
          </div>
        </div>
        {insp && (
          <aside className="st-insp" aria-label="Inspector">
            <Inspector clips={selClips} track={track} edit={edit} onPreview={(asset, from) => {
              if (engine.previewing) {
                engine.previewStop();
                return rerender((x) => x + 1);
              }
              if (!engine.cueSeparate()) return setAsk({ kind: 'preview', asset, from });
              engine.previewStart(asset, from, false);
              rerender((x) => x + 1);
            }} />
            <Markers song={song} edit={edit} />
            <Order song={song} edit={edit} />
            <TempoCard edit={edit} />
          </aside>
        )}
      </div>
    </div>
  );

  function setLoopOn(on: boolean) {
    op({ k: 'settings', patch: { loop: { ...p.loop, on } } });
  }
}

/* ---------- Estado de pista ---------- */
function trackStatus(p: Project, t: Track, assets: Record<string, string> | null): string {
  const cs = p.clips.filter((c) => c.track === t.id);
  if (!cs.length) return 'sin clips';
  if (!assets) return 'en el anfitrión';
  const st = cs.map((c) => (engine.hasAudio(c.asset) ? 'ready' : assets[c.asset] ?? 'pendiente'));
  if (st.includes('missing')) return 'falta el archivo';
  if (st.includes('error')) return 'error al decodificar';
  if (st.includes('loading')) return 'cargando';
  if (st.includes('session')) return 'solo esta sesión (sin espacio)';
  if (st.every((x) => x === 'ready')) return 'listo';
  return 'toque para activar el audio';
}

function TrackHead({ t, i, n, edit, status, onSelect }: { t: Track; i: number; n: number; edit: boolean; status: string; onSelect: () => void }) {
  const { d } = useLive();
  const set = (patch: Partial<Track>) => d({ type: 'proj', op: { k: 'track', id: t.id, patch } });
  const meterRef = useRef<HTMLElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const db = engine.trackLevel(t.id);
      if (meterRef.current) meterRef.current.style.width = `${clamp((db + 60) / 60, 0, 1) * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [t.id]);
  return (
    <div className="st-head" style={{ ['--cc' as string]: t.color }} onPointerDown={onSelect}>
      <div className="st-h1">
        <input className="st-name" value={t.name} disabled={!edit} aria-label={`Nombre de la pista ${i + 1}`} onChange={(e) => set({ name: e.target.value })} />
        <button className={`ms m${t.mute ? ' on' : ''}`} aria-pressed={t.mute} disabled={!edit} aria-label={`Silenciar ${t.name}`} onClick={() => set({ mute: !t.mute })}>M</button>
        <button className={`ms s${t.solo ? ' on' : ''}`} aria-pressed={t.solo} aria-label={`Escucha (PFL) de ${t.name}`} title="Escucha previa por la salida de escucha: no cambia la sala" onClick={() => set({ solo: !t.solo })}>S</button>
      </div>
      <div className="st-h2">
        <select aria-label="Categoría" value={t.cat} disabled={!edit} onChange={(e) => { const cat = e.target.value as StemCat; set({ cat, color: CAT_COLOR[cat], route: cat === 'click' || cat === 'guia' ? 'click' : 'tracks' }); }}>
          {STEM_CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <select aria-label="Ruta" value={t.route} disabled={!edit} title="Pistas: llega a la sala por el canal «Pistas» de la consola. Click: solo monitores y escucha." onChange={(e) => set({ route: e.target.value as Track['route'] })}>
          <option value="tracks">→ Pistas (sala)</option>
          <option value="click">→ Click (monitores)</option>
        </select>
      </div>
      <div className="st-h3">
        <HSlider label={`Nivel de ${t.name}`} value={t.db} toPos={dbToPos} fromPos={posToDb} snap={(x) => Math.round(x * 2) / 2} disabled={!edit} color={t.color} onChange={(v) => set({ db: v })} />
        <b>{fmtDb(t.db)}</b>
      </div>
      <div className="st-h4">
        <span className="st-meter"><i ref={meterRef} /></span>
        <small>{status}</small>
        <span className="st-ord">
          <button className="iconbtn" aria-label="Subir pista" disabled={!edit || i === 0} onClick={() => d({ type: 'proj', op: { k: 'trackMove', id: t.id, dir: -1 } })}>↑</button>
          <button className="iconbtn" aria-label="Bajar pista" disabled={!edit || i === n - 1} onClick={() => d({ type: 'proj', op: { k: 'trackMove', id: t.id, dir: 1 } })}>↓</button>
        </span>
      </div>
    </div>
  );
}

/* ---------- Dibujo: regla y formas de onda solo en la parte visible ---------- */

function useCanvas(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[], w: number, h: number) {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const cv = ref.current;
    if (!cv || w <= 0 || h <= 0) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const g = cv.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    draw(g, w, h);
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return ref;
}

function RulerCanvas({ view, pps, bar, beats }: { view: { left: number; w: number }; pps: number; bar: number; beats: number }) {
  const w = Math.max(1, view.w);
  const ref = useCanvas((g, W, H) => {
    const t0 = view.left / pps;
    const t1 = (view.left + W) / pps;
    const beat = bar / beats;
    const showBeats = beat * pps >= 10;
    g.font = '10px IBM Plex Mono, monospace';
    for (let b = Math.floor(t0 / bar); b * bar <= t1; b++) {
      const x = b * bar * pps - view.left;
      g.fillStyle = '#7f95ae';
      g.fillRect(x, 0, 1, 18);
      if (bar * pps >= 26 || b % 4 === 0) g.fillText(String(b + 1), x + 3, 11);
      if (showBeats) for (let k = 1; k < beats; k++) g.fillRect(x + k * beat * pps, 12, 1, 6);
    }
    // Segundos en la fila inferior.
    const stepS = [0.1, 0.5, 1, 2, 5, 10, 15, 30, 60].find((x) => x * pps >= 50) ?? 120;
    g.fillStyle = '#5f7896';
    for (let s = Math.floor(t0 / stepS) * stepS; s <= t1; s += stepS) {
      const x = s * pps - view.left;
      g.fillRect(x, H - 8, 1, 8);
      g.fillText(stepS < 1 ? s.toFixed(1) : mmss(s), x + 3, H - 1);
    }
  }, [view.left, view.w, pps, bar, beats], w, RULER_H);
  return <canvas ref={ref} className="st-cv" style={{ left: view.left, width: w, height: RULER_H }} />;
}

function LaneCanvas({ p, t, shown, view, pps, h }: { p: Project; t: Track; shown: (c: Clip) => Clip; view: { left: number; w: number }; pps: number; h: number }) {
  const w = Math.max(1, view.w);
  const clips = p.clips.filter((c) => c.track === t.id).map(shown);
  const ver = clips.map((c) => `${c.id}:${c.pos}:${c.off}:${c.len}:${c.gain}:${c.fadeIn}:${c.fadeOut}:${!!peaksStore.get(c.asset)}`).join('|');
  const ref = useCanvas((g, W, H) => {
    const top = 16; // franja del nombre del clip
    const ch = H - top - 2;
    for (const c of clips) {
      const pk = peaksStore.get(c.asset);
      const x0 = Math.max(0, c.pos * pps - view.left);
      const x1 = Math.min(W, clipEnd(c) * pps - view.left);
      if (x1 <= x0) continue;
      if (!pk) {
        g.fillStyle = 'rgba(255,255,255,.06)';
        g.fillRect(x0, top, x1 - x0, ch);
        continue;
      }
      const lvl = pickLevel(pk, pk.sr / pps);
      const stereo = pk.channels > 1 && ch >= 56;
      const lanes = stereo ? 2 : 1;
      const lh = ch / lanes;
      const gl = dbToLin(c.gain);
      g.fillStyle = t.color;
      for (let L = 0; L < lanes; L++) {
        const mid = top + lh * L + lh / 2;
        for (let x = Math.floor(x0); x < x1; x++) {
          const tp = (x + view.left) / pps;
          const tf = c.off + (tp - c.pos);
          // Lo que se dibuja incluye ganancia de clip y fundidos: es lo que suena.
          const k = Math.min(1.4, envelopeAt(c, tp) * gl);
          let [lo, hi] = rangeAt(pk, lvl, stereo ? L : 0, tf, tf + 1 / pps);
          if (!stereo && pk.channels > 1) {
            const [lo2, hi2] = rangeAt(pk, lvl, 1, tf, tf + 1 / pps);
            lo = Math.min(lo, lo2);
            hi = Math.max(hi, hi2);
          }
          const y0 = mid - hi * k * (lh / 2 - 1);
          const y1 = mid - lo * k * (lh / 2 - 1);
          g.fillRect(x, y0, 1, Math.max(1, y1 - y0));
        }
        if (stereo) {
          g.fillStyle = 'rgba(255,255,255,.35)';
          g.fillText(L ? 'R' : 'L', x0 + 3, top + lh * L + 10);
          g.fillStyle = t.color;
        }
      }
    }
  }, [ver, view.left, view.w, pps, h, t.color], w, h);
  return <canvas ref={ref} className="st-cv" style={{ left: view.left, width: w, height: h }} />;
}

/* ---------- Secciones sobre la regla ---------- */

function Regions({ song, markers, pps, bar }: { song: ReturnType<typeof useLive>['song']; markers: Marker[]; pps: number; bar: number }) {
  // Cada paso con marcador ocupa sus compases enteros: lo dibujado es lo que el transporte ejecuta.
  const seen = new Set<string>();
  return (
    <>
      {song.arr.map((it, i) => {
        if (!it.marker || seen.has(it.marker)) return null;
        seen.add(it.marker);
        const mk = markers.find((x) => x.id === it.marker);
        if (!mk) return null;
        const sec = song.sections.find((x) => x.id === it.scene);
        return <div key={i} className="st-region" style={{ left: mk.at * pps, width: it.bars * bar * pps, ['--sc' as string]: KIND_COLOR[sec?.kind ?? 'otro'] }} />;
      })}
    </>
  );
}

function MarkerFlag({ mk, pps, song, edit, onDown }: { mk: Marker; pps: number; song: ReturnType<typeof useLive>['song']; edit: boolean; onDown: (e: RPE) => void }) {
  const sec = song.sections.find((x) => x.id === mk.sec);
  return (
    <div className="st-marker" style={{ left: mk.at * pps, ['--sc' as string]: KIND_COLOR[sec?.kind ?? 'otro'] }} onPointerDown={edit ? onDown : undefined} title={`${sec?.label ?? mk.sec} · ${fmtT(mk.at)}${edit ? ' · arrastrar para mover' : ''}`}>
      <span>{sec?.label ?? mk.sec}</span>
    </div>
  );
}

function PosReadout() {
  const { tpNow, song } = useLive();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = tpNow();
      const m = meter(song.ts, song.bpm);
      const barN = Math.floor(t.pos / m.bar);
      const beat = Math.floor((t.pos - barN * m.bar) / (m.bar / m.beats.length));
      if (ref.current) ref.current.textContent = `${fmtT(t.pos)}  ·  ${barN + 1}.${beat + 1}`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tpNow, song.ts, song.bpm]);
  return <span ref={ref} className="st-pos" aria-label="Posición (minutos:segundos · compás.pulso)" />;
}

/* ---------- Inspector ---------- */

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="st-field"><span>{label}</span>{children}</label>;
}
function Num({ value, onChange, step = 0.01, min, disabled, label }: { value: number; onChange: (v: number) => void; step?: number; min?: number; disabled?: boolean; label: string }) {
  const [txt, setTxt] = useState(value.toFixed(3));
  useEffect(() => setTxt(value.toFixed(3)), [value]);
  return (
    <input type="number" aria-label={label} step={step} min={min} value={txt} disabled={disabled}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => { const v = Number(txt); if (Number.isFinite(v) && Math.abs(v - value) > 1e-6) onChange(v); else setTxt(value.toFixed(3)); }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
  );
}

function Inspector({ clips, track, edit, onPreview }: { clips: Clip[]; track: Track | undefined; edit: boolean; onPreview: (asset: string, from: number) => void }) {
  const { song, d, remote } = useLive();
  const p = song.project;
  const op = (o: ProjOp) => d({ type: 'proj', op: o });
  const c = clips[0];
  return (
    <section className="st-card">
      <h3>{c ? (clips.length > 1 ? `${clips.length} clips` : 'Clip') : track ? 'Pista' : 'Inspector'}</h3>
      {!c && !track && <p className="hint2">Seleccione un clip o una pista. Arrastre el clip para moverlo, sus bordes para recortar y los cuadritos superiores para los fundidos. Mayús + clic suma a la selección.</p>}
      {c && clips.length === 1 && (
        <>
          <p className="st-src">{p.assets[c.asset]?.name ?? c.asset}<br /><small>{p.assets[c.asset] ? `${p.assets[c.asset].duration.toFixed(2)} s · ${p.assets[c.asset].channels || '?'} canales · ${p.assets[c.asset].sampleRate || '?'} Hz` : 'datos del archivo pendientes'}</small></p>
          <Field label="Inicio en el proyecto (s)"><Num label="Inicio" value={c.pos} min={0} disabled={!edit} onChange={(v) => op({ k: 'move', ids: [c.id], dt: Math.max(0, v) - c.pos })} /></Field>
          <Field label="Desde el archivo (s)"><Num label="Desplazamiento en el archivo" value={c.off} min={0} disabled={!edit} onChange={(v) => op({ k: 'trimStart', ids: [c.id], d: v - c.off })} /></Field>
          <Field label="Duración (s)"><Num label="Duración" value={c.len} min={0.01} disabled={!edit} onChange={(v) => op({ k: 'trimEnd', ids: [c.id], d: v - c.len })} /></Field>
          <Field label={`Ganancia de clip ${fmtDb(c.gain)} dB`}>
            <HSlider label="Ganancia de clip" value={c.gain} toPos={(x) => (x + 24) / 36} fromPos={(q) => q * 36 - 24} snap={(x) => Math.round(x * 2) / 2} disabled={!edit} onChange={(v) => op({ k: 'clip', id: c.id, patch: { gain: v } })} />
          </Field>
          <Field label="Fundido de entrada (s)"><Num label="Fundido de entrada" value={c.fadeIn} min={0} disabled={!edit} onChange={(v) => op({ k: 'clip', id: c.id, patch: { fadeIn: v } })} /></Field>
          <Field label="Fundido de salida (s)"><Num label="Fundido de salida" value={c.fadeOut} min={0} disabled={!edit} onChange={(v) => op({ k: 'clip', id: c.id, patch: { fadeOut: v } })} /></Field>
          <p className="hint2">{c.group ? `En grupo de alineación con ${p.clips.filter((x) => x.group === c.group).length - 1} clip(s): moverlo o cortarlo los afecta igual.` : 'Sin grupo: se edita solo.'}</p>
        </>
      )}
      {c && (
        <div className="gp-row">
          {clips.length > 1 && <button className="mini" disabled={!edit} onClick={() => op({ k: 'group', ids: clips.map((x) => x.id), on: true })}>Agrupar</button>}
          {clips.some((x) => x.group) && <button className="mini" disabled={!edit} onClick={() => op({ k: 'group', ids: linkedIds(p, clips.map((x) => x.id)), on: false })}>Desagrupar</button>}
          {clips.length === 1 && !remote && <button className="mini" onClick={() => onPreview(c.asset, c.off)}>{engine.previewing ? 'Parar preescucha' : 'Preescuchar'}</button>}
        </div>
      )}
      {track && !c && (
        <>
          <Field label="Panorama">
            <HSlider label="Panorama de la pista" value={track.pan} toPos={(x) => (x + 100) / 200} fromPos={(q) => q * 200 - 100} snap={(x) => (Math.abs(x) < 4 ? 0 : Math.round(x))} bipolar disabled={!edit} onChange={(v) => op({ k: 'track', id: track.id, patch: { pan: v } })} />
          </Field>
          <Field label="Color"><input type="color" value={track.color} disabled={!edit} onChange={(e) => op({ k: 'track', id: track.id, patch: { color: e.target.value } })} /></Field>
          <p className="hint2">Nivel de pista = etapa musical (antes de la consola). El fader «Pistas» del sonidista sigue aparte y no cambia al editar clips.</p>
          <button className="mini warn" disabled={!edit} onClick={() => op({ k: 'trackRemove', id: track.id })}>Quitar pista</button>
        </>
      )}
    </section>
  );
}

function Markers({ song, edit }: { song: ReturnType<typeof useLive>['song']; edit: boolean }) {
  const { d, transport } = useLive();
  const p = song.project;
  return (
    <section className="st-card">
      <h3>Marcadores de sección</h3>
      {!p.markers.length && <p className="hint2">Coloque el cursor donde empieza cada parte y pulse «Marcador» (M). Sin marcadores, la canción sigue su orden en compases como antes.</p>}
      {p.markers.map((mk) => (
        <div key={mk.id} className="st-mk">
          <select aria-label="Sección del marcador" value={mk.sec} disabled={!edit} onChange={(e) => d({ type: 'proj', op: { k: 'marker', m: { ...mk, sec: e.target.value } } })}>
            {song.sections.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
          </select>
          <button className="mini" onClick={() => transport('seek', mk.at)} title="Llevar el cursor aquí">{fmtT(mk.at)}</button>
          <button className="iconbtn" aria-label="Quitar marcador" disabled={!edit} onClick={() => d({ type: 'proj', op: { k: 'markerRemove', id: mk.id } })}><Icon name="x" size={12} /></button>
        </div>
      ))}
    </section>
  );
}

function Order({ song, edit }: { song: ReturnType<typeof useLive>['song']; edit: boolean }) {
  const { d, transport } = useLive();
  const m = meter(song.ts, song.bpm);
  if (!song.project.markers.length) return null;
  return (
    <section className="st-card">
      <h3>Orden en vivo</h3>
      <p className="hint2">Repetir agrega otra vuelta del mismo audio: el transporte salta atrás en el compás, todas las pistas juntas. El archivo no se alarga.</p>
      {song.arr.map((it, i) => (
        <div key={i} className="st-mk">
          <span className="st-ordn">{i + 1}</span>
          <b>{song.sections.find((x) => x.id === it.scene)?.label}</b>
          <small>{it.bars} c. · {mmss(stepStart(song.arr, i, m.bar))}</small>
          <button className="mini" onClick={() => transport('from', i)}>Desde aquí</button>
          <button className="mini" disabled={!edit} onClick={() => d({ type: 'arrAdd', scene: it.scene, bars: it.bars, marker: it.marker, after: i })}>Repetir</button>
          <button className="iconbtn" aria-label="Subir" disabled={!edit || i === 0} onClick={() => d({ type: 'arrMove', index: i, dir: -1 })}>↑</button>
          <button className="iconbtn" aria-label="Quitar del orden" disabled={!edit || song.arr.length <= 1} onClick={() => d({ type: 'arrRemove', index: i })}><Icon name="x" size={12} /></button>
        </div>
      ))}
    </section>
  );
}

/* ===================================================================== */
/*                            Vista En vivo                              */
/* ===================================================================== */

function LiveOps() {
  const { s, d, song, transport, tpNow, assets, remote, can } = useLive();
  const p = song.project;
  const m = meter(song.ts, song.bpm);
  const [now, setNow] = useState(() => tpNow());
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => setNow(tpNow()), 100);
    return () => window.clearInterval(id);
  }, [tpNow]);
  const arr = song.arr;
  const cur = Math.min(now.sec, arr.length - 1);
  const next = now.pending ?? (s.playMode === 'loop' ? cur : cur + 1);
  const label = (i: number) => song.sections.find((x) => x.id === arr[i]?.scene)?.label ?? (i >= arr.length ? 'Fin' : '');
  const curEnd = stepStart(arr, cur, m.bar) + (arr[cur]?.bars ?? 0) * m.bar;
  const left = Math.max(0, curEnd - now.pos);
  const total = stepStart(arr, arr.length - 1, m.bar) + (arr[arr.length - 1]?.bars ?? 0) * m.bar;
  const missing = missingAssets(p, (a) => (remote ? true : engine.hasAudio(a) || assets[a] === 'loading'));
  const music = can('music') || can('transport');
  const play = () => {
    if (!now.playing && missing.length && !confirm) return setConfirm(true);
    setConfirm(false);
    transport('toggle');
  };
  return (
    <div className="st-live">
      <div className="st-now">
        <div><small>Sección actual</small><b style={{ color: KIND_COLOR[song.sections.find((x) => x.id === arr[cur]?.scene)?.kind ?? 'otro'] }}>{label(cur)}</b><small>{arr[cur]?.bars} compases · paso {cur + 1} de {arr.length}</small></div>
        <div><small>Siguiente</small><b>{s.playMode === 'loop' && now.pending === null ? `${label(cur)} (repite)` : label(next)}</b>{now.pending !== null && <small className="st-pend">entra en el próximo compás</small>}</div>
        <div><small>Restante en la sección</small><b className="mono">{mmss(left)}</b><small>Canción: {mmss(Math.max(0, total - now.pos))}</small></div>
        <div><small>Posición</small><b className="mono">{fmtT(now.pos)}</b><small>{now.playing ? 'sonando' : 'detenido'}</small></div>
      </div>
      <div className="st-overview" aria-hidden="true">
        {arr.map((it, i) => {
          const a = stepStart(arr, i, m.bar);
          return <i key={i} className={i === cur ? 'on' : ''} style={{ left: `${(a / Math.max(1, total)) * 100}%`, width: `${((it.bars * m.bar) / Math.max(1, total)) * 100}%`, ['--sc' as string]: KIND_COLOR[song.sections.find((x) => x.id === it.scene)?.kind ?? 'otro'] }}>{label(i)}</i>;
        })}
        <b style={{ left: `${(now.pos / Math.max(1, total)) * 100}%` }} />
      </div>
      {missing.length > 0 && <p className="inwarn">Faltan {missing.length} archivo(s): {missing.map((x) => x.name).join(', ')}. Esas pistas no sonarán.</p>}
      {confirm && (
        <div className="st-ask"><p>Faltan archivos. ¿Iniciar igualmente?</p><button className="mini on" onClick={play}>Iniciar</button><button className="mini" onClick={() => setConfirm(false)}>Cancelar</button></div>
      )}
      <div className="st-bigs">
        <button className={`st-big play${now.playing ? ' on' : ''}`} disabled={!music} onClick={play}><Icon name={now.playing ? 'pause' : 'play'} size={28} /> {now.playing ? 'Pausa' : 'Reproducir'}</button>
        <button className="st-big" disabled={!music} onClick={() => transport('stop')} title="Detiene pistas y acompañamiento; no corta micrófonos ni master"><Icon name="stop" size={24} /> Detener pistas</button>
        <button className="st-big" disabled={!music || cur >= arr.length - 1} onClick={() => transport('jump', cur + 1)}><Icon name="next" size={24} /> Siguiente sección</button>
        <button className={`st-big${s.playMode === 'loop' ? ' on' : ''}`} disabled={!music} aria-pressed={s.playMode === 'loop'} onClick={() => d({ type: 'playMode', mode: s.playMode === 'loop' ? 'follow' : 'loop' })}><Icon name="loop" size={24} /> {s.playMode === 'loop' ? 'Salir del loop' : 'Repetir sección'}</button>
        <button className="st-big" disabled={!music} onClick={() => transport('end')}><Icon name="next" size={24} /> Ir al final</button>
      </div>
      <div className="st-from">
        <small>Iniciar desde:</small>
        {arr.map((it, i) => <button key={i} className={`mini${i === cur ? ' on' : ''}`} disabled={!music} onClick={() => transport('from', i)}>{i + 1}. {label(i)}</button>)}
      </div>
    </div>
  );
}
