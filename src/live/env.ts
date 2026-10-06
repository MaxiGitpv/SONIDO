/*
 * Capacidades reales de este navegador y de la dirección con que se abrió la app.
 * Micrófonos (getUserMedia), MIDI y elegir salida exigen contexto seguro: HTTPS confiable o la dirección
 * local del propio equipo (localhost / 127.0.0.1 / [::1]). Una tablet que abre http://IP-del-PC:8790 no lo es:
 * puede controlar al anfitrión, pero no capturar audio ni usar MIDI. No se recomienda desactivar protecciones.
 */
export interface EnvCaps {
  secure: boolean;
  loopback: boolean;
  capture: boolean;
  midi: boolean;
  sink: boolean;
  /** Dirección local equivalente para el PC anfitrión (mismo puerto), o null si ya lo es o no aplica. */
  hostUrl: string | null;
  origin: string;
}

const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|::1)$/i;

export function envCaps(): EnvCaps {
  if (typeof window === 'undefined') return { secure: true, loopback: true, capture: false, midi: false, sink: false, hostUrl: null, origin: '' };
  const { protocol, hostname, port, pathname } = window.location;
  const secure = window.isSecureContext === true;
  const loopback = LOOPBACK.test(hostname);
  const nav = navigator as Navigator & { requestMIDIAccess?: unknown };
  const http = protocol === 'http:';
  return {
    secure,
    loopback,
    capture: secure && !!navigator.mediaDevices?.getUserMedia,
    midi: secure && typeof nav.requestMIDIAccess === 'function',
    sink: secure && typeof (window.AudioContext?.prototype as unknown as { setSinkId?: unknown })?.setSinkId === 'function',
    hostUrl: http && !loopback ? `http://localhost${port ? `:${port}` : ''}${pathname}` : null,
    origin: window.location.origin,
  };
}

/** Texto corto y honesto de por qué falta una capacidad. */
export function whyNot(c: EnvCaps, what: 'capture' | 'midi' | 'sink'): string | null {
  if (c[what]) return null;
  if (!c.secure) return `Esta dirección (${c.origin}) no es un contexto seguro. En el PC anfitrión abra ${c.hostUrl ?? 'http://localhost:8790'}; desde una tablet use SONIDO como control remoto.`;
  if (what === 'midi') return 'Este navegador no ofrece MIDI. Use Chrome o Edge en computador.';
  if (what === 'sink') return 'Este navegador no permite elegir la salida de audio; se usa la salida del sistema.';
  return 'Este navegador no permite capturar audio.';
}
