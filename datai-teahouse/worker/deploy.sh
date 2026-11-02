#!/bin/bash
# 第一次部署跨用户痕迹服务：登录 Cloudflare（浏览器里点一次授权）→ 建 KV → 部署 → 记下地址。
# 再跑一次只会重新部署，不会重复建 KV。
set -euo pipefail
cd "$(dirname "$0")"
W="npx --yes wrangler@4"

if ! $W whoami 2>/dev/null | grep -qi "associated with"; then
  echo "== 浏览器会弹出 Cloudflare 授权页，点 Allow =="
  $W login
fi

if grep -q '^id = ""' wrangler.toml; then
  echo "== 建 KV =="
  out=$($W kv namespace create DATAI_TRACES 2>&1) || { echo "$out"; exit 1; }
  id=$(printf '%s\n' "$out" | grep -oE '[0-9a-f]{32}' | head -1)
  [ -n "$id" ] || { echo "$out"; echo "没读到 KV id"; exit 1; }
  sed -i '' "s/^id = \"\"/id = \"$id\"/" wrangler.toml
fi

echo "== 部署 =="
out=$($W deploy 2>&1 | tee /dev/stderr)
url=$(printf '%s\n' "$out" | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1)
[ -n "$url" ] || { echo "没读到部署地址"; exit 1; }
printf '%s\n' "$url" > .deployed-url
echo "== 部署好了：$url =="
echo "回到对话跟 Claude 说一声「茶楼部署好了」就行"
