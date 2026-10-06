// Pruebas del estudio multitrack (modelo puro, operaciones, migración y orden por marcadores).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveInit, liveReducer } from '../src/live/store';
import type { LState } from '../src/live/store';
import { defaults, exportFile, importFile, normalize } from '../src/live/persist';
import { arrFromMarkers, clipEnd, envelopeAt, locate, newTrack, overlaps, planFrom, projectFromStems, splitAt, stepStart, trimEnd, trimStart } from '../src/live/studio/model';
import { applyOp } from '../src/live/studio/ops';
import { computePeaks, fromWire, pickLevel, rangeAt, toWire } from '../src/live/studio/peaks';
import type { Clip, Project } from '../src/live/types';
import { meter } from '../src/live/engine';

const fresh = (): LState => liveInit(defaults());
const clip = (x: Partial<Clip> = {}): Clip => ({ id: 'c1', track: 't1', asset: 'a1', pos: 2, off: 1, len: 10, gain: 0, fadeIn: 0, fadeOut: 0, ...x });

test('migración: stems de C1–C5 pasan a pistas y clips sin perder desplazamiento, nivel ni mute', () => {
  const p = projectFromStems([
    { id: 's1', name: 'Batería', cat: 'bateria', asset: 'a1', db: -3, mute: false, offset: 1.5, duration: 100 },
    { id: 's2', name: 'Click', cat: 'click', asset: 'a2', db: 0, mute: true, offset: -0.5, duration: 100 },
  ], true);
  assert.equal(p.tracks.length, 2);
  const [a, b] = p.clips;
  assert.deepEqual([a.pos, a.off, a.len], [1.5, 0, 100], 'offset positivo: empieza más tarde');
  assert.deepEqual([b.pos, b.off, b.len], [0, 0.5, 99.5], 'offset negativo: se salta el inicio del archivo');
  assert.equal(p.tracks[0].db, -3);
  assert.equal(p.tracks[1].mute, true);
  assert.equal(p.tracks[1].route, 'click', 'click y guía nunca van a la sala');
  assert.equal(p.accomp, false, '«solo stems» = sin acompañamiento sintetizado');
  assert.ok(a.group && a.group === b.group, 'los stems de la canción quedan alineados en grupo');
  // Y a través de la persistencia (datos del esquema 3).
  const v3 = defaults();
  const song = { ...v3.songs[0], stems: [{ id: 's9', name: 'Bajo', cat: 'bajo' as const, asset: 'a9', db: 0, mute: false, offset: 0, duration: 50 }], stemsOnly: false } as unknown as (typeof v3.songs)[number];
  const n = normalize({ ...v3, songs: [song] });
  assert.equal(n.songs[0].project.clips[0].asset, 'a9');
  assert.equal('stems' in n.songs[0], false, 'el campo viejo no queda colgando');
});

test('recortes no destructivos: inicio y final conservan lo que suena', () => {
  const c = clip();
  const a = trimStart(c, 4); // 2 s más tarde
  assert.deepEqual([a.pos, a.off, a.len], [4, 3, 8], 'avanza posición y lectura juntas');
  assert.equal(clipEnd(a), clipEnd(c), 'el final no se mueve');
  const back = trimStart(a, -10);
  assert.deepEqual([back.pos, back.off], [1, 0], 'no se puede recortar antes del principio del archivo');
  const e = trimEnd(c, 100, 12);
  assert.equal(e.len, 11, 'el final no pasa del archivo (12 s − 1 s de lectura)');
});

test('dividir: dos clips contiguos que leen el archivo sin hueco ni repetición', () => {
  const p: Project = { ...applyOp(projectFromStems([]), { k: 'addAudio', tracks: [newTrack('X', 'otro', { id: 't1' })], clips: [clip()], assets: {} }) };
  const q = splitAt(p, 5);
  const [a, b] = q.clips.sort((x, y) => x.pos - y.pos);
  assert.deepEqual([a.pos, a.off, a.len], [2, 1, 3]);
  assert.deepEqual([b.pos, b.off, b.len], [5, 4, 7]);
  assert.equal(a.off + a.len, b.off, 'la segunda parte sigue donde terminó la primera');
});

test('grupo de alineación: mover un stem mueve el grupo y conserva distancias', () => {
  let p = projectFromStems([
    { id: 's1', name: 'A', cat: 'bateria', asset: 'a1', db: 0, mute: false, offset: 0, duration: 30 },
    { id: 's2', name: 'B', cat: 'bajo', asset: 'a2', db: 0, mute: false, offset: 0.25, duration: 30 },
  ]);
  p = applyOp(p, { k: 'move', ids: [p.clips[0].id], dt: 1.5 });
  assert.deepEqual(p.clips.map((c) => c.pos), [1.5, 1.75]);
  p = applyOp(p, { k: 'group', ids: p.clips.map((c) => c.id), on: false });
  p = applyOp(p, { k: 'move', ids: [p.clips[0].id], dt: 1 });
  assert.deepEqual(p.clips.map((c) => c.pos), [2.5, 1.75], 'sin grupo, se mueve solo');
  p = applyOp(p, { k: 'move', ids: [p.clips[1].id], dt: -10 });
  assert.equal(p.clips[1].pos, 0, 'nunca antes del cero');
});

