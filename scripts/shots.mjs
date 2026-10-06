// Capturas de evidencia con Chrome sin ventana: cada escenario prepara un estado (canciones, pestaña, editor…)
// y se fotografía a un tamaño concreto. Uso: node scripts/shots.mjs [filtro] [carpeta]
// Las páginas temporales van a .tmp/; las imágenes a la carpeta indicada (por defecto .tmp/shots).
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(existsSync);
const filter = process.argv[2] ?? '';
const outDir = resolve(process.argv[3] ?? '.tmp/shots');
mkdirSync(outDir, { recursive: true });
// SHOT_PAGE permite fotografiar otra compilación (p. ej. la anterior, para comparar antes/después).
const page = readFileSync(process.env.SHOT_PAGE ?? 'index.html', 'utf8');

// Utilidades disponibles dentro de cada escenario.
const helpers = `
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (q) => document.querySelector(q);
const $$ = (q) => [...document.querySelectorAll(q)];
const byText = (q, t) => $$(q).find((b) => b.textContent.trim() === t || (t instanceof RegExp && t.test(b.textContent)));
const tab = (t) => byText('.ltabs button', t)?.click();
async function songs(n) { const b = $('[aria-label="Añadir canción"]'); for (let i = 0; i < n; i++) { b.click(); await wait(5); } }
function mark(sel) { const e = typeof sel === 'string' ? $(sel) : sel; if (e) e.style.outline = '3px solid #ff3bd4'; }
function report(o) { const d = document.createElement('pre'); d.id = 'shot-report'; d.textContent = JSON.stringify(o); d.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:99999;margin:0;padding:4px 6px;background:#ff3bd4;color:#000;font:600 12px monospace;max-width:70vw;white-space:pre-wrap'; document.body.appendChild(d); }
`;

