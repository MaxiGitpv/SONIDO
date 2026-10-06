// Chrome sin ventana controlado por el protocolo DevTools, para pruebas de punta a punta con entrada real.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const WebSocket = createRequire(resolve('bridge/package.json'))('ws');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(existsSync);
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Abre un Chrome; devuelve { page(url, w, h), close() }. Cada page es una pestaña con su propio cdp/ev/shot. */
export async function launch() {
  const prof = mkdtempSync(join(tmpdir(), 'sonido-cdp-'));
  const port = 9300 + Math.floor(Math.random() * 600);
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
  let ok = false;
  for (let i = 0; i < 60 && !ok; i++) {
    await wait(200);
    try { ok = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok; } catch { /* arrancando */ }
  }
  const pages = [];
  return {
    async page(url, width = 1366, height = 768) {
      const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
      const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 << 20 });
      let seq = 0;
      const pending = new Map();
      const logs = [];
      ws.on('message', (raw) => {
        const m = JSON.parse(String(raw));
        if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.fail(new Error(m.error.message)) : p.ok(m.result); }
        else if (m.method === 'Runtime.consoleAPICalled') logs.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
        else if (m.method === 'Runtime.exceptionThrown') logs.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
      });
      await new Promise((r) => ws.on('open', r));
      const cdp = (method, params = {}) => new Promise((ok2, fail) => { const id = ++seq; pending.set(id, { ok: ok2, fail }); ws.send(JSON.stringify({ id, method, params })); });
      await cdp('Runtime.enable');
      await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await cdp('Page.enable');
      await cdp('Page.navigate', { url });
      await wait(1500);
      const ev = async (expression) => {
        const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
        return r.result.value;
      };
      const shot = async (file) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.data, 'base64')); };
      const pg = { cdp, ev, shot, logs, close: () => ws.close() };
      pages.push(pg);
      return pg;
    },
    async close() {
      pages.forEach((p) => p.close());
      chrome.kill();
      await wait(800);
      try { rmSync(prof, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* Chrome aún suelta archivos */ }
    },
  };
}
