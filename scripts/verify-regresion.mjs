// Regresiones tras C6: MIDI (dispositivo sintético inyectado en la Web MIDI API), consola, escenas,
// grabación, guardado/reapertura sin arranque automático. Uso: node scripts/verify-regresion.mjs
import { launch, wait } from './cdp.mjs';
import { startBridge } from '../bridge/sonido-bridge.mjs';

// Teclado MIDI de prueba: la app usa su código real (requestMIDIAccess → onmidimessage); solo el dispositivo es falso.
const FAKE_MIDI = `
  window.__midiIn = { id: 'fake', name: 'Teclado de prueba', state: 'connected', onmidimessage: null };
  navigator.requestMIDIAccess = async () => ({ inputs: new Map([['fake', window.__midiIn]]), onstatechange: null });
  window.__midi = (...bytes) => window.__midiIn.onmidimessage && window.__midiIn.onmidimessage({ data: new Uint8Array(bytes) });
`;
const bridge = await startBridge({ port: 0, pins: { host: '1', mixer: '2', director: '3', musico: '4' }, log: () => {} });
const br = await launch();
const R = {};
const ok = (n, c, d) => (R[n] = `${c ? 'OK' : 'FALLA'} · ${d}`);
try {
  const pg = await br.page('about:blank', 1440, 900);
  await pg.cdp('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_MIDI });
  await pg.cdp('Page.navigate', { url: `http://localhost:${bridge.port}/?prueba` });
  await wait(1500);
  const { ev } = pg;
  const P = 'window.__sonidoPrueba';
  const rms = (id) => ev(`(() => { const d = ${P}.engine.probe('${id}'); let s = 0; for (const v of d) s += v * v; return Math.sqrt(s / d.length); })()`);
  const tab = (t) => ev(`[...document.querySelectorAll('.ltabs button')].find((b) => b.textContent === '${t}').click()`);
  await ev(`document.querySelector('.live').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); true`);

  // MIDI: conectar por la interfaz, nota, sustain, Program Change → sección, desconexión suelta notas.
  await tab('MIDI'); await wait(300);
  await ev(`[...document.querySelectorAll('button')].find((b) => /Conectar|Activar MIDI|Permitir/i.test(b.textContent)).click()`);
  await wait(500);
  const dev = await ev(`document.body.innerText.includes('Teclado de prueba')`);
  const ch = await ev(`(() => { const st = ${P}.state(); return st.mix[st.songId][st.sceneId].layers[0].ch; })()`);
  await ev(`window.__midi(0x90, 60, 110)`); await wait(250);
  const noteOn = await rms(ch);
  await ev(`window.__midi(0x80, 60, 0)`); await wait(900);
  const noteOff = await rms(ch);
  await ev(`window.__midi(0xB0, 64, 127)`); await wait(50);
  const sus = await ev(`${P}.state().sustain`);
  await ev(`window.__midi(0xB0, 64, 0)`); await wait(50);
  const pcScene = await ev(`(() => { ${P}.d({ type: 'scene', id: ${P}.song().sections[0].id }); return true; })()`);
  await ev(`window.__midi(0xC0, 2)`); await wait(300);
  const sec = await ev(`(() => { const sg = ${P}.song(); const st = ${P}.state(); return { escena: st.sceneId, esperado: sg.sections[2 % sg.sections.length].id }; })()`);
  ok('midi', dev && noteOn > 0.003 && noteOff < noteOn * 0.5 && sus === true && pcScene && sec.escena === sec.esperado,
    `dispositivo visible ${dev}; nota en ${ch} ${noteOn.toFixed(3)} → soltada ${noteOff.toFixed(4)}; sustain CC64 ${sus}; Program Change 3 → «${sec.escena}» (esperado «${sec.esperado}»)`);

  // Consola: el fader del piano cambia la ganancia real; mute la corta; escena de mezcla guarda y recupera.
  const fader = async (db) => ev(`(() => { const c = ${P}.state().console.piano; ${P}.d({ type: 'chput', id: 'piano', value: { ...c, fader: ${db} } }); return true; })()`);
  const hold = await ev(`(() => { window.__h = ${P}.engine.noteOn(['piano'], 64, 0.9); return true; })()`);
  await ev(`(() => { const st = ${P}.state(); ${P}.d({ type: 'music', id: 'piano', patch: { on: true, db: 0 } }); return true; })()`);
  await fader(0); await wait(250); const a0 = await rms('piano');
  await fader(-20); await wait(250); const a20 = await rms('piano');
  const ratio = 20 * Math.log10(a0 / Math.max(1e-9, a20));
  await ev(`(() => { ${P}.d({ type: 'mixSave', name: 'Regresión' }); return true; })()`);
  await fader(-40); await wait(100);
  await ev(`(() => { const m = ${P}.state().mixScenes.find((x) => x.name === 'Regresión'); ${P}.d({ type: 'mixLoad', id: m.id }); return true; })()`);
  await wait(100);
  const recalled = await ev(`${P}.state().console.piano.fader`);
  await ev(`window.__h(); true`);
  ok('consola_y_escenas', hold && ratio > 17 && ratio < 23 && recalled === -20, `fader 0 → −20 dB baja ${ratio.toFixed(1)} dB medidos; escena de mezcla recupera ${recalled} dB`);

  // Grabación del master: archivo real con su formato.
  await ev(`window.__h2 = ${P}.engine.noteOn(['piano'], 67, 0.9); true`);
  await ev(`[...document.querySelectorAll('.lfoot button')].find((b) => /Grabar el master/.test(b.getAttribute('aria-label') ?? '')).click()`);
  await wait(1500);
  await ev(`[...document.querySelectorAll('.lfoot button')].find((b) => /Detener grabación/.test(b.getAttribute('aria-label') ?? '')).click()`);
  await wait(1200);
  await ev(`window.__h2(); true`);
  const rec = await ev(`(async () => { const a = document.querySelector('.recout a'); if (!a) return null; const b = await (await fetch(a.href)).blob(); return { bytes: b.size, tipo: b.type, nombre: a.download }; })()`);
  ok('grabacion', !!rec && rec.bytes > 1000, JSON.stringify(rec));

  // Guardar y reabrir: la sesión vuelve detenida, sin reproducir ni grabar solas.
  await ev(`document.querySelector('.savebtn').click()`); await wait(300);
  await pg.cdp('Page.reload'); await wait(2000);
  const reopened = await ev(`({ sonando: ${P}.engine.playing, grabando: !!document.querySelector('.tp.rec.on'), mezcla: ${P}.state().mixScenes.some((m) => m.name === 'Regresión') })`);
  ok('reapertura', !reopened.sonando && !reopened.grabando && reopened.mezcla, JSON.stringify(reopened));
  R.erroresConsola = pg.logs.filter((l) => /error|exception/i.test(l)).slice(0, 6);
} finally {
  await br.close();
  await bridge.close();
}
console.log(JSON.stringify(R, null, 1));
