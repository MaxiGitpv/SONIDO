// Prueba de entrada real (rueda, gesto táctil, teclado y arrastre) con Chrome sin ventana por el protocolo DevTools.
// A diferencia de dispatchEvent, estos eventos pasan por el mismo camino que un ratón o un dedo.
// Uso: node scripts/input-test.mjs [página.html]   (por defecto index.html)
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const WebSocket = createRequire(resolve('bridge/package.json'))('ws');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(existsSync);
const page = resolve(process.argv[2] ?? 'index.html');
const html = resolve('.tmp/input-test.html');
writeFileSync(html, readFileSync(page, 'utf8'));
const prof = mkdtempSync(join(tmpdir(), 'sonido-cdp-'));
const port = 9300 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--window-size=1366,768', 'about:blank'], { stdio: 'ignore' });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let ws;
let seq = 0;
const pending = new Map();
const cdp = (method, params = {}) => new Promise((ok, fail) => { const id = ++seq; pending.set(id, { ok, fail }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => (await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await wait(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page'); } catch { /* aún arrancando */ }
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  ws.on('message', (raw) => { const m = JSON.parse(String(raw)); const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.fail(new Error(m.error.message)) : p.ok(m.result); } });
  await new Promise((r) => ws.on('open', r));
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await cdp('Page.navigate', { url: `file:///${html.replace(/\\/g, '/')}` });
  await wait(1500);
  await ev(`(async () => { const b = document.querySelector('[aria-label="Añadir canción"]'); for (let i = 0; i < 22; i++) { b.click(); await new Promise((r) => setTimeout(r, 5)); } })()`);
  await wait(300);
  const box = await ev(`(() => { const l = document.querySelector('.rep-list') ?? document.querySelector('.songs'); l.scrollTop = 0; const r = l.getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(r.top + r.height / 2, innerHeight - 150), n: document.querySelectorAll('.songs li').length }; })()`);
  const top = () => ev(`(document.querySelector('.rep-list') ?? document.querySelector('.songs')).scrollTop + document.querySelector('.lcol').scrollTop`);
  const out = { canciones: box.n };

  // 1. Rueda del ratón.
  try {
    for (let i = 0; i < 6; i++) { await cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: box.x, y: box.y, deltaX: 0, deltaY: 240 }); await wait(60); }
    await wait(500);
    out.rueda = await top();
  } catch (e) {
    out.rueda = `error: ${e.message}`;
  }

  // 2. Dedo: toque, arrastre hacia arriba y suelta (eventos táctiles reales del navegador).
  await ev(`(document.querySelector('.rep-list') ?? document.querySelector('.songs')).scrollTop = 0`);
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  try {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y + 60 }] });
    for (let i = 1; i <= 12; i++) { await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: box.x, y: box.y + 60 - i * 15 }] }); await wait(16); }
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await wait(600);
    out.tactil = await top();
  } catch (e) {
    out.tactil = `error: ${e.message}`;
  }
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: false });

  // 3. Teclado: foco en la lista y tecla Fin.
  await ev(`(() => { const l = document.querySelector('.rep-list'); if (l) { l.scrollTop = 0; l.focus(); } })()`);
  await cdp('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'End', code: 'End', windowsVirtualKeyCode: 35 });
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'End', code: 'End', windowsVirtualKeyCode: 35 });
  await wait(500);
  out.teclado = await top();
  out.ultimaVisible = await ev(`(() => { const l = document.querySelector('.rep-list') ?? document.querySelector('.songs'); const a = document.querySelector('.songs').lastElementChild.getBoundingClientRect(), b = l.getBoundingClientRect(); return a.bottom <= Math.min(b.bottom, innerHeight) + 1; })()`);

  // 4. Fader con ratón real: pulsar sin mover no cambia; arrastrar 40 px sube; horizontal en la fila no cambia el canal seleccionado.
  try {
  await ev(`[...document.querySelectorAll('.ltabs button')].find((b) => b.textContent === 'Mezcla').click()`);
  await wait(400);
  const f = await ev(`(() => { const t = document.querySelectorAll('.lstrip .fader-track')[1]; const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.8, v: Number(t.getAttribute('aria-valuenow')), h: r.height }; })()`);
  const val = () => ev(`Number(document.querySelectorAll('.lstrip .fader-track')[1].getAttribute('aria-valuenow'))`);
  const mouse = (type, x, y, extra = {}) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
  await mouse('mousePressed', f.x, f.y); await mouse('mouseReleased', f.x, f.y); await wait(100);
  out.fader = { inicial: f.v, alto: Math.round(f.h), trasClicSinMover: await val() };
  await mouse('mousePressed', f.x, f.y);
  for (let i = 1; i <= 8; i++) { await mouse('mouseMoved', f.x, f.y - i * 5); await wait(16); }
  await mouse('mouseReleased', f.x, f.y - 40); await wait(100);
  out.fader.trasArrastrar40px = await val();
  // Arrastrar en diagonal hasta salir del fader: sigue siendo el mismo canal (captura del puntero).
  await mouse('mousePressed', f.x, f.y);
  for (let i = 1; i <= 8; i++) { await mouse('mouseMoved', f.x + i * 25, f.y + i * 3); await wait(16); }
  await mouse('mouseReleased', f.x + 200, f.y + 24); await wait(100);
  out.fader.otrosFadersSinCambio = await ev(`[...document.querySelectorAll('.lstrip .fader-track')].slice(2, 5).map((t) => t.getAttribute('aria-valuenow'))`);
  out.fader.tras_diagonal = await val();
  } catch (e) {
    out.fader = { error: `${e.message} (fader de alto ${out.fader?.alto ?? '?'})` };
  }
  console.log(JSON.stringify(out, null, 1));
} finally {
  ws?.close();
  chrome.kill();
  await wait(800);
  try { rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* Chrome aún suelta archivos: se limpia en la próxima */ }
}
