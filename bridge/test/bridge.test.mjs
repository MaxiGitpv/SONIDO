// Pruebas del puente: permisos en el servicio, anfitrión, reconexión, órdenes duplicadas y OSC contra el emulador.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startBridge } from '../sonido-bridge.mjs';
import { startEmulator } from '../emulator-xair.mjs';
import { encode, decode, parseMeters, buildMeters } from '../osc.mjs';

const PINS = { host: '1111', mixer: '2222', director: '3333', musico: '4444' };
let bridge;
let emu;
let url;

before(async () => {
  emu = await startEmulator({ port: 0 });
  bridge = await startBridge({ port: 0, pins: PINS, log: () => {}, mixerOpts: { discoverTargets: [{ ip: '127.0.0.1', port: emu.port }], keepAliveMs: 300, connectTimeoutMs: 1500 } });
  url = `ws://127.0.0.1:${bridge.port}/ws`;
});
after(async () => {
  await bridge.close();
  emu.close();
});

function client(hello) {
  const ws = new WebSocket(url);
  const inbox = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    inbox.push(m);
    waiters.forEach((w) => w());
  });
  const next = (pred, ms = 2500) =>
    new Promise((ok, fail) => {
      const check = () => {
        const i = inbox.findIndex(pred);
        if (i >= 0) {
          ok(inbox.splice(i, 1)[0]);
          return true;
        }
        return false;
      };
      if (check()) return;
      const w = () => check() && clearTimeout(t);
      waiters.push(w);
      const t = setTimeout(() => fail(new Error('timeout esperando mensaje')), ms);
    });
  const open = new Promise((ok) => ws.on('open', () => (ws.send(JSON.stringify({ t: 'hello', ...hello })), ok())));
  return { ws, next, open, send: (o) => ws.send(JSON.stringify(o)), close: () => ws.close() };
}

test('OSC: codifica y decodifica i, f, s y blob de medidores', () => {
  const m = decode(encode('/ch/01/mix/fader', [{ type: 'f', value: 0.5 }, { type: 'i', value: 3 }, { type: 's', value: 'Voz' }]));
  assert.equal(m.address, '/ch/01/mix/fader');
  assert.equal(m.args[0].value, 0.5);
  assert.equal(m.args[1].value, 3);
  assert.equal(m.args[2].value, 'Voz');
  const meters = parseMeters(buildMeters([-6, -20, -90]));
  assert.deepEqual(meters.map((x) => Math.round(x)), [-6, -20, -90]);
});

test('PIN incorrecto es rechazado', async () => {
  const c = client({ role: 'mixer', pin: '9999', host: false, name: 'Intruso' });
  await c.open;
  const m = await c.next((x) => x.t === 'denied');
  assert.match(m.reason, /PIN/);
  c.close();
});

