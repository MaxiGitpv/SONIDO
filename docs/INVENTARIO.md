# C0 · Inventario y línea base

Fecha: 5 de octubre de 2026 · Rama: `integracion/mixer-performance` · Punto de recuperación: etiqueta `respaldo-antes-integracion` (commit `fde9c63`).

## Estado del repositorio y del sitio publicado

| Elemento | Hallazgo |
| --- | --- |
| Repositorio | `MaxiGitpv/SONIDO`, rama `main`, árbol limpio en `fde9c63`. Fuentes en `src/`, build con `node build.mjs` (esbuild) → `dist.html`; `index.html` es esa página envuelta en un documento completo. |
| Pages | Publica la rama `main`, carpeta raíz, ruta base `/SONIDO/`, entrada `index.html`. |
| Sitio servido | Servía la versión del commit `3c3615f` (19:13 UTC): sin entradas de audio, sin MIDI y sin grabación. Coincide con lo observado en la revisión del documento. |
| Causa | Los despliegues de `78d30b6` y `fde9c63` fallaron en el paso *deploy*: «The job was not acquired by Runner of type hosted even after multiple attempts». Es una falla de infraestructura de GitHub, no del build (el paso *build* terminó bien). |
| Corrección | Se añade `.nojekyll` (la página no necesita Jekyll) y se vuelve a publicar al cierre. Se comprueba el HTML servido, no solo el build local. |

## Versiones encontradas

| Versión | Ubicación | ¿Procesa audio real? |
| --- | --- | --- |
| SONIDO LIVE WORKSPACE (base) | `src/live/*` | Sí: Web Audio, un motor (`engine.ts`), síntesis, archivos, entradas por `getUserMedia`, MIDI, grabación. |
| Consola de 12 canales (anterior) | `src/App.tsx` (modo consola), `src/store.ts`, `src/views/*`, `src/components/*`, `src/meterEngine.ts` | No. Estado y medidores simulados (interruptor DEMO). Aporta la distribución: mezclas de monitor, matriz de rutas, click solo a monitores, escenas guardables. |
| Performance (anterior) | `src/perf/*` | No. Prototipo visual con «Motor de audio pendiente». Su funcionalidad ya fue absorbida por Live (capas, zonas, escenas, edición). |

## Matriz de capacidades

| Función | Dónde existe | Real o demo | Evidencia | Decisión | Archivos |
| --- | --- | --- | --- | --- | --- |
| Motor de audio único | Live | Real | `engine.ts`, una instancia exportada | Conservar y extender | `src/live/engine.ts` |
| Inicio + módulos ampliables | Live | Real | 10 pestañas, prueba de navegación con audio sonando | Conservar; agrupar en vistas Mixer / Performance | `LiveApp.tsx`, `nav.tsx`, `Pages.tsx` |
| Instrumentos sintetizados, capas, zonas | Live | Real | Picos de señal por canal medidos en pruebas | Conservar | `engine.ts`, `Center.tsx` |
| Repertorio, escenas, línea de tiempo | Live | Real | Cambio de sección al compás probado | Completar: estructuras libres (secciones propias, compases distintos de 4/4) | `store.ts`, `Timeline.tsx`, `engine.ts` |
| Ritmos (batería, bajo, percusión) | Live | Real | Señal en batería/percusión medida | Conservar; generalizar a otros compases | `rhythm.ts`, `engine.ts` |
| Entradas por permiso del navegador | Live | Real (sin prueba con micrófono físico) | Código `setInput`; lista de dispositivos detectada | Completar: canales efectivos, fuente compartida, estado, preparar silenciadas | `engine.ts`, `Pages.tsx` |
| Canal: HPF, EQ 6 bandas, LPF, compresor, envíos | Live | Real | Nodos Web Audio por canal | Conservar; añadir EQ básico como vista de las mismas bandas | `engine.ts`, `ChannelEditor.tsx` |
| Fader con −∞, mute, medidores | Live | Real | Analizadores por canal | Conservar | `Strips.tsx` |
| Solo | Live | Real pero **silencia la sala** (SIP) | `apply()` silencia los demás canales | **Corregir**: solo pasa a escucha (PFL) y no toca la sala | `engine.ts` |
| Click | Live | Real pero **se suma al master** al encender Monitor | `apply()` | **Corregir**: click y guías fuera de sala, efectos y grabación | `engine.ts` |
| Mezclas de monitor (3) | Consola anterior | Demo | `src/views/MonitorsView.tsx` | Recuperar con audio real: buses con envíos pre/post | `engine.ts`, nueva página Buses |
| Matriz de rutas | Consola anterior | Demo | `src/views/RoutesView.tsx` | Recuperar como rutas lógicas + salidas físicas detectadas | nueva página Salidas |
| Escenas guardables (4) | Consola anterior | Demo | `src/views/ScenesView.tsx` | Recuperar como escenas de mezcla con máscaras | nuevo módulo |
| Nivel musical vs fader de consola | — | No existe (un solo valor) | Vol de capa = fader | **Separar** | `types.ts`, `store.ts`, `engine.ts` |
| Escena musical vs de mezcla | — | No existe (escena = todo) | `mix[song][scene].chans` | **Separar** con migración | `types.ts`, `store.ts` |
| MIDI real | Live | Real (probado con mensajes sintéticos) | `midi.ts` | Conservar; completar desconexión, notas por propietario, Panic + sustain | `midi.ts`, `LiveApp.tsx` |
| Grabación del master | Live | Real (WebM/Opus según navegador) | Archivo generado en prueba | Conservar; excluir click, elegir bus | `engine.ts`, `Footer.tsx` |
| Persistencia | Live | localStorage `sonido.live.v2` | `store.ts` | Migrar a esquema versionado + perfiles + exportación; audio en IndexedDB | `store.ts`, nuevo `persist.ts` |
| Pistas de audio | Live | Real, una por canal (Tracks, Pad, Batería) | `loadFile` | Completar: multitrack de stems alineados | `engine.ts` |
| Sampler | — | No existe | — | Añadir | nuevo |
| Mesa digital por red (X Air / X32) | — | No existe | — | Añadir con puente local (OSC por UDP) | `bridge/` |
| Colaboración en vivo | — | No existe | — | Añadir con el mismo puente (WebSocket, roles con PIN) | `bridge/`, cliente |

## Requisitos agregados por el usuario (5 de octubre)

- Cualquier estructura musical: secciones con nombres propios, orden libre, repeticiones y compases 2/4, 3/4, 4/4, 5/4, 6/8, 7/8, 12/8.
- Compatibilidad con mezcladoras analógicas y digitales, tablet y PC.
- Behringer X Air (y familia X32/M32) controlable por IP, por Ethernet o Wi-Fi.

Implicación técnica: un navegador no puede enviar UDP ni abrir conexiones a la red local desde una página HTTPS. El control de mesas digitales y la colaboración necesitan un **puente local** (Node.js) en el computador anfitrión. Ese puente sirve la app por HTTP en la red local, habla OSC por UDP con la mesa y WebSocket con las tablets.
