# 动效工坊 Pro · Motion Craft Pro

**对标 Claude Opus 5.5 代码动效审美的程序化动效专家包。**

*Storyboard-first · Subtle spring · Captions · 1080p Canvas · Not photoreal AI video.*

| | |
|---|---|
| 专家 | `motion-director` · 职业：**程序化动效导演** |
| 技能 | `motion-craft`（包内 `skills/motion-craft/`） |
| 版本 | 2.0.0 · Apache-2.0 |
| 管线 | 分镜 JSON → Edge TTS → 静帧质检 → Chrome 逐帧 → FFmpeg |

## 导演纪律（硬契约）

1. 默认 **1920×1080**
2. 一屏一件事；长 hold、短飞入；幕间淡出
3. Spring damping ≈ 16–18；禁止满屏弹跳
4. 留白 ≥ 短边 8%；暖白字 `#f4f1ea`；青铜强调 `#c4a574`
5. 数字说话，不写形容词
6. 先 ≥4 张静帧，再全时长渲染
7. `renderFrame(t)` 纯函数：禁止 `Date.now()` / `Math.random()`

## 六场景

`TitleBeat` · `BulletReveal` · `StatCounter` · `CompareBars` · `QuoteCard` · `EndCard`

## 本机依赖

Chrome/Chromium · Node 18+ · puppeteer-core · Python 3.9+ · `pip install edge-tts` · **完整版** FFmpeg

```bash
python skills/motion-craft/compose.py --check
```

## 完整文档

开源仓库根目录 README（架构、七步工作流、API、发布对照）以 GitHub 版为准。  
WorkBuddy 排错见仓库 `docs/PUBLISH_WORKBUDDY.md`。

---

克制，才是高级感。
