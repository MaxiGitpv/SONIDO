#!/usr/bin/env node
/*
 * Emulador mínimo de una Behringer X Air (XR18) para pruebas sin hardware.
 * Responde /xinfo, consultas y cambios de parámetros, notifica cambios a quien envió /xremote
 * y envía /meters/1. No reproduce audio. Sirve para validar el protocolo, no el equipo real.
 */
import dgram from 'node:dgram';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { encode, decode, buildMeters } from './osc.mjs';

export function startEmulator({ port = 10024, name = 'XR18-Emulador', model = 'XR18' } = {}) {
  const sock = dgram.createSocket('udp4');
  const values = new Map();
  const subs = new Map(); // "ip:port" -> vence
  const meterSubs = new Map();
  for (let c = 1; c <= 16; c++) {
    const ch = `/ch/${String(c).padStart(2, '0')}`;
    values.set(`${ch}/mix/fader`, { type: 'f', value: 0.75 });
    values.set(`${ch}/mix/on`, { type: 'i', value: 1 });
    values.set(`${ch}/mix/pan`, { type: 'f', value: 0.5 });
    values.set(`${ch}/config/name`, { type: 's', value: `Canal ${c}` });
    // Fuente del canal: entrada física c (0..15); el canal 16 se emula como retorno USB (sin preamp).
    values.set(`${ch}/config/insrc`, { type: 'i', value: c === 16 ? 16 : c - 1 });
    values.set(`/headamp/${String(c).padStart(2, '0')}/gain`, { type: 'f', value: 0.1667 });
    values.set(`/headamp/${String(c).padStart(2, '0')}/phantom`, { type: 'i', value: 0 });
    for (let b = 1; b <= 6; b++) values.set(`${ch}/mix/${String(b).padStart(2, '0')}/level`, { type: 'f', value: 0 });
  }
  values.set('/lr/mix/fader', { type: 'f', value: 0.75 });
  values.set('/lr/mix/on', { type: 'i', value: 1 });

  sock.on('message', (buf, r) => {
    let m;
    try {
      m = decode(buf);
    } catch {
      return;
    }
    const who = `${r.address}:${r.port}`;
    const reply = (address, args) => sock.send(encode(address, args), r.port, r.address);
    if (m.address === '/xinfo') return reply('/xinfo', [{ type: 's', value: '127.0.0.1' }, { type: 's', value: name }, { type: 's', value: model }, { type: 's', value: '1.22' }]);
    if (m.address === '/xremote') return void subs.set(who, Date.now() + 10000);
    if (m.address === '/meters') return void meterSubs.set(who, { until: Date.now() + 10000, ip: r.address, port: r.port });
    const cur = values.get(m.address);
    if (!m.args.length) {
      if (cur) reply(m.address, [cur]);
      return;
    }
    const next = { type: m.args[0].type, value: m.args[0].value };
    values.set(m.address, next);
    // Notifica a los demás suscriptores, como hace la mesa real.
    subs.forEach((until, k) => {
      if (until < Date.now() || k === who) return;
      const [ip, p] = k.split(':');
      sock.send(encode(m.address, [next]), Number(p), ip);
    });
  });

  const meterTimer = setInterval(() => {
    meterSubs.forEach((s, k) => {
      if (s.until < Date.now()) return meterSubs.delete(k);
      const vals = Array.from({ length: 40 }, (_, i) => -60 + ((Date.now() / 50 + i * 7) % 50));
      sock.send(encode('/meters/1', [{ type: 'b', value: buildMeters(vals) }]), s.port, s.ip);
    });
  }, 50);

  return new Promise((ok) =>
    sock.bind(port, () =>
      ok({
        port: sock.address().port,
        values,
        close: () => {
          clearInterval(meterTimer);
          sock.close();
        },
      }),
    ),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const e = await startEmulator({ port: Number(process.env.PORT ?? 10024) });
  console.log(`Emulador X Air escuchando en UDP ${e.port}`);
}
