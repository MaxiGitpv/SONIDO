# SONIDO

Espacio de trabajo en vivo para el sonido de la iglesia (React + TypeScript, audio real con Web Audio). Un solo motor de audio con dos responsabilidades separadas:

- **Sonidista**: consola con canales, EQ, compresor, buses de monitor con envíos PRE/POST, escucha PFL, salidas, escenas de mezcla con máscara y canales protegidos, y control por IP de mesas **Behringer X Air / Midas MR18** y **X32 / M32** (Ethernet o Wi‑Fi).
- **Director de alabanza**: repertorio con estructura libre (secciones propias, repeticiones, compases 2/4 a 12/8), sonidos en capas, sampler, ritmos y teclado MIDI, y un **estudio multitrack** con formas de onda reales, edición no destructiva, marcadores de sección sobre el audio y una vista En vivo, todo con el mismo transporte.

Funciona en PC/Mac (Chrome o Edge recomendado), tabletas y teléfonos. Con mesas analógicas se usa una interfaz de audio USB; SONIDO mezcla en el computador.

## Uso rápido

- En línea (un solo equipo, sin puente): https://maxigitpv.github.io/SONIDO/
- Sin conexión: abra `index.html` en el navegador.
- Con tabletas y mesa digital (red local):

```bash
npm --prefix bridge install
npm run bridge
```

Luego abra la dirección que muestra el puente en cada dispositivo. Detalles en [docs/RED-Y-MESAS.md](docs/RED-Y-MESAS.md).

## Documentación

- [Guía de uso](docs/GUIA-USO.md) — sonidista, director, perfiles, esquema y recuperación.
- [Flujo de audio](docs/FLUJO-AUDIO.md) — grafo, PFL, PRE/POST, aislamiento del click.
- [Red y mesas](docs/RED-Y-MESAS.md) — puente, roles y PIN, X Air/X32, compatibilidad, pruebas físicas.
- [Estado](docs/ESTADO.md) — qué está implementado, cómo se verificó, pendientes y después del MVP.
- [C6](docs/C6.md) — correcciones visuales, transporte, estudio multitrack, evaluación de tempo y tono.
- [Licencias](docs/LICENCIAS.md) — componentes de terceros.
- [Inventario C0](docs/INVENTARIO.md).

## Desarrollo

```bash
npm install
npx tsc -p .              # revisa tipos
node build.mjs            # genera index.html y dist.html (incluye commit y fecha)
npm test                  # pruebas de la app y del puente
npm run emulador          # X Air simulada en UDP 10024
node scripts/verify-audio.mjs   # audio de punta a punta en Chrome (requiere bridge/node_modules)
node scripts/verify-red.mjs     # anfitrión/tablet, contexto seguro y mesa emulada
node scripts/shots.mjs          # capturas medidas en 7 tamaños
node scripts/input-test.mjs     # rueda, dedo, teclado y ratón reales
```

La versión compilada se ve en la barra de estado («Versión») y en `<meta name="sonido-build">`.
