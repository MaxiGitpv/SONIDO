// C6.3/C6.4: pruebas de audio de punta a punta con señales deterministas en Chrome real.
// A = ráfaga pseudoaleatoria con un hueco de silencio; B = A invertida. Alineadas, la suma en el canal
// «Pistas» es 0: cualquier desalineación (pausa, búsqueda, salto, mover, dividir…) se mide como señal.
// Uso: node scripts/verify-audio.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, wait } from './cdp.mjs';
import { startBridge } from '../bridge/sonido-bridge.mjs';

const SR = 44100;
const out = '.tmp/c6audio';
mkdirSync(out, { recursive: true });
function wav(file, ch) {
  const n = ch[0].length;
  const b = Buffer.alloc(44 + n * ch.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * ch.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch.length, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * ch.length * 2, 28); b.writeUInt16LE(ch.length * 2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * ch.length * 2, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch.length; c++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, ch[c][i])) * 32767), 44 + (i * ch.length + c) * 2);
  writeFileSync(file, b);
  return resolve(file);
}
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
const len = SR * 8;
const A = new Float32Array(len);
for (let i = 0; i < len; i++) A[i] = i >= SR * 2 && i < SR * 3 ? 0 : 0.5 * rnd(); // silencio entre 2 s y 3 s
const fA = wav(`${out}/Ritmo A.wav`, [A, A]);
const fB = wav(`${out}/Ritmo B invertido.wav`, [A.map((x) => -x), A.map((x) => -x)]);
const clickBuf = new Float32Array(SR * 8);
for (let k = 0; k < 16; k++) for (let i = 0; i < 400; i++) clickBuf[k * SR / 2 + i] = 0.8 * Math.sin(i / 3);
const fC = wav(`${out}/Click.wav`, [clickBuf]);