test('fundidos y plan de reproducción: posición y lectura correctas al arrancar a mitad de clip', () => {
  const c = clip({ fadeIn: 2, fadeOut: 4 });
  assert.equal(envelopeAt(c, 2), 0);
  assert.equal(envelopeAt(c, 3), 0.5);
  assert.equal(envelopeAt(c, 6), 1);
  assert.equal(envelopeAt(c, 10), 0.5);
  assert.equal(envelopeAt(c, 12), 0);
  const p = { ...projectFromStems([]), clips: [c, clip({ id: 'c2', pos: 20, off: 0, len: 5 })] };
  const plan = planFrom(p, 7);
  assert.deepEqual(plan.map((x) => [x.clip.id, x.delay, x.srcOff, x.dur]), [['c1', 0, 6, 5], ['c2', 13, 0, 5]]);
  assert.equal(planFrom(p, 30).length, 0, 'clips ya terminados no se programan');
});

test('solapes en una pista: se señalan, no se descartan', () => {
  const p = { ...projectFromStems([]), tracks: [newTrack('X', 'otro', { id: 't1' })], clips: [clip(), clip({ id: 'c2', pos: 8 })] };
  assert.deepEqual([...overlaps(p)].sort(), ['c1', 'c2']);
  assert.equal(planFrom(p, 9).length, 2, 'ambos suenan (se mezclan)');
});

test('marcadores → orden de la canción: duración en compases, repeticiones conservadas y saltos', () => {
  const bar = meter('4/4', 120).bar; // 2 s
  let p: Project = { ...projectFromStems([]), clips: [clip({ pos: 0, off: 0, len: 40 })] };
  p = applyOp(p, { k: 'marker', m: { id: 'm1', at: 0, sec: 'intro' } });
  p = applyOp(p, { k: 'marker', m: { id: 'm2', at: 8, sec: 'verso' } });
  p = applyOp(p, { k: 'marker', m: { id: 'm3', at: 24, sec: 'coro' } });
  let arr = arrFromMarkers(p, [], bar);
  assert.deepEqual(arr.map((x) => [x.scene, x.bars, x.at]), [['intro', 4, 0], ['verso', 8, 8], ['coro', 8, 24]]);
  // Repetir el coro: el orden tiene otro paso que vuelve a leer el mismo audio (a 24 s).
  arr = arrFromMarkers(p, [...arr, { ...arr[2] }], bar);
  assert.equal(arr.length, 4);
  assert.equal(stepStart(arr, 3, bar), 24, 'la repetición salta atrás al inicio del coro');
  assert.deepEqual(locate(arr, 27, bar), { index: 2, bar: 1, within: 1 });
  // Mover un marcador actualiza todas sus repeticiones.
  p = applyOp(p, { k: 'marker', m: { id: 'm3', at: 26, sec: 'coro' } });
  arr = arrFromMarkers(p, arr, bar);
  assert.deepEqual(arr.filter((x) => x.marker === 'm3').map((x) => x.at), [26, 26]);
});

test('reductor: edición del proyecto con deshacer/rehacer propio que no toca la consola', () => {
  let s = fresh();
  const tr = newTrack('Batería', 'bateria', { id: 'tx' });
  s = liveReducer(s, { type: 'proj', op: { k: 'addAudio', tracks: [tr], clips: [clip({ track: 'tx' })], assets: { a1: { name: 'Batería', duration: 30, channels: 2, sampleRate: 48000, bytes: 1 } } } });
  s = liveReducer(s, { type: 'chput', id: 'in1', value: { ...s.console.in1, fader: -20 } });
  s = liveReducer(s, { type: 'proj', op: { k: 'move', ids: ['c1'], dt: 3 } });
  const song = () => s.songs.find((x) => x.id === s.songId)!;
  assert.equal(song().project.clips[0].pos, 5);
  s = liveReducer(s, { type: 'projUndo' });
  assert.equal(song().project.clips[0].pos, 2);
  assert.equal(s.console.in1.fader, -20, 'deshacer el proyecto no revierte el micrófono');
  s = liveReducer(s, { type: 'projRedo' });
  assert.equal(song().project.clips[0].pos, 5);
  // Con marcadores, la duración de un paso la da el audio: los ± de compases no lo alargan.
  s = liveReducer(s, { type: 'proj', op: { k: 'marker', m: { id: 'mk', at: 0, sec: 'verso' } } });
  const bars = song().arr[0].bars;
  s = liveReducer(s, { type: 'bars', index: 0, bars: bars + 4 });
  assert.equal(song().arr[0].bars, bars);
});

