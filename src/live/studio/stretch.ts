/*
 * Tempo y tono procesados (acotado, modo Preparar). Usa Signalsmith Stretch (licencia MIT, WASM/AudioWorklet)
 * en un OfflineAudioContext: se renderiza una copia de cada archivo del grupo con los MISMOS parámetros y se
 * guarda aparte; los originales no se tocan. No se procesa en vivo.
 *
 * Evaluación (docs/C6.md): tempo 0,8× mantiene 440 Hz (+1,6 cents); +2 semitonos mantiene la duración;
 * 3 stems estéreo de 30 s a 0,9× en 11 s (8× tiempo real); entre stems hasta ~2 ms de diferencia en
 * transitorios (el algoritmo suaviza ataques). Por eso se procesa siempre desde el original y todo el grupo junto.
 */
// La biblioteca arma su AudioWorklet con el texto fuente de sus propias funciones: si se minifica dentro del
// paquete, ese código se rompe. Por eso build.mjs la incluye tal cual, como script aparte (variable global).
type StretchFactory = (c: BaseAudioContext, o: unknown) => Promise<StretchNode>;
const factory = (): StretchFactory => {
  const f = (globalThis as unknown as { SignalsmithStretch?: StretchFactory }).SignalsmithStretch;
  if (!f) throw new Error('la biblioteca de tempo y tono no está incluida en esta versión');
  return f;
};

interface StretchNode extends AudioNode {
  addBuffers(chans: Float32Array[]): Promise<number>;
  schedule(o: { output?: number; input?: number; rate?: number; semitones?: number; active?: boolean }): void;
}

/** Copia procesada de `buf`: duración ÷ rate, afinación + semitones. */
export async function renderStretched(buf: AudioBuffer, rate: number, semitones: number): Promise<AudioBuffer> {
  const nch = buf.numberOfChannels;
  const sr = buf.sampleRate;
  const want = Math.ceil(buf.length / rate);
  const ctx = new OfflineAudioContext(nch, want + Math.ceil(sr * 0.25), sr);
  const node = await factory()(ctx, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [nch] });
  node.connect(ctx.destination);
  await node.addBuffers(Array.from({ length: nch }, (_, i) => buf.getChannelData(i).slice()));
  node.schedule({ output: 0, input: 0, rate, semitones, active: true });
  const out = await ctx.startRendering();
  // Misma duración exacta para todos los archivos del grupo: la alineación entre stems no depende de la cola.
  const res = new AudioBuffer({ numberOfChannels: nch, length: want, sampleRate: sr });
  for (let i = 0; i < nch; i++) res.copyToChannel(out.getChannelData(i).subarray(0, want), i);
  return res;
}

/** WAV PCM de 16 bits (la mitad de memoria que float) para guardar la versión en el navegador. */
export function encodeWav16(buf: AudioBuffer): Blob {
  const nch = buf.numberOfChannels;
  const n = buf.length;
  const bytes = 44 + n * nch * 2;
  const v = new DataView(new ArrayBuffer(bytes));
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, bytes - 8, true);
  str(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, nch, true);
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * nch * 2, true);
  v.setUint16(32, nch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * nch * 2, true);
  const ch = Array.from({ length: nch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      const x = Math.max(-1, Math.min(1, ch[c][i]));
      v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([v.buffer], { type: 'audio/wav' });
}

/** Bytes que ocupará la versión (WAV 16 bits) para avisar antes de procesar. */
export const versionBytes = (seconds: number, channels: number, sr: number, rate: number) => Math.ceil((seconds / rate) * sr) * channels * 2;
