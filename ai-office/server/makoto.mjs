import { open } from 'node:fs/promises';
import { expand } from './collectors.mjs';

// A process-local cursor, never state: starting/replacing a file skips its existing contents.
// Raw lines live only in this closure, bounded to 256 KiB; no raw data/errors are returned or logged.
export function auditTail(file = '~/.claude/makoto_state/audit.jsonl') {
  let offset = null, identity = null, pending = Buffer.alloc(0), dropping = false, reading = false;
  const limit = 256 * 1024;
  async function read(baseline = false) {
    if (!file || reading) return [];
    reading = true;
    let handle;
    try {
      handle = await open(expand(file), 'r');
      const st = await handle.stat(), key = `${st.dev}:${st.ino}`;
      if (!st.isFile()) return [];
      if (baseline || offset === null || key !== identity || st.size < offset) {
        offset = st.size; identity = key; pending = Buffer.alloc(0); dropping = false; return [];
      }
      const bytes = Buffer.alloc(Math.min(limit, st.size - offset));
      const { bytesRead } = await handle.read(bytes, 0, bytes.length, offset);
      offset += bytesRead;
      const chunk = Buffer.concat([pending, bytes.subarray(0, bytesRead)]), blocks = [];
      let start = 0, end;
      while ((end = chunk.indexOf(10, start)) !== -1) {
        if (!dropping && end - start <= limit) {
          try {
            // Only these three fields cross the raw JSON boundary. findings is never inspected.
            const { ts, event, exit_code } = JSON.parse(chunk.subarray(start, end).toString('utf8'));
            if (exit_code === 2 && ['live.pre_tool_use', 'live.stop', 'live.subagent_stop'].includes(event) && typeof ts === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(ts) && Number.isFinite(Date.parse(ts))) blocks.push(Date.parse(ts));
          } catch { /* malformed raw input never becomes an error message */ }
        }
        dropping = false; start = end + 1;
      }
      pending = chunk.subarray(start);
      if (pending.length > limit || dropping) { pending = Buffer.alloc(0); dropping = true; }
      else pending = Buffer.from(pending);
      return blocks;
    } catch { return []; }
    finally { await handle?.close().catch(() => {}); reading = false; }
  }
  return { start: () => read(true), read: () => read() };
}
