#!/usr/bin/env python3
"""
tts.py — Motion Craft Pro 配音（Edge TTS）+ 字级边界字幕导出

用法：
  python tts.py --text "旁白" --out voice.mp3
  python tts.py --text-file script.txt --out voice.mp3 --voice zh-CN-YunxiNeural --rate=-6%
  python tts.py --text "旁白" --out voice.mp3 --captions-json captions.json --captions-vtt captions.vtt
  python tts.py --list

依赖：pip install edge-tts
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import subprocess
import sys

VOICES = [
    ("zh-CN-XiaoxiaoNeural", "温暖自然女声", "通用、讲解、品牌"),
    ("zh-CN-YunxiNeural", "沉稳男声", "科技、商务、纪录片 · Pro 默认"),
    ("zh-CN-YunyangNeural", "播音腔男声", "新闻、严肃、权威"),
    ("zh-CN-XiaoyiNeural", "活泼女声", "种草、轻内容、社媒"),
    ("zh-CN-liaoning-XiaobeiNeural", "东北女声", "方言、趣味"),
    ("zh-CN-shaanxi-XiaoniNeural", "陕西女声", "方言、趣味"),
    ("zh-TW-HsiaoChenNeural", "台湾女声", "繁体、台湾受众"),
    ("en-US-AriaNeural", "English female", "英文旁白"),
]


def find_ffmpeg():
    for c in [
        os.environ.get("FFMPEG_BIN"),
        "ffmpeg",
        "/usr/bin/ffmpeg",
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
    ]:
        if not c:
            continue
        try:
            r = subprocess.run([c, "-version"], capture_output=True, timeout=5)
            if r.returncode == 0:
                return c
        except Exception:
            continue
    return None


def duration_of(path, ffmpeg):
    if not ffmpeg:
        return None
    r = subprocess.run([ffmpeg, "-i", path], capture_output=True, text=True, errors="ignore")
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", r.stderr)
    if not m:
        return None
    h, mi, s = m.groups()
    return int(h) * 3600 + int(mi) * 60 + float(s)


def srt_ts(seconds: float) -> str:
    if seconds < 0:
        seconds = 0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int(round((seconds - int(seconds)) * 1000))
    if ms >= 1000:
        s += 1
        ms = 0
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


def group_words(words, group_chars=14):
    """WordBoundary list → phrase cues [{start,end,text,words}]"""
    cues = []
    buf = []
    buf_text = ""
    start = None
    end = 0.0
    for w in words:
        s = float(w.get("offset_ms", w.get("offset", 0))) / 1000.0
        d = float(w.get("duration_ms", w.get("duration", 0))) / 1000.0
        e = s + d
        text = w.get("text") or w.get("word") or ""
        if start is None:
            start = s
        buf.append({"t": s, "duration": d, "text": text})
        buf_text += text
        end = e
        if len(re.sub(r"\s+", "", buf_text)) >= group_chars:
            cues.append({"start": start, "end": end + 0.06, "text": buf_text.strip(), "words": buf})
            buf, buf_text, start = [], "", None
    if buf_text.strip():
        cues.append({"start": start or 0.0, "end": end + 0.08, "text": buf_text.strip(), "words": buf})
    return cues


def write_vtt(cues, path):
    lines = ["WEBVTT", ""]
    for i, c in enumerate(cues, 1):
        lines.append(str(i))
        lines.append(f"{srt_ts(c['start'])} --> {srt_ts(c['end'])}")
        lines.append(c["text"])
        lines.append("")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


async def synth(text, voice, rate, volume, pitch, out, captions_json=None, captions_vtt=None, group_chars=14):
    import edge_tts

    words = []
    sentences = []
    audio_chunks = []
    comm = edge_tts.Communicate(text, voice, rate=rate, volume=volume, pitch=pitch)
    async for chunk in comm.stream():
        typ = chunk.get("type")
        if typ == "audio":
            audio_chunks.append(chunk["data"])
        elif typ in ("WordBoundary", "SentenceBoundary"):
            # edge-tts: offset/duration are in 100-nanosecond units (ticks)
            offset_ticks = chunk.get("offset", 0)
            duration_ticks = chunk.get("duration", 0)
            item = {
                "offset_ms": offset_ticks / 10000.0,
                "duration_ms": duration_ticks / 10000.0,
                "text": chunk.get("text", ""),
                "kind": typ,
            }
            if typ == "WordBoundary":
                words.append(item)
            else:
                sentences.append(item)

    with open(out, "wb") as f:
        for b in audio_chunks:
            f.write(b)

    cues = []
    if words:
        cues = group_words(words, group_chars=group_chars)
    elif sentences:
        # Newer edge-tts often emits SentenceBoundary only (esp. zh).
        # Split each sentence on commas / enumeration marks with proportional time.
        for sent in sentences:
            s0 = sent["offset_ms"] / 1000.0
            dur = max(0.05, sent["duration_ms"] / 1000.0)
            raw = (sent.get("text") or "").strip()
            parts = [x for x in re.split(r"(?<=[，,、；;])", raw) if x.strip()]
            if not parts:
                parts = [raw]
            weights = [max(1, len(re.sub(r"\s+", "", x))) for x in parts]
            total_w = float(sum(weights)) or 1.0
            cursor = s0
            for part, w in zip(parts, weights):
                share = dur * (w / total_w)
                cues.append({
                    "start": cursor,
                    "end": cursor + share,
                    "text": part.strip(" ，,、；;"),
                    "words": [],
                })
                cursor += share
    else:
        parts = re.split(r"(?<=[。！？；;.!?])\s*", text.strip())
        parts = [p for p in parts if p.strip()]
        ff = find_ffmpeg()
        dur = duration_of(out, ff) or max(1.0, len(text) / 4.5)
        t0 = 0.0
        share = dur / max(1, len(parts))
        for part in parts:
            cues.append({"start": t0, "end": min(dur, t0 + share), "text": part.strip(), "words": []})
            t0 += share

    meta = {
        "voice": voice,
        "rate": rate,
        "word_count": len(words),
        "sentence_count": len(sentences),
        "cue_count": len(cues),
        "has_word_boundaries": bool(words),
        "has_sentence_boundaries": bool(sentences),
        "cues": cues,
        "words": words,
        "sentences": sentences,
    }
    if captions_json:
        with open(captions_json, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
    if captions_vtt:
        write_vtt(cues, captions_vtt)
    return meta


def main():
    ap = argparse.ArgumentParser(description="Motion Craft Pro TTS + captions")
    ap.add_argument("--text", default="")
    ap.add_argument("--text-file", default="")
    ap.add_argument("--out", default="voice.mp3")
    ap.add_argument("--voice", default="zh-CN-YunxiNeural")
    ap.add_argument("--rate", default="-6%")
    ap.add_argument("--volume", default="+0%")
    ap.add_argument("--pitch", default="+0Hz")
    ap.add_argument("--captions-json", default="", help="导出字/句级字幕 JSON")
    ap.add_argument("--captions-vtt", default="", help="导出 WebVTT")
    ap.add_argument("--group-chars", type=int, default=14, help="短语字幕分组字数")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    if args.list:
        print(f"{'音色':<34}{'气质':<14}适合")
        print("-" * 72)
        for v, d, u in VOICES:
            print(f"{v:<34}{d:<14}{u}")
        return

    text = args.text
    if args.text_file:
        with open(args.text_file, encoding="utf-8") as f:
            text = f.read().strip()
    if not text:
        sys.exit("缺少旁白文本：用 --text 或 --text-file")

    meta = asyncio.run(
        synth(
            text,
            args.voice,
            args.rate,
            args.volume,
            args.pitch,
            args.out,
            captions_json=args.captions_json or None,
            captions_vtt=args.captions_vtt or None,
            group_chars=args.group_chars,
        )
    )

    ff = find_ffmpeg()
    dur = duration_of(args.out, ff)
    size_kb = os.path.getsize(args.out) / 1024
    print(f"OK {args.out}  {size_kb:.1f} KB" + (f"  {dur:.2f}s" if dur else ""))
    chars = len([c for c in text if not c.isspace()])
    if dur:
        print(f"   文案 {chars} 字 / {dur:.2f}s = {chars / dur:.1f} 字每秒")
    print(f"   WordBoundary: {meta['word_count']}  SentenceBoundary: {meta.get('sentence_count', 0)}  cues: {meta['cue_count']}")
    if args.captions_json:
        print(f"   captions json: {args.captions_json}")
    if args.captions_vtt:
        print(f"   captions vtt: {args.captions_vtt}")


if __name__ == "__main__":
    main()