test('permisos validados en el servicio, anfitrión, duplicados y reconexión', async () => {
  const host = client({ role: 'all', pin: PINS.host, host: true, name: 'Anfitrión' });
  await host.open;
  await host.next((x) => x.t === 'welcome' && x.host);
  host.send({ t: 'state', rev: 1, data: { songs: ['x'] } });

  const dir = client({ role: 'director', pin: PINS.director, host: false, name: 'Director' });
  await dir.open;
  await dir.next((x) => x.t === 'welcome' && x.role === 'director');
  const st = await dir.next((x) => x.t === 'state');
  assert.equal(st.rev, 1, 'el cliente recibe el estado completo al conectar');

  // El director no puede mover el master: lo rechaza el puente, sin llegar al anfitrión.
  dir.send({ t: 'cmd', id: 'a1', action: { type: 'master', db: 0 } });
  const r1 = await dir.next((x) => x.t === 'ack' && x.id === 'a1');
  assert.equal(r1.ok, false);

  // Una orden musical sí llega al anfitrión; duplicada, solo una vez.
  dir.send({ t: 'cmd', id: 'a2', action: { type: 'scene', id: 'coro' } });
  dir.send({ t: 'cmd', id: 'a2', action: { type: 'scene', id: 'coro' } });
  const fwd = await host.next((x) => x.t === 'cmd' && x.id === 'a2');
  assert.equal(fwd.role, 'director');
  await assert.rejects(host.next((x) => x.t === 'cmd' && x.id === 'a2', 400), 'la orden duplicada no se reenvía');
  host.send({ t: 'ack', id: 'a2', to: fwd.from, ok: true });
  assert.equal((await dir.next((x) => x.t === 'ack' && x.id === 'a2')).ok, true);

  // Músico: solo su propio envío de monitor.
  const mus = client({ role: 'musico', pin: PINS.musico, host: false, name: 'Bajista', ownBus: 'm2' });
  await mus.open;
  await mus.next((x) => x.t === 'welcome');
  mus.send({ t: 'cmd', id: 'b1', action: { type: 'aux', ch: 'bajo', bus: 'm1', patch: { db: 0 } } });
  assert.equal((await mus.next((x) => x.t === 'ack' && x.id === 'b1')).ok, false);
  mus.send({ t: 'cmd', id: 'b2', action: { type: 'aux', ch: 'bajo', bus: 'm2', patch: { db: 0 } } });
  assert.equal((await host.next((x) => x.t === 'cmd' && x.id === 'b2')).action.bus, 'm2');

  // Segundo anfitrión rechazado; si el anfitrión se va, los clientes lo saben y no se pierde el estado.
  const host2 = client({ role: 'all', pin: PINS.host, host: true, name: 'Otro' });
  await host2.open;
  await host2.next((x) => x.t === 'denied');
  host.close();
  await dir.next((x) => x.t === 'host-left');
  dir.send({ t: 'cmd', id: 'a3', action: { type: 'scene', id: 'verso' } });
  assert.equal((await dir.next((x) => x.t === 'ack' && x.id === 'a3')).ok, false);
  dir.close();
  const dir2 = client({ role: 'director', pin: PINS.director, host: false, name: 'Director' });
  await dir2.open;
  assert.equal((await dir2.next((x) => x.t === 'state')).rev, 1, 'al reconectar recibe el último estado aceptado');
  dir2.close();
  mus.close();
  host2.close();
});

test('mesa X Air (emulador): descubrir, conectar, cambiar, consultar y medidores', async () => {
  const mx = client({ role: 'mixer', pin: PINS.mixer, host: false, name: 'Sonidista' });
  await mx.open;
  await mx.next((x) => x.t === 'welcome');
  mx.send({ t: 'mixer', op: 'discover' });
  const found = await mx.next((x) => x.t === 'mixer' && x.ev.kind === 'found');
  assert.equal(found.ev.mixer.model, 'XR18');
  mx.send({ t: 'mixer', op: 'connect', ip: '127.0.0.1', port: emu.port, model: 'XR18' });
  await mx.next((x) => x.t === 'mixer' && x.ev.kind === 'connected');
  mx.send({ t: 'mixer', op: 'set', address: '/ch/03/mix/fader', type: 'f', value: 0.25 });
  await mx.next((x) => x.t === 'mixer' && x.ev.kind === 'value' && x.ev.address === '/ch/03/mix/fader');
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(Math.abs(emu.values.get('/ch/03/mix/fader').value - 0.25) < 1e-6, 'la mesa recibió el cambio');
  mx.send({ t: 'mixer', op: 'set', address: '/headamp/04/phantom', type: 'i', value: 1 });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(emu.values.get('/headamp/04/phantom').value, 1);
  mx.send({ t: 'mixer', op: 'get', addresses: ['/ch/05/config/name'] });
  const name = await mx.next((x) => x.t === 'mixer' && x.ev.kind === 'value' && x.ev.address === '/ch/05/config/name');
  assert.equal(name.ev.value, 'Canal 5');
  const met = await mx.next((x) => x.t === 'mixer' && x.ev.kind === 'meters');
  assert.equal(met.ev.values.length, 40);

  // Un director no puede controlar la mesa.
  const dir = client({ role: 'director', pin: PINS.director, host: false, name: 'Director' });
  await dir.open;
  await dir.next((x) => x.t === 'welcome');
  dir.send({ t: 'mixer', op: 'set', address: '/lr/mix/fader', type: 'f', value: 0 });
  await dir.next((x) => x.t === 'mixer' && x.ev.kind === 'error');
  assert.equal(emu.values.get('/lr/mix/fader').value, 0.75);

  // IP sin mesa: error útil, sin colgarse.
  mx.send({ t: 'mixer', op: 'connect', ip: '127.0.0.1', port: 9, model: 'XR18' });
  const err = await mx.next((x) => x.t === 'mixer' && x.ev.kind === 'error', 3000);
  assert.match(err.ev.message, /no respondió/);
  dir.close();
  mx.close();
});
