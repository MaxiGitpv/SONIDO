// C6.2: anfitrión por localhost vs. tablet por IP, capacidades declaradas, mesa X Air (emulador) y cliente sin audio.
// Uso: node scripts/verify-red.mjs   (necesita bridge/node_modules: npm --prefix bridge install)
import { mkdirSync } from 'node:fs';
import { launch, wait } from './cdp.mjs';
import { startBridge, lanAddresses } from '../bridge/sonido-bridge.mjs';
import { startEmulator } from '../bridge/emulator-xair.mjs';

const PINS = { host: '1111', mixer: '2222', director: '3333', musico: '4444' };
const out = '.tmp/c62';
mkdirSync(out, { recursive: true });
const emu = await startEmulator({ port: 0 });
const bridge = await startBridge({ port: 0, pins: PINS, log: () => {}, mixerOpts: { discoverTargets: [{ ip: '127.0.0.1', port: emu.port }] } });
const ip = lanAddresses()[0];
const br = await launch();
const R = {};

// Contador de AudioContext creados, inyectado antes de que cargue la app.
const COUNT = `window.__ac = 0; for (const k of ['AudioContext', 'webkitAudioContext']) { const C = window[k]; if (C) window[k] = class extends C { constructor(...a) { super(...a); window.__ac++; } }; }`;
const H = `
  window.$$ = (q) => [...document.querySelectorAll(q)];
  window.tab = (t) => $$('.ltabs button').find((b) => b.textContent === t).click();
  window.setv = (el, v) => { const p = Object.getPrototypeOf(el); Object.getOwnPropertyDescriptor(p, 'value').set.call(el, v); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
  window.btn = (t) => $$('button').find((b) => b.textContent.trim() === t);
  true`;

try {
  // A. Tablet o PC abierto por la IP de la red: sin contexto seguro.
  if (ip) {
    const a = await br.page(`http://${ip}:${bridge.port}/`);
    await a.ev(H);
    R.porIP = await a.ev(`({ seguro: isSecureContext, aviso: !!document.querySelector('.securebar'), estado: document.querySelector('.st-caps')?.textContent, enlace: document.querySelector('.securebar a')?.href })`);
    await a.ev(`tab('Entradas')`); await wait(200);
    await a.ev(`$$('.mhead button, .savebtn').find((b) => /entradas|permitir|activar/i.test(b.textContent))?.click()`); await wait(300);
    R.porIP.entradas = await a.ev(`[...document.querySelectorAll('.inwarn, .inerr')].map((x) => x.textContent).join(' | ')`);
    await a.shot(`${out}/tablet-por-ip-aviso.png`);
    await a.ev(`tab('Red y mesa')`); await wait(200);
    R.porIP.capacidades = await a.ev(`$$('.caps li').map((x) => x.textContent)`);
    await a.shot(`${out}/tablet-por-ip-capacidades.png`);
    a.close();
  } else R.porIP = 'sin interfaz de red para probar';

  // B. Anfitrión por localhost: contexto seguro, sin aviso. Se conecta como anfitrión y a la mesa emulada.
  const h = await br.page(`http://localhost:${bridge.port}/`);
  await h.ev(H);
  R.anfitrion = await h.ev(`({ seguro: isSecureContext, aviso: !!document.querySelector('.securebar'), estado: document.querySelector('.st-caps')?.textContent })`);
  await h.ev(`tab('Red y mesa')`); await wait(200);
  await h.ev(`setv(document.querySelector('input[aria-label=PIN]'), '${PINS.host}')`); await wait(50);
  await h.ev(`btn('Conectar').click()`); await wait(800);
  await h.ev(`setv(document.querySelector('input[aria-label="IP de la mesa"]'), '127.0.0.1')`);
  // Puerto del emulador: se conecta por la búsqueda (el puente la dirige al emulador).
  await h.ev(`btn('Buscar mesas en la red').click()`); await wait(1200);
  await h.ev(`$$('.peers li button').find((b) => b.textContent === 'Conectar').click()`); await wait(1500);
  await h.ev(`$$('.xmixer .segx button')[1].click()`); await wait(800); // banco 9-16
  R.mesa = await h.ev(`({
    modelo: document.querySelector('.xtested')?.textContent,
    canales: $$('.xstrip:not(.master)').map((x) => ({ n: x.querySelector('.xname').textContent, ganancia: !!x.querySelector('[aria-label^="Ganancia"]'), nota: x.querySelector('.xnote')?.textContent ?? '' })).slice(-3),
  })`);
  await h.shot(`${out}/anfitrion-mesa-xair-banco2.png`);

  // C. Tablet del director por IP (o localhost si no hay red): no crea audio; su orden la ejecuta el anfitrión.
  const host2 = ip ?? 'localhost';
  const t = await br.page('about:blank');
  await t.cdp('Page.addScriptToEvaluateOnNewDocument', { source: COUNT });
  await t.cdp('Page.navigate', { url: `http://${host2}:${bridge.port}/` }); await wait(1500);
  await t.ev(H);
  await t.ev(`tab('Red y mesa')`); await wait(200);
  await t.ev(`setv($$('.netform input[type=checkbox]')[0], false); $$('.netform input[type=checkbox]')[0].click()`); await wait(100);
  await t.ev(`setv($$('.netform select')[0], 'director')`); await wait(50);
  await t.ev(`setv(document.querySelector('input[aria-label=PIN]'), '${PINS.director}')`);
  await t.ev(`btn('Conectar').click()`); await wait(1200);
  // Toques por toda la app y cambio de sección: en un cliente no debe nacer ningún AudioContext.
  await t.ev(`document.querySelector('.live').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
  await t.ev(`tab('Inicio')`); await wait(300);
  await t.ev(`$$('.scenebtn').find((b) => b.textContent.trim() === 'Puente').click()`); await wait(800);
  R.cliente = await t.ev(`({ audioContexts: window.__ac, estado: document.querySelector('.st-caps')?.textContent, red: document.querySelector('.st-net')?.textContent })`);
  R.anfitrionTrasOrden = await h.ev(`$$('.statusbar span').find((x) => x.textContent.startsWith('Sección'))?.textContent`);
  await t.shot(`${out}/tablet-director-remota.png`);
  R.erroresConsola = [...h.logs, ...t.logs].filter((l) => /error|exception/i.test(l));
} finally {
  await br.close();
  await bridge.close();
  emu.close();
}
console.log(JSON.stringify(R, null, 1));
