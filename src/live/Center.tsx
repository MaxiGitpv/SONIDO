import { useEffect, useRef, useState } from 'react';
import { useLive, Icon, Art } from './ctx';
import { CH_META, KEY_NAMES, EQ_NAMES, isBlack, layerInfo, noteName } from './data';
import { PLAYABLE, SCENES, STYLES } from './types';
import type { Chan, ChId, Style, Zone } from './types';
import { engine } from './engine';
import { chanResponse, LIVE_KINDS } from './eqmath';
import { PadsGrid } from './PadsGrid';
import { Timeline } from './Timeline';
import { Knob } from '../components/Knob';
import { HSlider } from '../components/HSlider';
import { compOut } from '../dsp';
import { clamp, dbToPos, fmtDb, fmtHz, posToDb } from '../util';

/* ---------- Cabecera de canción, escenas y línea de tiempo ---------- */
export function SongHeader() {
  const { s, d } = useLive();
  const song = s.songs.find((x) => x.id === s.songId)!;
  const gi = s.songs.findIndex((x) => x.id === s.songId);
  const si = SCENES.findIndex((x) => x.id === s.sceneId);
  const next = si < SCENES.length - 1 ? SCENES[si + 1].label : (s.songs[gi + 1]?.title ?? '—');
  return (
    <div className="songhead">
      <div className="songnav" role="group" aria-label="Canción anterior o siguiente">
        <button className="iconbtn" aria-label="Canción anterior" title={gi > 0 ? `Anterior: ${s.songs[gi - 1].title}` : 'Primera canción'} disabled={gi <= 0} onClick={() => d({ type: 'songStep', dir: -1 })}>
          <Icon name="prev" size={16} />
        </button>
        <button className="iconbtn" aria-label="Canción siguiente" title={gi < s.songs.length - 1 ? `Siguiente: ${s.songs[gi + 1].title}` : 'Última canción'} disabled={gi >= s.songs.length - 1} onClick={() => d({ type: 'songStep', dir: 1 })}>
          <Icon name="next" size={16} />
        </button>
      </div>
      <input className="song-title" aria-label="Título de la canción" value={song.title} maxLength={40} onChange={(e) => d({ type: 'songEdit', id: song.id, patch: { title: e.target.value } })} />
      <label className="pill">
        <span className="sr">Tonalidad</span>
        <select value={song.key} onChange={(e) => d({ type: 'songEdit', id: song.id, patch: { key: e.target.value } })}>
          {KEY_NAMES.map((k) => <option key={k} value={k}>{k} mayor</option>)}
        </select>
      </label>
      <label className="pill bpm">
        <input type="number" min={40} max={200} value={song.bpm} aria-label="BPM" onChange={(e) => d({ type: 'songEdit', id: song.id, patch: { bpm: clamp(Number(e.target.value) || 60, 40, 200) } })} />
        <span>BPM</span>
      </label>
      <label className="pill style">
        <span>Ritmo</span>
        <select value={song.style} onChange={(e) => d({ type: 'style', style: e.target.value as Style })}>
          {STYLES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </select>
      </label>
      <button className="nextscene" onClick={() => d({ type: 'step', dir: 1 })}>
        <small>Siguiente</small> · <b>{next}</b>
        <span className="circ"><Icon name="next" size={16} /></span>
      </button>
    </div>
  );
}

export function SceneBar() {
  const { s, goScene } = useLive();
  return (
    <>
      <div className="scenebar" role="tablist" aria-label="Escenas">
        {SCENES.map((sc) => (
          <button key={sc.id} role="tab" aria-selected={s.sceneId === sc.id} className={`scenebtn${s.sceneId === sc.id ? ' on' : ''}`} onClick={() => goScene(sc.id)}>
            {sc.label}
          </button>
        ))}
      </div>
      <Timeline />
    </>
  );
}

/* ---------- Sonido seleccionado: capas editables ---------- */
const ZONES: { id: Zone; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'low', label: 'Izq.' },
  { id: 'high', label: 'Der.' },
];

