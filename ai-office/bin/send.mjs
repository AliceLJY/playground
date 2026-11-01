import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const hardStop = setTimeout(() => process.exit(0), 5000);
try {
  const [kind, a, b, c, d, e] = process.argv.slice(2);
  if (!['report', 'notice', 'meeting', 'call'].includes(kind) || !a) process.exit(0);
  const token = (await readFile(path.join(os.homedir(), '.config/ai-office/token'), 'utf8')).trim();
  // meeting <start|round|end> [round] [adopted] [rejected] [open]; call <start|end>
  const n = v => v === undefined || v === '' ? undefined : Number(v);
  const body = kind === 'report' ? { id: a, status: b, summary: c || '' } : kind === 'meeting' ? { state: a, round: n(b), adopted: n(c), rejected: n(d), open: n(e) } : kind === 'call' ? { state: a } : { text: a };
  await fetch(`http://127.0.0.1:3091/api/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(4500), redirect: 'error' });
} catch { /* The calling workflow must remain unaffected. */ }
clearTimeout(hardStop);
process.exit(0);
