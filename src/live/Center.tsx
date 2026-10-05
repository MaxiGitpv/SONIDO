import { useEffect, useRef, useState } from 'react';
import { useLive, Icon, Art } from './ctx';
import { CH_META, KEY_NAMES, isBlack, noteName, soundById } from './data';
import { SCENES } from './types';
import type { Chan, ChId } from './types';
import { engine } from './engine';
import { Knob } from '../components/Knob';
import { HSlider } from '../components/HSlider';
import { bandResponse, compOut } from '../dsp';
import { clamp, dbToPos, fmtDb, fmtHz, posToDb } from '../util';

/* ---------- Cabecera de canción y escenas ---------- */
export function SongHeader() {
  const { s, d } = useLive();
  const song = s.songs.find((x) => x.id === s.songId)!;
  const si = SCENES.findIndex((x) => x.id === s.sceneId);
  const next = si < SCENES.length - 1 ? SCENES[si + 1].label : (s.songs[s.songs.findIndex((x) => x.id === s.songId) + 1]?.title ?? '—');
  return (
    <div className="songhead">
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
      <span className="pill">{song.ts}</span>
      <button className="nextscene" onClick={() => d({ type: 'step', dir: 1 })}>
        <small>Siguiente</small> · <b>{next}</b>
        <span className="circ"><Icon name="next" size={16} /></span>
      </button>
    </div>
  );
}

