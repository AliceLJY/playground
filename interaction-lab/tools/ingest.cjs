// 入库段：把一轮里判官「留下」的候选写进弹药库分组目录，每种交互一个子目录：
// index.html（可直接打开的单文件）、preview.gif、params.json（参数、演示手势、对上的原话与出处）、README.md。
// 同一种交互已经在库里的，只有新一版判官总分严格更高才替换；意外项不入库，只记进 history.json 给下一轮判官对照。
// 最后重写分组 README 的条目表。不碰 git：提交由调用方（weekly.sh）做。
// 用法：node tools/ingest.cjs <轮目录> <媒体目录> <弹药库分组目录> [轮名]
//   轮目录里要有 scores.json（已过 validate-scores）、ledger-rows.json、candidates/<slug>/{index.html,checks.json}；
//   媒体目录里要有 <slug>.gif。
const fs = require('fs'), path = require('path');

const zeta = (sp) => (sp && sp.k ? sp.c / (2 * Math.sqrt(sp.k)) : null);

function quotesFor(cand, rows) {
  const byId = new Map([...rows.taste, ...rows.craft].map((r) => [r.id, r]));
  return cand.items.filter((it) => it.cite && it.cite.id && it.delta > 0).map((it) => {
    const r = byId.get(it.cite.id) || {};
    return { date: r.date, piece: r.piece, quote: it.cite.quote, why: it.why, delta: it.delta };
  });
}

function entryReadme(p) {
  const sp = p.spring ? `k ${p.spring.k}、c ${p.spring.c}，阻尼比 ${zeta(p.spring).toFixed(2)}` : (p.easing || '—');
  return `# ${p.name}

${p.oneLine || ''}

![预览](preview.gif)

- 种类：\`${p.slug}\`；弹簧：${sp}（积分照 playground \`memory-fade/src/core.js\` 的 \`springStep\`，固定 1/240 秒步长）
- 反馈层：${(p.feedbackLayers || []).join(' → ') || '—'}
- 收录：${p.source.round}（${p.source.date}），判官 ${p.source.judge} 总分 ${p.source.total}，自动检查十项全过
- 未在真机上试过手感；预览是 390×664 手机视口、假时钟逐帧录的 3 秒。

## 为什么留下（判官引的作者原话）

${p.quotes.map((q) => `- ${q.date}《${q.piece}》：「${q.quote}」——${q.why}`).join('\n') || '- （无）'}

## 怎么用

\`index.html\` 是零依赖单文件，直接打开就能玩。搬进别的作品时取三样：\`springStep\` 函数、\`#lab-params\` 里的弹簧参数、事件处理里「按下改 target、松手改回」那几行；动画只走 requestAnimationFrame，录片时跟页面时钟走。参数和演示手势在 \`params.json\`。
`;
}

function groupReadme(entries) {
  const rows = entries.map((p) => `| [${p.name}](${p.slug}/README.md) | \`${p.slug}\` | ${p.oneLine || ''} | ${p.spring ? `${p.spring.k} / ${p.spring.c} / ${zeta(p.spring).toFixed(2)}` : '—'} | ${p.quotes.map((q) => `「${q.quote}」`).join(' ') || '—'} | ${p.source.date} |`);
  return `# 交互实验室：弹簧小交互

由 playground \`interaction-lab/\` 自动生成和筛选：Codex 每轮生成 8 个带弹簧手感的小交互，脚本录 3 秒、做十项自动检查（按下 100 毫秒内有反应、动完落稳、点击区 ≥44 像素、零外部请求等），再由另一个 AI 只拿作者说过的原话当判据打分，留下的收在这里。2026-11-03 两轮手动试跑后开始每周自动跑一次。

**取用**：做网页、小游戏、视频里要一个「按下去有弹性」的按钮、卡片、开关时，先在下表挑手感，再打开对应目录的 \`index.html\` 看，搬代码照该条 README 的「怎么用」。每条都没在真机上试过手感。

**判据的边界**：判官只会挑「像作者说过的话」的东西，不等于作者此刻的口味。作者看了随口评价一条，照审美账规矩记一行，下一轮判官就用上。每轮另留的「意外项」不入库，记在 \`history.json\` 里给下一轮判官对照，防止越筛越窄。

| 交互 | 种类 | 一句话 | 弹簧 k / c / 阻尼比 | 对上的原话 | 收录 |
|---|---|---|---|---|---|
${rows.join('\n')}

本表由入库脚本重写，别手改；要改某一条的说明，改它自己目录里的 README。
`;
}

