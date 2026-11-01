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
    // `codex` from a terminal, codex-run.sh or `codex exec` all count. The shim at ~/.local/bin/codex execs the binary
    // inside ChatGPT.app, so the bundle path is not a reason to skip; the app's own background helpers (app-server,
    // exec-server, mcp, login, computer-use) are.
    return /(?:^|\/)codex$/.test(m[1]) && !/(?:^|\s)(?:app-server|exec-server|mcp(?:-server)?|login)(?:\s|$)|cua_node|\.codex\/plugins\/cache/i.test(m[2]);
  });
}

// How many interactive runs of a CLI are alive right now, whatever started them (Alice in a terminal, CC through a
// wrapper, a TG bridge): the first token's basename is one of `names`; the CLI's own helper modes are not runs.
export function processCount(output, names) {
  const wanted = new Set(names || []);
  if (!wanted.size) return 0;
  return output.split('\n').filter(line => {
    const m = line.trim().match(/^\d+\s+(\S+)(.*)$/);
    if (!m) return false;
    const base = m[1].slice(m[1].lastIndexOf('/') + 1);
    return wanted.has(base) && !/(?:^|\s)(?:app-server|exec-server|mcp(?:-server)?|login|--version|-v)(?:\s|$)/i.test(m[2]);
  }).length;
}

const ps = async () => (await exec('/bin/ps', ['-axo', 'pid,args'], { timeout: 3000, maxBuffer: 8 * 1024 * 1024 })).stdout;

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

// Status slips other bots write for us (one-line JSON per bot: {status, task, at}); pulled by a mirror,
// so they lag. Only the three words a bot may write are kept; `task` never leaves the collector.
// `awakeFile` is the puller's one-page status note; its last-attempt line says whether the box answered ssh.
export async function boxAsleep(file) {
  if (!file) return undefined;
  try {
    if ((await stat(file)).size > 4096) return undefined;
    const line = (await readFile(file, 'utf8')).split('\n').find(l => l.startsWith('上次尝试：'));
    return line ? /休眠|没连上/.test(line) : undefined;
  } catch { return undefined; }
}

export async function statusFiles(dir, fallbackDir, awakeFile) {
  const fallback = fallbackDir ? await latestMtime(fallbackDir).catch(() => ({ error: true })) : { empty: true };
  const asleep = await boxAsleep(awakeFile);
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch (e) { if (e.code !== 'ENOENT') throw e; return { slips: [], fallback, asleep }; }
  const slips = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith('.json') || entry.name.startsWith('.')) continue;
    const file = path.join(dir, entry.name);
    try {
      const info = await stat(file);
      if (info.size > 4096) continue;
      const data = JSON.parse(await readFile(file, 'utf8'));
      if (!data || typeof data !== 'object' || !['busy', 'waiting', 'done'].includes(data.status)) continue;
      const at = sessionTime(data.at);
      slips.push({ status: data.status, at: Number.isFinite(at) ? at : info.mtimeMs });
    } catch { /* a half-written or odd slip is skipped, never fatal */ }
  }
  return { slips, fallback, asleep };
}

// A folder on a TCC-protected volume (a removable disk) can be stat'ed but never listed from launchd: listing hangs
// in open() for good. So for those, read only the folder's own mtime and that of its day subfolders (Beijing dates,
// today and yesterday), which change when a file lands in them. Nothing is enumerated.
export const beijingDate = (ms) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);
export async function statOnlyMtime(root, now = Date.now()) {
  const targets = [root, path.join(root, beijingDate(now)), path.join(root, beijingDate(now - 86_400_000))];
  let latest = 0, seen = false;
  for (const t of targets) {
    try { const info = await stat(t); if (!info.isDirectory()) continue; seen = true; if (t !== root) latest = Math.max(latest, info.mtimeMs); }
    catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') continue; throw e; }
  }
  if (!seen) throw new Error('missing');
  return latest ? { mtime: latest } : { empty: true };
}

