# SONIDO

Prototipo interactivo (React + TypeScript). La vista principal es **SONIDO Live Workspace**: repertorio, escenas, sonido en capas, teclado tocable, EQ/compresor/reverb/delay y canales con medidores, todo con audio real generado en el navegador (Web Audio). Se puede cargar un archivo de audio propio en el canal Tracks.

Desde el engranaje se abren las versiones anteriores:

- **Consola**: mezcla de iglesia con 12 canales, mezclas de monitores, EQ, compresor, envíos, escenas y rutas. Los medidores solo se mueven con el interruptor DEMO (niveles simulados).
- **Performance**: escenas Intro, Verso, Coro, Puente y Final por canción, capas Piano/Pad/Órgano/Cuerdas, macros, teclado gráfico, vista de edición y modo prueba Verso/Coro. Motor de audio pendiente: no suena ni se conecta a equipos.

## Uso rápido

Abra `index.html` en cualquier navegador (archivo único, ya compilado). En línea: https://maxigitpv.github.io/SONIDO/

## Desarrollo

```bash
npm install
npx tsc -p .        # revisa tipos
node build.mjs      # genera dist.html (página lista para publicar)
```

`build.mjs` genera `dist.html`; `index.html` es esa misma página envuelta en `<!doctype html><html><body>…</body></html>`.
