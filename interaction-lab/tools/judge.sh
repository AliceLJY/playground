#!/bin/bash
# 判官段：生成判官输入 → 交给 Kimi（只读，最后只写 scores.json）→ 校验每一分的出处。
# 用法：tools/judge.sh <轮目录> <审美账.md> <制作意见账.md> [history.json]
# 判官不能是生成者（Codex）。Kimi 失败或打分没过校验时自动换 Grok（tools/judge-grok.sh，隔离目录、只读工具）。
set -euo pipefail
LAB="$(cd "$(dirname "$0")/.." && pwd)"
ROUND="$(cd "${1:?用法: judge.sh <轮目录> <审美账> <制作意见账> [history]}" && pwd)"
node "$LAB/tools/judge-brief.cjs" "$ROUND" "$2" "$3" "${4:-}" > "$ROUND/judge-brief.md"
if ~/scripts/kimi-run.sh -C "$ROUND" -t 300 -T 1800 -e "$ROUND/scores.json:200" \
  "读 $ROUND/judge-brief.md，严格照里面的要求当判官：逐个打开每个候选的联系表和首帧图片、读源码，打分后把结果写进 $ROUND/scores.json。除了这个文件不要改任何东西。" \
  && node "$LAB/tools/validate-scores.cjs" "$ROUND"; then
  exit 0
fi
echo "Kimi 判官没成（撞额度、超时或打分没过校验），换 Grok"
[ -f "$ROUND/scores.json" ] && mv "$ROUND/scores.json" "$ROUND/scores.kimi-rejected.json"
exec "$LAB/tools/judge-grok.sh" "$ROUND"
