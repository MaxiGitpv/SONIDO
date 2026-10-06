#!/usr/bin/env node
/*
 * Puente local de SONIDO.
 *  1. Sirve la app por HTTP en la red local (las tablets la abren en http://IP:8790).
 *  2. Coordina la colaboración: un anfitrión (el equipo con el audio) y superficies de control.
 *     Cada orden se valida con la tabla de permisos antes de llegar al anfitrión.
 *  3. Traduce órdenes a OSC por UDP para mesas Behringer X Air / X32 y Midas MR / M32.
 * No transmite audio. Sin internet. Ver docs/RED-Y-MESAS.md.
 */
import http from 'node:http';
import dgram from 'node:dgram';
import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomInt, randomUUID } from 'node:crypto';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { encode, decode, parseMeters } from './osc.mjs';
import { allowed, ROLE_LABEL } from './permissions.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const pin = () => String(randomInt(1000, 10000));

export function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
}

export async function startBridge(opts = {}) {
  const port = opts.port ?? Number(process.env.SONIDO_PORT ?? 8790);
  const root = resolve(opts.root ?? join(here, '..'));
  const pins = {
    host: opts.pins?.host ?? process.env.SONIDO_PIN_HOST ?? pin(),
    mixer: opts.pins?.mixer ?? process.env.SONIDO_PIN_MIXER ?? pin(),
    director: opts.pins?.director ?? process.env.SONIDO_PIN_DIRECTOR ?? pin(),
    musico: opts.pins?.musico ?? process.env.SONIDO_PIN_MUSICO ?? pin(),
  };
  const log = opts.log ?? ((...a) => console.log(...a));

  /* ---------- HTTP: la app ---------- */
  const server = http.createServer(async (req, res) => {
    try {
      let path = decodeURIComponent((req.url ?? '/').split('?')[0]);
      if (path === '/' || path === '') path = '/index.html';
      const file = normalize(join(root, path));
      if (!file.startsWith(root) || !existsSync(file)) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('No encontrado');
      }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(500);
      res.end();
    }
  });

  /* ---------- Colaboración ---------- */
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Map(); // id -> { ws, role, name, host, ownBus, seen:Set }
  let hostId = null;
  let lastState = null;

  server.on('upgrade', (req, socket, head) => {
    if (!(req.url ?? '').startsWith('/ws')) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
  });

  const send = (ws, obj) => ws.readyState === 1 && ws.send(JSON.stringify(obj));
  const peers = () => [...clients.entries()].map(([id, c]) => ({ id, role: c.role, name: c.name, host: c.host }));
  const broadcast = (obj, except) => clients.forEach((c, id) => id !== except && send(c.ws, obj));
  const sendPeers = () => broadcast({ t: 'peers', peers: peers() });

  wss.on('connection', (ws) => {
    const id = randomUUID().slice(0, 8);
    let me = null;
    ws.on('message', (raw) => {
      let m;
      try {
        m = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!me) {
        if (m.t !== 'hello') return;
        const role = m.host ? 'all' : m.role;
        const okPin = m.host ? m.pin === pins.host : pins[role] !== undefined && m.pin === pins[role];
        if (!okPin) return send(ws, { t: 'denied', reason: 'PIN incorrecto para ese rol' });
        if (m.host && hostId && clients.has(hostId)) return send(ws, { t: 'denied', reason: 'Ya hay un equipo anfitrión conectado' });
        me = { ws, role, name: String(m.name ?? ROLE_LABEL[role]).slice(0, 40), host: !!m.host, ownBus: role === 'musico' ? String(m.ownBus ?? '') : '', seen: new Set() };
        clients.set(id, me);
        if (me.host) hostId = id;
        send(ws, { t: 'welcome', id, role, host: me.host, hostPresent: !!hostId, ownBus: me.ownBus, mixers: mixer.found });
        if (!me.host && lastState) send(ws, { t: 'state', ...lastState }); // estado completo al (re)conectar
        if (mixer.info) send(ws, { t: 'mixer', ev: { kind: 'connected', mixer: mixer.info } });
        sendPeers();
        log(`+ ${me.name} (${ROLE_LABEL[role]}${me.host ? ', anfitrión' : ''})`);
        return;
      }
      switch (m.t) {
        case 'cmd': {
          // Órdenes repetidas (reintentos de red) no se aplican dos veces.
          if (typeof m.id !== 'string' || me.seen.has(m.id)) return;
          me.seen.add(m.id);
          if (me.seen.size > 500) me.seen = new Set([...me.seen].slice(-250));
          if (!allowed(me.role, m.action, me.ownBus)) return send(ws, { t: 'ack', id: m.id, ok: false, reason: `sin permiso para «${m.action?.type}»` });
          const host = hostId && clients.get(hostId);
          if (!host) return send(ws, { t: 'ack', id: m.id, ok: false, reason: 'no hay equipo anfitrión conectado' });
          send(host.ws, { t: 'cmd', id: m.id, from: id, role: me.role, ownBus: me.ownBus, action: m.action });
          return;
        }
        case 'ack': {
          if (!me.host) return;
          const to = clients.get(m.to);
          if (to) send(to.ws, { t: 'ack', id: m.id, ok: !!m.ok, reason: m.reason });
          return;
        }
        case 'state':
          if (!me.host) return;
          lastState = { rev: m.rev, data: m.data };
          broadcast({ t: 'state', rev: m.rev, data: m.data }, id);
          return;
        case 'levels':
          if (me.host) broadcast({ t: 'levels', levels: m.levels }, id);
          return;
        case 'mixer':
          if (!['all', 'mixer'].includes(me.role)) return send(ws, { t: 'mixer', ev: { kind: 'error', message: 'Solo el sonidista o el anfitrión controlan la mesa' } });
          mixer.handle(m);
          return;
      }
    });
    ws.on('close', () => {
      if (!me) return;
      clients.delete(id);
      if (hostId === id) {
        hostId = null;
        broadcast({ t: 'host-left' });
      }
      sendPeers();
      log(`- ${me.name}`);
    });
  });

  /* ---------- Mesa digital por OSC ---------- */
  const mixer = createMixerLink((ev) => broadcast({ t: 'mixer', ev }), opts.mixerOpts);

  await new Promise((ok) => server.listen(port, opts.host ?? '0.0.0.0', ok));
  const realPort = server.address().port;
  return {
    port: realPort,
    pins,
    close: async () => {
      mixer.close();
      wss.clients.forEach((c) => c.terminate());
      await new Promise((ok) => server.close(ok));
    },
  };
}

