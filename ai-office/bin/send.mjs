import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const hardStop = setTimeout(() => process.exit(0), 5000);
try {
  const [kind, a, b, c] = process.argv.slice(2);
  if (!['report', 'notice'].includes(kind) || !a) process.exit(0);
  const token = (await readFile(path.join(os.homedir(), '.config/ai-office/token'), 'utf8')).trim();
  const body = kind === 'report' ? { id: a, status: b, summary: c || '' } : { text: a };
  await fetch(`http://127.0.0.1:3091/api/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(4500), redirect: 'error' });
} catch { /* The calling workflow must remain unaffected. */ }
clearTimeout(hardStop);
process.exit(0);
