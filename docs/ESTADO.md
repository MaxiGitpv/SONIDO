# Estado de la integración (C0–C5)

## Evidencia de pruebas

| Tipo | Qué se comprobó | Cómo |
|---|---|---|
| Automática (app) | Compases 2/4…12/8, curva de fader X32/X Air, permisos compartidos, escena musical no toca la consola, máscara y canales protegidos, escena completa, click fuera de la sala, MIDI Learn sin duplicados, estructura libre, migración v2→v3, exportar/importar | `npm test` — 11 pruebas |
| Automática (puente) | OSC (i, f, s, blob de medidores), PIN incorrecto, permisos en el servicio, anfitrión único, duplicados, reconexión, salida del anfitrión, X Air: descubrir, conectar, set/get, +48V, medidores, director sin control de la mesa, IP sin mesa | `npm --prefix bridge test` — 4 pruebas |
| Señal en el navegador | Click: master 0 y monitor 0,25; PFL no cambia la sala; PRE 0,72 / POST 0 con fader cerrado; stems alineados (par invertido = 0, también tras pausa) | Medición de nodos en Chrome |
| MIDI sintético | Notas, sustain, Program Change → sección, liberación al desconectar | Mensajes MIDI generados en el navegador |
| Emulador X Air | Interfaz de la mesa: nombres, +48V, fader −7,5 dB, medidores, barra de estado | `npm run emulador` + puente + pestaña Red |
| Dos clientes | Anfitrión + director en otra pestaña: el director cambia de sección, el cliente no crea audio, el anfitrión sigue al cerrar el cliente | Puente local |
| **Hardware real** | **Pendiente**: X Air/X32 real, micrófono por interfaz, interfaz multicanal, teclado MIDI, dos dispositivos físicos | Protocolo en `RED-Y-MESAS.md` §5 |

## MVP pendiente (con el usuario)

1. Pruebas físicas F1–F9 de `RED-Y-MESAS.md`.
2. Ajustar la asignación de ganancia/+48V en X32 si el enrutamiento de entradas no es el local.

## Después del MVP

- Grupos y submezclas (DCA/VCA).
- Control remoto de otras digitales (Yamaha TF, Soundcraft Ui, Allen & Heath QU/SQ/CQ, PreSonus).
- Cifrado (HTTPS/WSS) y cuentas reales en lugar de PIN.
- Grabación multipista; estiramiento de tiempo; plugins de terceros (requiere aplicación de escritorio).
- Bancos de sonido muestreados de mayor calidad (Surge XT, Decent Sampler y BBC SO Discover están en el catálogo como opciones de escritorio, no integrados).