export function createMixerLink(emit, opts = {}) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  const state = { info: null, target: null, found: [], timers: [], pending: null };
  sock.bind(opts.localPort ?? 0, () => {
    try {
      sock.setBroadcast(true);
    } catch {
      /* ignorado */
    }
  });
  const out = (address, args = [], target = state.target) => target && sock.send(encode(address, args), target.port, target.ip);

  sock.on('message', (buf, rinfo) => {
    let m;
    try {
      m = decode(buf);
    } catch {
      return;
    }
    if (m.address === '/xinfo' || m.address === '/info') {
      const [ip, name, model, firmware] = m.args.map((a) => String(a.value));
      const info = { ip: rinfo.address || ip, port: rinfo.port, name, model, firmware };
      if (!state.found.some((f) => f.ip === info.ip && f.port === info.port)) state.found.push(info);
      emit({ kind: 'found', mixer: info });
      if (state.pending && state.pending.ip === rinfo.address && state.pending.port === rinfo.port) {
        clearTimeout(state.pending.timer);
        state.pending = null;
        state.info = info;
        startKeepAlive();
        emit({ kind: 'connected', mixer: info });
      }
      return;
    }
    if (!state.target || rinfo.address !== state.target.ip) return;
    if (m.address.startsWith('/meters')) {
      const blob = m.args.find((a) => a.type === 'b');
      if (blob) emit({ kind: 'meters', values: parseMeters(blob.value) });
      return;
    }
    if (m.args.length) emit({ kind: 'value', address: m.address, value: m.args[0].value });
  });

  function startKeepAlive() {
    stopTimers();
    // /xremote mantiene la suscripción a cambios (expira a los 10 s); /meters, la de medidores.
    const tick = () => {
      out('/xremote');
      out('/meters', [{ type: 's', value: '/meters/1' }]);
    };
    tick();
    state.timers.push(setInterval(tick, opts.keepAliveMs ?? 8000));
  }
  function stopTimers() {
    state.timers.forEach(clearInterval);
    state.timers = [];
  }

  return {
    get info() {
      return state.info;
    },
    get found() {
      return state.found;
    },
    handle(m) {
      switch (m.op) {
        case 'discover': {
          for (const port of [10024, 10023]) {
            sock.send(encode('/xinfo'), port, '255.255.255.255');
            if (opts.discoverTargets) for (const t of opts.discoverTargets) sock.send(encode('/xinfo'), t.port, t.ip);
          }
          return;
        }
        case 'connect': {
          const ip = String(m.ip ?? '').trim();
          const port = Number(m.port) || (/X32|M32/i.test(String(m.model)) ? 10023 : 10024);
          if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return emit({ kind: 'error', message: 'IP no válida' });
          stopTimers();
          state.target = { ip, port };
          state.info = null;
          if (state.pending) clearTimeout(state.pending.timer);
          state.pending = {
            ip, port,
            timer: setTimeout(() => {
              state.pending = null;
              state.target = null;
              emit({ kind: 'error', message: `La mesa no respondió en ${ip}:${port}. Revise que esté en la misma red y el modelo.` });
            }, opts.connectTimeoutMs ?? 3000),
          };
          out('/xinfo', [], state.target);
          return;
        }
        case 'disconnect':
          stopTimers();
          state.target = null;
          state.info = null;
          emit({ kind: 'disconnected', reason: 'Desconectada por el usuario' });
          return;
        case 'set': {
          if (!state.info) return emit({ kind: 'error', message: 'No hay mesa conectada' });
          const type = m.type === 'i' ? 'i' : m.type === 's' ? 's' : 'f';
          const value = type === 'f' ? Math.max(0, Math.min(1, Number(m.value))) : m.value;
          if (typeof m.address !== 'string' || !m.address.startsWith('/')) return;
          out(m.address, [{ type, value }]);
          emit({ kind: 'value', address: m.address, value });
          return;
        }
        case 'get': {
          if (!state.info || !Array.isArray(m.addresses)) return;
          m.addresses.slice(0, 200).forEach((a, i) => setTimeout(() => out(String(a)), i * 4));
          return;
        }
      }
    },
    close() {
      stopTimers();
      if (state.pending) clearTimeout(state.pending.timer);
      try {
        sock.close();
      } catch {
        /* ignorado */
      }
    },
  };
}

/* ---------- Línea de comandos ---------- */
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const b = await startBridge();
  const ips = lanAddresses();
  console.log('\nSONIDO · puente local activo');
  console.log(`  En este equipo:  http://127.0.0.1:${b.port}`);
  ips.forEach((ip) => console.log(`  En la red:       http://${ip}:${b.port}`));
  console.log('\n  PIN por rol (compártalos solo con quien corresponda):');
  console.log(`    Anfitrión (equipo con el audio): ${b.pins.host}`);
  console.log(`    Sonidista:                       ${b.pins.mixer}`);
  console.log(`    Director de alabanza:            ${b.pins.director}`);
  console.log(`    Músico (su monitor):             ${b.pins.musico}`);
  console.log('\n  Conexión en red local sin cifrado: úsela solo en la red de la iglesia.\n');
}