export function SoundLayers() {
  const { s, d, mix } = useLive();
  const [adding, setAdding] = useState(false);
  const free = PLAYABLE.filter((id) => !mix.layers.some((l) => l.ch === id));
  return (
    <div className="layers">
      {mix.layers.map((l) => {
        const c = mix.chans[l.ch];
        const info = layerInfo(mix.sound, l.ch);
        return (
          <div key={l.ch} className={`layer${s.selected === l.ch ? ' sel' : ''}${c.mute ? ' muted' : ''}`} style={{ ['--cc' as string]: CH_META[l.ch].color }}>
            <i className="layer-bar" />
            <Art ch={l.ch} />
            <button className="layer-t" onClick={() => d({ type: 'select', id: l.ch })} title="Editar EQ y dinámica de esta capa">
              <b>{info.name}</b>
              <small>{info.desc}{c.mute ? ' · silenciada' : ''}</small>
            </button>
            <select className="zone" aria-label={`Zona del teclado para ${info.name}`} value={l.zone} onChange={(e) => d({ type: 'layerZone', ch: l.ch, zone: e.target.value as Zone })}>
              {ZONES.map((z) => <option key={z.id} value={z.id}>{z.label}</option>)}
            </select>
            <Knob label="Vol" value={c.fader} min={-60} max={6} step={0.5} def={0} format={(v) => `${fmtDb(v)} dB`} onChange={(v) => d({ type: 'ch', id: l.ch, fn: (x) => ({ ...x, fader: v }) })} />
            <Knob label="Pan" value={c.pan} min={-100} max={100} step={1} def={0} format={(v) => (Math.round(v) === 0 ? 'C' : v < 0 ? `L${-Math.round(v)}` : `R${Math.round(v)}`)} onChange={(v) => d({ type: 'ch', id: l.ch, fn: (x) => ({ ...x, pan: Math.abs(v) < 4 ? 0 : v }) })} />
            <div className="layer-btns">
              <button className={`iconbtn${c.mute ? ' warn' : ''}`} aria-pressed={!c.mute} title={c.mute ? 'Activar capa' : 'Silenciar capa'} onClick={() => d({ type: 'ch', id: l.ch, fn: (x) => ({ ...x, mute: !x.mute }) })}>
                <Icon name="power" size={15} />
              </button>
              <button className="iconbtn" aria-label={`Quitar ${info.name}`} title="Quitar capa" disabled={mix.layers.length <= 1} onClick={() => d({ type: 'layerRemove', ch: l.ch })}>
                <Icon name="x" size={15} />
              </button>
            </div>
          </div>
        );
      })}
      {mix.layers.length < 4 && (
        <div className="addlayer">
          {!adding ? (
            <button className="mini" onClick={() => setAdding(true)}><Icon name="plus" size={14} /> Añadir capa para tocar</button>
          ) : (
            <div className="addlist" role="group" aria-label="Elegir instrumento">
              {free.map((id) => (
                <button key={id} className="mini" style={{ ['--cc' as string]: CH_META[id].color }} onClick={() => { d({ type: 'layerAdd', ch: id }); setAdding(false); }}>
                  <Icon name={id} size={14} /> {CH_META[id].name}
                </button>
              ))}
              <button className="mini" onClick={() => setAdding(false)}>Cancelar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Teclado tocable ---------- */
const LO = 36;
const HI = 96;
const KEYS = (() => {
  const out: { n: number; x: number; black: boolean }[] = [];
  let wi = 0;
  for (let n = LO; n <= HI; n++) {
    if (isBlack(n)) out.push({ n, x: wi - 0.32, black: true });
    else out.push({ n, x: wi++, black: false });
  }
  return { keys: out, whites: wi };
})();

export function LiveKeyboard({ held, onDown, onUp }: { held: number[]; onDown: (n: number) => void; onUp: (n: number) => void }) {
  const { s, d, mix } = useLive();
  const low = mix.layers.find((l) => l.zone === 'low') ?? mix.layers[0];
  const high = mix.layers.find((l) => l.zone === 'high') ?? mix.layers.find((l) => l.zone === 'all') ?? mix.layers[0];
  const split = mix.layers.some((l) => l.zone !== 'all');
  const W = KEYS.whites;
  const pct = (x: number) => `${(x / W) * 100}%`;
  const zone = (n: number) => (!split ? 'a' : n < s.split ? 'a' : 'b');
  const handlers = (n: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { e.currentTarget.setPointerCapture(e.pointerId); onDown(n); },
    onPointerUp: () => onUp(n),
    onPointerCancel: () => onUp(n),
  });
  return (
    <div className="kbwrap">
      <div className="kb2" role="group" aria-label="Teclado: toque para escuchar las capas"
        style={{ ['--za' as string]: CH_META[low.ch].color, ['--zb' as string]: CH_META[high.ch].color }}>
        {KEYS.keys.filter((k) => !k.black).map((k) => (
          <button key={k.n} className={`wk z-${zone(k.n)}${held.includes(k.n) ? ' down' : ''}`} style={{ left: pct(k.x), width: pct(1) }} aria-label={noteName(k.n)} {...handlers(k.n)} />
        ))}
        {KEYS.keys.filter((k) => k.black).map((k) => (
          <button key={k.n} className={`bk z-${zone(k.n)}${held.includes(k.n) ? ' down' : ''}`} style={{ left: pct(k.x), width: pct(0.64) }} aria-label={noteName(k.n)} {...handlers(k.n)} />
        ))}
        <div className="kb-oct" aria-hidden="true">
          {KEYS.keys.filter((k) => k.n % 12 === 0).map((k) => <span key={k.n} style={{ left: pct(k.x) }}>{noteName(k.n)}</span>)}
        </div>
      </div>
      <div className="kb-side">
        <label>
          <span>Split</span>
          <select value={s.split} disabled={!split} onChange={(e) => d({ type: 'split', value: Number(e.target.value) })}>
            {[36, 41, 43, 48, 53, 55, 60, 65, 67, 72].map((n) => <option key={n} value={n}>{noteName(n)}</option>)}
          </select>
        </label>
        <label>
          <span>Transpose</span>
          <span className="stepper2">
            <button aria-label="Bajar semitono" onClick={() => d({ type: 'transpose', value: Math.max(-12, s.transpose - 1) })}>−</button>
            <output>{s.transpose > 0 ? `+${s.transpose}` : s.transpose}</output>
            <button aria-label="Subir semitono" onClick={() => d({ type: 'transpose', value: Math.min(12, s.transpose + 1) })}>+</button>
          </span>
        </label>
        <button className={`mini sus${s.sustain ? ' on' : ''}`} aria-pressed={s.sustain} title="Pedal de sustain (también con la tecla Shift)" onClick={() => d({ type: 'sustain', on: !s.sustain })}>
          Sustain {s.sustain ? 'ON' : 'OFF'}
        </button>
      </div>
    </div>
  );
}

export function PlayPanel({ held, onDown, onUp }: { held: number[]; onDown: (n: number) => void; onUp: (n: number) => void }) {
  const { s, d } = useLive();
  return (
    <section className="lpanel selsound">
      <header className="ph">
        <Icon name="layers" />
        <h3>Sonido seleccionado</h3>
        <div className="segx sm" role="tablist" aria-label="Forma de tocar">
          <button role="tab" aria-selected={s.playPanel === 'keys'} className={s.playPanel === 'keys' ? 'on' : ''} onClick={() => d({ type: 'playPanel', panel: 'keys' })}><Icon name="keys" size={14} /> Teclado</button>
          <button role="tab" aria-selected={s.playPanel === 'pads'} className={s.playPanel === 'pads' ? 'on' : ''} onClick={() => d({ type: 'playPanel', panel: 'pads' })}><Icon name="grid" size={14} /> Cuadros</button>
        </div>
      </header>
      <SoundLayers />
      {s.playPanel === 'keys' ? <LiveKeyboard held={held} onDown={onDown} onUp={onUp} /> : <PadsGrid />}
    </section>
  );
}

/* ---------- Gráfica de EQ (compartida con el editor de canal) ---------- */
export const BAND_COLORS = ['#c47bff', '#35b4ff', '#7fd6ff', '#4ee39a', '#f2d23a', '#f2953a'];
const BAND_TYPES = ['Low shelf', 'Peaking', 'Peaking', 'Peaking', 'Peaking', 'High shelf'];
const F0 = 20;
const F1 = 20000;

export function EqGraph({ ch, id, sel, setSel, W = 420, H = 150, big }: { ch: Chan; id: ChId; sel: number; setSel: (i: number) => void; W?: number; H?: number; big?: boolean }) {
  const { d } = useLive();
  const GR = big ? 18 : 15;
  const PAD = { l: 28, r: 8, t: 10, b: 18 };
  const fx = (f: number) => PAD.l + (Math.log(f / F0) / Math.log(F1 / F0)) * (W - PAD.l - PAD.r);
  const fy = (g: number) => PAD.t + (1 - (g + GR) / (2 * GR)) * (H - PAD.t - PAD.b);
  const xf = (x: number) => F0 * Math.pow(F1 / F0, (x - PAD.l) / (W - PAD.l - PAD.r));
  const yg = (y: number) => GR - ((y - PAD.t) / (H - PAD.t - PAD.b)) * 2 * GR;
  const svg = useRef<SVGSVGElement>(null);
  const spec = useRef<SVGPathElement>(null);
  const drag = useRef<number | 'hpf' | 'lpf' | null>(null);

  useEffect(() => {
    const bins = new Uint8Array(new ArrayBuffer(1024));
    let raf = 0;
    const draw = () => {
      if (engine.spectrum(id, bins) && spec.current) {
        const sr = engine.sampleRate || 48000;
        const pts: string[] = [];
        for (let k = 0; k <= 96; k++) {
          const f = F0 * Math.pow(F1 / F0, k / 96);
          const bin = Math.min(bins.length - 1, Math.round((f / (sr / 2)) * bins.length));
          const v = bins[bin] / 255;
          pts.push(`${fx(f).toFixed(1)},${(H - PAD.b - v * (H - PAD.t - PAD.b) * 0.95).toFixed(1)}`);
        }
        spec.current.setAttribute('d', `M${fx(F0)},${H - PAD.b}L${pts.join('L')}L${fx(F1)},${H - PAD.b}Z`);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [id, W, H]); // eslint-disable-line react-hooks/exhaustive-deps

  const pts: string[] = [];
  for (let k = 0; k <= 140; k++) {
    const f = F0 * Math.pow(F1 / F0, k / 140);
    pts.push(`${fx(f).toFixed(1)},${fy(clamp(chanResponse(ch, f), -GR - 2, GR)).toFixed(1)}`);
  }
  const point = (e: React.PointerEvent) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const move = (e: React.PointerEvent) => {
    const t = drag.current;
    if (t === null) return;
    const { x, y } = point(e);
    if (t === 'hpf') return d({ type: 'ch', id, fn: (c) => ({ ...c, hpf: { on: true, freq: Math.round(clamp(xf(x), 20, 800)) } }) });
    if (t === 'lpf') return d({ type: 'ch', id, fn: (c) => ({ ...c, lpf: { on: true, freq: Math.round(clamp(xf(x), 2000, 20000)) } }) });
    d({ type: 'ch', id, fn: (c) => ({ ...c, eq: c.eq.map((b, j) => (j === t ? { ...b, freq: Math.round(clamp(xf(x), 20, 20000)), gain: Math.round(clamp(yg(y), -GR, GR) * 2) / 2 } : b)) }) });
  };
  const wheel = (i: number, e: React.WheelEvent) => {
    if (LIVE_KINDS[i] !== 'peak') return;
    d({ type: 'ch', id, fn: (c) => ({ ...c, eq: c.eq.map((b, j) => (j === i ? { ...b, q: clamp(Math.round((b.q * (e.deltaY < 0 ? 1.12 : 0.89)) * 10) / 10, 0.3, 10) } : b)) }) });
  };
  const grid = big ? [30, 50, 100, 200, 300, 500, 1000, 2000, 3000, 5000, 10000] : [50, 100, 200, 500, 1000, 2000, 5000, 10000];
  const labels = big ? [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000] : [20, 100, 1000, 10000, 20000];
  return (
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className={`eqg${ch.eqOn ? '' : ' off'}${big ? ' big' : ''}`} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)} role="img" aria-label="Curva de ecualización y espectro en vivo">
      {big && (
        <g className="zones">
          {[[20, 120, 'Graves'], [120, 500, 'Cuerpo'], [500, 2000, 'Medios'], [2000, 6000, 'Presencia'], [6000, 20000, 'Brillo']].map(([a, b, l]) => (
            <g key={l as string}>
              <rect x={fx(a as number)} y={PAD.t} width={fx(b as number) - fx(a as number)} height={H - PAD.t - PAD.b} className="zone-r" />
              <text x={(fx(a as number) + fx(b as number)) / 2} y={PAD.t + 14} textAnchor="middle" className="zone-t">{l}</text>
            </g>
          ))}
        </g>
      )}
      {grid.map((f) => <line key={f} x1={fx(f)} x2={fx(f)} y1={PAD.t} y2={H - PAD.b} className="gl" />)}
      {labels.map((f) => <text key={f} x={Math.min(W - 12, fx(f))} y={H - 4} className="gt" textAnchor="middle">{f >= 1000 ? `${f / 1000}k` : f}</text>)}
      {(big ? [18, 12, 6, 0, -6, -12, -18] : [12, 6, 0, -6, -12]).map((g) => (
        <g key={g}>
          <line x1={PAD.l} x2={W - PAD.r} y1={fy(g)} y2={fy(g)} className={g === 0 ? 'gz' : 'gl'} />
          <text x={PAD.l - 4} y={fy(g) + 3} className="gt" textAnchor="end">{g > 0 ? `+${g}` : g}</text>
        </g>
      ))}
      <path ref={spec} className="spec" d="" />
      <path d={`M${pts.join('L')}`} className="eqc" />
      {big && (
        <>
          <g className={`node filt${ch.hpf.on ? '' : ' off'}`} style={{ ['--bc' as string]: '#9fb2c8' }} onPointerDown={(e) => { e.stopPropagation(); svg.current!.setPointerCapture(e.pointerId); drag.current = 'hpf'; }}>
            <circle cx={fx(ch.hpf.freq)} cy={fy(0)} r="18" className="hit" />
            <rect x={fx(ch.hpf.freq) - 6} y={fy(0) - 6} width="12" height="12" rx="2" className="dot" />
          </g>
          <g className={`node filt${ch.lpf.on ? '' : ' off'}`} style={{ ['--bc' as string]: '#9fb2c8' }} onPointerDown={(e) => { e.stopPropagation(); svg.current!.setPointerCapture(e.pointerId); drag.current = 'lpf'; }}>
            <circle cx={fx(ch.lpf.freq)} cy={fy(0)} r="18" className="hit" />
            <rect x={fx(ch.lpf.freq) - 6} y={fy(0) - 6} width="12" height="12" rx="2" className="dot" />
          </g>
        </>
      )}
      {ch.eq.map((b, i) => (
        <g key={i} className={`node${sel === i ? ' sel' : ''}${b.on ? '' : ' off'}`} style={{ ['--bc' as string]: BAND_COLORS[i] }}
          onWheel={(e) => wheel(i, e)}
          onPointerDown={(e) => { e.stopPropagation(); svg.current!.setPointerCapture(e.pointerId); drag.current = i; setSel(i); }}>
          <circle cx={fx(b.freq)} cy={fy(clamp(b.gain, -GR, GR))} r={big ? 20 : 16} className="hit" />
          <circle cx={fx(b.freq)} cy={fy(clamp(b.gain, -GR, GR))} r={big ? 8 : 6.5} className="dot" />
          {big && <text x={fx(b.freq)} y={fy(clamp(b.gain, -GR, GR)) - 13} textAnchor="middle" className="nlabel">{EQ_NAMES[i]}</text>}
        </g>
      ))}
    </svg>
  );
}

export function GrMeter({ id }: { id: ChId }) {
  const bar = useRef<HTMLDivElement>(null);
  const txt = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const r = engine.reduction(id);
      if (bar.current) bar.current.style.width = `${Math.min(100, (-r / 20) * 100)}%`;
      if (txt.current) txt.current.textContent = `${r.toFixed(1)} dB`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [id]);
  return (
    <div className="gr">
      <span className="gr-l">Reducción</span>
      <div className="gr-track"><div ref={bar} className="gr-bar" /></div>
      <span ref={txt} className="gr-v">0.0 dB</span>
    </div>
  );
}

export function CompCurve({ comp, size = 110 }: { comp: Chan['comp']; size?: number }) {
  const S = size;
  const curve = Array.from({ length: 61 }, (_, i) => {
    const inDb = -60 + i;
    return `${((inDb + 60) / 60) * S},${S - ((clamp(compOut(comp, inDb), -60, 0) + 60) / 60) * S}`;
  }).join('L');
  return (
    <svg viewBox={`-2 -2 ${S + 4} ${S + 4}`} className={`compg${comp.on ? '' : ' off'}`} style={{ width: S, height: S }} role="img" aria-label="Curva del compresor">
      <rect width={S} height={S} className="gf" />
      <line x1="0" y1={S} x2={S} y2="0" className="gz" />
      <line x1={((comp.threshold + 60) / 60) * S} x2={((comp.threshold + 60) / 60) * S} y1="0" y2={S} className="thr" />
      <path d={`M${curve}`} className="eqc" />
    </svg>
  );
}

export function CompKnobs({ id, comp }: { id: ChId; comp: Chan['comp'] }) {
  const { d } = useLive();
  const setC = (p: Partial<Chan['comp']>) => d({ type: 'ch', id, fn: (c) => ({ ...c, comp: { ...c.comp, ...p } }) });
  return (
    <div className="compk">
      <Knob label="Umbral" value={comp.threshold} min={-60} max={0} step={0.5} def={-20} format={(v) => `${v.toFixed(1)} dB`} onChange={(v) => setC({ threshold: v })} disabled={!comp.on} />
      <Knob label="Ratio" value={comp.ratio} min={1} max={20} log step={0.1} def={3} format={(v) => `${v.toFixed(1)}:1`} onChange={(v) => setC({ ratio: v })} disabled={!comp.on} />
      <Knob label="Ataque" value={comp.attack} min={1} max={200} log step={1} def={15} format={(v) => `${Math.round(v)} ms`} onChange={(v) => setC({ attack: v })} disabled={!comp.on} />
      <Knob label="Relé" value={comp.release} min={20} max={1000} log step={5} def={200} format={(v) => `${Math.round(v)} ms`} onChange={(v) => setC({ release: v })} disabled={!comp.on} />
      <Knob label="Ganancia" value={comp.makeup} min={0} max={18} step={0.5} def={0} format={(v) => `${v.toFixed(1)} dB`} onChange={(v) => setC({ makeup: v })} disabled={!comp.on} />
      <button className={`mini${comp.on ? ' on' : ''}`} aria-pressed={comp.on} onClick={() => setC({ on: !comp.on })}>Comp {comp.on ? 'ON' : 'OFF'}</button>
    </div>
  );
}

export function BandKnobs({ id, ch, sel }: { id: ChId; ch: Chan; sel: number }) {
  const { d } = useLive();
  const b = ch.eq[sel];
  const setB = (p: Partial<typeof b>) => d({ type: 'ch', id, fn: (c) => ({ ...c, eq: c.eq.map((x, j) => (j === sel ? { ...x, ...p } : x)) }) });
  const shelf = LIVE_KINDS[sel] !== 'peak';
  return (
    <>
      <Knob label="Frecuencia" value={b.freq} min={20} max={20000} log def={[90, 250, 600, 2500, 6000, 11000][sel]} format={fmtHz} onChange={(v) => setB({ freq: Math.round(v) })} color={BAND_COLORS[sel]} />
      <Knob label="Ganancia" value={b.gain} min={-18} max={18} step={0.5} def={0} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} onChange={(v) => setB({ gain: v })} color={BAND_COLORS[sel]} />
      <Knob label="Q" value={b.q} min={0.3} max={10} log step={0.1} def={1} format={(v) => v.toFixed(1)} onChange={(v) => setB({ q: v })} color={BAND_COLORS[sel]} disabled={shelf} />
      <div className="eqtype">
        <span>{EQ_NAMES[sel]}</span>
        <b>{BAND_TYPES[sel]}</b>
        <div className="eqbtns">
          <button className={`mini${b.on ? ' on' : ''}`} aria-pressed={b.on} onClick={() => setB({ on: !b.on })}>Banda {b.on ? 'ON' : 'OFF'}</button>
          <button className={`mini${ch.eqOn ? ' on' : ''}`} aria-pressed={ch.eqOn} onClick={() => d({ type: 'ch', id, fn: (c) => ({ ...c, eqOn: !c.eqOn }) })}>EQ {ch.eqOn ? 'ON' : 'OFF'}</button>
        </div>
      </div>
    </>
  );
}

const dbSlider = (label: string, v: number, on: (v: number) => void) => (
  <HSlider label={label} value={v} toPos={dbToPos} fromPos={posToDb} snap={(x) => (Math.abs(x) < 1 ? 0 : Math.round(x * 2) / 2)} onChange={on} />
);

/* ---------- EQ / Comp / Reverb / Delay compactos del canal seleccionado ---------- */
export function ChannelFx() {
  const { s, d, mix } = useLive();
  const [sel, setSel] = useState(1);
  const id = s.selected;
  const ch = mix.chans[id];
  const tabs: [typeof s.eqTab, string][] = [['eq', 'EQ'], ['comp', 'Comp'], ['reverb', 'Reverb'], ['delay', 'Delay']];
  return (
    <section className="cfx">
      <div className="cfx-tabs" role="tablist">
        {tabs.map(([t, l]) => (
          <button key={t} role="tab" aria-selected={s.eqTab === t} className={s.eqTab === t ? 'on' : ''} onClick={() => d({ type: 'eqTab', tab: t })}>
            {l}{t === 'eq' && <> · <span style={{ color: CH_META[id].color }}>{CH_META[id].name}</span></>}
          </button>
        ))}
        <button className="cfx-open" onClick={() => d({ type: 'editor', id })} title="Abrir el editor completo de este canal">
          <Icon name="expand" size={15} /> Editor
        </button>
      </div>
      {s.eqTab === 'eq' && (
        <div className="cfx-body">
          <EqGraph ch={ch} id={id} sel={sel} setSel={setSel} />
          <div className="eqctl"><BandKnobs id={id} ch={ch} sel={sel} /></div>
        </div>
      )}
      {s.eqTab === 'comp' && (
        <div className="cfx-body comp2">
          <CompCurve comp={ch.comp} size={120} />
          <CompKnobs id={id} comp={ch.comp} />
          <GrMeter id={id} />
        </div>
      )}
      {(s.eqTab === 'reverb' || s.eqTab === 'delay') && (
        <div className="cfx-body sendsx">
          <div className="sendrow">
            <span>Envío de <b style={{ color: CH_META[id].color }}>{CH_META[id].name}</b> a {s.eqTab === 'reverb' ? 'Hall Reverb' : 'Delay 1/4'}</span>
            {dbSlider('Nivel de envío', s.eqTab === 'reverb' ? ch.sendRev : ch.sendDly, (v) => d({ type: 'ch', id, fn: (c) => (s.eqTab === 'reverb' ? { ...c, sendRev: v } : { ...c, sendDly: v }) }))}
            <b className="mono">{fmtDb(s.eqTab === 'reverb' ? ch.sendRev : ch.sendDly)} dB</b>
          </div>
          <p className="hint2">Los controles generales del efecto están en el panel «Espacio y expresión». El retorno suena por el master.</p>
        </div>
      )}
    </section>
  );
}
