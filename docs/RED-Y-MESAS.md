# Red local, tabletas y mesas de mezcla

## 1. Qué se puede conectar

| Equipo | Cómo se conecta | Qué controla SONIDO | Estado de prueba |
|---|---|---|---|
| **Behringer X Air (XR12, XR16, XR18) / Midas MR18** | Ethernet o Wi‑Fi de la mesa, OSC por UDP 10024, a través del puente | Nombres, fader, mute, pan, envíos a buses 1–6, master LR, medidores. Ganancia y **+48V reales** solo si la fuente del canal (`config/insrc`) es una entrada física; si es USB/aux se bloquean | Implementado · probado con el emulador XR18 · **mesa real pendiente** |
| **Behringer X32 / Midas M32** (incluye Compact, Producer, Rack) | Ethernet, OSC por UDP 10023, a través del puente | Lo mismo con 32 canales y 16 buses, y **trim digital** por canal. Ganancia y +48V del preamp físico **solo después de que el sonidista asigne** qué preamp alimenta cada canal (Local 1–32, AES50 A 1–48, AES50 B 1–48); no se supone la entrada local | Implementado según el protocolo publicado · **sin emulador ni mesa real** |
| **Mesas analógicas** (Yamaha MG, Behringer Xenyx, Soundcraft, Allen & Heath ZED…) | Interfaz de audio USB o la USB de la propia mesa (p. ej. MG10XU/MG12XU, Xenyx QX/USB) | SONIDO hace la mezcla dentro del computador: entradas `in1…in6` desde la interfaz, salida a la mesa. **No mueve faders físicos** (no tienen control remoto). | Probado con micrófono del computador. Interfaz multicanal **pendiente**. |
| **Otras digitales** (Yamaha TF/QL, Soundcraft Ui, Allen & Heath QU/SQ/CQ, PreSonus StudioLive) | Solo como interfaz de audio USB, si la mesa la ofrece | Igual que una analógica | No hay control remoto de estas mesas: cada una usa un protocolo propio. Es trabajo para después del MVP. |
| **Teclado MIDI** | USB al equipo anfitrión | Notas, sustain, cambios de sección (Program Change), MIDI Learn de controles | MIDI sintético probado. **Teclado real pendiente.** |
| **Tableta o teléfono** (Android, iPad) | Navegador en la misma red, `http://IP-del-anfitrión:8790` | Vista según rol: sonidista, director o músico (su propio monitor) | Probado con dos pestañas en el mismo equipo. **Dos equipos reales pendiente.** |
| **PC/Mac** | Chrome o Edge (recomendado). Firefox y Safari funcionan sin MIDI ni selección de salida | Todo | Chrome probado. |

## 2. Dos maneras de abrir SONIDO

El navegador solo permite micrófonos, MIDI y elegir la salida en un **contexto seguro**: HTTPS confiable o la dirección local del propio equipo. `http://IP-del-PC:8790` **no** lo es, ni siquiera en el mismo PC.

| Equipo | Dirección | Puede |
|---|---|---|
| **PC anfitrión** (produce el audio) | `http://localhost:8790` (o `127.0.0.1`) | Audio, micrófonos/interfaz, MIDI, elegir salida, grabar, controlar la mesa |
| **Tablet / teléfono / otro PC** | `http://IP-del-PC:8790` | Controlar al anfitrión según su rol (no crea motor de audio ni pide micrófono) |

SONIDO lo detecta: si un equipo abre la app por IP sin conectarse como control remoto, muestra un aviso con el enlace `localhost` antes de pedir permisos; «Red y mesa → Este dispositivo» lista lo que ese equipo puede hacer de verdad. No se recomienda desactivar protecciones del navegador. Capturar audio en una tablet requeriría HTTPS/WSS con un certificado de confianza en la red local: **no implementado** (POST‑MVP, ver `ESTADO.md`).

## 3. Poner en marcha el puente (equipo anfitrión)

El anfitrión es el computador que produce el audio y, si hay, habla con la mesa.

```bash
npm --prefix bridge install
npm run bridge
```

La consola muestra las direcciones y un PIN por rol:

```
SONIDO · puente local activo
  En este equipo:  http://127.0.0.1:8790
  En la red:       http://192.168.1.20:8790
  PIN por rol ...
```

1. En el anfitrión abra `http://localhost:8790`, pestaña **Red**, rol **Anfitrión**, PIN de anfitrión, **Conectar**.
2. En cada tableta abra `http://192.168.1.20:8790` (la IP que muestra el puente), pestaña **Red**, su rol y su PIN.
3. Para fijar los PIN entre servicios: variables `SONIDO_PIN_HOST`, `SONIDO_PIN_MIXER`, `SONIDO_PIN_DIRECTOR`, `SONIDO_PIN_MUSICO`; puerto con `SONIDO_PORT`.

Comportamiento comprobado:

