import { readdir, readFile, stat, open } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
const exec = promisify(execFile);
export const expand = (p) => p?.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p;
export const sessionTime = value => typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN;

export function codexRunning(output) {
  return output.split('\n').some(line => {
    const m = line.trim().match(/^\d+\s+(\S+)(.*)$/);
    if (!m) return false;
    return /(?:^|\/)codex$/.test(m[1]) && !/app-server|mcp|login|ChatGPT\.app|cua_node|\.codex\/plugins\/cache/i.test(m[1] + m[2]);
  });
}

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'ESRCH' ? false : null; }
}

async function sessions(dir) {
  let entries;
  try { entries = (await readdir(dir)).filter(n => n.endsWith('.json')); }
  catch (e) { return e.code === 'ENOENT' ? { sessions: [] } : { error: true }; }
  if (entries.length > 2000) return { error: true };
  let uncertain = false;
  const found = [];
  for (const name of entries) {
    try {
      const file = path.join(dir, name);
      if ((await stat(file)).size > 65536) { uncertain = true; continue; }
      const data = JSON.parse(await readFile(file, 'utf8'));
      const isAlive = alive(data.pid);
      if (isAlive === null) uncertain = true;
      found.push({ alive: isAlive, status: data.status, at: Math.max(sessionTime(data.statusUpdatedAt) || 0, sessionTime(data.updatedAt) || 0) });
    } catch { uncertain = true; }
  }
  return { sessions: found, uncertain };
}

async function launchd(label) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(label || '')) return null;
  try {
    const { stdout } = await exec('/bin/launchctl', ['print', `gui/${process.getuid()}/${label}`], { timeout: 3000, maxBuffer: 2 * 1024 * 1024 });
    // launchctl can contain environment secrets: only this boolean leaves the function.
    return /^\s*pid = [1-9]\d*\s*$/m.test(stdout);
  } catch (e) {
    return /could not find service|service not found/i.test(e.stderr || '') ? false : null;
  }
}

export async function latestMtime(root, limit = 20000) {
  let count = 0, latest = 0;
  const pending = [root];
  while (pending.length) {
    const dir = pending.pop();
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (++count > limit) throw new Error('Scan limit exceeded');
      if (entry.name === '.git' || entry.isSymbolicLink()) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) pending.push(file);
      else if (entry.isFile()) latest = Math.max(latest, (await stat(file)).mtimeMs);
    }
  }
  return latest ? { mtime: latest } : { empty: true };
}

// Read only new complete lines; never retain message text. Cursor is private/persistent.
export async function etwinActivity(file, memory) {
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    const sameFile = memory.logIno === info.ino && memory.logOffset <= info.size;
    if (!sameFile) return { activity: false, memory: { logIno: info.ino, logOffset: info.size } };
    const length = info.size - memory.logOffset;
    if (length > 1024 * 1024) throw new Error('Log gap too large');
    const bytes = Buffer.alloc(length);
    await handle.read(bytes, 0, length, memory.logOffset);
    const end = bytes.lastIndexOf(10);
    if (end < 0) return { activity: false, memory: {} };
    const lines = bytes.subarray(0, end + 1).toString('utf8').split('\n');
    const count = lines.filter(l => /^\[bot\] (?:bot → |distill 完成:)/u.test(l)).length;
    return { activity: count > 0, memory: { logIno: info.ino, logOffset: memory.logOffset + end + 1, activityCount: (memory.activityCount || 0) + count } };
  } finally { await handle.close(); }
}

export async function collect(source, previous = {}) {
  try {
    switch (source.type) {
      case 'push': case 'courier': return {};
      case 'cc': return await sessions(expand(source.directory));
      case 'codex': return { running: codexRunning((await exec('/bin/ps', ['-axo', 'pid,args'], { timeout: 3000, maxBuffer: 8 * 1024 * 1024 })).stdout) };
      case 'launchd': case 'etwin': {
        const running = await launchd(source.label);
        if (running !== true) return { running };
        const file = expand(source.log);
        const mtime = (await stat(file)).mtimeMs;
        if (source.type === 'etwin') return { running, mtime, ...await etwinActivity(file, previous.memory || {}) };
        return { running, mtime };
      }
      case 'artifacts': return await latestMtime(expand(source.directory));
      default: return { error: true };
    }
  } catch { return { error: true }; }
}
