#!/bin/bash
# 把几张截图拼成一张对照表：tools/sheet.sh out.jpg 列数 宽 高 图1 图2 …
out=$1; cols=$2; w=$3; h=$4; shift 4; n=$#; args=(); fc=""; lay=""; i=0
for f in "$@"; do args+=(-i "$f"); fc+="[${i}:v]scale=${w}:${h}[v${i}];"; lay+="$(( (i%cols)*w ))_$(( (i/cols)*h ))|"; i=$((i+1)); done
for ((j=0;j<n;j++)); do fc+="[v${j}]"; done
ffmpeg -loglevel error -y "${args[@]}" -filter_complex "${fc}xstack=inputs=${n}:layout=${lay%|}" -q:v 3 "$out"
