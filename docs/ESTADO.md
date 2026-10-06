# Estado de SONIDO (C0–C6)

Tres niveles de verificación, nunca mezclados: **software** (pruebas automáticas y Chrome real con señales deterministas), **emulación** (emulador XR18 del repositorio, MIDI sintético) y **hardware real** (pendiente).

## Funciones y cómo se verificaron

| Área | Estado | Verificación |
|---|---|---|
| Consola, buses PRE/POST, escucha PFL, salidas, grabación de sala/bus | Implementado (C1–C5) | Señal en Chrome (C5) |
| Escenas musicales y de mezcla, máscara, protegidos, escena completa | Implementado | `npm test` |
| Perfiles, esquema 4 con migración desde 3 y 2 (copias intactas), exportar/importar | Implementado | `npm test` |
| Distribución, repertorio desplazable, faders (C6.1) | Corregido | `scripts/shots.mjs` (7 tamaños, antes/después) y `scripts/input-test.mjs` (rueda, dedo, teclado, ratón reales) |
| Anfitrión por localhost / tablet como control, capacidades reales (C6.2) | Implementado | `scripts/verify-red.mjs` |
| Mesa X Air: fader, mute, pan, envíos, master, medidores; ganancia/+48V solo con fuente física | Implementado | Emulador XR18 · **mesa real pendiente** |
| Mesa X32/M32: lo mismo + trim digital; ganancia/+48V solo con preamp asignado | Implementado según protocolo | **Sin emulador ni mesa real** |
| Transporte único y dominios (C6.3) | Implementado | `scripts/verify-audio.mjs` |
| **Estudio multitrack nuevo** (C6.4): clips no destructivos, ondas reales, marcadores, A/B, deshacer, En vivo | Implementado | `npm test` (modelo) y `scripts/verify-audio.mjs` (11 pruebas de punta a punta) |
| **Tempo y tono procesados** (C6, acotado): copia renderizada del grupo, original conservado | Implementado en modo Preparar | Evaluación medida + prueba 12 de `verify-audio.mjs` |
| Colaboración: PIN por rol, anfitrión único, reconexión, picos y posición para tablets | Implementado | `npm --prefix bridge test` + `verify-red.mjs` + prueba 11 |
| **Hardware real** | **Pendiente** | Protocolo F1–F9 en `RED-Y-MESAS.md` §6 |

## Pruebas automáticas

- `npm test`: 23 de la app (modelo del estudio, migraciones, permisos, escenas, conversión del fader…) y 4 del puente.
- `node scripts/verify-audio.mjs`: 12 pruebas de audio en Chrome real (alineación por cancelación de un par invertido, pausa, búsqueda, repetición de sección, mover, dividir, fundidos, onda en su sitio, click fuera de la sala, dominios, tablet, versión procesada).
- `node scripts/verify-red.mjs`, `node scripts/shots.mjs`, `node scripts/input-test.mjs`: red, distribución y entrada real.

## MVP pendiente (con el usuario)

1. Pruebas físicas F1–F9 (`RED-Y-MESAS.md` §6): X Air real por Ethernet y Wi‑Fi, +48V real, micrófono, interfaz multicanal, teclado MIDI, dos dispositivos, reconexión, servicio de 60 min.
2. X32/M32: asignar los preamps en la mesa real y comprobar ganancia/+48V.
3. Escuchar en un sistema real la calidad de la versión procesada (tempo/tono) con stems de la iglesia.

## Después del MVP

- **Cifrado (HTTPS/WSS) con certificado de confianza en la red local.** No es cosmético: es lo que permitiría capturar audio o usar MIDI desde un equipo que no sea el anfitrión. Hoy la captura solo funciona en el anfitrión por `localhost`. Cuentas reales en lugar de PIN.
- Warp por segmentos (seguir el tempo variable de una grabación) y tempo/tono en tiempo real durante el servicio; hoy solo hay copias preparadas con un único factor por canción.
- Separación de instrumentos, reconocimiento de acordes o generación musical: alcance de análisis/IA aparte, no incluido.
- Importar audio desde una tablet (transferencia de bytes al anfitrión con verificación); hoy se importa en el anfitrión.
- Grupos y submezclas (DCA/VCA); grabación multipista; plugins de terceros (aplicación de escritorio).
- Control remoto de otras mesas digitales (Yamaha TF, Soundcraft Ui, Allen & Heath QU/SQ/CQ, PreSonus).
- Bancos de sonido muestreados de mayor calidad (Surge XT, Decent Sampler y BBC SO Discover figuran como opciones de escritorio, no integrados).
