#!/bin/bash
# Grok 判官（Kimi 撞额度或失败时的兜底）：Grok 只给只读工具、写不了文件，
# 所以把判官输入和每个候选的联系表、首帧、源码拷进一个隔离目录，路径改成相对路径，让它把 JSON 打到标准输出，
# 再由本脚本截出 JSON、judge 字段写 grok、落成 <轮目录>/scores.json，最后照常校验。
# 隔离目录的理由：grok 的 read_file 给绝对路径照样读，材料里不能出现隔离目录之外的真实路径（mutual-review 调用矩阵 Grok 行）。
# 用法：tools/judge-grok.sh <轮目录>   （要求 judge-brief.md、ledger-rows.json 已由 judge.sh 生成）
set -euo pipefail
LAB="$(cd "$(dirname "$0")/.." && pwd)"
ROUND="$(cd "${1:?用法: judge-grok.sh <轮目录>}" && pwd)"
mkdir -p "$HOME/.grok-runs"
RUN="$(mktemp -d "$HOME/.grok-runs/interaction-lab-XXXXXX")"
for d in "$ROUND"/candidates/*/; do
  s="$(basename "$d")"; [ -f "$d/checks.json" ] || continue
  mkdir -p "$RUN/candidates/$s"
  cp "$d/index.html" "$d/contact.png" "$d/shot.png" "$RUN/candidates/$s/"
done
python3 - "$ROUND/judge-brief.md" "$ROUND" "$RUN/judge-brief.md" <<'EOF'
import sys
src, rnd, dst = sys.argv[1:]
s = open(src, encoding='utf-8').read().replace(rnd + '/', '').replace(rnd, '.')
s = s.replace('最后写 `scores.json` 这一个文件', '最后把结果 JSON 直接输出')
s += '\n\n## 交付方式（覆盖上文「写进 scores.json」）\n\n你没有写文件的工具。把完整的 scores JSON 作为最后的回答直接输出，"judge" 填 "grok"，JSON 前后不要有别的文字。\n'
open(dst, 'w', encoding='utf-8').write(s)
EOF
# 闸：改完还带本机绝对路径就不调 Grok（2026-11-03 首次试跑时说明是从别的目录拷来的，路径没替换上，Grok 照着读了隔离目录外的文件）
if grep -nE '/Users/|/Volumes/|~/' "$RUN/judge-brief.md" >/dev/null; then echo "判官说明里还有本机绝对路径，停下不调 Grok：$RUN/judge-brief.md" >&2; exit 4; fi
OUT="$RUN/grok-out.txt"
( cd "$RUN" && ~/scripts/grok-clean.sh -p "读当前目录的 judge-brief.md，严格照它当判官：逐个打开 candidates 下每个候选的 contact.png、shot.png 看画面，读 index.html，然后只输出 scores JSON。先读材料，别把轮数耗在探索上。" \
    --reasoning-effort high --tools "read_file,grep,list_dir" --always-approve --max-turns 80 --no-auto-update ) > "$OUT" 2>&1
python3 - "$OUT" "$ROUND/scores.json" <<'EOF'
import json, sys
t = open(sys.argv[1], encoding='utf-8').read()
dec, d, i = json.JSONDecoder(), None, 0
while (i := t.find('{', i)) >= 0:   # 取最后一个带 candidates 的完整 JSON 对象，前面的思考文字里有花括号也不怕
    try:
        obj, end = dec.raw_decode(t, i)
        if isinstance(obj, dict) and 'candidates' in obj: d = obj
        i = end
    except ValueError: i += 1
if d is None: sys.exit('grok 输出里找不到带 candidates 的 JSON')
d['judge'] = 'grok'
json.dump(d, open(sys.argv[2], 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
EOF
node "$LAB/tools/validate-scores.cjs" "$ROUND"
