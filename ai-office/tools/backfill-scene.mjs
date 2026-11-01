// One-off: count the meetings, hand-offs and phone calls that happened before the office could see them, from the raw
// Claude Code session records (tool calls are only in the raw jsonl, not in the Deja index). Reads lines on stdin
// (`rg --no-filename` over the session folders, prefiltered on the wrapper and skill names), writes only totals.
//
//   rg --no-filename --no-messages -g '*.jsonl' -e '<pattern>' <dirs> | node tools/backfill-scene.mjs > backfill.json
//
// Counted the way the live office counts, as closely as a record allows:
//   hand-off  one wrapper call (codex-run.sh, kimi-run.sh, agy-gui-run.sh, grok-clean.sh, muse-vm.py ask); dry runs and help skipped
//   meeting   a mutual-review run (the Skill, once per session per three hours), or, outside one, wrapper calls in the
//             same session to two or more engines with gaps under ten minutes (a huddle)
//   call      a consult-gpt run: the Skill, or its SKILL.md read and chatgpt.com opened within two hours (once per session per hour)
// The same call shows up in several copies of a session (hot tree, cold archive, hard links): tool_use ids dedupe it.
import readline from 'node:readline';
import { DISPATCH } from '../server/scene.mjs';

const seen = new Set(), calls = [], skills = [], reads = [], chatgpt = [];
const wrapperOf = (segment) => {
  const words = segment.trim().replace(/^(?:[A-Z_][A-Z0-9_]*=\S*\s+)+/, '').split(/\s+/);
  for (let k = 0; k < Math.min(words.length, 4); k++) {
    const w = words[k].replace(/^["']|["']$/g, '');
    if (k === 0 && /^(?:cat|sed|grep|rg|head|tail|less|bat|wc|ls|echo|vim?|nano|code|open|git|stat|file|cp|mv|chmod|diff)$/.test(w)) return null;
    if (w.startsWith('-')) continue;
    const id = DISPATCH[w.slice(w.lastIndexOf('/') + 1)];
    if (!id) { if (k === 0 && !/^(?:bash|sh|zsh|python3?|env|nohup|time|exec|command)$/.test(w.slice(w.lastIndexOf('/') + 1))) return null; continue; }
    const rest = words.slice(k + 1);
    if (rest.some(a => a === '-h' || a === '--help' || a === '-n')) return null;
    if (id === 'muse' && rest[0] !== 'ask') return null;
    return id;
  }
  return null;
};

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.includes('"tool_use"')) continue;
  let d; try { d = JSON.parse(line); } catch { continue; }
  if (d.type !== 'assistant' || !Array.isArray(d.message?.content)) continue;
  const at = Date.parse(d.timestamp), session = d.sessionId || '';
  if (!Number.isFinite(at)) continue;
  for (const c of d.message.content) {
    if (c?.type !== 'tool_use' || !c.id || seen.has(c.id)) continue;
    if (c.name === 'Bash' && typeof c.input?.command === 'string') {
      const engines = c.input.command.split(/&&|\|\||;|\n|\|/).map(wrapperOf).filter(Boolean);
      if (engines.length) { seen.add(c.id); for (const e of engines) calls.push({ at, session, engine: e }); }
    } else if (c.name === 'Skill' && ['mutual-review', 'consult-gpt'].includes(c.input?.skill)) {
      seen.add(c.id); skills.push({ at, session, skill: c.input.skill });
    } else if (c.name === 'Read' && /consult-gpt\/SKILL\.md$/.test(c.input?.file_path || '')) {
      // consult-gpt is mostly loaded by reading its SKILL.md; it counts as a call only if the page was then opened.
      seen.add(c.id); reads.push({ at, session });
    } else if (/chatgpt\.com/.test(JSON.stringify(c.input || {}))) {
      seen.add(c.id); chatgpt.push({ at, session });
    }
  }
}

const H = 3_600_000, M = 60_000;
function once(list, window) {
  // Re-invocations in the same session (a compaction, a second look) within the window are the same run.
  const out = [], last = new Map();
  for (const x of [...list].sort((a, b) => a.at - b.at)) {
    const prev = last.get(x.session);
    if (prev === undefined || x.at - prev > window) { out.push(x); last.set(x.session, x.at); }
  }
  return out;
}
const reviews = once(skills.filter(s => s.skill === 'mutual-review'), 3 * H);
const phone = once([...skills.filter(s => s.skill === 'consult-gpt'), ...reads.filter(r => chatgpt.some(c => c.session === r.session && c.at >= r.at && c.at - r.at < 2 * H))], H);
const huddles = [];
const bySession = new Map();
for (const c of calls) { if (!bySession.has(c.session)) bySession.set(c.session, []); bySession.get(c.session).push(c); }
for (const [session, list] of bySession) {
  list.sort((a, b) => a.at - b.at);
  let group = [];
  const close = () => {
    if (new Set(group.map(g => g.engine)).size >= 2) {
      const start = group[0].at, end = group.at(-1).at;
      if (!reviews.some(r => r.session === session && r.at >= start - 3 * H && r.at <= end + 10 * M)) huddles.push({ at: start, session });
    }
    group = [];
  };
  for (const c of list) { if (group.length && c.at - group.at(-1).at > 10 * M) close(); group.push(c); }
  close();
}
const day = ms => new Date(ms + 8 * H).toISOString().slice(0, 10);
const all = [...calls, ...skills].map(x => x.at);
const byEngine = {};
for (const c of calls) byEngine[c.engine] = (byEngine[c.engine] || 0) + 1;
process.stdout.write(JSON.stringify({
  version: 1, source: 'claude session records (hot + cold)', scannedAt: new Date().toISOString(),
  since: all.length ? day(Math.min(...all)) : null, through: all.length ? new Date(Math.max(...all)).toISOString() : null,
  handoffsTotal: calls.length, byEngine, meetingsTotal: reviews.length + huddles.length, reviews: reviews.length, huddles: huddles.length,
  callsTotal: phone.length, firstReview: reviews.length ? day(reviews[0].at) : null
}, null, 1) + '\n');
