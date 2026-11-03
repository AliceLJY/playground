// 从 RecallNest 只读导出记忆褪色页要的抽样：bun tools/export-library.ts <recallnest 仓目录> <输出 library.js> [日期 YYYY-MM-DD]
// 只读数字字段（category、importance、timestamp、metadata 里的 accessCount / lastAccessedAt / tier / tags），不读 text，不写库。
// 每天由作者机器上的定时任务跑一次再发布；规则函数直接用 RecallNest 自己的，不在这里另抄一份。
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const [rnDir, outFile, dateArg] = process.argv.slice(2);
if (!rnDir || !outFile) { console.error("用法: bun tools/export-library.ts <recallnest 仓目录> <输出 library.js> [日期]"); process.exit(2); }
const R = (f: string) => join(rnDir, "src", f);
const lancedb = createRequire(join(rnDir, "package.json"))("@lancedb/lancedb");   // 库装在 RecallNest 仓里，本仓不装
const { resolveDbPath } = await import(R("runtime-config.ts"));
const { isActiveMemory } = await import(R("memory-evolution.ts"));
const { isDecayExempt, resolveTier, weibullDecay } = await import(R("decay-engine.ts"));
const { DEFAULT_ACCESS_TRACKER_CONFIG: C } = await import(R("access-tracker.ts"));

const SAMPLE = 400, RECENT_SAMPLE = 40, BASE_HL = 60, D = 86_400_000;
const MAIN = new Set(["events", "patterns", "cases", "preferences", "entities", "profile"]);
const now = Date.now();
const date = dateArg || new Date(now + 8 * 3600_000).toISOString().slice(0, 10);   // 北京日期

const table = await (await lancedb.connect(resolveDbPath())).openTable("memories");
const rows: any[] = await table.query().select(["category", "importance", "timestamp", "metadata"]).toArray();

type Row = { c: string; imp: number; age: number; ac: number; sa: number | null; tier: string; pinned: boolean; exempt: boolean; recent: boolean; dropTo: number | null };
const all: Row[] = [];
for (const r of rows) {
  const md = r.metadata || "{}";
  if (!isActiveMemory(md)) continue;
  let m: any = {}; try { m = JSON.parse(md); } catch { /* 坏 metadata 当空 */ }
  const imp = Number(r.importance);
  const ac = typeof m.accessCount === "number" ? m.accessCount : 0;
  const la = typeof m.lastAccessedAt === "number" ? m.lastAccessedAt : 0;
  const age = Math.max(0, (now - Number(r.timestamp)) / D);
  const tier = resolveTier(md, imp);
  const pinned = Array.isArray(m.tags) && m.tags.includes("pinned");
  const sa = la > 0 ? (now - la) / D : null;
  const recent = sa !== null && sa < 7 && !pinned && !(tier === "core" && imp >= 0.95) && r.category !== "patterns";
  let dropTo: number | null = null;
  if (recent) {
    const fr = Math.exp(-7 / C.accessFreshnessHalfLifeDays);
    const hl = Math.min(BASE_HL + BASE_HL * C.reinforcementFactor * Math.log1p(ac * fr), BASE_HL * C.maxMultiplier);
    dropTo = weibullDecay(age + (7 - sa!), hl, tier);
  }
  all.push({ c: r.category, imp, age, ac, sa, tier, pinned, exempt: isDecayExempt(md, imp, r.category), recent, dropTo });
}
if (all.length < SAMPLE) { console.error(`在用记忆只有 ${all.length} 条，少于抽样数 ${SAMPLE}，不导出`); process.exit(3); }

// 按日期定种子：同一天重跑结果一样，换一天换一批
let seed = [...date].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const recent = all.filter((x) => x.recent), rest = all.filter((x) => !x.recent);
const nRecent = Math.min(RECENT_SAMPLE, recent.length);
const pick = shuffle([...shuffle(recent.slice()).slice(0, nRecent), ...shuffle(rest.slice()).slice(0, SAMPLE - nRecent)]);

const drops = recent.map((x) => x.dropTo!).sort((a, b) => a - b);
const meta = {
  date, active: all.length, exempt: all.filter((x) => x.exempt).length, pinned: all.filter((x) => x.pinned).length,
  patterns: all.filter((x) => x.c === "patterns").length, recentOnly: recent.length,
  dropMedian: drops.length ? +drops[Math.floor((drops.length - 1) / 2)].toFixed(3) : null,
  dropBelow07: drops.filter((d) => d < 0.7).length, sampled: pick.length, recentSampled: nRecent,
};
const out = pick.map((x) => [MAIN.has(x.c) ? x.c : "other", +x.imp.toFixed(2), Math.round(x.age), x.ac, x.sa === null ? null : Math.round(x.sa), x.tier[0], x.pinned ? 1 : 0]);
const js = `// 记忆褪色 · 真实记忆库抽样。由 RecallNest 只读导出（tools/export-library.ts），只有数字，没有任何记忆正文、id 或 scope。
// 每行：[类别, 重要性, 写入至今天数, 被想起次数, 距上次被想起天数(null=从没), 层级 c/w/p, 是否钉住]
// 抽样：从 ${meta.active} 条在用记忆里随机抽 ${meta.sampled} 条；「只靠最近 7 天被想起才不掉分」的那类单独多抽了 ${meta.recentSampled} 条，好让页面上看得到。
(function (root) {
  root.FADE_LIBRARY = ${JSON.stringify({ meta, rows: out })};
})(typeof self !== 'undefined' ? self : this);
`;
writeFileSync(outFile, js);
console.log(JSON.stringify(meta));
process.exit(0);
