import { readdir, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import Core from '../office-core.js';
import { expand } from './collectors.mjs';

export function historyReader(directory, roster) {
  const cache = new Map(), limit = 2 * 1024 * 1024;
  async function read(day) {
    let file;
    try {
      file = await open(path.join(expand(directory), day + '.json'), constants.O_RDONLY | constants.O_NOFOLLOW);
      const st = await file.stat(), key = `${st.ino}:${st.mtimeMs}:${st.ctimeMs}:${st.size}`;
      if (!st.isFile() || st.size > limit) return null;
      if (cache.get(day)?.key === key) return cache.get(day).value;
      // Bounded read even if a writer grows the file between stat and read.
      const buffer = Buffer.alloc(limit + 1);
      let size = 0;
      while (size < buffer.length) {
        const { bytesRead } = await file.read(buffer, size, buffer.length - size, size);
        if (!bytesRead) break;
        size += bytesRead;
      }
      let value = null;
      try { if (size <= limit) value = Core.validateHistory(JSON.parse(buffer.subarray(0, size).toString('utf8')), roster, day); } catch { /* fail closed, never return/log raw content */ }
      cache.set(day, { key, value });
      // Keep bad-file results too; bounded cache, older entries are revalidated if revisited.
      if (cache.size > 64) cache.delete(cache.keys().next().value);
      return value;
    } catch { return null; }
    finally { await file?.close().catch(() => {}); }
  }
  async function list() {
    let names;
    try { names = await readdir(expand(directory), { withFileTypes: true }); } catch { return []; }
    const days = [];
    for (const day of names.filter(f => f.isFile() && /^\d{4}-\d{2}-\d{2}\.json$/.test(f.name)).map(f => f.name.slice(0, -5)).filter(Core.validDay).sort().reverse()) {
      const value = await read(day);
      if (value) days.push({ day, events: value.events.length, timeline: value.timeline.length });
      if (days.length === 14) break;
    }
    for (const day of cache.keys()) if (!names.some(f => f.name === day + '.json')) cache.delete(day);
    return days;
  }
  async function get(day, guest = false) {
    if (!Core.validDay(day) || !(await list()).some(d => d.day === day)) return null;
    const value = await read(day);
    if (!value) return null;
    const copy = structuredClone(value);
    if (guest) for (const entry of [...copy.events, ...copy.timeline]) entry.at = new Date(Math.floor(Date.parse(entry.at) / 60000) * 60000).toISOString();
    return copy;
  }
  return { list, get };
}
