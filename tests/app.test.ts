// Pruebas unitarias de la lógica de SONIDO (sin navegador). Se ejecutan con `node scripts/test.mjs`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { meter } from '../src/live/engine';
import { dbToFader, faderToDb } from '../src/live/mixers';
import { allowed } from '../src/live/perms';
import { liveInit, liveReducer } from '../src/live/store';
import type { LState } from '../src/live/store';
import { defaults, exportFile, importFile, migrateV2, normalize } from '../src/live/persist';
import { CH_IDS } from '../src/live/types';
import { dbToPos, faderGain, posToDb } from '../src/util';

const fresh = (): LState => liveInit(defaults());

test('compases: pulsos y semicorcheas por compás', () => {
  assert.deepEqual([meter('4/4', 60).steps, meter('4/4', 60).beats.length], [16, 4]);
  assert.equal(meter('3/4', 60).beats.length, 3);
  assert.deepEqual([meter('6/8', 60).steps, meter('6/8', 60).beats.length], [12, 2]);
  assert.deepEqual([meter('12/8', 60).steps, meter('12/8', 60).beats.length], [24, 4]);
  assert.deepEqual(meter('7/8', 60).beats, [0, 4, 8]);
  assert.deepEqual([meter('9/8', 60).steps, meter('9/8', 60).beats.length], [18, 3]);
  assert.equal(meter('6/4', 60).beats.length, 6);
  assert.ok(Math.abs(meter('4/4', 120).bar - 2) < 1e-9, '4/4 a 120 BPM dura 2 s');
  assert.ok(Math.abs(meter('6/8', 60).bar - 2) < 1e-9, '6/8 a 60 (negra con puntillo) dura 2 s');
});

test('fader X32/X Air: curva por tramos ida y vuelta', () => {
  assert.equal(faderToDb(0), -90);
  assert.ok(Math.abs(faderToDb(0.75)) < 1e-9);
  for (const db of [-60, -40, -20, -10, -3, 0, 5, 10]) assert.ok(Math.abs(faderToDb(dbToFader(db)) - db) < 0.3, `${db} dB`);
});

test('permisos: misma tabla para la app y el puente', () => {
  assert.equal(allowed('director', { type: 'master' }), false);
  assert.equal(allowed('director', { type: 'scene' }), true);
  assert.equal(allowed('director', { type: 'chput' }), false);
  assert.equal(allowed('director', { type: 'fx', patch: { rotary: 'fast' } }), true);
  assert.equal(allowed('director', { type: 'fx', patch: { reverbWet: 1 } }), false);
  assert.equal(allowed('mixer', { type: 'chput' }), true);
  assert.equal(allowed('mixer', { type: 'sound' }), false);
  assert.equal(allowed('musico', { type: 'aux', bus: 'm2' }, 'm2'), true);
  assert.equal(allowed('musico', { type: 'aux', bus: 'm1' }, 'm2'), false);
  assert.equal(allowed('musico', { type: 'scene' }, 'm2'), false);
});

test('escena musical: cambiar sección o sonido no toca la consola', () => {
  let s = fresh();
  const before = JSON.stringify(s.console);
  s = liveReducer(s, { type: 'scene', id: 'puente' });
  s = liveReducer(s, { type: 'sound', id: 'organpad' });
  s = liveReducer(s, { type: 'music', id: 'piano', patch: { db: -6 } });
  s = liveReducer(s, { type: 'macro', key: 'expression', value: 0.2 });
  assert.equal(JSON.stringify(s.console), before);
  assert.equal(s.mix[s.songId].puente.sound, 'organpad');
});

test('escena de mezcla: recupera según la máscara y respeta canales protegidos', () => {
  let s = fresh();
  s = liveReducer(s, { type: 'mixSave', name: 'A' });
  const id = s.mixScenes[0].id;
  s = liveReducer(s, { type: 'chput', id: 'piano', value: { ...s.console.piano, fader: -30, pan: 40 } });
  s = liveReducer(s, { type: 'chput', id: 'in1', value: { ...s.console.in1, fader: -30 } });
  s = liveReducer(s, { type: 'mask', patch: { pans: false } });
  s = liveReducer(s, { type: 'mixLoad', id });
  assert.equal(s.console.piano.fader, -7, 'fader recuperado');
  assert.equal(s.console.piano.pan, 40, 'el panorama no estaba en la máscara');
  assert.equal(s.console.in1.fader, -30, 'el pastor está protegido por defecto');
  s = liveReducer(s, { type: 'mixDelete', id });
  assert.equal(s.mixScenes.length, 0);
  s = liveReducer(s, { type: 'mixUndo' });
  assert.equal(s.mixScenes.length, 1, 'la eliminación se puede deshacer');
});

test('click: nunca va a la sala aunque se intente', () => {
  let s = fresh();
  assert.equal(s.console.click.toMain, false);
  s = liveReducer(s, { type: 'chput', id: 'click', value: { ...s.console.click, toMain: true } });
  assert.equal(s.console.click.toMain, false);
});

