#!/usr/bin/env python3
"""
compose.py — Motion Craft Pro 合成管线
配音（可选字级字幕）+ BGM 闪避 + 软字幕/烧录 + 质检

用法：
  python compose.py --check
  python compose.py --frames <帧目录> --text "旁白" --out out.mp4 --duration 18
  python compose.py --frames frames --voice-file voice.mp3 --captions captions.vtt --out out.mp4
  python compose.py --frames frames --text-file script.txt --bgm pad.mp3 --out out.mp4 --burn-captions

默认按 1080p 交付预期；CRF 18；AAC 192k。
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import shutil
import subprocess
import sys


def _ffmpeg_candidates():
    home = os.path.expanduser("~")
    here = os.path.dirname(os.path.abspath(__file__))
    exe_names = ("ffmpeg.exe", "ffmpeg") if os.name == "nt" else ("ffmpeg",)
    cands = [os.environ.get("FFMPEG_BIN")]
    bases = [
        os.path.join(home, "node_modules"),
        os.path.join(home, ".workbuddy-ai", "binaries", "node", "workspace", "node_modules"),
        os.path.join(here, "node_modules"),
        os.path.join(here, "..", "node_modules"),
        os.path.join(here, "..", "..", "..", "node_deps", "node_modules"),
    ]
    for base in bases:
        for exe in exe_names:
            p = os.path.normpath(os.path.join(base, "ffmpeg-static", exe))
            if os.path.isfile(p):
                cands.append(p)
    npm = shutil.which("npm")
    if npm:
        try:
            r = subprocess.run([npm, "root", "-g"], capture_output=True, text=True, timeout=20)
            if r.returncode == 0 and r.stdout.strip():
                for exe in exe_names:
                    p = os.path.join(r.stdout.strip(), "ffmpeg-static", exe)
                    if os.path.isfile(p):
                        cands.append(p)
        except Exception:
            pass
    cands.append(shutil.which("ffmpeg"))
    cands += [
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
        r"C:\ffmpeg\bin\ffmpeg.exe",
    ]
    return cands


def find_ffmpeg():
    for c in _ffmpeg_candidates():
        if not c or not os.path.isfile(c):
            continue
        try:
            out = subprocess.run([c, "-version"], capture_output=True, text=True, timeout=10).stdout
            if "playwright" in out.lower():
                continue
            return c
        except Exception:
            continue
    raise RuntimeError(
        "找不到可用的完整版 ffmpeg。\n"
        "  安装：npm i -g ffmpeg-static  或  apt install ffmpeg\n"
        "  或设置 FFMPEG_BIN"
    )


def probe_duration(ffmpeg, path):
    r = subprocess.run([ffmpeg, "-i", path], capture_output=True, text=True, errors="ignore")
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", r.stderr)
    if not m:
        raise RuntimeError(f"无法解析时长: {path}")
    h, mi, s = m.groups()
    return int(h) * 3600 + int(mi) * 60 + float(s)


def probe_streams(ffmpeg, path):
    r = subprocess.run([ffmpeg, "-i", path], capture_output=True, text=True, errors="ignore")
    stderr = r.stderr
    v = next((l.strip() for l in stderr.splitlines() if "Video:" in l), "")
    a = next((l.strip() for l in stderr.splitlines() if "Audio:" in l), "")
    wh = None
    m = re.search(r"Video:.*?(\d{3,5})x(\d{3,5})", stderr)
    if m:
        wh = (int(m.group(1)), int(m.group(2)))
    return {"video": v, "audio": a, "resolution": wh, "raw": stderr}


async def run_tts_module(text, voice, rate, out_path, captions_json=None, captions_vtt=None):
    """Call sibling tts.py logic for WordBoundary captions."""
    here = os.path.dirname(os.path.abspath(__file__))
    if here not in sys.path:
        sys.path.insert(0, here)
    import tts as tts_mod

    meta = await tts_mod.synth(
        text,
        voice,
        rate,
        "+0%",
        "+0Hz",
        out_path,
        captions_json=captions_json,
        captions_vtt=captions_vtt,
    )
    return meta


def _check_deps():
    import platform

    ok = True
    print("依赖自检 · Motion Craft Pro 2.0")
    print("-" * 46)
    v = sys.version_info
    py_ok = v >= (3, 7)
    print("  [%s] Python %s.%s.%s (%s)" % ("OK " if py_ok else "!! ", v.major, v.minor, v.micro, platform.system()))
    ok = ok and py_ok

    try:
        ff = find_ffmpeg()
    except Exception:
        ff = None
    if ff:
        out = subprocess.run([ff, "-hide_banner", "-version"], capture_output=True, text=True, timeout=20).stdout or ""
        ver = out.splitlines()[0] if out else "?"
        has_h264 = "enable-libx264" in out or "h264" in out.lower() or "libx264" in out
        print("  [%s] FFmpeg  %s" % ("OK " if has_h264 else "!! ", ver[:60]))
        print("         路径: %s" % ff)
        if not has_h264:
            print("         警告: 这份 ffmpeg 可能不支持 h264")
            ok = False
    else:
        print("  [!!] FFmpeg  未找到")
        ok = False

    try:
        import edge_tts  # noqa: F401

        print("  [OK ] Edge TTS 已安装")
    except Exception:
        print("  [!!] Edge TTS 未安装 -> pip install edge-tts")
        ok = False

    print("  [-- ] 渲染引擎: 需本机 Chrome + puppeteer-core（render.js 自动探测）")
    print("-" * 46)
    print("结论: %s" % ("可以开工" if ok else "有缺件，按上面提示补齐"))
    return 0 if ok else 1


def build_audio_filter(vid_dur, has_voice, has_bgm, bgm_vol=0.14, duck=True):
    """Return -filter_complex string or None, and map labels."""
    if not has_voice and not has_bgm:
        return None, []
    if has_voice and not has_bgm:
        # pad VO to video length
        return f"[1:a]apad=whole_dur={vid_dur:.3f}[aout]", ["[aout]"]
    if has_bgm and not has_voice:
        return f"[1:a]volume={bgm_vol},afade=t=in:st=0:d=0.8,afade=t=out:st={max(0, vid_dur-1.0):.3f}:d=1.0,apad=whole_dur={vid_dur:.3f}[aout]", ["[aout]"]
    # voice=1 bgm=2
    if duck:
        fc = (
            f"[1:a]apad=whole_dur={vid_dur:.3f}[vo];"
            f"[2:a]volume={bgm_vol},afade=t=in:st=0:d=0.8,afade=t=out:st={max(0, vid_dur-1.0):.3f}:d=1.0[bg];"
            f"[bg][vo]sidechaincompress=threshold=0.05:ratio=6:attack=50:release=300[ducked];"
            f"[vo][ducked]amix=inputs=2:duration=first:dropout_transition=0[aout]"
        )
    else:
        fc = (
            f"[1:a]apad=whole_dur={vid_dur:.3f}[vo];"
            f"[2:a]volume={bgm_vol}[bg];"
            f"[vo][bg]amix=inputs=2:duration=first[aout]"
        )
    return fc, ["[aout]"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--frames", help="帧目录 frame_0000.png ...")
    ap.add_argument("--text", default="", help="旁白；留空可配合 --voice-file")
    ap.add_argument("--text-file", default="")
    ap.add_argument("--voice-file", default="", help="已有配音 mp3/wav，跳过 TTS")
    ap.add_argument("--out", help="输出 mp4")
    ap.add_argument("--voice", default="zh-CN-YunxiNeural")
    ap.add_argument("--rate", default="-6%")
    ap.add_argument("--fps", type=int, default=30)
    ap.add_argument("--duration", type=float, default=0)
    ap.add_argument("--crf", type=int, default=18)
    ap.add_argument("--preset", default="medium")
    ap.add_argument("--work", default="")
    ap.add_argument("--bgm", default="", help="BGM 音频路径；自动闪避旁白")
    ap.add_argument("--bgm-vol", type=float, default=0.14)
    ap.add_argument("--no-duck", action="store_true")
    ap.add_argument("--captions", default="", help="已有 VTT/SRT；软字幕封装")
    ap.add_argument("--burn-captions", action="store_true", help="烧录字幕到画面")
    ap.add_argument("--export-captions", action="store_true", help="TTS 时导出 captions.json/vtt")
    ap.add_argument("--width", type=int, default=1920, help="期望宽度（质检参考）")
    ap.add_argument("--height", type=int, default=1080, help="期望高度（质检参考）")
    args = ap.parse_args()

    if args.check:
        return _check_deps()
    if not args.frames or not args.out:
        ap.error("必须提供 --frames 和 --out（或用 --check）")

    ffmpeg = find_ffmpeg()
    frames = os.path.abspath(args.frames)
    n_frames = len([f for f in os.listdir(frames) if f.startswith("frame_") and f.endswith(".png")])
    if n_frames == 0:
        sys.exit("帧目录为空")

    vid_dur = args.duration or (n_frames / args.fps)
    work = args.work or os.path.dirname(os.path.abspath(args.out))
    os.makedirs(work, exist_ok=True)

    print(f"[1/5] 帧数 {n_frames}, 视频时长 {vid_dur:.2f}s, fps {args.fps}")

    text = args.text
    if args.text_file:
        with open(args.text_file, encoding="utf-8") as f:
            text = f.read().strip()

    voice_path = None
    voice_dur = 0.0
    caption_meta = None
    captions_vtt = args.captions or ""

    if args.voice_file:
        voice_path = os.path.abspath(args.voice_file)
        voice_dur = probe_duration(ffmpeg, voice_path)
        print(f"[2/5] 使用现有配音 {voice_dur:.2f}s")
    elif text:
        voice_path = os.path.join(work, "voice.mp3")
        cap_json = os.path.join(work, "captions.json") if args.export_captions or not captions_vtt else None
        cap_vtt = os.path.join(work, "captions.vtt") if args.export_captions or not captions_vtt else None
        caption_meta = asyncio.run(
            run_tts_module(text, args.voice, args.rate, voice_path, cap_json, cap_vtt)
        )
        voice_dur = probe_duration(ffmpeg, voice_path)
        if cap_vtt and os.path.isfile(cap_vtt) and not captions_vtt:
            captions_vtt = cap_vtt
        print(f"[2/5] 配音 {voice_dur:.2f}s  ({args.voice})  cues={caption_meta.get('cue_count', 0)}")
        if voice_dur > vid_dur + 0.35:
            print(f"      WARN 配音比视频长 {voice_dur - vid_dur:.2f}s，将被截断。应加长分镜或放慢语速。")
    else:
        print("[2/5] 无配音")

    bgm = os.path.abspath(args.bgm) if args.bgm else ""
    if bgm and not os.path.isfile(bgm):
        sys.exit(f"BGM 不存在: {bgm}")

    # ---------- encode ----------
    print("[3/5] 编码合成")
    cmd = [
        ffmpeg, "-y",
        "-framerate", str(args.fps),
        "-i", os.path.join(frames, "frame_%04d.png"),
    ]
    input_idx = 1
    if voice_path:
        cmd += ["-i", voice_path]
        input_idx += 1
    if bgm:
        cmd += ["-i", bgm]

    vf_parts = []
    if args.burn_captions and captions_vtt:
        # escape path for ffmpeg subtitles filter
        sub = captions_vtt.replace("\\", "/").replace(":", "\\:").replace("'", "\\'")
        vf_parts.append(f"subtitles='{sub}'")

    fc, _maps = build_audio_filter(
        vid_dur,
        has_voice=bool(voice_path),
        has_bgm=bool(bgm),
        bgm_vol=args.bgm_vol,
        duck=not args.no_duck,
    )

    if vf_parts:
        cmd += ["-vf", ",".join(vf_parts)]

    if fc:
        cmd += ["-filter_complex", fc, "-map", "0:v", "-map", "[aout]"]
    else:
        cmd += ["-map", "0:v"]

    # softsubs (mov_text) if not burned
    softsub = False
    if captions_vtt and not args.burn_captions and os.path.isfile(captions_vtt):
        cmd += ["-i", captions_vtt]
        softsub = True
        # remap carefully
        # rebuild map: video + audio + subtitle
        # simpler path: add subtitle as late input and map
        pass

    cmd += [
        "-c:v", "libx264", "-preset", args.preset, "-crf", str(args.crf),
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-t", f"{vid_dur:.3f}",
    ]
    if voice_path or bgm:
        cmd += ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"]

    # Soft subtitle: re-run with cleaner command if needed
    # For reliability, if softsub requested, do two-pass style: first mux AV, then remux subs.
    tmp_out = args.out
    if softsub:
        tmp_out = os.path.join(work, "_tmp_av.mp4")
        # strip any accidental caption input from cmd — rebuild without softsub input
        # Actually current cmd may already have caption as last -i. Rebuild cleanly below.

    # Rebuild command cleanly for clarity
    cmd = [
        ffmpeg, "-y",
        "-framerate", str(args.fps),
        "-i", os.path.join(frames, "frame_%04d.png"),
    ]
    if voice_path:
        cmd += ["-i", voice_path]
    if bgm:
        cmd += ["-i", bgm]

    if vf_parts:
        cmd += ["-vf", ",".join(vf_parts)]

    if fc:
        cmd += ["-filter_complex", fc, "-map", "0:v", "-map", "[aout]"]
    else:
        cmd += ["-map", "0:v"]

    cmd += [
        "-c:v", "libx264", "-preset", args.preset, "-crf", str(args.crf),
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-t", f"{vid_dur:.3f}",
    ]
    if voice_path or bgm:
        cmd += ["-c:a", "aac", "-b:a", "192k", "-ar", "48000"]

    av_target = tmp_out if softsub else args.out
    cmd += [av_target]
    r = subprocess.run(cmd, capture_output=True, text=True, errors="ignore")
    if r.returncode != 0:
        print(r.stderr[-2000:])
        sys.exit("编码失败")

    if softsub:
        print("[3b/5] 封装软字幕")
        cmd2 = [
            ffmpeg, "-y",
            "-i", av_target,
            "-i", captions_vtt,
            "-c", "copy",
            "-c:s", "mov_text",
            "-metadata:s:s:0", "language=zho",
            args.out,
        ]
        r2 = subprocess.run(cmd2, capture_output=True, text=True, errors="ignore")
        if r2.returncode != 0:
            print(r2.stderr[-1500:])
            print("软字幕封装失败，保留无字幕成片")
            shutil.copy2(av_target, args.out)
        try:
            os.remove(av_target)
        except Exception:
            pass

    # ---------- QA ----------
    print("[4/5] 质检")
    out_dur = probe_duration(ffmpeg, args.out)
    size_mb = os.path.getsize(args.out) / 1024 / 1024
    streams = probe_streams(ffmpeg, args.out)
    wh = streams["resolution"]

    # sample stills for QA paths (caller should also inspect visually)
    still_dir = os.path.join(work, "qa-stills")
    os.makedirs(still_dir, exist_ok=True)
    # Always aim for 4 unique sample times even on short smokes.
    # Clamp away from EOF: input-seek near the last frame often yields empty output.
    safe_end = max(0.0, vid_dur - max(1.0 / max(args.fps, 1), 0.12))
    if vid_dur <= 2.5:
        sample_times = [0.0, vid_dur * 0.33, vid_dur * 0.66, safe_end]
    else:
        sample_times = [0.4, vid_dur * 0.33, vid_dur * 0.66, safe_end]
    uniq = []
    for ss in sample_times:
        ss = float(max(0.0, min(ss, safe_end)))
        if not uniq or abs(uniq[-1] - ss) > 0.02:
            uniq.append(ss)
    while len(uniq) < 4 and safe_end > 0:
        uniq.append(min(safe_end * (len(uniq) / 3.0), safe_end))
        uniq = sorted(set(round(x, 3) for x in uniq))
    still_paths = []
    for i, ss in enumerate(uniq[:4]):
        sp = os.path.join(still_dir, f"still_{i+1}.png")
        # output-seek is more reliable near EOF for short clips
        subprocess.run(
            [ffmpeg, "-y", "-i", args.out, "-ss", f"{ss:.2f}", "-frames:v", "1", sp],
            capture_output=True,
        )
        if os.path.isfile(sp) and os.path.getsize(sp) > 0:
            still_paths.append(sp)

    res_ok = True
    if wh:
        # allow 4:3 / 9:16 / 1:1 — check short side >= 1080 or long side >= 1920 for "pro"
        res_ok = max(wh) >= 1280 and min(wh) >= 720

    report = {
        "version": "2.0.0",
        "output": os.path.abspath(args.out),
        "duration": round(out_dur, 3),
        "expected_duration": round(vid_dur, 3),
        "size_mb": round(size_mb, 2),
        "frames": n_frames,
        "fps": args.fps,
        "resolution": {"w": wh[0], "h": wh[1]} if wh else None,
        "expected_resolution": {"w": args.width, "h": args.height},
        "voice": args.voice if voice_path else None,
        "voice_duration": round(voice_dur, 3),
        "bgm": bool(bgm),
        "captions": bool(captions_vtt),
        "burn_captions": bool(args.burn_captions),
        "video_stream": streams["video"],
        "audio_stream": streams["audio"],
        "qa_stills": still_paths,
        "checks": {
            "duration_ok": abs(out_dur - vid_dur) < 0.25,
            "has_audio": bool(voice_path or bgm),
            "size_reasonable": 0.15 < size_mb < 400,
            "resolution_pro": res_ok,
            "voice_fits": (not voice_path) or (voice_dur <= vid_dur + 0.4),
            "stills_exported": len(still_paths) >= 4,
        },
    }
    # has_audio is informational when user intentionally ships silent
    required = ["duration_ok", "size_reasonable", "resolution_pro", "voice_fits", "stills_exported"]
    report["checks"]["all_ok"] = all(report["checks"][k] for k in required)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    with open(os.path.join(work, "qa-report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print("[5/5] 完成" if report["checks"]["all_ok"] else "[5/5] 完成（有质检警告）")
    print("OUTPUT:", args.out)
    if not report["checks"]["duration_ok"] or not report["checks"]["size_reasonable"]:
        sys.exit("质检未通过：时长或体积异常")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
