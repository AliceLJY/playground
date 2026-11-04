#!/bin/bash
# 把品牌片头接到正片前面：bash tools/intro-splice.sh <intro.mp4（带声）> <正片.mp4> <输出.mp4>
# 输出尺寸、帧率跟正片走；正片不是竖屏时，竖屏片头等比缩进正片画幅、两边垫米色（#efe7d4）。
set -euo pipefail
intro="$1"; main="$2"; out="$3"
read W H FR < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$main" | tr ',' ' ')
has_audio=$(ffprobe -v error -select_streams a -show_entries stream=index -of csv=p=0 "$main" | head -1)
if [ -n "$has_audio" ]; then ma="[1:a]aresample=48000,aformat=channel_layouts=stereo[ma]"; else ma="anullsrc=r=48000:cl=stereo,atrim=duration=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$main")[ma]"; fi
ffmpeg -y -loglevel error -i "$intro" -i "$main" -filter_complex "\
[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0xefe7d4,fps=${FR},setsar=1,format=yuv420p[iv];\
[1:v]fps=${FR},setsar=1,format=yuv420p[mv];\
[0:a]aresample=48000,aformat=channel_layouts=stereo[ia];$ma;\
[iv][ia][mv][ma]concat=n=2:v=1:a=1[v][a]" -map "[v]" -map "[a]" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "$out"
