#!/bin/bash
# 一键启动：起本地服务器（禁用缓存）并打开浏览器
cd "$(dirname "$0")" || exit 1
PORT=8777
while lsof -i ":$PORT" >/dev/null 2>&1; do PORT=$((PORT + 1)); done

# 默认只监听本机。传 share 参数则监听所有网卡，局域网/frp 才连得上。
BIND=127.0.0.1
if [ "$1" = "share" ]; then
  BIND=0.0.0.0
  echo "分享模式：局域网内可访问 http://$(ipconfig getifaddr en0 2>/dev/null || echo '<本机IP>'):$PORT/index.html"
fi

echo "山河卷 demo → http://127.0.0.1:$PORT/index.html"
echo "停止：Ctrl+C"
( sleep 1 && open "http://127.0.0.1:$PORT/index.html" ) &

# 关掉缓存：改了文件刷新就能看到新的，不必手动硬刷新
python3 - "$PORT" "$BIND" <<'PY'
import sys, http.server, socketserver

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

port = int(sys.argv[1])
bind = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer((bind, port), NoCache) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
PY