function ingest({ round, media, group, roundName, date }) {
  const scores = JSON.parse(fs.readFileSync(path.join(round, 'scores.json'), 'utf8'));
  const rows = JSON.parse(fs.readFileSync(path.join(round, 'ledger-rows.json'), 'utf8'));
  fs.mkdirSync(group, { recursive: true });
  const log = [];
  for (const slug of scores.keep) {
    const cand = scores.candidates.find((c) => c.slug === slug);
    const ck = JSON.parse(fs.readFileSync(path.join(round, 'candidates', slug, 'checks.json'), 'utf8'));
    if (!ck.allPass) { log.push(`${slug}：自动检查没全过，不入库`); continue; }
    const dir = path.join(group, slug), metaPath = path.join(dir, 'params.json');
    if (fs.existsSync(metaPath)) {
      const old = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (!(cand.total > old.source.total)) { log.push(`${slug}：库里已有 ${old.source.round} 版（${old.source.total} 分），这版 ${cand.total} 分不更高，不替换`); continue; }
    }
    const gif = path.join(media, `${slug}.gif`);
    if (!fs.existsSync(gif)) throw new Error(`${slug}：缺预览 ${gif}`);
    const p = { slug, name: ck.params.name, oneLine: ck.params.oneLine, spring: ck.params.spring, easing: ck.params.easing,
      feedbackLayers: ck.params.feedbackLayers, demo: ck.demo, quotes: quotesFor(cand, rows),
      source: { round: roundName, date, judge: scores.judge, total: cand.total } };
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(round, 'candidates', slug, 'index.html'), path.join(dir, 'index.html'));
    fs.copyFileSync(gif, path.join(dir, 'preview.gif'));
    fs.writeFileSync(metaPath, JSON.stringify(p, null, 2) + '\n');
    fs.writeFileSync(path.join(dir, 'README.md'), entryReadme(p));
    log.push(`${slug}：入库（${cand.total} 分）`);
  }
  const histPath = path.join(group, 'history.json');
  const hist = fs.existsSync(histPath) ? JSON.parse(fs.readFileSync(histPath, 'utf8')) : [];
  const pick = [...scores.keep.map((s) => [s, 'keep']), [scores.surprise, 'surprise']];
  for (const [slug, role] of pick) {
    if (hist.some((h) => h.round === roundName && h.slug === slug)) continue;
    const ck = JSON.parse(fs.readFileSync(path.join(round, 'candidates', slug, 'checks.json'), 'utf8'));
    hist.push({ round: roundName, date, slug, role, kind: slug, spring: ck.params.spring || null, total: scores.candidates.find((c) => c.slug === slug).total });
  }
  fs.writeFileSync(histPath, JSON.stringify(hist, null, 2) + '\n');
  const entries = fs.readdirSync(group).filter((d) => fs.existsSync(path.join(group, d, 'params.json'))).sort()
    .map((d) => JSON.parse(fs.readFileSync(path.join(group, d, 'params.json'), 'utf8')));
  fs.writeFileSync(path.join(group, 'README.md'), groupReadme(entries));
  return { log, entries: entries.length };
}

module.exports = { ingest, quotesFor, zeta };

if (require.main === module) {
  const [round, media, group, roundName] = process.argv.slice(2);
  if (!round || !media || !group) { console.error('用法: node tools/ingest.cjs <轮目录> <媒体目录> <弹药库分组目录> [轮名]'); process.exit(2); }
  const name = roundName || path.basename(path.resolve(round));
  const date = (name.match(/\d{4}-\d{2}-\d{2}/) || [new Date().toISOString().slice(0, 10)])[0];
  const r = ingest({ round: path.resolve(round), media: path.resolve(media), group: path.resolve(group), roundName: name, date });
  console.log(r.log.join('\n'));
  console.log(`分组里现有 ${r.entries} 条`);
}
