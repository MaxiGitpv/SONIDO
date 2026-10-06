/*
 * Activos de audio (stems, muestras del sampler, pistas) en IndexedDB.
 * localStorage solo guarda metadatos pequeños; los WAV y MP3 van aquí.
 */

export interface AssetMeta {
  id: string;
  name: string;
  type: string;
  bytes: number;
  savedAt: string;
}

const DB = 'sonido-assets';
const STORE = 'assets';
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('sin-indexeddb'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb'));
  });
  dbp.catch(() => (dbp = null));
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const r = fn(t.objectStore(STORE));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error ?? new Error('indexeddb'));
        t.onabort = () => reject(t.error ?? new Error('abort'));
      }),
  );
}

export const newAssetId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Guarda un archivo. Lanza 'cuota' si el navegador no tiene espacio. */
export async function putAsset(id: string, file: File | Blob, name: string): Promise<AssetMeta> {
  const data = await file.arrayBuffer();
  const meta: AssetMeta = { id, name, type: file.type || 'audio/*', bytes: data.byteLength, savedAt: new Date().toISOString() };
  try {
    await tx('readwrite', (s) => s.put({ ...meta, data }));
  } catch (e) {
    const n = e instanceof DOMException ? e.name : '';
    throw new Error(n === 'QuotaExceededError' ? 'cuota' : 'guardar');
  }
  return meta;
}

export async function getAsset(id: string): Promise<{ meta: AssetMeta; data: ArrayBuffer } | null> {
  try {
    const r = (await tx('readonly', (s) => s.get(id))) as (AssetMeta & { data: ArrayBuffer }) | undefined;
    if (!r) return null;
    const { data, ...meta } = r;
    return { meta, data };
  } catch {
    return null;
  }
}

export async function listAssets(): Promise<AssetMeta[]> {
  try {
    const all = (await tx('readonly', (s) => s.getAll())) as (AssetMeta & { data?: ArrayBuffer })[];
    return all.map(({ data: _d, ...m }) => m);
  } catch {
    return [];
  }
}

export async function deleteAsset(id: string) {
  try {
    await tx('readwrite', (s) => s.delete(id));
  } catch {
    /* ignorado */
  }
}

export async function storageEstimate(): Promise<{ used: number; quota: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    return e ? { used: e.usage ?? 0, quota: e.quota ?? 0 } : null;
  } catch {
    return null;
  }
}
