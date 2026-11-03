#!/bin/bash
# 判官段：生成判官输入 → 交给 Kimi（只读，最后只写 scores.json）→ 校验每一分的出处。
# 用法：tools/judge.sh <轮目录> <审美账.md> <制作意见账.md> [history.json]
# 判官不能是生成者（Codex）。Kimi 撞额度时换 Grok：把 judge-brief.md 交给 grok 读，产出同样的 scores.json，judge 字段写 grok，再单独跑最后一行校验。
set -euo pipefail
LAB="$(cd "$(dirname "$0")/.." && pwd)"
ROUND="$(cd "${1:?用法: judge.sh <轮目录> <审美账> <制作意见账> [history]}" && pwd)"
node "$LAB/tools/judge-brief.cjs" "$ROUND" "$2" "$3" "${4:-}" > "$ROUND/judge-brief.md"
~/scripts/kimi-run.sh -C "$ROUND" -t 300 -T 1800 -e "$ROUND/scores.json:200" \
  "读 $ROUND/judge-brief.md，严格照里面的要求当判官：逐个打开每个候选的联系表和首帧图片、读源码，打分后把结果写进 $ROUND/scores.json。除了这个文件不要改任何东西。"
node "$LAB/tools/validate-scores.cjs" "$ROUND"
