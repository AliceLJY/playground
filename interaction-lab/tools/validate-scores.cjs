// 判官输出校验：每一分都要有出处，原话引用要逐字出现在那一行原话里，检查项要真实存在；
// 同一行原话一轮最多引两次（第一轮判官把一句「很心动」当万能加分引了 5 次）；
// 留下 2–3 个且自动检查全过，意外项恰好 1 个、种类和留下的都不同；判官不能是生成者。
// 用法：node tools/validate-scores.cjs <轮目录>   （读 scores.json、ledger-rows.json、各候选 checks.json）
const fs = require('fs'), path = require('path');

const norm = (s) => String(s).replace(/[\s「」“”"'，。,.!！?？~～…、；;：:（）()]/g, '');

function validate(scores, rows, checksBySlug, { minQuote = 4, maxSameRow = 2 } = {}) {
  const errs = [], byId = new Map([...rows.taste, ...rows.craft].map((r) => [r.id, r]));
  if (!scores || !Array.isArray(scores.candidates)) return ['scores.json 缺 candidates 数组'];
  if (!scores.judge || /codex/i.test(scores.judge)) errs.push(`判官是「${scores.judge}」：不能缺，也不能是生成者 codex`);
  const seen = new Set();
  for (const c of scores.candidates) {
    const ck = checksBySlug[c.slug];
    if (!ck) { errs.push(`${c.slug}：没有这个候选`); continue; }
    seen.add(c.slug);
    if (!Array.isArray(c.items) || !c.items.length) { errs.push(`${c.slug}：没有任何打分条目`); continue; }
    let sum = 0;
    c.items.forEach((it, i) => {
      const at = `${c.slug} 第${i + 1}条`;
      if (!Number.isInteger(it.delta) || Math.abs(it.delta) > 3) errs.push(`${at}：delta 要是 -3..3 的整数`);
      sum += Number(it.delta) || 0;
      const cite = it.cite || {};
      if (cite.check) {
        if (!ck.checks[cite.check]) errs.push(`${at}：检查项 ${cite.check} 不存在`);
      } else if (cite.id) {
        const row = byId.get(cite.id);
        if (!row) errs.push(`${at}：原话行 ${cite.id} 不存在`);
        else if (norm(cite.quote).length < minQuote) errs.push(`${at}：引用太短（去掉标点不足 ${minQuote} 字）`);
        else if (!norm(row.quote).includes(norm(cite.quote))) errs.push(`${at}：引用「${cite.quote}」不在 ${cite.id} 的原话里`);
      } else errs.push(`${at}：没有出处`);
    });
    if (Number(c.total) !== sum) errs.push(`${c.slug}：total=${c.total}，但各条相加是 ${sum}`);
    const failed = Object.entries(ck.checks).filter(([, v]) => !v.pass).map(([k]) => k);
    for (const k of failed) if (!c.items.some((it) => it.cite && it.cite.check === k && it.delta < 0)) errs.push(`${c.slug}：${k} 没过，但没有对应的扣分`);
  }
  const uses = {};
  for (const c of scores.candidates) for (const it of c.items || []) if (it.cite && it.cite.id) uses[it.cite.id] = (uses[it.cite.id] || 0) + 1;
  for (const [id, n] of Object.entries(uses)) if (n > maxSameRow) errs.push(`${id} 被引用了 ${n} 次（一轮最多 ${maxSameRow} 次，同一句话不能当万能加分）`);
  for (const s of Object.keys(checksBySlug)) if (!seen.has(s)) errs.push(`${s}：判官漏打了`);
  const keep = scores.keep || [];
  if (keep.length < 2 || keep.length > 3) errs.push(`留下 ${keep.length} 个，要 2–3 个`);
  for (const s of keep) if (checksBySlug[s] && !checksBySlug[s].allPass) errs.push(`留下的 ${s} 自动检查没全过`);
  const sur = scores.surprise;
  if (!sur || !checksBySlug[sur]) errs.push('意外项缺失或不是候选之一');
  else {
    if (keep.includes(sur)) errs.push('意外项不能同时是留下项');
    const kinds = new Set(keep.map((s) => checksBySlug[s] && checksBySlug[s].params && checksBySlug[s].params.kind));
    if (kinds.has(checksBySlug[sur].params && checksBySlug[sur].params.kind)) errs.push('意外项的种类和留下的重复了');
    if (!scores.surpriseWhy) errs.push('意外项没写理由');
  }
  for (const c of scores.candidates) {
    const want = keep.includes(c.slug) ? 'keep' : c.slug === sur ? 'surprise' : 'drop';
    if (c.verdict !== want) errs.push(`${c.slug}：verdict=${c.verdict}，和 keep/surprise 列表对不上（应为 ${want}）`);
  }
  return errs;
}

module.exports = { validate, norm };

if (require.main === module) {
  const round = process.argv[2];
  if (!round) { console.error('用法: node tools/validate-scores.cjs <轮目录>'); process.exit(2); }
  const cand = path.join(round, 'candidates');
  const checksBySlug = {};
  for (const s of fs.readdirSync(cand)) {
    const f = path.join(cand, s, 'checks.json');
    if (fs.existsSync(f)) checksBySlug[s] = JSON.parse(fs.readFileSync(f, 'utf8'));
  }
  let scores;
  try { scores = JSON.parse(fs.readFileSync(path.join(round, 'scores.json'), 'utf8')); }
  catch (e) { console.error('scores.json 读不了或不是合法 JSON：' + e.message); process.exit(1); }
  const rows = JSON.parse(fs.readFileSync(path.join(round, 'ledger-rows.json'), 'utf8'));
  const errs = validate(scores, rows, checksBySlug);
  if (errs.length) { console.error(`校验没过（${errs.length} 处）：\n- ` + errs.join('\n- ')); process.exit(1); }
  console.log(`校验通过：${scores.candidates.length} 个候选、${scores.candidates.reduce((a, c) => a + c.items.length, 0)} 条打分全部有出处；留下 ${scores.keep.join('、')}，意外项 ${scores.surprise}`);
}
