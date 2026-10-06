# Guía de uso de SONIDO

## Vistas

El selector del encabezado cambia la vista: **Todo**, **Sonidista** o **Director**. En una tableta conectada al puente, la vista la fija el rol del PIN. Un **músico** solo ve y mueve su propio monitor.

## Para el sonidista

- **Mezcla**: canales con fader, mute, solo (escucha PFL, no silencia la sala), pan, EQ básico y medidor. Doble toque o «Editor» abre el canal completo: HPF/LPF, EQ de 6 bandas, compresor, envíos a monitores PRE/POST, presets (incluye voces y «Predicación clara») y comparación A/B.
- **Entradas**: asignar micrófono o interfaz a `in1…in6`; muestra canales efectivos y si dos canales comparten la misma fuente.
- **Buses**: monitores m1–m3 (renombrables, con color); tabla de envíos PRE/POST.
- **Salidas**: dispositivo de salida, pares para sala/escucha/buses, origen de grabación.
- **Rutas**: qué canales van a la sala. El click está bloqueado fuera de la sala.
- **Escenas de mezcla**: guardar, sobrescribir (dos pasos), duplicar, borrar y deshacer. **Máscara** (qué se recupera) y **canales protegidos** (el pastor por defecto). Una **escena completa** recuerda además canción y sección y pide confirmación antes de aplicar.
- **Red**: puente, roles y la **Mesa digital por IP** (X Air / X32): ganancia, +48V, mute, pan, fader, envíos a buses, master LR y medidores de la mesa física.

## Para el director de alabanza

- **Escenas y repertorio**: canciones con tono, BPM, compás (2/4 a 12/8), estilo y **estructura libre**: crear secciones propias (intro, verso, pre‑coro, coro, puente, interludio, tag, final…), ordenarlas y repetirlas.
- **Cambio de sección** al siguiente compás; Program Change del teclado selecciona la sección por número.
- **Sonidos y capas** por sección (piano, pad, órgano, cuerdas, metales, sampler), con nivel musical y macros (ambiente, brillo, expresión). Nada de esto mueve faders de la consola.
- **Stems**: importar varias pistas, categoría, nivel, mute, desplazamiento; «solo stems» desactiva los ritmos sintetizados.
- **Sampler**: zonas con nota raíz, rango, capas de velocidad, loop y envolvente, a partir de WAV propios.
- **Escucha del click**: el botón «Click en escucha» lo pone en el bus de escucha, nunca en la sala.

## Perfiles, guardado y respaldo

- Menú de perfil: crear, cambiar y borrar perfiles locales (no son cuentas). Muestra el espacio usado.
- **Exportar** genera un JSON (esquema 3) con canciones, escenas, consola, buses y MIDI. Los audios no viajan: al **importar** se listan los que faltan. Los dispositivos de entrada/salida no se exportan porque dependen del equipo.
- Audios (stems, samples, pads) se guardan en IndexedDB del navegador.

## Esquema y migraciones

| Versión | Clave | Notas |
|---|---|---|
| 2 | `sonido.live.v2` | Consola mezclada dentro de cada escena musical |
| 3 | `sonido.p.<perfil>.v3` | Escenas musicales y consola separadas; buses, salidas, escenas de mezcla, perfiles |

Al abrir por primera vez con datos v2: la consola se toma de la escena abierta, las capas pasan a niveles musicales, y se guarda una copia en `sonido.live.v2.backup` sin borrar el original.

## Recuperación

- Antes de integrar se creó la etiqueta `respaldo-antes-integracion` en el repositorio. Para volver a esa versión: `git checkout respaldo-antes-integracion`.
- Las versiones anteriores (Consola de 12 canales y Performance) siguen disponibles desde el menú de perfil → «Versiones anteriores».