- Hay un solo anfitrión; un segundo intento es rechazado.
- El puente valida los permisos (misma tabla `shared/permissions.json` que la app). El anfitrión vuelve a validar.
- Una orden repetida (mismo id) se aplica una sola vez.
- Si dos personas tocan el mismo control en menos de 1,5 s, gana la primera y la segunda recibe aviso.
- Si un cliente se desconecta, al volver recibe el último estado. Si el anfitrión se va, los clientes lo ven y sus órdenes se rechazan hasta que vuelva; el audio no se corta en el anfitrión cuando se cierra una tableta.

### Multitrack desde una tablet

- La tablet ve el proyecto (pistas, clips, marcadores) y lo puede editar según su rol: cada edición es una orden que el puente valida y el anfitrión ejecuta.
- No decodifica ni reproduce audio: pide al anfitrión **picos reducidos** de cada archivo (unos KB por minuto) para dibujar las formas de onda.
- La posición del transporte llega con los medidores; al reconectar recibe la última posición y el estado sin reiniciar el audio del anfitrión.
- Los audios se importan en el anfitrión. Enviar archivos desde la tablet no está implementado.

## 4. Conectar la mesa X Air / X32

1. Mesa y anfitrión en la misma red. Por **Ethernet**: cable a la mesa o al mismo router. Por **Wi‑Fi**: el anfitrión se une al punto de acceso de la X Air, o la mesa en modo cliente al router de la iglesia (recomendado: router propio, sin internet obligatorio).
2. Pestaña **Red** → tarjeta **Mesa digital** → **Buscar mesas** (envía `/xinfo` a la red) o escriba la IP y elija el modelo → **Conectar**.
3. El puente mantiene la sesión con `/xremote` cada pocos segundos y pide medidores `/meters/1`.
4. **Preamps.** X Air: SONIDO lee la fuente de cada canal; ganancia y +48V solo aparecen si es una entrada física. X32/M32: elija en cada canal qué preamp lo alimenta (se guarda por mesa en este navegador); mientras diga «Sin asignar» solo se ofrece el **trim digital**, que no toca el preamp.
5. Firewall de Windows: permita Node.js en redes privadas (UDP 10024/10023 y TCP 8790). Si «Buscar» no encuentra nada, escriba la IP directamente.

Sin mesa a mano se puede probar todo con el emulador:

```bash
npm run emulador
```

(responde como una XR18 en `127.0.0.1:10024`; no produce audio). Que algo funcione contra el emulador demuestra el protocolo, no la compatibilidad con cada X Air/X32/M32 real.

## 5. Límites de seguridad

- El PIN es un secreto compartido en la red local, **no** una cuenta. La conexión es HTTP/WebSocket sin cifrado: úsela solo en la red de la iglesia.
- Los perfiles locales (menú de perfil) separan configuraciones, no son autenticación.
- La versión publicada en GitHub Pages funciona sola (sin puente). Una página HTTPS no puede conectarse a un puente `ws://` en la LAN; para colaborar abra la app desde el propio puente.
- El puente no se publica en internet ni guarda contraseñas.

## 6. Protocolo de pruebas físicas (pendiente con el usuario)

Marque cada punto con fecha y resultado. Nada de esto se ha probado aún con hardware real.

| # | Prueba | Cómo | Resultado esperado |
|---|---|---|---|
| F1 | Micrófono real | Entradas → `in1` → micrófono; Mezcla → canal Voz 1 | Medidor se mueve; HPF y EQ audibles; solo PFL no cambia la sala |
| F2 | Interfaz multicanal | Interfaz de 4+ salidas; Salidas → sala 1‑2, escucha 3‑4, monitor 5‑6 | Cada destino sale por su par; el click solo en el monitor |
| F3 | Teclado MIDI | Conectar por USB; MIDI → Conectar; tocar, sustain, Program Change | Notas sin cortes; PC 1..n cambia de sección; al desconectar no quedan notas colgadas |
| F4 | X Air real por Ethernet | Puente + Buscar mesas | Aparece el modelo y nombre; mover fader en SONIDO lo mueve en X Air Edit y viceversa |
| F5 | X Air real por Wi‑Fi | Igual que F4 en el punto de acceso de la mesa | Igual; latencia de control aceptable (< 100 ms percibidos) |
| F6 | +48V real | Activar en un canal **sin** micrófono dinámico de cinta conectado | El LED de +48V de la mesa se enciende |
| F7 | Dos dispositivos | Anfitrión + tableta (director) + teléfono (músico, m2) | Director cambia sección; músico solo su monitor; la tableta no suena |
| F8 | Reconexión | Apagar Wi‑Fi de la tableta 30 s y volver | Recupera el estado; el anfitrión no se detuvo |
| F9 | Servicio de 60 min | Ensayo completo con pistas y click | Sin cortes; click nunca en la sala ni en la grabación |