test('exportar e importar conserva el proyecto (clips, marcadores, fundidos) y avisa de audios faltantes', () => {
  let s = fresh();
  s = liveReducer(s, { type: 'proj', op: { k: 'addAudio', tracks: [newTrack('Batería', 'bateria', { id: 'tx' })], clips: [clip({ track: 'tx', fadeIn: 0.5 })], assets: { a1: { name: 'Batería', duration: 30, channels: 2, sampleRate: 48000, bytes: 1 } } } });
  s = liveReducer(s, { type: 'proj', op: { k: 'marker', m: { id: 'mk', at: 2, sec: 'coro' } } });
  const { data, missing } = importFile(exportFile(s, 'Principal', []));
  const p = data.songs.find((x) => x.id === s.songId)!.project;
  assert.equal(p.clips[0].fadeIn, 0.5);
  assert.equal(p.markers[0].sec, 'coro');
  assert.equal(p.assets.a1.sampleRate, 48000);
  assert.ok(missing.some((m) => m.includes('Batería')));
});

test('picos: salen del audio real y los reducidos para tablets conservan la forma', () => {
  const sr = 48000;
  const L = new Float32Array(sr * 2);
  for (let i = 0; i < sr; i++) L[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr); // 1 s de seno a −6 dB y 1 s de silencio
  const buf = { numberOfChannels: 1, sampleRate: sr, length: L.length, getChannelData: () => L };
  const pk = computePeaks(buf);
  const lvl = pickLevel(pk, 1000);
  const [lo, hi] = rangeAt(pk, lvl, 0, 0.2, 0.4);
  assert.ok(Math.abs(hi - 0.5) < 0.02 && Math.abs(lo + 0.5) < 0.02, `pico ±0,5 (${lo}, ${hi})`);
  assert.deepEqual(rangeAt(pk, lvl, 0, 1.2, 1.8), [0, 0], 'el silencio se dibuja plano');
  const w = fromWire(JSON.parse(JSON.stringify(toWire(pk))));
  const [lo2, hi2] = rangeAt(w, pickLevel(w, 4096), 0, 0.2, 0.4);
  assert.ok(Math.abs(hi2 - 0.5) < 0.02 && Math.abs(lo2 + 0.5) < 0.02);
});

test('versión procesada: tiempos × factor, BPM y tonalidad siguen a la versión y se deshace junto', () => {
  let s = fresh();
  const song = () => s.songs.find((x) => x.id === s.songId)!;
  const bpm0 = song().bpm;
  const key0 = song().key;
  s = liveReducer(s, { type: 'proj', op: { k: 'addAudio', tracks: [newTrack('A', 'otro', { id: 'tx' })], clips: [clip({ track: 'tx', pos: 9, off: 0.9, len: 9, fadeIn: 0.9 })], assets: { a1: { name: 'A', duration: 30, channels: 2, sampleRate: 48000, bytes: 1 } } } });
  s = liveReducer(s, { type: 'proj', op: { k: 'marker', m: { id: 'mk', at: 9, sec: 'coro' } } });
  s = liveReducer(s, { type: 'proj', op: { k: 'retime', map: { a1: 'a2' }, factor: 1 / 0.9, assets: { a2: { name: 'A · 90 %', duration: 33.34, channels: 2, sampleRate: 48000, bytes: 1, from: { asset: 'a1', rate: 0.9, semitones: 2 } } }, version: { rate: 0.9, semitones: 2, baseBpm: bpm0, baseKey: key0 } } });
  const c = song().project.clips[0];
  assert.equal(c.asset, 'a2');
  assert.ok(Math.abs(c.pos - 10) < 1e-9 && Math.abs(c.off - 1) < 1e-9 && Math.abs(c.len - 10) < 1e-9 && Math.abs(c.fadeIn - 1) < 1e-9);
  assert.ok(Math.abs(song().project.markers[0].at - 10) < 1e-9, 'el marcador sigue al audio');
  assert.equal(song().bpm, Math.round(bpm0 * 0.9 * 10) / 10);
  assert.notEqual(song().key, key0, 'la tonalidad de referencia sube 2 semitonos');
  s = liveReducer(s, { type: 'projUndo' });
  assert.equal(song().bpm, bpm0, 'deshacer vuelve también al tempo de referencia original');
  assert.equal(song().key, key0);
  assert.equal(song().project.clips[0].asset, 'a1');
});
