# /// script
# dependencies = []
# ///
# 岭南园林导览片的 40 秒以内发布版：不重拍，从整片录制的分镜里取段重拼。
# 用法：python3 -I tools/cut40.py <整片竖屏目录> <整片 v2 目录> <输出目录>
#   整片竖屏目录：film.cjs 竖屏整片的输出（shots/*.mp4、timeline.json）；v2 目录：第一镜改铺满后的 shots/card.mp4 与 ambience.wav。
# 产物：<输出目录>/shots-40/*.mp4、film-silent.mp4、ambience.wav、timeline.json（带 shots 名字与 phraseTail，给 film-music.py 用）。
# 2026-11-11 Alice：「只要一版发布就行了啊，竖屏时间太短，导览太长，我建议40秒以内~」。
import json, subprocess, sys
from pathlib import Path

full, v2, out = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
(out / "shots-40").mkdir(parents=True, exist_ok=True)
FPS, XF, XF_IN = 30, 1.0, 0.6
src_tl = json.loads((full / "timeline.json").read_text())
src_cut = dict(zip([s["name"] for s in src_tl["shots"]], src_tl["cuts"]))   # 各镜在整片里的起点（环境声按它切）
src_cut["endcard"] = src_tl["endcardAt"]

# (镜头名, 源文件, [(段起, 段止), …])；一镜里有两段时用 XF_IN 秒叠化接起来（屋里转身剪掉中间对着满洲窗慢转的过程）
PLAN = [
    ("card",    v2 / "shots/card.mp4",     [(0.0, 7.0)]),
    ("pond",    full / "shots/pond.mp4",   [(0.0, 5.0)]),
    ("hall",    full / "shots/hall.mp4",   [(0.5, 5.5)]),
    ("inside",  full / "shots/inside.mp4", [(2.0, 5.0), (10.5, 15.5)]),   # 先慢转到满洲窗（约 23°→68°，每秒 15°），再接转过砖墙和庭院那半圈（约 152°→330°）
    ("rock",    full / "shots/rock.mp4",   [(0.5, 5.5)]),
    ("finale",  full / "shots/finale.mp4", [(0.0, 8.0)]),                 # 结尾链接字在 3.2 秒后出，整段留着
    ("endcard", full / "shots/endcard.mp4", [(0.0, 5.6)]),
]
ENC = ["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-color_range", "tv", "-colorspace", "bt709",
       "-color_primaries", "bt709", "-color_trc", "bt709", "-r", str(FPS)]

def run(args): subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args], check=True)

durs, amb_parts = [], []
for name, src, segs in PLAN:
    dst = out / "shots-40" / f"{name}.mp4"
    if len(segs) == 1:
        a, b = segs[0]
        run(["-ss", f"{a}", "-to", f"{b}", "-i", str(src), *ENC, "-an", str(dst)]); d = b - a
    else:
        (a1, b1), (a2, b2) = segs
        g = (f"[0:v]trim={a1}:{b1},setpts=PTS-STARTPTS[a];[0:v]trim={a2}:{b2},setpts=PTS-STARTPTS[b];"
             f"[a][b]xfade=transition=fade:duration={XF_IN}:offset={b1 - a1 - XF_IN:.3f}[v]")
        run(["-i", str(src), "-filter_complex", g, "-map", "[v]", *ENC, "-an", str(dst)]); d = (b1 - a1) + (b2 - a2) - XF_IN
    durs.append(round(d * FPS) / FPS)
    amb_parts.append([(src_cut[name] + a, src_cut[name] + b) for a, b in segs])

# 画面：各镜叠化接起来（同 film.cjs）
inputs = sum([["-i", str(out / "shots-40" / f"{n}.mp4")] for n, _, _ in PLAN], [])
graph, prev, off = "", "[0:v]", 0.0
for i in range(1, len(PLAN)):
    off += durs[i - 1] - XF; graph += f"{prev}[{i}:v]xfade=transition=fade:duration={XF}:offset={off:.3f}[v{i}];"; prev = f"[v{i}]"
run([*inputs, "-filter_complex", graph[:-1], "-map", prev, *ENC, "-movflags", "+faststart", str(out / "film-silent.mp4")])

# 环境声：从 v2 整片的环境声里按同样的段取，段间同样叠化
amb_src = v2 / "ambience.wav"
labels, g, k = [], "", 0
for parts in amb_parts:
    sub = []
    for a, b in parts:
        g += f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS[s{k}];"; sub.append(f"[s{k}]"); k += 1
    if len(sub) == 2:
        g += f"{sub[0]}{sub[1]}acrossfade=d={XF_IN}[s{k}];"; sub = [f"[s{k}]"]; k += 1
    labels.append(sub[0])
prev = labels[0]
for i in range(1, len(labels)):
    g += f"{prev}{labels[i]}acrossfade=d={XF}[x{i}];"; prev = f"[x{i}]"
run(["-i", str(amb_src), "-filter_complex", g[:-1], "-map", prev, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(out / "ambience.wav")])

cuts, c = [], 0.0
for d in durs: cuts.append(round(c, 2)); c += d - XF
total = round(sum(durs) - XF * (len(durs) - 1), 2)
shots = [{"name": n, "dur": d} for (n, _, _), d in zip(PLAN, durs)]
(out / "timeline.json").write_text(json.dumps({"fps": FPS, "xfade": XF, "landscape": False, "total": total, "endcardAt": cuts[-1],
    "cuts": cuts, "shots": shots[:-1], "phraseTail": 1.5, "source": "cut40.py"}, ensure_ascii=False, indent=1))
print("总长", total, "秒；各镜起点", cuts)
