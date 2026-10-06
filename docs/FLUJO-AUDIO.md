# Flujo de audio de SONIDO

Hay **un solo motor de audio** (`src/live/engine.ts`). La consola (sonidista) y la música (director) actúan sobre el mismo grafo, pero sobre ganancias distintas, así que una no pisa a la otra.

## Cadena por canal

```
fuente ──► nivel musical × expresión ──► HPF ──► EQ 6 bandas ──► LPF ──► compresor
                                                                              │
                     ┌──────────────── escucha PFL (antes del mute) ◄─────────┤
                     │                                                        ▼
                     │                     envíos PRE (antes del fader) ◄── mute
                     │                                                        │
                     ▼                                                        ▼
                  bus de escucha                                            fader ──► pan ──► medidor
                                                                                                │
                              envíos POST ◄────────────────────────────────────────────────────┤
                              reverb / delay ◄──────────────────────────────────────────────────┤
                              sala (si «a la sala» está activo) ◄───────────────────────────────┘
```

- **Fuente**: instrumentos sintetizados (piano, pad, órgano, cuerdas, metales, sampler, batería, bajo, percusión), archivos (tracks y stems) o entradas reales `in1…in6` (micrófono o interfaz por `getUserMedia`).
- **Nivel musical**: lo mueve el director desde la escena musical (capa encendida, nivel, expresión). No es el fader.
- **Fader, mute, pan, EQ, compresor, envíos**: los mueve el sonidista. Cambiar de sección o de sonido **no los toca**.

## Reglas que el grafo garantiza

| Regla | Cómo se cumple | Verificado |
|---|---|---|
| El click y las guías nunca llegan a la sala, a los efectos ni a la grabación | El canal `click` (lista `MONITOR_ONLY`) nunca se conecta al master ni a reverb/delay; solo a buses de monitor y a la escucha. El reductor fuerza `toMain = false`. | Prueba de señal: master 0, monitor 0,25. Prueba unitaria «click». |
| La escucha (solo/PFL) no silencia la sala | El solo enruta una copia antes del mute al bus de escucha; la sala sigue igual. | Prueba de señal: nivel de sala sin cambio al activar PFL. |
| Envío PRE llega aunque el fader esté cerrado; POST no | PRE sale antes del fader; POST después. | Fader en −∞: PRE 0,72, POST 0. |
| Cambiar escena musical no altera la consola | Escena musical y consola son estados separados. | Prueba unitaria «escena musical». |
| Recuperar una escena de mezcla respeta máscara y canales protegidos | `recall()` aplica solo las áreas marcadas y omite los protegidos (pastor por defecto). | Prueba unitaria «escena de mezcla». |

## Buses y salidas

- **Buses de monitor** (por defecto m1 Voces, m2 Banda, m3 Batería): cada canal tiene un envío PRE o POST por bus.
- **Salidas**: si el dispositivo de salida expone 4 o más canales (`maxChannelCount`), sala, escucha y buses se pueden asignar a pares distintos con `ChannelMerger`. Con una salida estéreo, todo comparte el mismo par (la página Salidas lo advierte). Selección de dispositivo con `setSinkId` donde el navegador lo permite (Chrome/Edge).
- **Escucha que reemplaza la sala**: opción explícita, con aviso, para equipos con una sola salida.

## Grabación

Graba la sala (después del limitador) o un bus, con `MediaRecorder`. El formato real lo decide el navegador (WebM/Opus en Chrome, MP4/AAC en Safari) y se muestra antes de descargar. No es grabación multipista.

## Proyecto multitrack, transporte y dominios

```
clip (archivo, desde off, durante len) → ganancia de clip y fundidos → generación (anti-clic) → pista: nivel, pan, mute
   → canal «Pistas» de la consola (sala)      o      → canal «Click» (solo monitores y escucha)
   → escucha PFL de la pista (no cambia la sala)
```

- Un solo transporte: el secuenciador marca compases y secciones; el audio del proyecto se programa sobre `AudioContext.currentTime` en cada arranque, pausa, búsqueda o salto, todas las pistas en el mismo instante.
- Cuatro dominios: proyecto (clips, click, guías), interpretación en vivo (teclado/MIDI), acompañamiento sintetizado (vínculo explícito por canción) y preescucha (por la escucha; a la sala solo si se confirma, nunca a la grabación).
- Detener pistas no corta micrófonos, master ni notas en vivo; Panic suelta las notas.

## Stems y tiempo

Todas las pistas arrancan en el mismo instante del `AudioContext`. Probado con un par invertido (C6): la suma queda en el piso numérico al iniciar, tras pausar/reanudar, buscar, repetir una sección, mover el grupo y dividir. Los cambios de sección quedan pendientes hasta el siguiente compás. Compases soportados: 2/4, 3/4, 4/4, 5/4, 6/4, 6/8, 7/8, 9/8 y 12/8 (en 6/8, 9/8 y 12/8 el BPM es la negra con puntillo).

## Lo que no hace

- No transmite audio por la red: los clientes remotos solo envían órdenes y reciben estado y medidores.
- No aloja plugins VST/AU. El tempo y el tono solo se cambian con copias preparadas (no en vivo, sin warp por segmentos).
- No hay grupos ni submezclas (VCA/DCA).
- En el navegador, +48V es solo una indicación; **sí** es control real en una X Air/X32 conectada por el puente (OSC).
