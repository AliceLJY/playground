#!/bin/bash
# 生成段：按种子从 kinds.json 抽 N 种，填好 generate-prompt.md，交给 Codex 写进 <轮目录>/candidates/。
# 用法：tools/generate.sh <轮目录> [种子] [N=8]
# 生成者固定是 Codex；判官必须换另一个端（见 tools/judge-brief.cjs）。
set -euo pipefail
LAB="$(cd "$(dirname "$0")/.." && pwd)"
ROUND="${1:?用法: generate.sh <轮目录> [种子] [N]}"; SEED="${2:-$(date +%Y%m%d)}"; N="${3:-8}"
OUT="$ROUND/candidates"; mkdir -p "$OUT"
PROMPT="$ROUND/generate-prompt.filled.md"
node "$LAB/tools/fill-prompt.cjs" "$LAB" "$OUT" "$SEED" "$N" > "$PROMPT"
GATES=()
for s in $(node -e 'const m=require(process.argv[1]);console.log(m.map(x=>x.slug).join(" "))' "$OUT/.plan.json"); do
  GATES+=(-e "$OUT/$s/index.html:1500")
done
exec ~/scripts/codex-run.sh -C "$OUT" -m write -t 300 -T 3600 "${GATES[@]}" -e "$OUT/manifest.json" -f "$PROMPT"
