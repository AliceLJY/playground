// 判官输入：把两份账的表格行编号（审美账 T-n、制作意见账 N-n），只留「日期、片子、原话、层」四列——
// 「我读出的倾向」是记账人的推断、作者没认过，不给判官；再附每个候选的参数、自动检查、源码与联系表路径。
// 用法：node tools/judge-brief.cjs <轮目录> <审美账.md> <制作意见账.md> [以往留下的 history.json] > <轮目录>/judge-brief.md
const fs = require('fs'), path = require('path');

// 解析 markdown 表格：只认第一张以「| 日期 |」开头的表，返回 [{ id, date, piece, quote, layer }]
function parseLedger(md, prefix) {
  const rows = [];
  let inTable = false, n = 0;
  for (const line of md.split('\n')) {
    if (/^\|\s*日期\s*\|/.test(line)) { inTable = true; continue; }
    if (!inTable) continue;
    if (!line.startsWith('|')) { if (rows.length) break; continue; }
    if (/^\|\s*-/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 4) continue;
    rows.push({ id: `${prefix}-${++n}`, date: cells[0], piece: cells[1], quote: cells[2], layer: cells[3] });
  }
  return rows;
}

function brief({ round, taste, craft, history }) {
  const cand = path.join(round, 'candidates');
  const slugs = fs.readdirSync(cand).filter((s) => fs.existsSync(path.join(cand, s, 'checks.json'))).sort();
  const out = [];
  out.push(`# 交互实验室判官任务

你是判官，不是生成者。只读：除了最后写 \`${path.join(round, 'scores.json')}\` 这一个文件，什么都不要改。

下面有 ${slugs.length} 个候选小交互。每个都请你：打开它的联系表图片（12 格，从左到右、从上到下每格间隔约 0.27 秒，覆盖 3 秒演示）和首帧截图看画面，读它的 index.html 看手势和参数，再看自动检查结果。然后按下面的判据打分。

## 判据（只能用这些，不许用你自己的审美偏好）

1. **作者的原话**：下面两张表里「原话」那一列，是作者看片子、看样子时亲口说的评价。审美账（T-）是具体感受，制作意见账（N-）是她挑过的毛病，当扣分项用。这些话多数是对视频说的，套到小交互上要讲清对应关系（比如「宁快勿慢」对应弹簧落定的时长）；对应不上就别硬套。
2. **自动检查**（C1–C10，含义见每个候选的 checks.json）：没过的项每项必须扣分；任何一项没过的候选不能进「留下」。

每一个加分或扣分都必须带出处：要么 \`{"id": "T-5", "quote": "<从那一行原话里逐字摘一段，至少 4 个字>"}\`，要么 \`{"check": "C8-response"}\`。没有出处的分会被校验脚本作废；摘的字和原话对不上也作废。**同一行原话（同一个 T-/N- 编号）一轮最多引用两次**——一句好话不能当万能加分，要找跟这个交互最贴切的那一行；找不到贴切的就别加分。制作意见账（N-）和画面上的硬伤（字太小、主体太偏、重点不够大不够亮）同样要看，有就扣。

## 要你给出的

- 每个候选：若干条加减分（delta 为 -3 到 +3 的整数）、总分、verdict（keep / surprise / drop）。
- 「留下」2–3 个：总分最高且自动检查全过的。
- 「意外项」恰好 1 个：总分中等、但弹法和「留下」的那几个、以及以往留下的都明显不一样（种类不同，手感也不同）——它的作用是防止越筛越窄，不是安慰奖。写一句为什么选它。
- 宁可留得少也别把难看的放进来：两个都不够好就只留 2 个。

## 输出格式（写进 scores.json，合法 JSON，不要别的文字）

\`\`\`json
{
  "judge": "kimi",
  "candidates": [
    { "slug": "...", "items": [ { "delta": 2, "why": "落地挤压再弹两下，对上「落地挤压的弹跳」那种心动", "cite": { "id": "T-3", "quote": "超级无敌好，很心动" } },
                                { "delta": -1, "why": "...", "cite": { "check": "C9-settle" } } ],
      "total": 1, "verdict": "keep" }
  ],
  "keep": ["..."],
  "surprise": "...",
  "surpriseWhy": "..."
}
\`\`\`
`);
  if (history && history.length) {
    out.push('## 以往留下的（意外项要和这些不一样）\n');
    for (const h of history) out.push(`- ${h.round}：${h.slug}（${h.kind}，${JSON.stringify(h.spring || h.easing || {})}）`);
    out.push('');
  }
  const table = (rows, title) => {
    out.push(`## ${title}\n\n| id | 日期 | 片子 | 原话 | 层 |\n|---|---|---|---|---|`);
    for (const r of rows) out.push(`| ${r.id} | ${r.date} | ${r.piece} | ${r.quote} | ${r.layer} |`);
    out.push('');
  };
  table(taste, '审美账（作者原话）');
  table(craft, '制作意见账（作者原话，当扣分项）');
  out.push('## 候选\n');
  for (const s of slugs) {
    const r = JSON.parse(fs.readFileSync(path.join(cand, s, 'checks.json'), 'utf8'));
    out.push(`### ${s}\n`);
    out.push(`- 源码：\`${path.join(cand, s, 'index.html')}\``);
    out.push(`- 联系表：\`${path.join(cand, s, 'contact.png')}\`；首帧：\`${path.join(cand, s, 'shot.png')}\``);
    out.push(`- 参数：\`${JSON.stringify(r.params)}\``);
    out.push(`- 演示手势：\`${JSON.stringify(r.demo)}\``);
    out.push(`- 自动检查：${r.allPass ? '全过' : '有未过项'}`);
    for (const [k, v] of Object.entries(r.checks)) out.push(`  - ${v.pass ? '过' : '**未过**'} ${k}：${v.detail}`);
    out.push('');
  }
  return out.join('\n');
}

module.exports = { parseLedger, brief };

if (require.main === module) {
  const [round, tastePath, craftPath, histPath] = process.argv.slice(2);
  if (!round || !tastePath || !craftPath) { console.error('用法: node tools/judge-brief.cjs <轮目录> <审美账.md> <制作意见账.md> [history.json]'); process.exit(2); }
  const taste = parseLedger(fs.readFileSync(tastePath, 'utf8'), 'T');
  const craft = parseLedger(fs.readFileSync(craftPath, 'utf8'), 'N');
  const history = histPath && fs.existsSync(histPath) ? JSON.parse(fs.readFileSync(histPath, 'utf8')) : [];
  fs.writeFileSync(path.join(round, 'ledger-rows.json'), JSON.stringify({ taste, craft }, null, 2));
  process.stdout.write(brief({ round: path.resolve(round), taste, craft, history }));
}
