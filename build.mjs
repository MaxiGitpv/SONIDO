import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

const js = await build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: 'es2020',
  write: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  jsx: 'automatic',
});
const css = await build({ entryPoints: ['src/styles.css'], bundle: true, minify: true, write: false });

const html = `<title>SONIDO</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600;700&family=IBM+Plex+Sans+Condensed:wght@400;500;600;700&family=Cormorant+Garamond:wght@600;700&family=Manrope:wght@400;500;600;700;800&display=swap">
<style>${css.outputFiles[0].text}</style>
<div id="root"></div>
<script>${js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script>
`;
writeFileSync('dist.html', html);
writeFileSync('preview.html', `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}</body></html>`);
writeFileSync('preview-demo.html', `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}<script>setTimeout(()=>document.querySelector('.demo').click(),200)</script></body></html>`);
writeFileSync('preview-mon.html', `<!doctype html><html><head><meta charset="utf-8"></head><body>${html}<script>setTimeout(()=>{document.querySelector('.demo').click();document.querySelectorAll('.mixbtn')[2].click()},200)</script></body></html>`);
console.log('ok', (html.length / 1024).toFixed(0) + ' KB');
const pv = (name, script) => writeFileSync(name, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}<script>setTimeout(()=>{document.querySelectorAll('.modebtn')[1].click();${script}},250)</script></body></html>`);
pv('pv-perf.html', '');
pv('pv-test.html', "setTimeout(()=>{[...document.querySelectorAll('.tbtn')].find(b=>/prueba/i.test(b.textContent)).click();setTimeout(()=>{document.querySelector('.testp-blend .hslider').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:document.querySelector('.testp-blend .hslider').getBoundingClientRect().left+document.querySelector('.testp-blend .hslider').getBoundingClientRect().width*0.5,pointerId:1}))},300)},300)");
pv('pv-edit.html', "setTimeout(()=>{[...document.querySelectorAll('.tbtn')].find(b=>/Edici|Ajustes/.test(b.textContent)).click()},300)");
pv('pv-fx.html', "setTimeout(()=>{[...document.querySelectorAll('.tbtn')].find(b=>/Edici|Ajustes/.test(b.textContent)).click();setTimeout(()=>[...document.querySelectorAll('[role=tab]')].find(b=>/Efectos/.test(b.textContent)).click(),200)},300)");
const lv = (name, script) => writeFileSync(name, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${html}<script>setTimeout(()=>{${script}},300)</script></body></html>`);
lv('pv-live.html', "");
lv('pv-play.html', "document.querySelector('.tp.play').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));document.querySelector('.tp.play').click()");
lv('pv-pads.html', "setTimeout(()=>{[...document.querySelectorAll('.segx.sm button')].find(b=>b.textContent.includes('Cuadros')).click()},100)");
lv('pv-ed.html', "setTimeout(()=>{document.querySelector('.cfx-open').click()},100)");
for (const t of ['Escenas', 'Tocar', 'Canal', 'Efectos', 'Entradas', 'Mezcla']) lv(`pv-t-${t}.html`, `[...document.querySelectorAll('.ltabs button')].find(b=>b.textContent==='${t}').click()`);
lv('pv-tab.html', "[...document.querySelectorAll('.ltabs button')].find(b=>b.textContent==='Sonidos').click()");