const bridge = await startBridge({ port: 0, pins: { host: '1111', mixer: '2222', director: '3333', musico: '4444' }, log: () => {} });
const br = await launch();
const R = {};
const ok = (name, cond, detail) => (R[name] = `${cond ? 'OK' : 'FALLA'} · ${detail}`);
try {
  const pg = await br.page(`http://localhost:${bridge.port}/?prueba`, 1440, 900);
  const { cdp, ev } = pg;
  await ev(`document.querySelector('.live').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); true`);
  await ev(`[...document.querySelectorAll('.ltabs button')].find((b) => b.textContent === 'Multitrack').click()`);
  await wait(400);
  const P = 'window.__sonidoPrueba';
  // Importar A y B por la interfaz real (un grupo de alineación).
  const { root } = await cdp('DOM.getDocument', { depth: -1 });
  const { nodeId } = await cdp('DOM.querySelector', { nodeId: root.nodeId, selector: '.studio input[type=file]' });
  await cdp('DOM.setFileInputFiles', { nodeId, files: [fA, fB] });
  await wait(2500);
  const info = await ev(`(() => { const p = ${P}.song().project; return { pistas: p.tracks.map((t) => t.name + ' → ' + t.route), clips: p.clips.length, grupo: p.clips.every((c) => c.group && c.group === p.clips[0].group), activos: Object.values(p.assets).map((a) => a.duration.toFixed(2) + ' s/' + a.channels + 'ch/' + a.sampleRate) }; })()`);
  R.importacion = info;
  await pg.shot(`${out}/estudio-importado.png`);

  const rms = (id = 'tracks') => ev(`(() => { const d = ${P}.engine.probe('${id}'); let s = 0; for (const v of d) s += v * v; return Math.sqrt(s / d.length); })()`);
  const sample = async (n = 6, id = 'tracks') => { let mx = 0; for (let i = 0; i < n; i++) { mx = Math.max(mx, await rms(id)); await wait(70); } return mx; };
  const T = (op, arg) => ev(`${P}.transport('${op}'${arg !== undefined ? `, ${arg}` : ''})`);
  const proj = (o) => ev(`${P}.d({ type: 'proj', op: ${JSON.stringify(o)} })`);
  const clips = () => ev(`${P}.song().project.clips.map((c) => ({ id: c.id, track: c.track, pos: c.pos, off: c.off, len: c.len, group: c.group }))`);
  const trackId = (i) => ev(`${P}.song().project.tracks[${i}].id`);
  const pos = () => ev(`${P}.engine.projectTime()`);
  await proj({ k: 'settings', patch: { accomp: false } }); // solo el audio del proyecto para medir
  await wait(200);

  // 1. Alineación al reproducir y referencia con B en silencio.
  await T('seek', 3.2); await T('play'); await wait(500); // fuera del hueco de silencio (2–3 s)
  const al = await sample();
  const tB = await trackId(1);
  await proj({ k: 'track', id: tB, patch: { mute: true } }); await wait(250);
  const solo = await sample();
  await proj({ k: 'track', id: tB, patch: { mute: false } }); await wait(250);
  ok('1_alineadas', al < 0.003 && solo > 0.05, `suma A+B = ${al.toExponential(2)} (B muda: ${solo.toFixed(3)})`);

  // 2. Pausa y reanudación exacta (sin volver al inicio del compás).
  await wait(300);
  await T('pause'); const pPause = await pos(); await wait(300);
  await T('play'); await wait(120); const pRes = await pos(); await wait(300);
  const afterRes = await sample();
  ok('2_pausa_reanuda', afterRes < 0.003 && Math.abs(pRes - pPause) < 0.25, `reanuda en ${pPause.toFixed(3)} s → ${pRes.toFixed(3)} s; suma ${afterRes.toExponential(2)}`);

  // 3. Búsqueda sonando.
  await T('seek', 5.25); await wait(400);
  const sk = await sample(); const pSk = await pos();
  ok('3_busqueda', sk < 0.003 && pSk > 5.25 && pSk < 6.6, `posición ${pSk.toFixed(2)} s; suma ${sk.toExponential(2)}`);
  await T('stop'); await wait(200);

  // 4. Marcadores y repetición: el coro (4–6 s) se repite; todas las pistas saltan juntas.
  await proj({ k: 'marker', m: { id: 'mA', at: 0, sec: 'intro' } });
  await proj({ k: 'marker', m: { id: 'mB', at: 4, sec: 'coro' } });
  await wait(300);
  await ev(`(() => { const a = ${P}.song().arr; const i = a.findIndex((x) => x.marker === 'mB'); ${P}.d({ type: 'arrAdd', scene: a[i].scene, bars: a[i].bars, marker: 'mB', after: i }); })()`);
  await wait(300);
  const arr = await ev(`${P}.song().arr.map((x) => x.scene + '@' + x.at + '×' + x.bars)`);
  await T('from', 1); await wait(200);
  let seen = []; let maxSum = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) { seen.push([+(await pos()).toFixed(2), await ev(`${P}.engine.playing`)]); maxSum = Math.max(maxSum, await rms()); await wait(90); }
  // Salto atrás sonando, que cae en el inicio del coro (4 s): es la repetición, no el final de la canción.
  const jumpedBack = arr.length === 3 && seen.some(([x, pl], i) => i > 0 && pl && seen[i - 1][1] && x < seen[i - 1][0] - 0.5 && x >= 3.95 && x < 4.6);
  ok('4_repetir_seccion', jumpedBack && maxSum < 0.003, `orden ${JSON.stringify(arr)}; saltó atrás: ${jumpedBack}; suma máx. ${maxSum.toExponential(2)}`);
  await T('stop'); await wait(200);

  // 5. Mover: con grupo se mueven juntas (siguen cancelando); sin grupo, B desplazada deja de cancelar.
  let cs = await clips();
  await proj({ k: 'move', ids: [cs[0].id], dt: 1 });
  cs = await clips();
  await T('seek', 1.6); await T('play'); await wait(500);
  const grp = await sample();
  await T('pause');
  await proj({ k: 'group', ids: cs.map((c) => c.id), on: false });
  await proj({ k: 'move', ids: [cs[1].id], dt: 0.25 });
  await T('seek', 1.6); await T('play'); await wait(500);
  const shifted = await sample();
  await T('pause');
  await proj({ k: 'move', ids: [cs[1].id], dt: -0.25 });
  await T('seek', 1.6); await T('play'); await wait(500);
  const back = await sample();
  await T('pause');
  ok('5_mover', grp < 0.003 && shifted > 0.1 && back < 0.003, `grupo movido +1 s: ${grp.toExponential(2)}; B +0,25 s: ${shifted.toFixed(3)}; B vuelta: ${back.toExponential(2)}`);

  // 6. Dividir y recortar A: las partes siguen leyendo el archivo sin hueco (sigue cancelando con B).
  cs = await clips();
  await proj({ k: 'split', t: 2.2, ids: [cs[0].id] });
  await T('seek', 1.9); await T('play'); await wait(700);
  const sp = await sample(8);
  await T('pause');
  ok('6_dividir', sp < 0.003, `A dividida en 2,2 s, sonando a través del corte: suma ${sp.toExponential(2)}`);

  // 7. Fundido de entrada en B: durante el fundido A+B ya no cancela (B más baja); después sí.
  cs = await clips();
  const cB = cs.find((c) => c.track === tB);
  await proj({ k: 'clip', id: cB.id, patch: { fadeIn: 3 } });
  await T('seek', cB.pos + 0.3); await T('play'); await wait(300);
  const during = await sample(3);
  await T('seek', cB.pos + 4.4); await wait(500);
  const after = await sample(3);
  await T('pause');
  ok('7_fundido', during > 0.05 && after < 0.003, `durante el fundido ${during.toFixed(3)}; después ${after.toExponential(2)}`);
  await proj({ k: 'clip', id: cB.id, patch: { fadeIn: 0 } });

  // 8. La onda dibujada corresponde al archivo: el hueco de silencio (2–3 s del archivo) cae donde debe.
  cs = await clips();
  const draw = await ev(`(() => {
    const p = ${P}.song().project; const b = p.clips.find((c) => c.track === '${tB}');
    const row = [...document.querySelectorAll('.st-row')].find((r) => r.querySelector('.st-name')?.value === p.tracks.find((t) => t.id === '${tB}').name);
    const lane = row.querySelector('.st-lane'); const cv = lane.querySelector('canvas'); const g = cv.getContext('2d');
    const clipEl = [...lane.querySelectorAll('.st-clip')][0]; const pps = clipEl.offsetWidth / b.len;
    const sc = document.querySelector('.st-scroll'); const left = sc.scrollLeft; const dpr = cv.width / cv.clientWidth;
    const ink = (t) => { const x = Math.round((t * pps - left) * dpr); const d = g.getImageData(x, Math.round(20 * dpr), 1, cv.height - Math.round(22 * dpr)).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i] > 0 ? 1 : 0; return n; };
    const gapAt = b.pos + (2.5 - b.off);
    return { clipLeftPx: clipEl.offsetLeft, esperado: Math.round(b.pos * pps), tintaEnHueco: ink(gapAt), tintaConSeñal: ink(b.pos + 0.5), huecoEn: gapAt.toFixed(2) };
  })()`);
  ok('8_onda_en_su_lugar', Math.abs(draw.clipLeftPx - draw.esperado) <= 1 && draw.tintaEnHueco <= 0.15 * draw.tintaConSeñal && draw.tintaConSeñal > 10, JSON.stringify(draw));
  await pg.shot(`${out}/estudio-editado.png`);

  // 9. Click/guía: pista de click → canal de click (monitores). La sala y «Pistas» no lo reciben.
  await T('stop');
  for (const t of await ev(`${P}.song().project.tracks.map((x) => x.id)`)) await proj({ k: 'track', id: t, patch: { mute: true } });
  const { nodeId: n2 } = await cdp('DOM.querySelector', { nodeId: (await cdp('DOM.getDocument', { depth: -1 })).root.nodeId, selector: '.studio input[type=file]' });
  await cdp('DOM.setFileInputFiles', { nodeId: n2, files: [fC] });
  await wait(1500);
  const clickRoute = await ev(`${P}.song().project.tracks.find((t) => t.name === 'Click')?.route`);
  await T('seek', 0); await T('play'); await wait(400);
  let clickMax = 0, salaMax = -200, pistasMax = 0;
  for (let i = 0; i < 14; i++) {
    clickMax = Math.max(clickMax, await rms('click'));
    pistasMax = Math.max(pistasMax, await rms('tracks'));
    salaMax = Math.max(salaMax, await ev(`(() => { const l = ${P}.engine.levels(); return Math.max(l.mL ?? -90, l.mR ?? -90); })()`));
    await wait(60);
  }
  await T('stop');
  ok('9_click_fuera_de_sala', clickRoute === 'click' && clickMax > 0.01 && pistasMax < 0.001 && salaMax <= -80, `ruta ${clickRoute}; canal click ${clickMax.toFixed(3)}; Pistas ${pistasMax.toExponential(1)}; sala ${salaMax.toFixed(1)} dB`);

  // 10. Detener pistas no corta una nota tocada en vivo; el acompañamiento solo suena si está vinculado.
  // Canal de la primera capa de la sección inicial (encendida para el director): ahí se toca la nota.
  await T('stop'); await wait(200);
  const ch = await ev(`(() => { const st = ${P}.state(); return st.mix[st.songId][st.sceneId].layers[0].ch; })()`);
  const rel = await ev(`(() => { window.__rel = ${P}.engine.noteOn(['${ch}'], 60, 0.9); return true; })()`);
  await wait(150); await T('play'); await wait(300);
  const noteBefore = await rms(ch);
  await T('stop'); await wait(250);
  const noteAfterStop = await rms(ch);
  await ev(`window.__rel(); true`);
  await T('seek', 0); await T('play'); await wait(1200);
  const drumsOff = await sample(6, 'drums');
  await proj({ k: 'settings', patch: { accomp: true } }); await wait(1500);
  const drumsOn = await sample(10, 'drums');
  await T('stop');
  ok('10_dominios', rel && noteAfterStop > 0.3 * noteBefore && noteBefore > 0.0005 && drumsOff < 0.0005 && drumsOn > 0.005, `nota en vivo (${ch}) sonando ${noteBefore.toFixed(3)} → tras detener pistas ${noteAfterStop.toFixed(3)}; batería sintetizada sin vínculo ${drumsOff.toExponential(1)} / con vínculo ${drumsOn.toFixed(3)}`);
  await proj({ k: 'settings', patch: { accomp: false } });

  // 11. Tablet: control remoto sin motor ni audio; recibe picos reducidos y la posición del anfitrión.
  await ev(`[...document.querySelectorAll('.ltabs button')].find((b) => b.textContent === 'Red y mesa').click()`); await wait(200);
  await ev(`(() => { const i = document.querySelector('input[aria-label=PIN]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '1111'); i.dispatchEvent(new Event('input', { bubbles: true })); [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Conectar').click(); })()`);
  await wait(800);
  await ev(`[...document.querySelectorAll('.ltabs button')].find((b) => b.textContent === 'Multitrack').click()`);
  for (const t of await ev(`${P}.song().project.tracks.map((x) => x.id)`)) await proj({ k: 'track', id: t, patch: { mute: false } });
  const tab = await br.page('about:blank', 1180, 820);
  await tab.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__ac = 0; const C = window.AudioContext; window.AudioContext = class extends C { constructor(...a) { super(...a); window.__ac++; } };` });
  await tab.cdp('Page.navigate', { url: `http://localhost:${bridge.port}/` }); await wait(1500);
  await tab.ev(`(() => { [...document.querySelectorAll('.ltabs button')].find((b) => b.textContent === 'Red y mesa').click(); return true; })()`); await wait(200);
  await tab.ev(`(() => { const cb = document.querySelector('.netform input[type=checkbox]'); cb.click(); return true; })()`); await wait(100);
  await tab.ev(`(() => { const sel = document.querySelector('.netform select'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, 'director'); sel.dispatchEvent(new Event('change', { bubbles: true })); const i = document.querySelector('input[aria-label=PIN]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '3333'); i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await tab.ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Conectar').click()`); await wait(1500);
  await tab.ev(`[...document.querySelectorAll('.ltabs button')].find((b) => b.textContent === 'Multitrack').click()`); await wait(300);
  await tab.ev(`[...document.querySelectorAll('.studio .segx button')].find((b) => b.textContent === 'Preparar').click()`); await wait(2500);
  await T('seek', 1); await T('play'); await wait(1500);
  const tabState = await tab.ev(`(() => { const cv = document.querySelector('.st-lane canvas'); let ink = 0; if (cv) { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; for (let i = 3; i < d.length; i += 16) ink += d[i] > 0 ? 1 : 0; } return { audioContexts: window.__ac, pistas: document.querySelectorAll('.st-row:not(.st-rulerrow)').length, tintaOnda: ink, estado: document.querySelector('.st-proj b')?.textContent }; })()`);
  const hostPos = await pos();
  await T('stop');
  await tab.shot(`${out}/tablet-estudio.png`);
  ok('11_tablet', tabState.audioContexts === 0 && tabState.tintaOnda > 50 && /sonando/.test(tabState.estado ?? ''), `${JSON.stringify(tabState)}; anfitrión en ${hostPos.toFixed(2)} s`);
  R.erroresConsola = [...pg.logs, ...tab.logs].filter((l) => /error|exception/i.test(l)).slice(0, 8);
} finally {
  await br.close();
  await bridge.close();
}
console.log(JSON.stringify(R, null, 1));
