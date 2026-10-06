import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { LiveCtx, Icon } from './ctx';
import type { AssetState, LiveCtxValue, MidiState, NetState, RecState } from './ctx';
import { connectMidi as openMidi, describe } from './midi';
import type { MidiMsg } from './midi';
import { posToDb } from '../util';
import { liveInit, liveReducer } from './store';
import type { LAction } from './store';
import { CH_META, KEY_SEMI } from './data';
import type { ChId, InId, InputCfg, SceneId, Stem, StemCat, Tab, View } from './types';
import { IN_IDS } from './types';
import { engine } from './engine';
import { Repertoire, SoundBank } from './Left';
import { ChannelFx, PlayPanel, SceneBar, SongHeader } from './Center';
import { Expand } from './nav';
import { ChannelPage, FxPage, InputsPage, PlayPage, ScenesPage } from './Pages';
import { BusesPage, MixScenesPage, NetworkPage, OutputsPage, StemsPage } from './Pages2';
import { StripRow } from './Strips';
import { RightPanel } from './Right';
import { Footer } from './Footer';
import { MidiView, MixerView, RoutesView, SoundsView } from './Views';
import { ProfileMenu } from './Profiles';
import { useMedia } from '../ctx';
import { activeProfile, loadProfile, pickSaved, saveProfile } from './persist';
import type { SavedData } from './persist';
import { allowed, areaOf, can as canRole, ROLE_LABEL } from './perms';
import type { Area, Role } from './perms';
import { getAsset, listAssets, newAssetId, putAsset } from './assets';
import { net } from './net';
import type { MixerEvent, ServerMsg } from './net';

const ALL_TABS: { id: Tab; label: string; icon: string; views: View[] }[] = [
  { id: 'live', label: 'Inicio', icon: 'master', views: ['all', 'mixer', 'director'] },
  { id: 'scenes', label: 'Escenas', icon: 'list', views: ['all', 'director'] },
  { id: 'play', label: 'Tocar', icon: 'keys', views: ['all', 'director'] },
  { id: 'sounds', label: 'Sonidos', icon: 'layers', views: ['all', 'director'] },
  { id: 'stems', label: 'Multitrack', icon: 'tracks', views: ['all', 'director'] },
  { id: 'mixer', label: 'Mezcla', icon: 'sliders', views: ['all', 'mixer'] },
  { id: 'channel', label: 'Canal', icon: 'expand', views: ['all', 'mixer'] },
  { id: 'inputs', label: 'Entradas', icon: 'voz', views: ['all', 'mixer'] },
  { id: 'buses', label: 'Monitores', icon: 'headphones', views: ['all', 'mixer'] },
  { id: 'fx', label: 'Efectos', icon: 'pad', views: ['all', 'mixer'] },
  { id: 'outputs', label: 'Salidas', icon: 'next', views: ['all', 'mixer'] },
  { id: 'mixscenes', label: 'Escenas de mezcla', icon: 'save', views: ['all', 'mixer'] },
  { id: 'network', label: 'Red y mesa', icon: 'grid', views: ['all', 'mixer', 'director'] },
  { id: 'routes', label: 'Rutas', icon: 'loop', views: ['all', 'mixer'] },
  { id: 'midi', label: 'MIDI', icon: 'keys', views: ['all', 'director'] },
];
const VIEWS: { id: View; label: string }[] = [
  { id: 'all', label: 'Todo' },
  { id: 'mixer', label: 'Sonidista' },
  { id: 'director', label: 'Director' },
];
const PC_KEYS: Record<string, number> = { a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72, o: 73, l: 74 };
const LOCAL_ONLY = new Set(['tab', 'view', 'eqTab', 'cat', 'select', 'left', 'toast', 'group', 'playPanel', 'saved', 'playing', 'octave', 'editor', 'replace', 'file']);
const AREA_LABEL: Record<Area, string> = { music: 'la música', midi: 'el MIDI', console: 'la consola', buses: 'los monitores', master: 'el master', fx: 'los efectos', inputs: 'las entradas', outputs: 'las salidas', mixscenes: 'las escenas de mezcla', transport: 'el transporte', admin: 'la sesión' };
const stemCatFromName = (n: string): StemCat => {
  const x = n.toLowerCase();
  if (/click|metro/.test(x)) return 'click';
  if (/gu[ií]a|guide|cue/.test(x)) return 'guia';
  if (/drum|bater|kick|snare|perc/.test(x)) return 'bateria';
  if (/bass|bajo/.test(x)) return 'bajo';
  if (/pad|amb/.test(x)) return 'ambiente';
  if (/key|piano|synth|tecl/.test(x)) return 'teclados';
  if (/gtr|guit/.test(x)) return 'guitarras';
  if (/voc|voz|bgv|coro/.test(x)) return 'voces';
  return 'otro';
};
const viewOfRole = (r: Role): View => (r === 'director' ? 'director' : r === 'all' ? 'all' : 'mixer');

