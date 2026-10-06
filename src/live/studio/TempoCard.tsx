/*
 * Tempo y tono procesados del proyecto (acotado). Renderiza copias de TODOS los archivos de la canción con los
 * mismos parámetros, siempre desde los originales, y cambia el proyecto a esa versión (deshacer y «Volver al
 * original» disponibles). El original no se borra ni se modifica.
 */
import { useState } from 'react';
import { useLive } from '../ctx';
import { engine } from '../engine';
import { newAssetId, putAsset } from '../assets';
import type { AssetInfo } from '../types';
import { encodeWav16, renderStretched, versionBytes } from './stretch';

export function TempoCard({ edit }: { edit: boolean }) {
  const { song, d, remote } = useLive();
  const p = song.project;
  const v = p.version;
  const [rate, setRate] = useState(v?.rate ?? 1);
  const [semi, setSemi] = useState(v?.semitones ?? 0);
  const [busy, setBusy] = useState<string | null>(null);
  const origOf = (asset: string) => p.assets[asset]?.from?.asset ?? asset;
  const origs = [...new Set(p.clips.map((c) => origOf(c.asset)))];
  const info = (a: string): AssetInfo | undefined => p.assets[a];
  const seconds = origs.reduce((s, a) => s + (info(a)?.duration ?? 0), 0);
  const bytes = origs.reduce((s, a) => s + versionBytes(info(a)?.duration ?? 0, info(a)?.channels || 2, info(a)?.sampleRate || 48000, rate), 0);
  const baseBpm = v?.baseBpm ?? song.bpm;
  const baseKey = v?.baseKey ?? song.key;
  const curRate = v?.rate ?? 1;
  const changed = rate !== curRate || semi !== (v?.semitones ?? 0);

  const prepare = async () => {
    if (rate === 1 && semi === 0) return revert();
    const map: Record<string, string> = {};
    const assets: Record<string, AssetInfo> = {};
    let sessionOnly = 0;
    try {
      for (const [i, orig] of origs.entries()) {
        const buf = engine.bufferOf(orig);
        if (!buf) throw new Error(`falta el original «${info(orig)?.name ?? orig}» (cárguelo o active el audio)`);
        setBusy(`Procesando ${i + 1}/${origs.length} · ${info(orig)?.name ?? orig}…`);
        const out = await renderStretched(buf, rate, semi);
        const id = newAssetId();
        const name = `${info(orig)?.name ?? 'Audio'} · ${Math.round(rate * 100)} %${semi ? ` ${semi > 0 ? '+' : ''}${semi} st` : ''}`;
        const wav = encodeWav16(out);
        try {
          await putAsset(id, wav, name);
        } catch {
          sessionOnly++;
        }
        engine.putAudio(id, out);
        assets[id] = { name, duration: out.duration, channels: out.numberOfChannels, sampleRate: out.sampleRate, bytes: wav.size, from: { asset: orig, rate, semitones: semi } };
        // Todo clip que hoy apunta a este original (o a una versión anterior de él) pasa a la nueva copia.
        for (const c of p.clips) if (origOf(c.asset) === orig) map[c.asset] = id;
      }
    } catch (e) {
      setBusy(null);
      return d({ type: 'toast', text: `No se pudo preparar la versión: ${e instanceof Error ? e.message : 'error'}` });
    }
    setBusy(null);
    d({ type: 'proj', op: { k: 'retime', map, factor: curRate / rate, assets, version: { rate, semitones: semi, baseBpm, baseKey } } });
    d({ type: 'toast', text: `Versión lista: ${Math.round(rate * 100)} % y ${semi > 0 ? '+' : ''}${semi} semitonos.${sessionOnly ? ` ${sessionOnly} archivo(s) sin espacio para guardar: solo esta sesión.` : ''}` });
  };

  const revert = () => {
    if (!v) return;
    const map: Record<string, string> = {};
    for (const c of p.clips) map[c.asset] = origOf(c.asset);
    d({ type: 'proj', op: { k: 'retime', map, factor: curRate, assets: {}, version: null } });
    setRate(1);
    setSemi(0);
  };

  return (
    <section className="st-card">
      <h3>Tempo y tono (procesado)</h3>
      <p className="hint2">
        Copia procesada de todo el grupo con los mismos parámetros (Signalsmith Stretch, MIT). Cambia el tempo sin cambiar la afinación, o la afinación sin cambiar la duración. Se prepara antes del servicio; los originales se conservan. Los ataques pueden suavizarse y variar hasta ~2 ms entre pistas.
      </p>
      <label className="st-field"><span>Velocidad {Math.round(rate * 100)} % → {Math.round(baseBpm * rate * 10) / 10} BPM</span>
        <input type="range" min={0.8} max={1.2} step={0.01} value={rate} disabled={!edit || remote || !!busy} onChange={(e) => setRate(Number(e.target.value))} aria-label="Velocidad" />
      </label>
      <label className="st-field"><span>Transposición {semi > 0 ? '+' : ''}{semi} semitonos</span>
        <input type="range" min={-6} max={6} step={1} value={semi} disabled={!edit || remote || !!busy} onChange={(e) => setSemi(Number(e.target.value))} aria-label="Transposición" />
      </label>
      <p className="hint2">{origs.length} archivo(s), {Math.round(seconds)} s de audio · ≈ {Math.ceil(seconds / 8)} s de proceso · ≈ {(bytes / 1048576).toFixed(0)} MB en el navegador.{v ? ` Vigente: ${Math.round(v.rate * 100)} %, ${v.semitones > 0 ? '+' : ''}${v.semitones} st (desde ${v.baseBpm} BPM, ${v.baseKey}).` : ' Vigente: original.'}</p>
      {busy && <p className="st-warn" role="status">{busy}</p>}
      <div className="gp-row">
        <button className="mini on" disabled={!edit || remote || !!busy || !origs.length || !changed} onClick={() => void prepare()}>{rate === 1 && semi === 0 ? 'Volver al original' : 'Preparar versión'}</button>
        {v && <button className="mini" disabled={!edit || remote || !!busy} onClick={revert}>Volver al original</button>}
      </div>
      {remote && <p className="hint2">Se prepara en el equipo anfitrión.</p>}
    </section>
  );
}
