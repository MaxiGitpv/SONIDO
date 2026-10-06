/*
 * Cliente de red de SONIDO: habla con el puente local (bridge/sonido-bridge.mjs) por WebSocket.
 * - Colaboración: el anfitrión ejecuta el motor; los demás equipos son superficies de control.
 * - Mesa digital: el puente traduce a OSC por UDP (X Air / X32 / M32).
 * Ver docs/RED-Y-MESAS.md.
 */
import type { Role } from './perms';

export type NetStatus = 'off' | 'connecting' | 'on' | 'error';

export interface Peer {
  id: string;
  role: Role;
  name: string;
  host: boolean;
}

export type ServerMsg =
  | { t: 'welcome'; id: string; role: Role; host: boolean; hostPresent: boolean; ownBus?: string; mixers?: MixerInfo[] }
  | { t: 'denied'; reason: string }
  | { t: 'peers'; peers: Peer[] }
  | { t: 'state'; rev: number; data: unknown; levels?: Record<string, number> }
  | { t: 'levels'; levels: Record<string, number> }
  | { t: 'cmd'; id: string; from: string; role: Role; action: { type: string } & Record<string, unknown> }
  | { t: 'ack'; id: string; ok: boolean; reason?: string }
  | { t: 'host-left' }
  | { t: 'mixer'; ev: MixerEvent };

export interface MixerInfo {
  ip: string;
  port: number;
  name: string;
  model: string;
  firmware?: string;
}

export type MixerEvent =
  | { kind: 'found'; mixer: MixerInfo }
  | { kind: 'connected'; mixer: MixerInfo }
  | { kind: 'disconnected'; reason: string }
  | { kind: 'value'; address: string; value: number | string }
  | { kind: 'meters'; values: number[] }
  | { kind: 'error'; message: string };

type Handler = (m: ServerMsg) => void;

export class NetClient {
  ws: WebSocket | null = null;
  status: NetStatus = 'off';
  private handlers = new Set<Handler>();
  private seq = 0;
  private pending = new Map<string, (ok: boolean, reason?: string) => void>();
  onStatus: ((s: NetStatus, detail?: string) => void) | null = null;

  /** Dirección por defecto: el mismo equipo que sirvió la página, si fue el puente. */
  static defaultUrl(): string {
    const { protocol, host } = window.location;
    if (protocol === 'http:' && host) return `ws://${host}/ws`;
    return 'ws://127.0.0.1:8790/ws';
  }

  connect(url: string, hello: { role: Role; pin: string; host: boolean; name: string; ownBus?: string }) {
    this.close();
    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.setStatus('error', 'Dirección no válida');
      return;
    }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', ...hello }));
    ws.onmessage = (e) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(String(e.data)) as ServerMsg;
      } catch {
        return;
      }
      if (m.t === 'welcome') this.setStatus('on');
      if (m.t === 'denied') this.setStatus('error', m.reason);
      if (m.t === 'ack') {
        this.pending.get(m.id)?.(m.ok, m.reason);
        this.pending.delete(m.id);
      }
      this.handlers.forEach((h) => h(m));
    };
    ws.onerror = () => this.setStatus('error', 'No se pudo conectar con el puente');
    ws.onclose = () => {
      if (this.ws === ws) {
        this.ws = null;
        if (this.status !== 'error') this.setStatus('off');
      }
    };
  }

  close() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.ws = null;
    this.pending.clear();
    if (this.status !== 'off') this.setStatus('off');
  }

  on(h: Handler) {
    this.handlers.add(h);
    return () => {
      this.handlers.delete(h);
    };
  }

  send(obj: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(obj));
  }

  /** Envía una orden al anfitrión; responde cuando el anfitrión la acepta o la rechaza. */
  command(action: { type: string } & Record<string, unknown>): Promise<{ ok: boolean; reason?: string }> {
    const id = `c${Date.now().toString(36)}${(++this.seq).toString(36)}`;
    return new Promise((resolve) => {
      this.pending.set(id, (ok, reason) => resolve({ ok, reason }));
      this.send({ t: 'cmd', id, action });
      window.setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          resolve({ ok: false, reason: 'sin respuesta del anfitrión' });
        }
      }, 4000);
    });
  }

  mixer(op: Record<string, unknown>) {
    this.send({ t: 'mixer', ...op });
  }

  private setStatus(s: NetStatus, detail?: string) {
    this.status = s;
    this.onStatus?.(s, detail);
  }
}

export const net = new NetClient();
