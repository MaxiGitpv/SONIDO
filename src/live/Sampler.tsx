import { useRef } from 'react';
import { useLive, Icon } from './ctx';
import { noteName } from './data';
import { engine } from './engine';
import { Knob } from '../components/Knob';

/** Sampler: muestras propias (WAV, MP3, M4A, OGG) con nota raíz, rangos, capas de velocidad, envolvente y loop. */
export function SamplerPanel() {
  const { s, d, can, assets, addSamples, remote } = useLive();
  const input = useRef<HTMLInputElement>(null);
  const edit = can('music');
  const zs = s.sampler.zones;
  const num = (v: string, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));
  return (
    <section className="organ2">
      <h3>Sampler · Mis muestras</h3>
      <p className="hint2">Cada archivo es una zona: nota raíz (se toma del nombre, p. ej. «Piano_C4.wav»), rango de notas, rango de velocidad, volumen y loop. Una sola muestra transpuesta no equivale a un piano multisample profesional: para un instrumento realista cargue varias notas y capas de velocidad. Los archivos se guardan en este navegador.</p>
      <div className="gp-row">
        <input ref={input} type="file" accept="audio/*" multiple hidden onChange={(e) => { const f = [...(e.target.files ?? [])]; if (f.length) void addSamples(f); e.target.value = ''; }} />
        <button className="mini on" disabled={!edit || remote} onClick={() => input.current?.click()}><Icon name="upload" size={14} /> Cargar muestras…</button>
        <Knob label="Ataque" value={s.sampler.attack} min={0.001} max={2} log step={0.001} def={0.005} disabled={!edit} format={(v) => `${Math.round(v * 1000)} ms`} onChange={(v) => d({ type: 'samplerEdit', patch: { attack: v } })} />
        <Knob label="Relajación" value={s.sampler.release} min={0.02} max={4} log step={0.01} def={0.35} disabled={!edit} format={(v) => `${v.toFixed(2)} s`} onChange={(v) => d({ type: 'samplerEdit', patch: { release: v } })} />
      </div>
      {zs.length === 0 ? <p className="hint2">Sin muestras. Para tocarlas, elija el sonido «Mis muestras» (categoría Sampler) o añada la capa Sampler.</p> : (
        <div className="zones">
          <div className="zone-h"><span>Muestra</span><span>Raíz</span><span>Notas</span><span>Velocidad</span><span>Volumen</span><span>Loop</span><span>Estado</span><span /></div>
          {zs.map((z) => (
            <div key={z.id} className="zone-row">
              <input aria-label="Nombre" value={z.name} maxLength={32} disabled={!edit} onChange={(e) => d({ type: 'zoneEdit', id: z.id, patch: { name: e.target.value } })} />
              <label className="zn">{noteName(z.root)}<input type="number" aria-label="Nota raíz" min={0} max={127} value={z.root} disabled={!edit} onChange={(e) => d({ type: 'zoneEdit', id: z.id, patch: { root: num(e.target.value, 0, 127) } })} /></label>
              <span className="zr">
                <input type="number" aria-label="Nota más grave" min={0} max={127} value={z.lo} disabled={!edit} onChange={(e) => d({ type: 'zoneEdit', id: z.id, patch: { lo: num(e.target.value, 0, z.hi) } })} />–
                <input type="number" aria-label="Nota más aguda" min={0} max={127} value={z.hi} disabled={!edit} onChange={(e) => d({ type: 'zoneEdit', id: z.id, patch: { hi: num(e.target.value, z.lo, 127) } })} />
                <small>{noteName(z.lo)}–{noteName(z.hi)}</small>
              </span>
              <span className="zr">
                <input type="number" aria-label="Velocidad mínima" min={0} max={127} value={z.velLo} disabled={!edit} onChange={(e) => d({ type: 'zoneEdit', id: z.id, patch: { velLo: num(e.target.value, 0, z.velHi) } })} />–
                <input type="number" aria-label="Velocidad máxima" min={0} max={127} value={z.velHi} disabled={!edit} onChange={(e) => d({ type: 'zoneEdit', id: z.id, patch: { velHi: num(e.target.value, z.velLo, 127) } })} />
              </span>
              <label className="zn">{z.gain > 0 ? '+' : ''}{z.gain} dB<input type="range" aria-label="Volumen" min={-24} max={12} step={0.5} value={z.gain} disabled={!edit} onChange={(e) => d({ type: 'zoneEdit', id: z.id, patch: { gain: Number(e.target.value) } })} /></label>
              <input type="checkbox" aria-label="Loop" checked={z.loop} disabled={!edit} onChange={(e) => d({ type: 'zoneEdit', id: z.id, patch: { loop: e.target.checked } })} />
              <small>{assets[z.asset] === 'ready' || engine.hasSample(z.asset) ? 'listo' : assets[z.asset] === 'missing' ? 'falta el archivo' : assets[z.asset] === 'error' ? 'error' : 'cargando'}</small>
              <button className="iconbtn" aria-label={`Quitar ${z.name}`} disabled={!edit} onClick={() => d({ type: 'zoneRemove', id: z.id })}><Icon name="x" size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const CATALOG: { name: string; kind: string; status: 'web' | 'desktop' | 'link'; note: string; url: string }[] = [
  { name: 'Surge XT', kind: 'Sintetizador de código abierto (pads, síntesis)', status: 'desktop', note: 'Requiere un host de escritorio (VST3/AU/CLAP). No se puede cargar en el navegador.', url: 'https://surge-synthesizer.github.io/' },
  { name: 'Decent Sampler', kind: 'Reproductor gratuito de bibliotecas', status: 'desktop', note: 'Plugin de escritorio. Sus bibliotecas tienen licencias propias; revise cada una antes de usar o compartir muestras.', url: 'https://www.decentsamples.com/product/decent-sampler-plugin/' },
  { name: 'BBC Symphony Orchestra Discover', kind: 'Orquesta gratuita (cuerdas, metales, maderas)', status: 'desktop', note: 'Plugin de escritorio de Spitfire Audio; no es un banco web importable.', url: 'https://www.spitfireaudio.com/products/bbc-symphony-orchestra-discover' },
  { name: 'Sus propias muestras WAV/MP3', kind: 'Sampler de SONIDO', status: 'web', note: 'Compatible con la web: se cargan arriba y se guardan en este navegador.', url: '' },
];

export function Catalog() {
  return (
    <section className="organ2">
      <h3>Recursos externos (catálogo, no instalados)</h3>
      <p className="hint2">SONIDO no aloja ni redistribuye muestras de terceros. Gratis para instalar no significa permiso para incluir sus muestras en una app pública. Los plugins de escritorio requieren un host nativo (etapa posterior).</p>
      <div className="catalog">
        {CATALOG.map((c) => (
          <article key={c.name} className={`catitem ${c.status}`}>
            <b>{c.name}</b>
            <small>{c.kind}</small>
            <span className="catbadge">{c.status === 'web' ? 'Compatible con la web' : c.status === 'desktop' ? 'Requiere plugin o host de escritorio' : 'Enlace de descarga'}</span>
            <p>{c.note}</p>
            {c.url && <a href={c.url} target="_blank" rel="noopener noreferrer">Abrir sitio oficial</a>}
          </article>
        ))}
      </div>
    </section>
  );
}