// Newest mtime among rollout-*.jsonl in today's and yesterday's day folders (UTC dates, as Codex names them, plus the
// Beijing date in case the folder is named by local time); the folders are small, nothing is opened.
export async function latestRollout(root, now = Date.now()) {
  const days = new Set();
  for (const ms of [now, now - 86_400_000]) {
    days.add(new Date(ms).toISOString().slice(0, 10));
    days.add(beijingDate(ms));
  }
  let latest = 0;
  for (const day of days) {
    const dir = path.join(root, ...day.split('-'));
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch (e) { if (e.code === 'ENOENT' || e.code === 'ENOTDIR') continue; throw e; }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.startsWith('rollout-') || !entry.name.endsWith('.jsonl')) continue;
      latest = Math.max(latest, (await stat(path.join(dir, entry.name))).mtimeMs);
    }
  }
  return latest ? { rolloutMtime: latest } : {};
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
    // Work starts when the bot asks the model on her behalf (a reply, a distill). Its own self-loop wake-ups, where it
    // asks whether to say anything and usually stays silent, are not a conversation and do not count.
    const started = lines.filter(l => /^\[claude\] query kind=(?:reactive|distill)\b/u.test(l)).length;
    return { activity: count > 0, started: started > 0, memory: { logIno: info.ino, logOffset: memory.logOffset + end + 1, activityCount: (memory.activityCount || 0) + count } };
  } finally { await handle.close(); }
}

export async function collect(source, previous = {}) {
  try {
    switch (source.type) {
      case 'push': case 'courier': return {};
      case 'cc': return await sessions(expand(source.directory));
      case 'codex': {
        const running = codexRunning(await ps());
        // The Codex app and the CLI both append the open thread's rollout under CODEX_HOME/sessions/<y>/<m>/<d>/; a rollout
        // written in the last minutes is a turn in progress whatever window it came from. Only the two newest day folders are read.
        const rollouts = await latestRollout(expand(source.sessions || '~/.codex/sessions'));
        return { running, ...rollouts };
      }
      case 'launchd': case 'etwin': {
        // Several instances behind one desk (two TG bridges of the same engine): at work if any is, off only if all are.
        const instances = source.instances || [{ label: source.label, log: source.log }];
        // The same engine has several forms (a TG bridge, Alice's terminal, a CC wrapper); one desk shows all of them.
        const processes = source.processes?.length ? { processes: processCount(await ps(), source.processes) } : {};
        const seen = [];
        for (const inst of instances) {
          const running = await launchd(inst.label);
          if (running !== true) { seen.push({ running }); continue; }
          const file = expand(inst.log);
          seen.push({ running, mtime: (await stat(file)).mtimeMs, file });
        }
        const up = seen.filter(x => x.running === true);
        if (!up.length) return { running: seen.every(x => x.running === false) ? false : undefined, ...processes };
        const best = up.reduce((a, b) => (b.mtime > a.mtime ? b : a));
        if (source.type === 'etwin') return { running: true, mtime: best.mtime, ...await etwinActivity(best.file, previous.memory || {}) };
        return { running: true, mtime: best.mtime, ...processes };
      }
      case 'artifacts': {
        // One desk may watch several drop points (a media folder on the removable disk, a chat snapshot folder on the
        // internal one); the newest arrival anywhere counts. A missing optional folder is skipped, not an error.
        const spots = source.directories || [{ path: source.directory, statOnly: source.statOnly }];
        let latest = 0, seen = false;
        for (const spot of spots) {
          try {
            const r = spot.statOnly ? await statOnlyMtime(expand(spot.path)) : await latestMtime(expand(spot.path));
            seen = true; if (r.mtime) latest = Math.max(latest, r.mtime);
          } catch (e) { if (!(spot.optional && (e.code === 'ENOENT' || e.message === 'missing'))) throw e; }
        }
        if (!seen) throw new Error('missing');
        return latest ? { mtime: latest } : { empty: true };
      }
      case 'statusfiles': {
        // The same engine also runs as a local CLI (Grok CLI next to Grok Bot); a live run counts at the same desk.
        const r = await statusFiles(expand(source.directory), source.fallbackDirectory ? expand(source.fallbackDirectory) : null, source.awakeFile ? expand(source.awakeFile) : null);
        if (source.processes?.length) r.processes = processCount(await ps(), source.processes);
        return r;
      }
      default: return { error: true };
    }
  } catch { return { error: true }; }
}
