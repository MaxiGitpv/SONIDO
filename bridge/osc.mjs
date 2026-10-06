// Codificación y decodificación OSC 1.0 (tipos i, f, s, b) para mesas X Air / X32 / M32.

const pad4 = (n) => (n + 3) & ~3;

function str(s) {
  const raw = Buffer.from(String(s), 'utf8');
  const out = Buffer.alloc(pad4(raw.length + 1));
  raw.copy(out);
  return out;
}

/** @param {string} address @param {{type:'i'|'f'|'s'|'b', value:any}[]} args */
export function encode(address, args = []) {
  const parts = [str(address), str(',' + args.map((a) => a.type).join(''))];
  for (const a of args) {
    if (a.type === 'i') {
      const b = Buffer.alloc(4);
      b.writeInt32BE(Math.round(Number(a.value)) | 0);
      parts.push(b);
    } else if (a.type === 'f') {
      const b = Buffer.alloc(4);
      b.writeFloatBE(Number(a.value));
      parts.push(b);
    } else if (a.type === 's') parts.push(str(a.value));
    else if (a.type === 'b') {
      const data = Buffer.from(a.value);
      const size = Buffer.alloc(4);
      size.writeInt32BE(data.length);
      const body = Buffer.alloc(pad4(data.length));
      data.copy(body);
      parts.push(size, body);
    } else throw new Error(`tipo OSC no soportado: ${a.type}`);
  }
  return Buffer.concat(parts);
}

function readStr(buf, off) {
  let end = off;
  while (end < buf.length && buf[end] !== 0) end++;
  return { value: buf.toString('utf8', off, end), next: pad4(end + 1) };
}

/** @returns {{address:string, args:{type:string, value:any}[]}} */
export function decode(buf) {
  const a = readStr(buf, 0);
  if (!a.value.startsWith('/')) throw new Error('mensaje OSC no válido');
  if (a.next >= buf.length) return { address: a.value, args: [] };
  const t = readStr(buf, a.next);
  let off = t.next;
  const args = [];
  for (const type of t.value.slice(1)) {
    if (type === 'i') {
      args.push({ type, value: buf.readInt32BE(off) });
      off += 4;
    } else if (type === 'f') {
      args.push({ type, value: buf.readFloatBE(off) });
      off += 4;
    } else if (type === 's') {
      const s = readStr(buf, off);
      args.push({ type, value: s.value });
      off = s.next;
    } else if (type === 'b') {
      const size = buf.readInt32BE(off);
      args.push({ type, value: buf.subarray(off + 4, off + 4 + size) });
      off += 4 + pad4(size);
    } else throw new Error(`tipo OSC no soportado: ${type}`);
  }
  return { address: a.value, args };
}

/** Blob de /meters de X Air/X32: int32 LE con la cantidad, luego int16 LE en 1/256 dB. */
export function parseMeters(blob) {
  if (!blob || blob.length < 4) return [];
  const n = Math.min(blob.readInt32LE(0), (blob.length - 4) >> 1);
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.max(-90, blob.readInt16LE(4 + i * 2) / 256));
  return out;
}

export function buildMeters(values) {
  const b = Buffer.alloc(4 + values.length * 2);
  b.writeInt32LE(values.length, 0);
  values.forEach((v, i) => b.writeInt16LE(Math.round(Math.max(-128, Math.min(0, v)) * 256), 4 + i * 2));
  return b;
}