export function SceneBar() {
  const { s, d } = useLive();
  return (
    <div className="scenebar" role="tablist" aria-label="Escenas">
      {SCENES.map((sc) => (
        <button key={sc.id} role="tab" aria-selected={s.sceneId === sc.id} className={`scenebtn${s.sceneId === sc.id ? ' on' : ''}`} onClick={() => d({ type: 'scene', id: sc.id })}>
          {sc.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Sonido seleccionado: capas ---------- */
export function SoundLayers() {
  const { s, d, mix } = useLive();
  const sound = soundById(mix.sound);
  return (
    <div className="layers">
      {sound.layers.map((l) => {
        const c = mix.chans[l.ch];
        return (
          <div key={l.ch} className={`layer${s.selected === l.ch ? ' sel' : ''}${c.mute ? ' muted' : ''}`} style={{ ['--cc' as string]: CH_META[l.ch].color }}>
            <i className="layer-bar" />
            <Art ch={l.ch} />
            <button className="layer-t" onClick={() => d({ type: 'select', id: l.ch })} title="Editar EQ y dinámica de esta capa">
              <b>{l.name}</b>
              <small>{l.desc}{c.mute ? ' · silenciada' : ''}</small>
            </button>
            <Knob label="Vol" value={c.fader} min={-60} max={6} step={0.5} def={0} format={(v) => `${fmtDb(v)} dB`} onChange={(v) => d({ type: 'ch', id: l.ch, fn: (x) => ({ ...x, fader: v }) })} />
            <Knob label="Pan" value={c.pan} min={-100} max={100} step={1} def={0} format={(v) => (Math.round(v) === 0 ? 'C' : v < 0 ? `L${-Math.round(v)}` : `R${Math.round(v)}`)} onChange={(v) => d({ type: 'ch', id: l.ch, fn: (x) => ({ ...x, pan: Math.abs(v) < 4 ? 0 : v }) })} />
            <button className={`iconbtn${c.mute ? ' warn' : ''}`} aria-pressed={!c.mute} title={c.mute ? 'Activar capa' : 'Silenciar capa'} onClick={() => d({ type: 'ch', id: l.ch, fn: (x) => ({ ...x, mute: !x.mute }) })}>
              <Icon name="power" size={16} />
            </button>
          </div>
        );
      })}
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
  const layers = soundById(mix.sound).layers;
  const two = layers.length > 1;
  const W = KEYS.whites;
  const pct = (x: number) => `${(x / W) * 100}%`;
  const zone = (n: number) => (!two ? 'a' : n < s.split ? 'a' : 'b');
  return (
    <div className="kbwrap">
      <div className="kb2" role="group" aria-label="Teclado: toque para escuchar el sonido seleccionado"
        style={{ ['--za' as string]: CH_META[layers[0].ch].color, ['--zb' as string]: CH_META[(layers[1] ?? layers[0]).ch].color }}>
        {KEYS.keys.filter((k) => !k.black).map((k) => (
          <button key={k.n} className={`wk z-${zone(k.n)}${held.includes(k.n) ? ' down' : ''}`} style={{ left: pct(k.x), width: pct(1) }} aria-label={noteName(k.n)}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onDown(k.n); }} onPointerUp={() => onUp(k.n)} onPointerCancel={() => onUp(k.n)} />
        ))}
        {KEYS.keys.filter((k) => k.black).map((k) => (
          <button key={k.n} className={`bk z-${zone(k.n)}${held.includes(k.n) ? ' down' : ''}`} style={{ left: pct(k.x), width: pct(0.64) }} aria-label={noteName(k.n)}
            onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); onDown(k.n); }} onPointerUp={() => onUp(k.n)} onPointerCancel={() => onUp(k.n)} />
        ))}
        <div className="kb-oct" aria-hidden="true">
          {KEYS.keys.filter((k) => k.n % 12 === 0).map((k) => <span key={k.n} style={{ left: pct(k.x) }}>{noteName(k.n)}</span>)}
        </div>
      </div>
      <div className="kb-side">
        <label>
          <span>Split</span>
          <select value={s.split} disabled={!two} onChange={(e) => d({ type: 'split', value: Number(e.target.value) })}>
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
      </div>
    </div>
  );
}

/* ---------- EQ / Comp / Reverb / Delay del canal seleccionado ---------- */
const W = 420;
const H = 150;
const PAD = { l: 26, r: 6, t: 8, b: 16 };
const F0 = 20;
const F1 = 20000;
const GR = 15;
const fx = (f: number) => PAD.l + (Math.log(f / F0) / Math.log(F1 / F0)) * (W - PAD.l - PAD.r);
const fy = (g: number) => PAD.t + (1 - (g + GR) / (2 * GR)) * (H - PAD.t - PAD.b);
const xf = (x: number) => F0 * Math.pow(F1 / F0, (x - PAD.l) / (W - PAD.l - PAD.r));
const yg = (y: number) => GR - ((y - PAD.t) / (H - PAD.t - PAD.b)) * 2 * GR;
const BAND_COLORS = ['#c47bff', '#35b4ff', '#4ee39a', '#f2a53a'];
const BAND_TYPES = ['Low shelf', 'Peaking', 'Peaking', 'High shelf'];

function EqGraph({ ch, id, sel, setSel }: { ch: Chan; id: ChId; sel: number; setSel: (i: number) => void }) {
  const { d } = useLive();
  const svg = useRef<SVGSVGElement>(null);
  const spec = useRef<SVGPathElement>(null);
  const drag = useRef<number | null>(null);

  useEffect(() => {
    const bins = new Uint8Array(new ArrayBuffer(1024));
    let raf = 0;
    const sr = () => engine.sampleRate || 48000;
    const draw = () => {
      if (engine.spectrum(id, bins) && spec.current) {
        const pts: string[] = [];
        for (let k = 0; k <= 72; k++) {
          const f = F0 * Math.pow(F1 / F0, k / 72);
          const bin = Math.min(bins.length - 1, Math.round((f / (sr() / 2)) * bins.length));
          const v = bins[bin] / 255;
          pts.push(`${fx(f).toFixed(1)},${(H - PAD.b - v * (H - PAD.t - PAD.b) * 0.95).toFixed(1)}`);
        }
        spec.current.setAttribute('d', `M${fx(F0)},${H - PAD.b}L${pts.join('L')}L${fx(F1)},${H - PAD.b}Z`);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [id]);

  const pts: string[] = [];
  for (let k = 0; k <= 96; k++) {
    const f = F0 * Math.pow(F1 / F0, k / 96);
    pts.push(`${fx(f).toFixed(1)},${fy(clamp(bandResponse(ch, f), -GR, GR)).toFixed(1)}`);
  }
  const move = (e: React.PointerEvent) => {
    const i = drag.current;
    if (i === null) return;
    const r = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    d({ type: 'ch', id, fn: (c) => ({ ...c, eq: c.eq.map((b, j) => (j === i ? { ...b, freq: Math.round(clamp(xf(x), 20, 20000)), gain: Math.round(clamp(yg(y), -GR, GR) * 2) / 2 } : b)) as Chan['eq'] }) });
  };
  return (
    <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className={`eqg${ch.eqOn ? '' : ' off'}`} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)} role="img" aria-label="Curva de ecualización y espectro en vivo">
      {[50, 100, 200, 500, 1000, 2000, 5000, 10000].map((f) => <line key={f} x1={fx(f)} x2={fx(f)} y1={PAD.t} y2={H - PAD.b} className="gl" />)}
      {[20, 100, 1000, 10000, 20000].map((f) => <text key={f} x={Math.min(W - 12, fx(f))} y={H - 3} className="gt" textAnchor="middle">{f >= 1000 ? `${f / 1000}k` : f}</text>)}
      {[12, 6, 0, -6, -12].map((g) => (
        <g key={g}>
          <line x1={PAD.l} x2={W - PAD.r} y1={fy(g)} y2={fy(g)} className={g === 0 ? 'gz' : 'gl'} />
          <text x={PAD.l - 4} y={fy(g) + 3} className="gt" textAnchor="end">{g > 0 ? `+${g}` : g}</text>
        </g>
      ))}
      <path ref={spec} className="spec" d="" />
      <path d={`M${pts.join('L')}`} className="eqc" />
      {ch.eq.map((b, i) => (
        <g key={i} className={`node${sel === i ? ' sel' : ''}${b.on ? '' : ' off'}`} style={{ ['--bc' as string]: BAND_COLORS[i] }}
          onPointerDown={(e) => { e.stopPropagation(); svg.current!.setPointerCapture(e.pointerId); drag.current = i; setSel(i); }}>
          <circle cx={fx(b.freq)} cy={fy(clamp(b.gain, -GR, GR))} r="18" className="hit" />
          <circle cx={fx(b.freq)} cy={fy(clamp(b.gain, -GR, GR))} r="6.5" className="dot" />
        </g>
      ))}
    </svg>
  );
}

function GrMeter({ id }: { id: ChId }) {
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

const dbSlider = (label: string, v: number, on: (v: number) => void) => (
  <HSlider label={label} value={v} toPos={dbToPos} fromPos={posToDb} snap={(x) => (Math.abs(x) < 1 ? 0 : Math.round(x * 2) / 2)} onChange={on} />
);

export function ChannelFx() {
  const { s, d, mix } = useLive();
  const [sel, setSel] = useState(1);
  const id = s.selected;
  const ch = mix.chans[id];
  const b = ch.eq[sel];
  const setB = (p: Partial<typeof b>) => d({ type: 'ch', id, fn: (c) => ({ ...c, eq: c.eq.map((x, j) => (j === sel ? { ...x, ...p } : x)) as Chan['eq'] }) });
  const setC = (p: Partial<Chan['comp']>) => d({ type: 'ch', id, fn: (c) => ({ ...c, comp: { ...c.comp, ...p } }) });
  const tabs: [typeof s.eqTab, string][] = [['eq', 'EQ'], ['comp', 'Comp'], ['reverb', 'Reverb'], ['delay', 'Delay']];
  const S = 110;
  const curve = Array.from({ length: 61 }, (_, i) => {
    const inDb = -60 + i;
    return `${((inDb + 60) / 60) * S},${S - ((clamp(compOut(ch.comp, inDb), -60, 0) + 60) / 60) * S}`;
  }).join('L');

  return (
    <section className="cfx">
      <div className="cfx-tabs" role="tablist">
        {tabs.map(([t, l]) => (
          <button key={t} role="tab" aria-selected={s.eqTab === t} className={s.eqTab === t ? 'on' : ''} onClick={() => d({ type: 'eqTab', tab: t })}>
            {l}{t === 'eq' && <> · <span style={{ color: CH_META[id].color }}>{CH_META[id].name}</span></>}
          </button>
        ))}
      </div>
      {s.eqTab === 'eq' && (
        <div className="cfx-body">
          <EqGraph ch={ch} id={id} sel={sel} setSel={setSel} />
          <div className="eqctl">
            <Knob label="Frequency" value={b.freq} min={20} max={20000} log def={[100, 400, 2500, 9000][sel]} format={fmtHz} onChange={(v) => setB({ freq: Math.round(v) })} color={BAND_COLORS[sel]} />
            <Knob label="Gain" value={b.gain} min={-15} max={15} step={0.5} def={0} format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`} onChange={(v) => setB({ gain: v })} color={BAND_COLORS[sel]} />
            <Knob label="Q" value={b.q} min={0.3} max={8} log step={0.1} def={1} format={(v) => v.toFixed(1)} onChange={(v) => setB({ q: v })} color={BAND_COLORS[sel]} disabled={sel === 0 || sel === 3} />
            <div className="eqtype">
              <span>Tipo</span>
              <b>{BAND_TYPES[sel]}</b>
              <div className="eqbtns">
                <button className={`mini${b.on ? ' on' : ''}`} aria-pressed={b.on} onClick={() => setB({ on: !b.on })}>Banda {b.on ? 'ON' : 'OFF'}</button>
                <button className={`mini${ch.eqOn ? ' on' : ''}`} aria-pressed={ch.eqOn} onClick={() => d({ type: 'ch', id, fn: (c) => ({ ...c, eqOn: !c.eqOn }) })}>EQ {ch.eqOn ? 'ON' : 'OFF'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {s.eqTab === 'comp' && (
        <div className="cfx-body comp2">
          <svg viewBox={`-2 -2 ${S + 4} ${S + 4}`} className={`compg${ch.comp.on ? '' : ' off'}`} role="img" aria-label="Curva del compresor">
            <rect width={S} height={S} className="gf" />
            <line x1="0" y1={S} x2={S} y2="0" className="gz" />
            <line x1={((ch.comp.threshold + 60) / 60) * S} x2={((ch.comp.threshold + 60) / 60) * S} y1="0" y2={S} className="thr" />
            <path d={`M${curve}`} className="eqc" />
          </svg>
          <div className="compk">
            <Knob label="Umbral" value={ch.comp.threshold} min={-60} max={0} step={0.5} def={-20} format={(v) => `${v.toFixed(1)} dB`} onChange={(v) => setC({ threshold: v })} disabled={!ch.comp.on} />
            <Knob label="Ratio" value={ch.comp.ratio} min={1} max={20} log step={0.1} def={3} format={(v) => `${v.toFixed(1)}:1`} onChange={(v) => setC({ ratio: v })} disabled={!ch.comp.on} />
            <Knob label="Ataque" value={ch.comp.attack} min={1} max={200} log step={1} def={15} format={(v) => `${Math.round(v)} ms`} onChange={(v) => setC({ attack: v })} disabled={!ch.comp.on} />
            <Knob label="Relé" value={ch.comp.release} min={20} max={1000} log step={5} def={200} format={(v) => `${Math.round(v)} ms`} onChange={(v) => setC({ release: v })} disabled={!ch.comp.on} />
            <Knob label="Ganancia" value={ch.comp.makeup} min={0} max={18} step={0.5} def={0} format={(v) => `${v.toFixed(1)} dB`} onChange={(v) => setC({ makeup: v })} disabled={!ch.comp.on} />
            <button className={`mini${ch.comp.on ? ' on' : ''}`} aria-pressed={ch.comp.on} onClick={() => setC({ on: !ch.comp.on })}>Comp {ch.comp.on ? 'ON' : 'OFF'}</button>
          </div>
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
