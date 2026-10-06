import { useEffect, useRef, useState } from 'react';
import { useLive } from './ctx';
import { deleteProfile, exportFile, importFile, listProfiles, setActiveProfile } from './persist';
import type { SavedData } from './persist';
import { listAssets, storageEstimate } from './assets';

const mb = (n: number) => `${(n / 1048576).toFixed(1)} MB`;

/** Perfiles locales, respaldo (exportar/importar) y versiones anteriores. Un perfil local no es una cuenta. */
export function ProfileMenu({ onClose, onProfile, onLegacy }: { onClose: () => void; onProfile: (p: string) => void; onLegacy: (m: 'consola' | 'performance') => void }) {
  const { s, d, profile, remote } = useLive();
  const [name, setName] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [pending, setPending] = useState<{ data: SavedData; missing: string[] } | null>(null);
  const [usage, setUsage] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const profiles = listProfiles();

  useEffect(() => {
    void storageEstimate().then((e) => e && setUsage(`${mb(e.used)} usados de ${mb(e.quota)}`));
    return () => {
      if (exportUrl) URL.revokeObjectURL(exportUrl);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const switchTo = (p: string) => {
    if (s.dirty && p !== profile) {
      d({ type: 'toast', text: 'Guarde o descarte los cambios antes de cambiar de perfil' });
      return;
    }
    setActiveProfile(p);
    onProfile(p);
    onClose();
  };

  const doExport = async () => {
    const assets = (await listAssets()).map((a) => ({ id: a.id, name: a.name, type: a.type, bytes: a.bytes, usedBy: s.songs.find((sg) => sg.stems.some((st) => st.asset === a.id))?.title ?? (s.sampler.zones.some((z) => z.asset === a.id) ? 'Sampler' : 'Pista') }));
    const blob = new Blob([exportFile(s, profile, assets)], { type: 'application/json' });
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    setExportUrl(URL.createObjectURL(blob));
  };

  const doImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPending(importFile(await f.text()));
    } catch {
      d({ type: 'toast', text: 'Ese archivo no es una sesión de SONIDO válida' });
    }
  };

  return (
    <div className="gearpop wide" role="dialog" aria-label="Perfiles y respaldo">
      <section>
        <p className="gp-h">Perfil local · {profile}</p>
        <p className="gp-note">Separa configuraciones en este navegador. No es una cuenta ni protege datos entre personas que usan el mismo equipo.</p>
        <div className="gp-list">
          {profiles.map((p) => (
            <button key={p} className={`mini${p === profile ? ' on' : ''}`} onClick={() => switchTo(p)}>{p}</button>
          ))}
        </div>
        <form className="gp-row" onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (n) { setName(''); switchTo(n); } }}>
          <input id="new-profile" value={name} maxLength={24} placeholder="Nuevo perfil (p. ej. Domingo AM)" onChange={(e) => setName(e.target.value)} aria-label="Nombre del nuevo perfil" />
          <button className="mini" type="submit" disabled={!name.trim()}>Crear</button>
        </form>
        {profiles.length > 1 && (
          <button className={`mini${confirmDel ? ' warn' : ''}`} onClick={() => {
            if (!confirmDel) return setConfirmDel(true);
            deleteProfile(profile);
            onProfile(listProfiles()[0]);
            onClose();
          }}>{confirmDel ? `Confirmar: borrar «${profile}» de este navegador` : 'Eliminar este perfil'}</button>
        )}
      </section>
      <section>
        <p className="gp-h">Respaldo</p>
        <div className="gp-row">
          <button className="mini" onClick={() => void doExport()}>Preparar exportación</button>
          {exportUrl && <a className="mini on" href={exportUrl} download={`SONIDO-${profile}-${new Date().toISOString().slice(0, 10)}.json`}>Descargar sesión (.json)</a>}
        </div>
        <p className="gp-note">Incluye canciones, escenas, mezcla, buses, MIDI y la lista de archivos de audio usados (sin el audio). Las entradas físicas no se exportan: cada equipo las asigna.</p>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { void doImport(e.target.files?.[0]); e.target.value = ''; }} />
        <button className="mini" disabled={remote} onClick={() => fileRef.current?.click()}>Importar sesión…</button>
        {pending && (
          <div className="gp-confirm">
            <p>Se reemplazará la sesión de este perfil por la importada ({pending.data.songs.length} canciones, {pending.data.mixScenes.length} escenas de mezcla). Se crea como copia local.</p>
            {pending.missing.length > 0 && <p className="gp-note">Archivos que deberá volver a cargar: {pending.missing.join(', ')}.</p>}
            <div className="gp-row">
              <button className="mini on" onClick={() => { d({ type: 'import', data: pending.data }); setPending(null); onClose(); }}>Importar</button>
              <button className="mini" onClick={() => setPending(null)}>Cancelar</button>
            </div>
          </div>
        )}
        {usage && <p className="gp-note">Almacenamiento del navegador: {usage}.</p>}
      </section>
      <section>
        <p className="gp-h">Versiones anteriores del prototipo</p>
        <div className="gp-row">
          <button className="mini" onClick={() => onLegacy('consola')}>Consola de 12 canales</button>
          <button className="mini" onClick={() => onLegacy('performance')}>Performance</button>
        </div>
      </section>
    </div>
  );
}
