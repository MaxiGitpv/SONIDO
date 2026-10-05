/*
 * Entrada MIDI real (Web MIDI API). Solo escucha: notas, controladores (CC) y Program Change
 * de los teclados y controladores conectados por USB o por una interfaz MIDI.
 */

export type MidiMsg =
  | { kind: 'on'; note: number; vel: number; ch: number }
  | { kind: 'off'; note: number; ch: number }
  | { kind: 'cc'; cc: number; value: number; ch: number }
  | { kind: 'pc'; program: number; ch: number };

export interface MidiDevice {
  id: string;
  name: string;
  state: string;
}

type Access = { inputs: Map<string, { id: string; name: string | null; state: string; onmidimessage: ((e: { data: Uint8Array }) => void) | null }>; onstatechange: (() => void) | null };

let access: Access | null = null;

export function parse(data: Uint8Array): MidiMsg | null {
  const st = data[0] & 0xf0;
  const ch = (data[0] & 0x0f) + 1;
  if (st === 0x90 && data[2] > 0) return { kind: 'on', note: data[1], vel: data[2] / 127, ch };
  if (st === 0x80 || (st === 0x90 && data[2] === 0)) return { kind: 'off', note: data[1], ch };
  if (st === 0xb0) return { kind: 'cc', cc: data[1], value: data[2], ch };
  if (st === 0xc0) return { kind: 'pc', program: data[1], ch };
  return null;
}

/** Pide acceso MIDI y empieza a escuchar todas las entradas. Devuelve la lista de dispositivos. */
export async function connectMidi(onMsg: (m: MidiMsg, from: string) => void, onDevices: (d: MidiDevice[]) => void): Promise<MidiDevice[]> {
  const nav = navigator as unknown as { requestMIDIAccess?: (o: { sysex: boolean }) => Promise<Access> };
  if (!nav.requestMIDIAccess) throw new Error('unsupported');
  access = await nav.requestMIDIAccess({ sysex: false });
  const list = (): MidiDevice[] => [...access!.inputs.values()].map((i) => ({ id: i.id, name: i.name ?? 'Dispositivo MIDI', state: i.state }));
  const bind = () => {
    access!.inputs.forEach((input) => {
      input.onmidimessage = (e) => {
        const m = parse(e.data);
        if (m) onMsg(m, input.name ?? 'MIDI');
      };
    });
  };
  bind();
  access.onstatechange = () => {
    bind();
    onDevices(list());
  };
  return list();
}

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export function describe(m: MidiMsg): string {
  if (m.kind === 'on') return `Nota ${NAMES[m.note % 12]}${Math.floor(m.note / 12) - 1} · velocidad ${Math.round(m.vel * 127)} · canal ${m.ch}`;
  if (m.kind === 'off') return `Suelta ${NAMES[m.note % 12]}${Math.floor(m.note / 12) - 1} · canal ${m.ch}`;
  if (m.kind === 'cc') return `CC ${m.cc} = ${m.value} · canal ${m.ch}`;
  return `Program Change ${m.program + 1} · canal ${m.ch}`;
}
