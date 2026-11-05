#!/bin/bash
# 11-06 定版拼接：正片第 0 秒起叠「像素门开缝煤球探头」＋门铃 → 正片 → [新署名页] → 房间片段收尾
# 门标帧由 tools/door-mark/record.cjs 生成，环境变量 DOOR 可指定目录
# 用法：intro-splice2.sh <编号> <正片> <输出> [署名页.mp4]
set -euo pipefail
n="$1"; main="$2"; out="$3"; ec="${4:-}"
B=/Volumes/ColdData/产出/2026-11-05-品牌片头
SF=~/.claude/skills/story-video/references/sfx-library
intro=$B/batch/intros/$n/intro-a.mp4; sting=$B/sting-norm.wav
read W H FR < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate -of csv=p=0 "$main" | tr ',' ' ')
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$main")
S=$(( W < H ? W : H ))
TW=$(python3 -c "print(int(round(320*$S/1080/2))*2)")   # 门的贴图跟短边等比
CR="aformat=sample_rates=48000:channel_layouts=stereo"
inputs=(-i "$main" -framerate 24 -i ${DOOR:-$B/batch2/door}/%04d.png -i "$sting" -ss 1.0 -i "$intro")
fc="[1:v]crop=320:400:0:0,scale=${TW}:-2,format=rgba[ov];[0:v]fps=${FR},setsar=1[m0];[m0][ov]overlay=0:0:eof_action=pass,format=yuv420p[mv];"
fc+="[2:a]atrim=0:0.85,afade=out:st=0.6:d=0.25,$CR[ding];[0:a]$CR[ma0];[ma0][ding]amix=inputs=2:duration=first:normalize=0[ma];"
fc+="[3:v]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0xefe7d4,fps=${FR},setsar=1,format=yuv420p,fade=in:st=0:d=0.25[rv];"
fc+="[2:a]atrim=1.0:3.6,asetpts=PTS-STARTPTS,$CR[ra];"
if [ -n "$ec" ]; then
  # 署名页：画面等比放进正片画幅垫米色；底下垫正片最后一段声音（-14dB 淡入淡出），1.8/2.8 秒两声落定音
  bs=$(python3 -c "print(max(0,$D-6.8))")
  inputs+=(-i "$ec" -ss "$bs" -t 5.6 -i "$main" -i $SF/sfx-hard-pop-click.mp3 -i $SF/sfx-deep-impact.mp3)
  fc+="[4:v]scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0xefe9dc,fps=${FR},setsar=1,format=yuv420p,trim=0:5.6,setpts=PTS-STARTPTS[ev];"
  fc+="[5:a]$CR,asetpts=PTS-STARTPTS,volume=-14dB,afade=in:st=0:d=0.5,afade=out:st=4.4:d=1.2,apad=whole_dur=5.6[bed];"
  fc+="[6:a]$CR,volume=-10dB,asplit=2[p1][p2];[7:a]$CR,volume=-20dB,asplit=2[q1][q2];"
  fc+="[p1]adelay=1800|1800[p1d];[p2]adelay=2800|2800[p2d];[q1]adelay=1800|1800[q1d];[q2]adelay=2800|2800[q2d];"
  fc+="[bed][p1d][p2d][q1d][q2d]amix=inputs=5:duration=first:normalize=0,atrim=0:5.6[ea];"
  fc+="[mv][ma][ev][ea][rv][ra]concat=n=3:v=1:a=1[v][a]"
else
  fc+="[mv][ma][rv][ra]concat=n=2:v=1:a=1[v][a]"
fi
ffmpeg -nostdin -y -loglevel error "${inputs[@]}" -filter_complex "$fc" -map "[v]" -map "[a]" -c:v libx264 -crf 18 -preset medium -pix_fmt yuv420p -c:a aac -b:a 192k -movflags +faststart "$out"