declare const __BUILD__: string;
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'desarrollo';

export function LiveApp({ onLegacy }: { onLegacy: (m: 'consola' | 'performance') => void }) {
  const [profile, setProfile] = useState(activeProfile);
  return <Workspace key={profile} profile={profile} onProfile={setProfile} onLegacy={onLegacy} />;
}

function Workspace({ profile, onProfile, onLegacy }: { profile: string; onProfile: (p: string) => void; onLegacy: (m: 'consola' | 'performance') => void }) {
  const [boot] = useState(() => loadProfile(profile));
  const [s, dRaw] = useReducer(liveReducer, undefined, () => liveInit(boot.data));
  const [audioOn, setAudioOn] = useState(false);
  const [held, setHeld] = useState<number[]>([]);
  const [gear, setGear] = useState(false);
  const tabsRef = useRef<HTMLElement>(null);
  // La pestaña activa siempre queda a la vista aunque la barra no quepa entera.
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>('button.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [s.tab, s.view]);
  const [assets, setAssets] = useState<AssetState>({});
  const [netState, setNetState] = useState<NetState>({ status: 'off', detail: '', role: 'all', host: false, hostPresent: false, peers: [], ownBus: '', mixers: [], mixer: null, values: {}, meters: [], levels: {} });
  const rel = useRef(new Map<number, { release: () => void; fromMidi: boolean }>());
  const sustained = useRef<(() => void)[]>([]);
  const wide = useMedia('(min-width: 1280px)');
  const song = s.songs.find((x) => x.id === s.songId)!;
  const music = s.mix[s.songId][s.sceneId];
  const mix = useMemo(() => ({ ...music, chans: s.console }), [music, s.console]);
  const ref = useRef({ s, mix, song, netState });
  ref.current = { s, mix, song, netState };

  // Rol efectivo: el de la vista local o el que asignó el puente si este equipo es un cliente remoto.
  const remote = netState.status === 'on' && !netState.host;
  const role: Role = remote ? netState.role : (s.view as Role);
  const can = useCallback((area: Area) => canRole(role, area), [role]);

  useEffect(() => {
    if (boot.note) dRaw({ type: 'toast', text: boot.note });
  }, [boot.note]);

  /* ---------- Despacho con permisos y red ---------- */
  const d = useCallback((a: LAction) => {
    const cur = ref.current;
    const isRemote = cur.netState.status === 'on' && !cur.netState.host;
    const r: Role = isRemote ? cur.netState.role : (cur.s.view as Role);
    if (LOCAL_ONLY.has(a.type)) return dRaw(a);
    const plain = a.type === 'ch' ? ({ type: 'chput', id: a.id, value: a.fn(cur.s.console[a.id]) } as LAction) : a;
    const bus = plain.type === 'aux' ? plain.bus : undefined;
    if (!allowed(r, { type: plain.type, bus, patch: (plain as { patch?: Record<string, unknown> }).patch }, cur.netState.ownBus)) {
      const area = areaOf(plain.type);
      return dRaw({ type: 'toast', text: `La vista «${ROLE_LABEL[r]}» no puede cambiar ${area ? AREA_LABEL[area] : 'esto'}` });
    }
    if (isRemote) {
      void net.command(plain as unknown as { type: string }).then((res) => {
        if (!res.ok) dRaw({ type: 'toast', text: `El anfitrión rechazó el cambio: ${res.reason ?? 'sin motivo'}` });
      });
      return;
    }
    dRaw(plain);
  }, []);

  /* ---------- Estado -> motor de audio (solo en el equipo que suena) ---------- */
  useEffect(() => {
    engine.disabled = remote;
  }, [remote]);
  useEffect(() => {
    engine.info = {
      bpm: song.bpm, key: KEY_SEMI[song.key] ?? 0, ts: song.ts, rhodes: music.sound === 'rhodes', drawbars: s.fx.drawbars, style: song.style, arr: song.arr,
      kinds: Object.fromEntries(song.sections.map((x) => [x.id, x.kind])), mode: s.playMode, end: song.end, src: s.src, stemsOnly: song.stemsOnly && song.stems.length > 0,
    };
    engine.apply({ mix, fx: s.fx, master: s.master, masterMute: s.masterMute, buses: s.buses, outputs: s.outputs });
  }, [mix, music.sound, s.fx, s.master, s.masterMute, song, s.playMode, s.src, s.buses, s.outputs]);
  useEffect(() => engine.syncSources(), [s.src]);
  useEffect(() => engine.setSampler(s.sampler), [s.sampler]);
  useEffect(() => engine.setStems(song.stems), [song.stems]);

  const lastIn = useRef<Partial<Record<InId, string>>>({});
  useEffect(() => {
    if (remote) return;
    for (const id of IN_IDS) {
      const cfg: InputCfg = s.inputs[id];
      const key = JSON.stringify([cfg.device, cfg.side, cfg.trim, cfg.polarity]);
      if (lastIn.current[id] === key) continue;
      lastIn.current[id] = key;
      engine.setInput(id, cfg).catch((e: unknown) => {
        const name = e instanceof Error ? e.name : '';
        dRaw({ type: 'toast', text: name === 'NotAllowedError' ? 'El navegador no dio permiso para esa entrada de audio' : name === 'NotFoundError' || name === 'OverconstrainedError' ? `La entrada asignada a ${cfg.name} ya no está conectada` : `No se pudo abrir la entrada de ${cfg.name}` });
        dRaw({ type: 'input', id, patch: { device: null } });
      });
    }
  }, [s.inputs, remote]);

  useEffect(() => {
    if (!engine.playing) {
      const i = song.arr.findIndex((x) => x.scene === ref.current.s.sceneId);
      engine.setSection(Math.max(0, i));
    }
  }, [s.songId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    engine.onState = () => {
      dRaw({ type: 'playing', on: engine.playing });
      setAudioOn(engine.ready);
    };
    engine.onSection = (sec) => {
      const sc = ref.current.song.arr[sec]?.scene;
      if (sc && sc !== ref.current.s.sceneId) dRaw({ type: 'scene', id: sc });
    };
    engine.onEnd = (a) => {
      if (a === 'next') dRaw({ type: 'songStep', dir: 1 });
      if (a === 'stop') dRaw({ type: 'scene', id: ref.current.song.arr[0]?.scene ?? ref.current.song.sections[0].id });
    };
    return () => {
      engine.onState = engine.onSection = engine.onEnd = null;
      engine.stop();
    };
  }, []);

  useEffect(() => {
    if (!s.toast) return;
    const t = window.setTimeout(() => dRaw({ type: 'toast', text: '' }), 3200);
    return () => window.clearTimeout(t);
  }, [s.toast?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Activos de audio: precarga desde IndexedDB antes de tocar ---------- */
  const loadAsset = useCallback(async (id: string, kind: 'stem' | 'sample' | ChId) => {
    setAssets((a) => ({ ...a, [id]: 'loading' }));
    const r = await getAsset(id);
    if (!r) return setAssets((a) => ({ ...a, [id]: 'missing' }));
    try {
      if (kind === 'stem') await engine.loadStem(id, r.data);
      else if (kind === 'sample') await engine.loadSample(id, r.data);
      else {
        await engine.loadFile(kind, r.data);
        dRaw({ type: 'file', ch: kind, name: r.meta.name });
      }
      setAssets((a) => ({ ...a, [id]: 'ready' }));
    } catch {
      setAssets((a) => ({ ...a, [id]: 'error' }));
    }
  }, []);
  useEffect(() => {
    if (!audioOn || remote) return;
    for (const st of song.stems) if (!assets[st.asset]) void loadAsset(st.asset, 'stem');
    for (const z of s.sampler.zones) if (!assets[z.asset]) void loadAsset(z.asset, 'sample');
  }, [audioOn, song.stems, s.sampler.zones, remote]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!audioOn || remote) return;
    void listAssets().then((list) => {
      for (const ch of ['tracks', 'pad', 'drums'] as ChId[]) if (list.some((m) => m.id === `file-${ch}`)) void loadAsset(`file-${ch}`, ch);
    });
  }, [audioOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const storeFile = useCallback(async (id: string, f: File) => {
    try {
      await putAsset(id, f, f.name);
      return true;
    } catch (e) {
      dRaw({ type: 'toast', text: e instanceof Error && e.message === 'cuota' ? 'No hay espacio en el navegador para guardar el archivo; sonará solo en esta sesión.' : 'No se pudo guardar el archivo en el navegador; sonará solo en esta sesión.' });
      return false;
    }
  }, []);

  const loadFile = useCallback(async (ch: ChId, file: File) => {
    try {
      const dur = await engine.loadFile(ch, await file.arrayBuffer());
      dRaw({ type: 'file', ch, name: file.name });
      if (ch === 'pad' || ch === 'drums') d({ type: 'src', ch, mode: 'file' });
      d({ type: 'music', id: ch, patch: { on: true } });
      void storeFile(`file-${ch}`, file);
      setAssets((a) => ({ ...a, [`file-${ch}`]: 'ready' }));
      dRaw({ type: 'toast', text: `«${file.name}» (${Math.round(dur)} s) cargado en ${CH_META[ch].name}` });
    } catch {
      dRaw({ type: 'toast', text: 'No se pudo leer ese archivo. Pruebe con WAV, MP3, M4A u OGG.' });
    }
  }, [d, storeFile]);

  const addStems = useCallback(async (files: File[]) => {
    for (const f of files) {
      const id = newAssetId();
      setAssets((a) => ({ ...a, [id]: 'loading' }));
      try {
        const dur = await engine.loadStem(id, await f.arrayBuffer());
        await storeFile(id, f);
        const stem: Stem = { id: `st${id}`, name: f.name.replace(/\.[^.]+$/, ''), cat: stemCatFromName(f.name), asset: id, db: 0, mute: false, offset: 0, duration: dur };
        d({ type: 'stemAdd', stem });
        setAssets((a) => ({ ...a, [id]: 'ready' }));
      } catch {
        setAssets((a) => ({ ...a, [id]: 'error' }));
        dRaw({ type: 'toast', text: `No se pudo decodificar «${f.name}»` });
      }
    }
  }, [d, storeFile]);

  const addSamples = useCallback(async (files: File[]) => {
    for (const f of files) {
      const id = newAssetId();
      try {
        await engine.loadSample(id, await f.arrayBuffer());
        await storeFile(id, f);
        // Nota raíz desde el nombre del archivo (p. ej. «Piano_C4.wav»); si no, C4.
        const m = /(?:^|[^A-Za-z])([A-Ga-g])([#b]?)(-?\d)(?!\d)/.exec(f.name);
        const root = m ? 12 * (Number(m[3]) + 1) + (KEY_SEMI[m[1].toUpperCase() + m[2]] ?? KEY_SEMI[m[1].toUpperCase()] ?? 0) : 60;
        setAssets((a) => ({ ...a, [id]: 'ready' }));
        d({ type: 'zoneAdd', zone: { id: `z${id}`, name: f.name.replace(/\.[^.]+$/, ''), asset: id, root, lo: Math.max(0, root - 12), hi: Math.min(127, root + 12), velLo: 0, velHi: 127, gain: 0, loop: false } });
      } catch {
        dRaw({ type: 'toast', text: `No se pudo decodificar «${f.name}»` });
      }
    }
  }, [d, storeFile]);

  /* ---------- Transporte, secciones y notas ---------- */
  const isRemoteNow = () => ref.current.netState.status === 'on' && !ref.current.netState.host;

  const goScene = useCallback((scene: SceneId) => {
    if (isRemoteNow()) return void net.command({ type: 'transport', op: 'goto', scene });
    const arr = ref.current.song.arr;
    const i = arr.findIndex((x) => x.scene === scene);
    if (engine.playing && i >= 0) {
      engine.setSection(i);
      dRaw({ type: 'toast', text: `${ref.current.song.sections.find((x) => x.id === scene)?.label ?? 'Sección'} entra en el próximo compás` });
    } else {
      dRaw({ type: 'scene', id: scene });
      if (i >= 0) engine.setSection(i);
    }
  }, []);

  const transport = useCallback((op: 'play' | 'pause' | 'stop') => {
    if (isRemoteNow()) return void net.command({ type: 'transport', op });
    if (op === 'play') engine.play();
    else if (op === 'pause') engine.pause();
    else {
      engine.stop();
      const sg = ref.current.song;
      dRaw({ type: 'scene', id: sg.arr[0]?.scene ?? sg.sections[0].id });
    }
  }, []);

  const releaseNote = (n: number) => {
    const r = rel.current.get(n);
    if (!r) return;
    if (ref.current.s.sustain) sustained.current.push(r.release);
    else r.release();
    rel.current.delete(n);
  };
  const down = useCallback((n: number, vel = 0.85, fromMidi = false) => {
    if (isRemoteNow()) return; // las notas suenan en el anfitrión, no en las tablets
    if (rel.current.has(n)) releaseNote(n); // nota repetida: se libera la anterior
    const { s: st, mix: m } = ref.current;
    const ids = m.layers.filter((l) => l.zone === 'all' || (l.zone === 'low' ? n < st.split : n >= st.split)).map((l) => l.ch);
    rel.current.set(n, { release: engine.noteOn(ids.length ? ids : [m.layers[0].ch], n + st.transpose, vel), fromMidi });
    setAudioOn(true);
    setHeld((h) => (h.includes(n) ? h : [...h, n]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const up = useCallback((n: number) => {
    releaseNote(n);
    setHeld((h) => h.filter((x) => x !== n));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (s.sustain) return;
    sustained.current.forEach((r) => r());
    sustained.current = [];
  }, [s.sustain]);

  const panic = useCallback(() => {
    if (isRemoteNow()) return void net.command({ type: 'panic' });
    engine.panic();
    rel.current.clear();
    sustained.current = [];
    setHeld([]);
    if (ref.current.s.sustain) dRaw({ type: 'sustain', on: false });
    dRaw({ type: 'toast', text: 'Panic: voces musicales liberadas y sustain reiniciado. Micrófonos y sala intactos.' });
  }, []);

  useEffect(() => {
    const typing = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    };
    const key = (e: KeyboardEvent) => PC_KEYS[e.key.toLowerCase()];
    const kd = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Shift') return void (!e.repeat && dRaw({ type: 'sustain', on: true }));
      if (e.repeat) return;
      const n = key(e);
      const oct = ref.current.s.octave;
      if (n !== undefined) down(n + oct * 12);
      else if (e.key === 'z' || e.key === 'Z') dRaw({ type: 'octave', value: Math.max(-2, oct - 1) });
      else if (e.key === 'x' || e.key === 'X') dRaw({ type: 'octave', value: Math.min(2, oct + 1) });
      else if (e.code === 'Space') {
        e.preventDefault();
        transport(engine.playing ? 'pause' : 'play');
      }
    };
    const ku = (e: KeyboardEvent) => {
      if (e.key === 'Shift') return void dRaw({ type: 'sustain', on: false });
      const n = key(e);
      if (n === undefined) return;
      for (let o = -2; o <= 2; o++) if (rel.current.has(n + o * 12)) up(n + o * 12);
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, [down, up, transport]);

  /* ---------- MIDI real ---------- */
  const [midi, setMidi] = useState<MidiState>({ status: 'off', devices: [], last: '', learn: null, error: '' });
  const learnRef = useRef<string | null>(null);
  const ccPrev = useRef(new Map<string, number>());
  const panicRef = useRef(panic);
  panicRef.current = panic;
  const onMidi = useCallback((m: MidiMsg) => {
    const st = ref.current.s;
    setMidi((x) => ({ ...x, last: describe(m) }));
    if (m.kind === 'on') return down(m.note, Math.max(0.15, m.vel), true);
    if (m.kind === 'off') return up(m.note);
    if (m.kind === 'pc') {
      // Program Change llega como 0–127 y se muestra como 1–128; cada número elige la sección en ese orden.
      const secs = ref.current.song.sections;
      return goScene(secs[m.program % secs.length].id);
    }
    if (learnRef.current) {
      const id = learnRef.current;
      learnRef.current = null;
      setMidi((x) => ({ ...x, learn: null }));
      d({ type: 'midi', id, patch: { cc: m.cc, ch: m.ch } });
      return;
    }
    const map = st.midi.find((x) => x.cc === m.cc && x.ch === m.ch);
    if (!map) return;
    const v = m.value / 127;
    const prev = ccPrev.current.get(map.id) ?? 0;
    ccPrev.current.set(map.id, m.value);
    const rising = m.value >= 64 && prev < 64;
    switch (map.id) {
      case 'ambience': case 'brightness': case 'expression':
        d({ type: 'macro', key: map.id, value: v });
        break;
      case 'master': d({ type: 'master', db: Math.round(posToDb(v * 0.88) * 2) / 2 }); break; // d() rechaza si la vista no tiene el master
      case 'sustain': if ((m.value >= 64) !== st.sustain) dRaw({ type: 'sustain', on: m.value >= 64 }); break;
      case 'prev': if (rising) d({ type: 'step', dir: -1 }); break;
      case 'next': if (rising) d({ type: 'step', dir: 1 }); break;
      case 'play': if (rising) transport(engine.playing ? 'pause' : 'play'); break;
      case 'panic': if (rising) panicRef.current(); break;
    }
  }, [down, up, goScene, d, transport]);
  const onMidiRef = useRef(onMidi);
  onMidiRef.current = onMidi;
  const connectMidi = useCallback(() => {
    engine.ensure();
    openMidi((m) => onMidiRef.current(m), (devices) => {
      setMidi((x) => ({ ...x, devices }));
      // Un teclado desconectado ya no enviará Note Off: se sueltan sus notas y el sustain.
      if (devices.some((dv) => dv.state !== 'connected') || !devices.length) {
        rel.current.forEach((r, n) => {
          if (!r.fromMidi) return;
          r.release();
          rel.current.delete(n);
        });
        setHeld([]);
        if (ref.current.s.sustain) dRaw({ type: 'sustain', on: false });
      }
    })
      .then((devices) => setMidi((x) => ({ ...x, status: 'on', devices, error: devices.length ? '' : 'Acceso MIDI listo, pero no hay ningún teclado o controlador conectado. Conéctelo por USB; aparecerá aquí.' })))
      .catch((e: unknown) => {
        const n = e instanceof Error ? (e.message === 'unsupported' ? 'unsupported' : e.name) : '';
        setMidi((x) => ({ ...x, status: 'error', error: n === 'unsupported' ? 'Este navegador no tiene MIDI. Use Chrome o Edge en computador.' : 'El navegador no dio permiso para MIDI. Si está en el visor de Claude, abra la versión publicada.' }));
      });
  }, []);
  const setLearn = useCallback((id: string | null) => {
    learnRef.current = id;
    setMidi((x) => ({ ...x, learn: id }));
  }, []);

  /* ---------- Grabación ---------- */
  const [rec, setRec] = useState<RecState>({ on: false, secs: 0, url: null, ext: 'webm', mime: '' });
  useEffect(() => {
    if (!rec.on) return;
    const t0 = Date.now() - rec.secs * 1000;
    const id = window.setInterval(() => setRec((r) => ({ ...r, secs: Math.floor((Date.now() - t0) / 1000) })), 500);
    return () => window.clearInterval(id);
  }, [rec.on]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleRec = useCallback(() => {
    if (isRemoteNow()) return dRaw({ type: 'toast', text: 'La grabación se hace en el equipo anfitrión' });
    if (!rec.on) {
      try {
        const { ext, mime } = engine.startRec();
        if (rec.url) URL.revokeObjectURL(rec.url);
        setRec({ on: true, secs: 0, url: null, ext, mime });
        const src = s.outputs.rec === 'main' ? 'el master (sin click)' : `«${s.buses.find((b) => b.id === s.outputs.rec)?.name ?? 'bus'}»`;
        dRaw({ type: 'toast', text: `Grabando ${src}` });
      } catch {
        dRaw({ type: 'toast', text: 'Este navegador no puede grabar audio.' });
      }
      return;
    }
    void engine.stopRec().then((blob) => {
      setRec((r) => ({ ...r, on: false, url: blob.size ? URL.createObjectURL(blob) : null }));
      dRaw({ type: 'toast', text: blob.size ? 'Grabación lista para escuchar o descargar' : 'La grabación quedó vacía' });
    });
  }, [rec.on, rec.url, s.outputs.rec, s.buses]);

  /* ---------- Guardar ---------- */
  const save = useCallback(() => {
    if (isRemoteNow()) return dRaw({ type: 'toast', text: 'Los cambios se guardan en el equipo anfitrión' });
    const ok = saveProfile(profile, pickSaved(ref.current.s));
    if (!ok) return dRaw({ type: 'toast', text: 'No se pudo guardar: el navegador bloquea el almacenamiento o no hay espacio' });
    dRaw({ type: 'saved' });
    dRaw({ type: 'toast', text: `Guardado en el perfil «${profile}» de este navegador` });
  }, [profile]);

  /* ---------- Red: colaboración y mesa digital ---------- */
  const writers = useRef(new Map<string, { who: string; t: number }>());
  const revRef = useRef(0);
  const handleMixer = (ev: MixerEvent) => {
    setNetState((x) => {
      switch (ev.kind) {
        case 'found': return { ...x, mixers: [...x.mixers.filter((mm) => mm.ip !== ev.mixer.ip), ev.mixer] };
        case 'connected': return { ...x, mixer: ev.mixer, values: {}, detail: '' };
        case 'disconnected': return { ...x, mixer: null, detail: ev.reason };
        case 'value': return { ...x, values: { ...x.values, [ev.address]: ev.value } };
        case 'meters': return { ...x, meters: ev.values };
        case 'error': return { ...x, detail: ev.message };
      }
    });
  };
  const handleRef = useRef({ goScene, transport, panic });
  handleRef.current = { goScene, transport, panic };
  useEffect(() => {
    net.onStatus = (st, detail) => setNetState((x) => ({ ...x, status: st, detail: detail ?? '' }));
    return net.on((m: ServerMsg) => {
      const cur = ref.current;
      switch (m.t) {
        case 'welcome':
          setNetState((x) => ({ ...x, role: m.role, host: m.host, hostPresent: m.hostPresent || m.host, ownBus: m.ownBus ?? '', mixers: m.mixers ?? x.mixers }));
          break;
        case 'peers':
          setNetState((x) => ({ ...x, peers: m.peers, hostPresent: m.peers.some((p) => p.host) }));
          break;
        case 'state':
          if (!cur.netState.host) dRaw({ type: 'replace', data: m.data as SavedData });
          break;
        case 'levels':
          setNetState((x) => ({ ...x, levels: m.levels }));
          break;
        case 'host-left':
          setNetState((x) => ({ ...x, hostPresent: false }));
          dRaw({ type: 'toast', text: 'El equipo anfitrión se desconectó. Los controles quedan en espera hasta que vuelva.' });
          break;
        case 'cmd': {
          if (!cur.netState.host) break;
          const a = m.action as LAction;
          const ex = m.action as { id?: string; ch?: string; key?: string; bus?: string; op?: string; scene?: string; patch?: Record<string, unknown> };
          // El anfitrión vuelve a validar el permiso aunque el puente ya lo hizo.
          if (!allowed(m.role, { type: a.type, bus: ex.bus, patch: ex.patch }, (m as { ownBus?: string }).ownBus)) {
            net.send({ t: 'ack', id: m.id, to: m.from, ok: false, reason: 'sin permiso' });
            break;
          }
          // Política de conflicto: un control que otra persona movió hace menos de 1,5 s queda reservado.
          const ckey = `${a.type}:${ex.id ?? ex.ch ?? ex.key ?? ''}:${ex.bus ?? ''}`;
          const w = writers.current.get(ckey);
          const now = Date.now();
          if (w && w.who !== m.from && now - w.t < 1500) {
            net.send({ t: 'ack', id: m.id, to: m.from, ok: false, reason: 'otra persona está moviendo ese control' });
            break;
          }
          writers.current.set(ckey, { who: m.from, t: now });
          if (a.type === ('transport' as LAction['type'])) {
            if (ex.op === 'goto' && ex.scene) handleRef.current.goScene(ex.scene);
            else handleRef.current.transport(ex.op as 'play' | 'pause' | 'stop');
          } else if (a.type === ('panic' as LAction['type'])) handleRef.current.panic();
          else dRaw(a);
          net.send({ t: 'ack', id: m.id, to: m.from, ok: true });
          break;
        }
        case 'mixer':
          handleMixer(m.ev);
          break;
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // El anfitrión publica el estado aceptado (máximo ~8 veces por segundo) y una medición reducida.
  useEffect(() => {
    if (!(netState.status === 'on' && netState.host)) return;
    const id = window.setTimeout(() => net.send({ t: 'state', rev: ++revRef.current, data: pickSaved(s) }), 120);
    return () => window.clearTimeout(id);
  }, [s, netState.status, netState.host]);
  useEffect(() => {
    if (!(netState.status === 'on' && netState.host)) return;
    const id = window.setInterval(() => {
      const lv = engine.levels();
      const small: Record<string, number> = {};
      for (const k of Object.keys(lv)) if (k.startsWith('live:') || k.startsWith('bus:') || k === 'mL' || k === 'mR') small[k] = lv[k];
      net.send({ t: 'levels', levels: small });
    }, 200);
    return () => window.clearInterval(id);
  }, [netState.status, netState.host]);

  const ctx = useMemo<LiveCtxValue>(
    () => ({ s, d, mix, audioOn, loadFile, goScene, midi, connectMidi, setLearn, rec, toggleRec, role, can, remote, song, assets, addStems, addSamples, netState, setNetState, transport, panic, save, profile }),
    [s, d, mix, audioOn, loadFile, goScene, midi, connectMidi, setLearn, rec, toggleRec, role, can, remote, song, assets, addStems, addSamples, netState, transport, panic, save, profile],
  );
  const sr = engine.sampleRate;
  const lat = engine.latencySamples;
  const effView = remote ? viewOfRole(role) : s.view;
  const tabs = ALL_TABS.filter((t) => t.views.includes(effView));
  const activeMix = s.mixScenes.find((m) => m.id === s.activeMix);
  const sectionLabel = song.sections.find((x) => x.id === s.sceneId)?.label ?? '';
  const left = (
    <div className="lcol">
      <Repertoire />
      <SoundBank />
    </div>
  );

  return (
    <LiveCtx.Provider value={ctx}>
      <div
        className={`live ${wide ? 'wide' : 'narrow'} view-${effView}${remote ? ' remote' : ''}`}
        onPointerDownCapture={() => {
          if (!audioOn && !remote) {
            engine.ensure();
            setAudioOn(true);
          }
        }}
      >
        <header className="lhead">
          {!wide && (
            <button className="iconbtn big" aria-label="Repertorio y banco de sonidos" onClick={() => dRaw({ type: 'left', open: !s.leftOpen })}>
              <Icon name="menu" />
            </button>
          )}
          <div className="brand">
            <svg viewBox="0 0 28 28" width="30" height="30" aria-hidden="true">
              {[3, 8, 13, 18, 23].map((x, i) => <rect key={x} x={x} y={[11, 6, 3, 7, 12][i]} width="2.6" height={[8, 16, 22, 14, 6][i]} rx="1.3" />)}
            </svg>
            <div>
              <b>SONIDO</b>
              <small>LIVE WORKSPACE</small>
            </div>
          </div>
          {!remote && (
            <div className="viewsel" role="tablist" aria-label="Vista de trabajo">
              {VIEWS.map((v) => (
                <button key={v.id} role="tab" aria-selected={s.view === v.id} className={s.view === v.id ? 'on' : ''} onClick={() => dRaw({ type: 'view', view: v.id })}>{v.label}</button>
              ))}
            </div>
          )}
          <nav className="ltabs" aria-label="Secciones" ref={tabsRef} onWheel={(e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY; }}>
            {tabs.map((t) => (
              <button key={t.id} className={s.tab === t.id ? 'on' : ''} aria-current={s.tab === t.id ? 'page' : undefined} onClick={() => dRaw({ type: 'tab', tab: t.id })}>
                <Icon name={t.icon} size={15} />
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
          <div className="gearwrap">
            <button className="iconbtn big" aria-label="Perfiles, respaldo y versiones" aria-expanded={gear} onClick={() => setGear((g) => !g)}>
              <Icon name="gear" size={22} />
            </button>
            {gear && <ProfileMenu onClose={() => setGear(false)} onProfile={onProfile} onLegacy={onLegacy} />}
          </div>
          <button className="savebtn" onClick={save} title="Guardar en este navegador">
            <Icon name="save" />
            <span>Guardar</span>
            {s.dirty && <i className="dirtydot" aria-label="Hay cambios sin guardar" />}
          </button>
        </header>
        <div className="statusbar" aria-label="Estado de la sesión">
          <span><small>Perfil</small> {profile}</span>
          <span><small>Vista</small> {ROLE_LABEL[role]}{remote ? ' · remota' : ''}</span>
          <span><small>Canción</small> {song.title}</span>
          <span><small>Sección</small> {sectionLabel}</span>
          <span><small>Mezcla</small> {activeMix ? activeMix.name : 'sin escena'}</span>
          <span><small>Audio</small> {remote ? 'en el equipo anfitrión' : audioOn && sr ? `${+(sr / 1000).toFixed(1)} kHz${lat ? ` · ${lat} muestras` : ''} · ${engine.outputInfo().channels} canales de salida` : 'en espera (toque para activar)'}</span>
          <span title="Los instrumentos son síntesis propia; micrófonos, archivos y MIDI son reales"><small>Instrumentos</small> síntesis</span>
          <span className={`st-net ${netState.status}`}><small>Red</small> {netState.status === 'on' ? (netState.host ? `anfitrión · ${Math.max(0, netState.peers.length - 1)} conectados` : 'cliente') : netState.status === 'connecting' ? 'conectando…' : 'local'}{netState.mixer ? ` · mesa ${netState.mixer.model}` : ''}</span>
          <span className="st-build" title="Commit fuente y fecha de compilación"><small>Versión</small> {BUILD}</span>
        </div>

        <div className={`lbody tab-${s.tab}`}>
          {wide && s.tab === 'live' && left}
          {!wide && s.leftOpen && (
            <>
              <div className="lscrim" onClick={() => dRaw({ type: 'left', open: false })} />
              <div className="ldrawer">{left}</div>
            </>
          )}

          {s.tab === 'live' ? (
            <>
              <main className="lcenter">
                <section className="lpanel songpanel">
                  <div className="songpanel-x"><Expand tab="scenes" label="Escenas y repertorio" /></div>
                  <SongHeader />
                  <SceneBar />
                </section>
                <div className="midrow">
                  <PlayPanel held={held} onDown={down} onUp={up} />
                  <ChannelFx />
                </div>
                <section className="lpanel stripspanel">
                  <StripRow />
                </section>
              </main>
              <RightPanel />
            </>
          ) : (
            <main className="lcenter wideview">
              {s.tab === 'scenes' && <ScenesPage />}
              {s.tab === 'play' && <PlayPage held={held} onDown={down} onUp={up} />}
              {s.tab === 'channel' && <ChannelPage />}
              {s.tab === 'fx' && <FxPage />}
              {s.tab === 'inputs' && <InputsPage />}
              {s.tab === 'sounds' && <SoundsView />}
              {s.tab === 'stems' && <StemsPage />}
              {s.tab === 'mixer' && <MixerView />}
              {s.tab === 'buses' && <BusesPage />}
              {s.tab === 'outputs' && <OutputsPage />}
              {s.tab === 'mixscenes' && <MixScenesPage />}
              {s.tab === 'network' && <NetworkPage />}
              {s.tab === 'routes' && <RoutesView />}
              {s.tab === 'midi' && <MidiView />}
            </main>
          )}
        </div>
        <Footer />
        <div className="toast live-toast" role="status" aria-live="polite">{s.toast?.text}</div>
      </div>
    </LiveCtx.Provider>
  );
}