test('MIDI Learn: un CC repetido deja sin asignar a la función anterior y avisa', () => {
  let s = fresh();
  s = liveReducer(s, { type: 'midi', id: 'brightness', patch: { cc: 11, ch: 1 } });
  assert.equal(s.midi.find((m) => m.id === 'brightness')!.cc, 11);
  assert.equal(s.midi.find((m) => m.id === 'expression')!.cc, -1);
  assert.match(s.toast!.text, /Expresión/);
});

test('estructura libre: secciones propias, orden con repeticiones y eliminación', () => {
  let s = fresh();
  s = liveReducer(s, { type: 'secAdd', label: 'Tag final', kind: 'tag' });
  const song = s.songs.find((x) => x.id === s.songId)!;
  const tag = song.sections.find((x) => x.label === 'Tag final')!;
  assert.ok(s.mix[s.songId][tag.id], 'la nueva sección tiene su escena musical');
  s = liveReducer(s, { type: 'arrAdd', scene: 'coro', bars: 8 });
  s = liveReducer(s, { type: 'arrMove', index: s.songs.find((x) => x.id === s.songId)!.arr.length - 1, dir: -1 });
  s = liveReducer(s, { type: 'secRemove', id: tag.id });
  const after = s.songs.find((x) => x.id === s.songId)!;
  assert.ok(!after.arr.some((x) => x.scene === tag.id), 'el orden ya no usa la sección eliminada');
});

test('migración del esquema 2: consola desde la escena abierta, arreglo como nivel musical', () => {
  const v2 = {
    songs: [{ id: 's2', title: 'Vieja', key: 'G', bpm: 70, ts: '4/4', style: 'worship' as const, arr: [{ scene: 'intro', bars: 4 }, { scene: 'coro', bars: 8 }], end: 'stop' as const }],
    songId: 's2',
    sceneId: 'coro',
    mix: { s2: {
      intro: { sound: 'ambient' as const, layers: [{ ch: 'pad' as const, zone: 'all' as const }], macros: { ambience: 0.5, brightness: 0.5, expression: 0.5 }, chans: { piano: { fader: -3, mute: true } } },
      coro: { sound: 'grandpad' as const, layers: [{ ch: 'piano' as const, zone: 'all' as const }], macros: { ambience: 0.4, brightness: 0.2, expression: 0.7 }, chans: { piano: { fader: -4.5, mute: false, pan: 10 }, in1: { fader: -11, mute: true } } },
    } },
    fx: { reverbWet: 0.4 },
    master: -2,
  };
  const d = normalize(migrateV2(v2));
  assert.equal(d.console.piano.fader, -4.5);
  assert.equal(d.console.in1.mute, true);
  assert.equal(d.mix.s2.intro.music.piano?.on, false);
  assert.equal(d.mix.s2.coro.music.piano?.on, true);
  assert.equal(d.fx.reverbWet, 0.4);
  for (const id of CH_IDS) assert.ok(d.console[id], `canal ${id}`);
});

test('exportar e importar conserva la sesión y lista los audios faltantes', () => {
  let s = fresh();
  s = liveReducer(s, { type: 'songEdit', id: s.songId, patch: { title: 'Exportada' } });
  s = liveReducer(s, { type: 'stemAdd', stem: { id: 'st1', name: 'Batería', cat: 'bateria', asset: 'a1', db: 0, mute: false, offset: 0, duration: 120 } });
  const file = exportFile(s, 'Principal', []);
  const { data, missing } = importFile(file);
  assert.equal(data.songs.find((x) => x.id === s.songId)!.title, 'Exportada');
  assert.ok(missing.some((m) => m.includes('Batería')));
  for (const id of ['in1', 'in2'] as const) assert.equal(data.inputs[id].device, null, 'los dispositivos no viajan entre equipos');
});

test('escena completa: recuerda canción y sección además de la mezcla', () => {
  let s = fresh();
  s = liveReducer(s, { type: 'scene', id: 'puente' });
  s = liveReducer(s, { type: 'mixSave', name: 'Completa', full: true });
  const id = s.mixScenes[0].id;
  const song = s.songId;
  s = liveReducer(s, { type: 'scene', id: 'verso' });
  s = liveReducer(s, { type: 'mixLoad', id });
  assert.deepEqual([s.songId, s.sceneId], [song, 'puente']);
  s = liveReducer(s, { type: 'mixSave', name: 'Solo mezcla' });
  assert.equal(s.mixScenes.find((m) => m.name === 'Solo mezcla')!.ref, undefined);
});

test('fader de SONIDO: dB ↔ posición reversible y ganancia real (sin curva de mesa)', () => {
  for (let db = -90; db <= 10; db += 0.5) assert.ok(Math.abs(posToDb(dbToPos(db)) - db) < 1e-9, `${db} dB`);
  assert.equal(dbToPos(-90), 0);
  assert.equal(dbToPos(10), 1);
  assert.equal(dbToPos(0), 0.75);
  assert.equal(faderGain(-90), 0, '−∞ es silencio');
  assert.equal(faderGain(0), 1);
  assert.ok(Math.abs(faderGain(-6) - 0.501) < 1e-3);
  // Cerca de 0 dB un paso fino de 0,1 dB mueve la posición de forma apreciable y monótona.
  assert.ok(dbToPos(0.1) > dbToPos(0) && dbToPos(0) > dbToPos(-0.1));
});
