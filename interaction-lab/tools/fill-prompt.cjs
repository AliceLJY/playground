// 按种子从 kinds.json 加权抽 N 种（不重复），把合同（SPEC.md「候选合同」一节）原样嵌进生成提示词。
// 抽中的清单另写 <OUT>/.plan.json，给 generate.sh 设 Done Gate 用。
const fs = require('fs'), path = require('path');

function rng(s) { let x = s >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
function pick(kinds, n, rand) {
  const pool = kinds.slice(), got = [];
  while (got.length < n && pool.length) {
    const total = pool.reduce((a, k) => a + (k.weight ?? 1), 0);
    let r = rand() * total, i = 0;
    for (; i < pool.length - 1; i++) { r -= pool[i].weight ?? 1; if (r < 0) break; }
    got.push(pool.splice(i, 1)[0]);
  }
  return got;
}
function contract(spec) {
  const m = spec.match(/## 候选合同[^\n]*\n([\s\S]*?)\n## /);
  if (!m) throw new Error('SPEC.md 里找不到「候选合同」一节');
  return m[1].trim();
}
module.exports = { pick, rng, contract };

if (require.main === module) {
  const [lab, out, seedArg, nArg] = process.argv.slice(2);
  const seed = Number(String(seedArg).replace(/\D/g, '')) || 1, n = Number(nArg) || 8;
  const kinds = JSON.parse(fs.readFileSync(path.join(lab, 'kinds.json'), 'utf8')).kinds;
  const chosen = pick(kinds, n, rng(seed));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, '.plan.json'), JSON.stringify(chosen.map((k) => ({ slug: k.kind, kind: k.kind })), null, 2));
  const tpl = fs.readFileSync(path.join(lab, 'generate-prompt.md'), 'utf8');
  process.stdout.write(tpl
    .replaceAll('{{OUT}}', out).replaceAll('{{N}}', String(chosen.length))
    .replace('{{KINDS}}', chosen.map((k, i) => `${i + 1}. \`${k.kind}\`：${k.hint}`).join('\n'))
    .replace('{{CONTRACT}}', contract(fs.readFileSync(path.join(lab, 'SPEC.md'), 'utf8'))));
}