const pageH = `scrollH: document.documentElement.scrollWidth > innerWidth`;
// Comprobaciones comunes de distribución en cualquier estado.
const layout = `{
  ${pageH},
  tabsAlcanzables: (() => { const n = $('.ltabs'); return n.scrollWidth <= n.clientWidth + 1 || getComputedStyle(n).overflowX === 'auto'; })(),
  pieTapa: (() => { const f = $('.lfoot').getBoundingClientRect().top; const b = $('.lbody').getBoundingClientRect().bottom; return b > f + 1; })(),
  seccionesRecortadas: $$('.tl-name, .scenebtn').filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.textContent.trim()),
  fadersAlto: $$('.lstrip .fader-track').slice(0, 3).map((x) => Math.round(x.getBoundingClientRect().height)),
}`;
const S = {
  'inicio-25-canciones': { size: '1366,768', run: `await songs(22); await wait(100); const l = $('.rep-list') ?? $('.songs'); const sc = l.scrollHeight > l.clientHeight && /auto|scroll/.test(getComputedStyle(l).overflowY); l.scrollTop = 1e6; await wait(100); const last = $('.songs').lastElementChild.getBoundingClientRect(); const lr = l.getBoundingClientRect(); mark(l); report({ canciones: $$('.songs li').length, scrollPropio: sc, ultimaVisible: last.bottom <= lr.bottom + 1 && last.top >= lr.top - 1, bancoAlto: Math.round($('.bank-panel').getBoundingClientRect().height), ...${layout} });` },
  'inicio-1440x900': { size: '1440,900', run: `report(${layout});` },
  'inicio-1366x768': { size: '1366,768', run: `report(${layout});` },
  'inicio-1280x720': { size: '1280,720', run: `report(${layout});` },
  'inicio-1024x768': { size: '1024,768', run: `report(${layout});` },
  'inicio-zoom125-1366x768': { size: '1093,614', run: `report(${layout});` },
  'tablet-horizontal-1180x820': { size: '1180,820', run: `report(${layout});` },
  'movil-390x844': { size: '390,844', run: `report(${layout});` },
  'nombres-largos-1280x720': { size: '1280,720', run: `const t = $('.song-title'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(t, 'Grande es tu fidelidad (versión extendida con coro final)'); t.dispatchEvent(new Event('input', { bubbles: true })); await wait(100); report(${layout});` },
  'solapes-inicio-1366x768': { size: '1366,768', run: `
    const boxes = $$('.lcenter > *, .midrow > *, .rpanel, .lcol > *').map((e) => [e, e.getBoundingClientRect()]);
    const hits = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const [ea, a] = boxes[i], [eb, b] = boxes[j];
      if (ea.contains(eb) || eb.contains(ea)) continue;
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left), oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox > 2 && oy > 2) { hits.push(ea.className + ' × ' + eb.className); mark(ea); mark(eb); }
    }
    const kids = $$('.midrow *').filter((e) => { const r = e.getBoundingClientRect(), p = e.closest('.lpanel, .cfx')?.getBoundingClientRect(); return p && r.width > 0 && (r.right > p.right + 2 || r.left < p.left - 2); });
    kids.slice(0, 6).forEach(mark);
    report({ solapes: hits, desbordes: kids.slice(0, 6).map((e) => e.className || e.tagName) });` },
  'editor-canal-1366x768': { size: '1366,768', run: `tab('Canal'); await wait(200); report(${layout});` },
  'menu-perfil-1280x720': { size: '1280,720', run: `$('[aria-label="Perfiles, respaldo y versiones"]').click(); await wait(200); const p = $('.gearpop, .profmenu, [role=dialog]'); const r = p?.getBoundingClientRect(); const top = r && document.elementFromPoint(r.left + r.width / 2, Math.min(r.bottom - 10, innerHeight - 5)); report({ menu: !!p, menuArriba: !!(top && p.contains(top)) });` },
  'faders-mezcla-1366x768': { size: '1366,768', run: `tab('Mezcla'); await wait(200); const tr = $$('.lstrip .fader-track'); const ms = $$('.lstrip .ms').slice(0, 2).map((x) => Math.round(x.getBoundingClientRect().height)); report({ faders: tr.length, altoFader: tr.slice(0, 3).map((x) => Math.round(x.getBoundingClientRect().height)), altoBotonesMS: ms, ${pageH} });` },
  'faders-mezcla-1024x768': { size: '1024,768', run: `tab('Mezcla'); await wait(200); const tr = $$('.lstrip .fader-track'); report({ altoFader: tr.slice(0, 3).map((x) => Math.round(x.getBoundingClientRect().height)), ${pageH} });` },
  'fader-precision-1366x768': { size: '1366,768', run: `tab('Mezcla'); await wait(200);
    const tr = $$('.lstrip .fader-track')[0]; const th = tr.querySelector('.fader-thumb');
    const val = () => Number(tr.getAttribute('aria-valuenow'));
    const centerErr = () => { const r = tr.getBoundingClientRect(), t = th.getBoundingClientRect(); const lbl = [...tr.parentElement.querySelectorAll('.fader-scale span')].find((x) => x.textContent === '0').getBoundingClientRect(); const zeroY = lbl.top + lbl.height / 2; return { thumbY: Math.round(t.top + t.height / 2), zeroY: Math.round(zeroY) }; };
    const pe = (type, y, extra = {}) => tr.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: tr.getBoundingClientRect().left + 20, clientY: y, pointerId: 7, button: 0, ...extra }));
    const v0 = val(); const r = tr.getBoundingClientRect();
    pe('pointerdown', r.top + 20); pe('pointerup', r.top + 20); await wait(50); const trasToque = val();
    tr.focus(); for (let i = 0; i < 14; i++) tr.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); await wait(50);
    const enCero = val(); const al0 = centerErr();
    const y0 = r.top + r.height / 2; pe('pointerdown', y0); pe('pointermove', y0 - 10); pe('pointermove', y0 - 30); pe('pointerup', y0 - 30); await wait(50); const arrastre = val();
    pe('pointerdown', y0); pe('pointermove', y0 + 10, { shiftKey: true }); pe('pointermove', y0 + 30, { shiftKey: true }); pe('pointerup', y0 + 30); await wait(50); const fino = val();
    tr.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })); await wait(50); const minimo = tr.getAttribute('aria-valuetext');
    tr.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); await wait(50);
    report({ inicial: v0, trasToqueSinArrastre: trasToque, teclado14x05: enCero, pulgarEn0dB: al0, arrastre30px: arrastre, fino30pxShift: fino, fin: minimo, dobleClic: val() });` },
  'multitrack-envivo-1280x720': { size: '1280,720', run: `tab('Multitrack'); await wait(200); byText('.studio .segx button', 'En vivo').click(); await wait(200); report(${layout});` },
  'multitrack-1366x768': { size: '1366,768', run: `tab('Multitrack'); await wait(200); report(${layout});` },
};

const names = Object.keys(S).filter((n) => n.includes(filter));
for (const name of names) {
  const sc = S[name];
  const file = resolve(`.tmp/shot-${name}.html`);
  // El paquete JS contiene la cadena «</body>»: se inserta antes de la última, la real.
  const at = page.lastIndexOf('</body>');
  writeFileSync(file, page.slice(0, at) + `<script>${helpers}\nsetTimeout(async () => { try { ${sc.run} } catch (e) { report({ error: String(e) }); } }, 400);</script>` + page.slice(at));
  const prof = resolve(`.tmp/prof-${name}`);
  rmSync(prof, { recursive: true, force: true });
  const out = resolve(outDir, `${name}.png`);
  const r = spawnSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${prof}`, `--window-size=${sc.size}`, '--virtual-time-budget=6000', `--screenshot=${out}`, `file:///${file.replace(/\\/g, '/')}`], { encoding: 'utf8', timeout: 90000 });
  // El informe del escenario se lee del DOM con --dump-dom en una segunda pasada corta.
  const dom = spawnSync(CHROME, ['--headless=new', '--disable-gpu', `--user-data-dir=${prof}-d`, `--window-size=${sc.size}`, '--virtual-time-budget=6000', '--dump-dom', `file:///${file.replace(/\\/g, '/')}`], { encoding: 'utf8', timeout: 90000, maxBuffer: 64 << 20 });
  rmSync(`${prof}-d`, { recursive: true, force: true });
  const rep = /<pre id="shot-report"[^>]*>([^<]*)<\/pre>/.exec(dom.stdout ?? '')?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, '&') ?? '(sin informe)';
  console.log(`${r.status === 0 ? 'ok ' : 'ERR'} ${name} [${sc.size}] ${rep}`);
}
