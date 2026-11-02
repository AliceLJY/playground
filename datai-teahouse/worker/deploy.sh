#!/bin/bash
# 第一次部署跨用户痕迹服务：登录 Cloudflare（浏览器里点一次授权）→ 建 KV → 部署 → 记下地址。
# 再跑一次只会重新部署，不会重复建 KV。
set -euo pipefail
cd "$(dirname "$0")"
DIR=$(pwd)
W="npx --yes wrangler@4"
# 登录、查账号、建 KV 都在一个空目录里跑：wrangler 每条命令都会先读当前目录的配置
TMP=$(mktemp -d)
cd "$TMP"

if ! $W whoami 2>/dev/null | grep -qiE "associated with|logged in"; then
  echo "== 浏览器会弹出 Cloudflare 授权页，点 Allow =="
  $W login
fi

if ! grep -q 'DATAI_TRACES' "$DIR/wrangler.toml"; then
  echo "== 建 KV =="
  out=$($W kv namespace create DATAI_TRACES 2>&1 || true)
  id=$(printf '%s\n' "$out" | grep -oE '[0-9a-f]{32}' | head -1 || true)
  if [ -z "$id" ]; then
    # 上次建过了：从列表里找回来
    id=$($W kv namespace list 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s.slice(s.indexOf("[")));const n=a.find(x=>/DATAI_TRACES/.test(x.title));if(n)console.log(n.id)}catch(e){}})')
  fi
  [ -n "$id" ] || { echo "$out"; echo "没拿到 KV id"; exit 1; }
  printf '\n[[kv_namespaces]]\nbinding = "DATAI_TRACES"\nid = "%s"\n' "$id" >> "$DIR/wrangler.toml"
fi

echo "== 部署 =="
echo "（第一次会问要不要注册 workers.dev 子域名：回 y，名字填 aliceljy）"
cd "$DIR"
# 不接管道：接了管道 wrangler 就不问子域名、直接当拒绝。地址从它自己的日志里读
LOGDIR="$HOME/Library/Preferences/.wrangler/logs"
$W deploy
log=$(ls -t "$LOGDIR"/*.log 2>/dev/null | head -1)
url=$(grep -oE 'https://datai-traces\.[a-z0-9-]+\.workers\.dev' "$log" | head -1 || true)
[ -n "$url" ] || { echo "没读到部署地址"; exit 1; }
printf '%s\n' "$url" > .deployed-url
echo "== 部署好了：$url =="
echo "回到对话跟 Claude 说一声「茶楼部署好了」就行"
