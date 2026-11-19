// 碎碎平安 room · the smallest WebSocket the room needs (RFC 6455 subset), no dependencies.
// Accepts only what a browser sends for this game: masked, unfragmented text frames up to MAX_FRAME bytes,
// plus ping and close. Anything else (binary, fragments, big frames, unmasked frames) is a protocol error.
import { createHash } from 'node:crypto';

export const MAX_FRAME = 512;          // one game message is well under 200 bytes
const MAX_BUFFER = 4 * MAX_FRAME;      // bytes we hold while waiting for the rest of a frame
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export function acceptKey(key) { return createHash('sha1').update(key + GUID).digest('base64'); }

// Validate an upgrade request; return the 101 response text, or null when it is not a proper WebSocket handshake.
export function handshake(req) {
  const h = req.headers;
  if (req.method !== 'GET') return null;
  if (String(h.upgrade || '').toLowerCase() !== 'websocket') return null;
  if (!/(^|,)\s*upgrade\s*(,|$)/i.test(String(h.connection || ''))) return null;
  if (h['sec-websocket-version'] !== '13') return null;
  const key = String(h['sec-websocket-key'] || '');
  if (!/^[A-Za-z0-9+/]{22}==$/.test(key)) return null;   // base64 of 16 random bytes
  return 'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
    + `Sec-WebSocket-Accept: ${acceptKey(key)}\r\n\r\n`;
}

function frame(opcode, payload) {
  const n = payload.length;
  if (n > 0xffff) throw new Error('frame too large');
  const head = n < 126 ? Buffer.from([0x80 | opcode, n]) : Buffer.from([0x80 | opcode, 126, n >> 8, n & 0xff]);
  return Buffer.concat([head, payload]);
}
export const encodeText = (s) => frame(0x1, Buffer.from(s, 'utf8'));
export const encodePong = (p) => frame(0xa, p);
export const encodePing = () => frame(0x9, Buffer.alloc(0));
export const encodeClose = (code = 1000) => frame(0x8, Buffer.from([code >> 8, code & 0xff]));

const utf8 = new TextDecoder('utf-8', { fatal: true });

// Feed raw socket bytes with push(); calls onText(string), onPing(buffer), onClose(), or onError(reason) once.
export class FrameReader {
  constructor({ onText, onPing, onClose, onError }) {
    this.buf = Buffer.alloc(0); this.dead = false;
    this.onText = onText; this.onPing = onPing || (() => {}); this.onClose = onClose || (() => {}); this.onError = onError;
  }
  fail(reason) { if (!this.dead) { this.dead = true; this.buf = Buffer.alloc(0); this.onError(reason); } }
  push(chunk) {
    if (this.dead) return;
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    if (this.buf.length > MAX_BUFFER) return this.fail('buffer');
    while (!this.dead && this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = b0 & 0x80, rsv = b0 & 0x70, op = b0 & 0x0f, masked = b1 & 0x80;
      let len = b1 & 0x7f, off = 2;
      if (rsv) return this.fail('rsv');
      if (!masked) return this.fail('unmasked');
      if (len === 127) return this.fail('length');
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      if (len > MAX_FRAME) return this.fail('length');
      if (!fin) return this.fail('fragment');
      if (this.buf.length < off + 4 + len) return;           // wait for the rest
      const mask = this.buf.subarray(off, off + 4);
      const data = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      if (op === 0x1) {
        let s; try { s = utf8.decode(data); } catch { return this.fail('utf8'); }
        this.onText(s);
      } else if (op === 0x9) { if (len > 125) return this.fail('control'); this.onPing(data); }
      else if (op === 0xa) { /* pong: ignore */ }
      else if (op === 0x8) { this.dead = true; this.onClose(); return; }
      else return this.fail('opcode');
    }
  }
}

// Build a masked client frame (tests and the local room check use it; browsers do this themselves).
export function clientFrame(opcode, payload, { fin = true, mask = true, len } = {}) {
  const p = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  const n = len ?? p.length;
  const head = n < 126 ? [((fin ? 0x80 : 0) | opcode), (mask ? 0x80 : 0) | n] : [((fin ? 0x80 : 0) | opcode), (mask ? 0x80 : 0) | 126, n >> 8, n & 0xff];
  if (!mask) return Buffer.concat([Buffer.from(head), p]);
  const key = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const body = Buffer.from(p.map((b, i) => b ^ key[i & 3]));
  return Buffer.concat([Buffer.from(head), key, body]);
}
