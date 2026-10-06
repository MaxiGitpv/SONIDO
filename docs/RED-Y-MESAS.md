# Red local, tabletas y mesas de mezcla

## 1. Qué se puede conectar

| Equipo | Cómo se conecta | Qué controla SONIDO | Estado de prueba |
|---|---|---|---|
| **Behringer X Air (XR12, XR16, XR18) / Midas MR18** | Ethernet o Wi‑Fi de la mesa, OSC por UDP 10024, a través del puente | Nombres, fader, mute, pan, ganancia del preamplificador, **+48V real**, envíos a buses 1–6, master LR, medidores | Probado contra el emulador incluido. **Pendiente en mesa real.** |
| **Behringer X32 / Midas M32** (incluye Compact, Producer, Rack) | Ethernet, OSC por UDP 10023, a través del puente | Lo mismo con 32 canales y 16 buses. La ganancia y +48V suponen entradas locales 1–32 (si el enrutamiento es otro, no use ese control) | Solo el protocolo, sin emulador X32. **Pendiente en mesa real.** |
| **Mesas analógicas** (Yamaha MG, Behringer Xenyx, Soundcraft, Allen & Heath ZED…) | Interfaz de audio USB o la USB de la propia mesa (p. ej. MG10XU/MG12XU, Xenyx QX/USB) | SONIDO hace la mezcla dentro del computador: entradas `in1…in6` desde la interfaz, salida a la mesa. **No mueve faders físicos** (no tienen control remoto). | Probado con micrófono del computador. Interfaz multicanal **pendiente**. |
| **Otras digitales** (Yamaha TF/QL, Soundcraft Ui, Allen & Heath QU/SQ/CQ, PreSonus StudioLive) | Solo como interfaz de audio USB, si la mesa la ofrece | Igual que una analógica | No hay control remoto de estas mesas: cada una usa un protocolo propio. Es trabajo para después del MVP. |
| **Teclado MIDI** | USB al equipo anfitrión | Notas, sustain, cambios de sección (Program Change), MIDI Learn de controles | MIDI sintético probado. **Teclado real pendiente.** |
| **Tableta o teléfono** (Android, iPad) | Navegador en la misma red, `http://IP-del-anfitrión:8790` | Vista según rol: sonidista, director o músico (su propio monitor) | Probado con dos pestañas en el mismo equipo. **Dos equipos reales pendiente.** |
| **PC/Mac** | Chrome o Edge (recomendado). Firefox y Safari funcionan sin MIDI ni selección de salida | Todo | Chrome probado. |

## 2. Poner en marcha el puente (equipo anfitrión)

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

1. En el anfitrión abra `http://127.0.0.1:8790`, pestaña **Red**, rol **Anfitrión**, PIN de anfitrión, **Conectar**.
2. En cada tableta abra `http://192.168.1.20:8790` (la IP que muestra el puente), pestaña **Red**, su rol y su PIN.
3. Para fijar los PIN entre servicios: variables `SONIDO_PIN_HOST`, `SONIDO_PIN_MIXER`, `SONIDO_PIN_DIRECTOR`, `SONIDO_PIN_MUSICO`; puerto con `SONIDO_PORT`.

Comportamiento comprobado:

- Hay un solo anfitrión; un segundo intento es rechazado.
- El puente valida los permisos (misma tabla `shared/permissions.json` que la app). El anfitrión vuelve a validar.
- Una orden repetida (mismo id) se aplica una sola vez.
- Si dos personas tocan el mismo control en menos de 1,5 s, gana la primera y la segunda recibe aviso.
- Si un cliente se desconecta, al volver recibe el último estado. Si el anfitrión se va, los clientes lo ven y sus órdenes se rechazan hasta que vuelva; el audio no se corta en el anfitrión cuando se cierra una tableta.

## 3. Conectar la mesa X Air / X32

1. Mesa y anfitrión en la misma red. Por **Ethernet**: cable a la mesa o al mismo router. Por **Wi‑Fi**: el anfitrión se une al punto de acceso de la X Air, o la mesa en modo cliente al router de la iglesia (recomendado: router propio, sin internet obligatorio).
2. Pestaña **Red** → tarjeta **Mesa digital** → **Buscar mesas** (envía `/xinfo` a la red) o escriba la IP y elija el modelo → **Conectar**.
3. El puente mantiene la sesión con `/xremote` cada pocos segundos y pide medidores `/meters/1`.
4. Firewall de Windows: permita Node.js en redes privadas (UDP 10024/10023 y TCP 8790). Si «Buscar» no encuentra nada, escriba la IP directamente.

Sin mesa a mano se puede probar todo con el emulador:

```bash
npm run emulador
```

(responde como una XR18 en `127.0.0.1:10024`; no produce audio).

## 4. Límites de seguridad

- El PIN es un secreto compartido en la red local, **no** una cuenta. La conexión es HTTP/WebSocket sin cifrado: úsela solo en la red de la iglesia.
- Los perfiles locales (menú de perfil) separan configuraciones, no son autenticación.
- La versión publicada en GitHub Pages funciona sola (sin puente). Una página HTTPS no puede conectarse a un puente `ws://` en la LAN; para colaborar abra la app desde el propio puente.
- El puente no se publica en internet ni guarda contraseñas.

## 5. Protocolo de pruebas físicas (pendiente con el usuario)

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
