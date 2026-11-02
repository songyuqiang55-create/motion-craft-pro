---
name: motion-craft
description: >-
  Motion Craft Pro — programmatic motion-graphics with a Remotion-inspired light
  director stack: storyboard JSON, spring easing, scene helpers, Edge TTS with
  word-boundary captions, 1080p Canvas render and FFmpeg mux. Claude Opus aesthetic:
  calm editorial typography, generous whitespace, subtle spring. Not AI photoreal video.
description_zh: "动效工坊 Pro：分镜 JSON → Edge TTS 字级字幕 → Canvas 1080p 逐帧 → FFmpeg 合成。Spring 缓动、场景组件、字幕时间轴，对标 Claude Opus 5.5 代码动效审美（冷静、留白、精确）。不是写实 AI 视频。"
description_en: "Motion Craft Pro: storyboard-first programmatic motion graphics with spring easing, scene helpers, word-level captions, 1080p Canvas render. Claude Opus 5.5 aesthetic. Not photoreal AI video."
version: 2.0.0
allowed-tools: Read,Bash,Write
display_name: "动效工坊 Pro"
display_name_en: "Motion Craft Pro"
visibility: "public"
examples_zh:
  - "按 Claude 审美做一条 16:9 十八秒动效片，讲克制才是高级感"
  - "把这段文案做成分镜 JSON，再配音、抽静帧、渲染 1080p"
  - "用 TitleBeat + StatCounter + EndCard 做产品发布短片"
examples_en:
  - "Make an 18s 16:9 motion piece in Claude aesthetic about restraint"
  - "Turn this script into storyboard JSON, TTS, stills QA, then 1080p render"
  - "Build a launch short with TitleBeat, StatCounter and EndCard"
author: "WorkBuddy User"
---

# Motion Craft Pro · 动效工坊 Pro

程序化 motion graphics。对标 Claude Opus 5.5 写代码做片的审美与习惯：**先分镜，再配音，再静帧，再整段渲染**。

不是可灵/即梦那种 AI 生视频。画面由代码在 Canvas 上逐帧画出来。

## 先定位技能目录（每次必做）

`engine.js` / `scenes.js` / `render.js` / `compose.py` / `tts.py` / `film.html` / `storyboard.json` **全部在本 SKILL.md 同级目录**（扁平，无子文件夹）。

`<技能目录>` = 本文件父目录的**绝对路径**。

```bash
# 自检路径
python "<技能目录>/compose.py" --check
```

禁止依赖相对路径 `python scripts/compose.py`——审核环境会找不到。

## 依赖

| 依赖 | 用途 |
|---|---|
| Node 18+ | render.js |
| puppeteer-core | 驱动本机 Chrome |
| Chrome / Chromium | 渲染 |
| Python 3.9+ | tts / compose |
| edge-tts | `pip install edge-tts` |
| FFmpeg 完整版 | 合成（排除 Playwright 精简版） |

## 质量条（按这个做，就是「Pro」）

1. **默认 1920×1080**（也支持 1440×1080 / 1080×1920 / 1080×1080）
2. **一屏一件事**；幕间必须淡出；长 hold，短飞入
3. **Spring 轻微 overshoot**（damping≈16–18，禁止满屏弹性狂欢）
4. **留白**：外边距 ≥ 短边 8%；正文暖白 `#f4f1ea`，强调色克制（默认青铜 `#c4a574`）
5. **标题加字距**；层级字号差 ≥ 1.5×
6. **配音先行** + 尽量导出 WordBoundary 字幕
7. **先导出 ≥4 张静帧验收**，再全时长渲染
8. `renderFrame(t)` 纯函数：禁止 `Date.now()` / `Math.random()`

## 工作流（严格按序）

### 1. 写分镜 JSON（先于一切代码）

复制 `storyboard.json`，按 `storyboard.schema.json` 填：

- `meta`：画幅、时长、旁白全文、音色
- `beats[]`：`id, start, end, type, copy, visual`
- 场景类型：`TitleBeat` / `BulletReveal` / `StatCounter` / `CompareBars` / `QuoteCard` / `EndCard`

**数字说话，不写形容词。** 例：标题 86px、入场 0.9s、hold 2.2s——不要写「大气一点」。

### 2. TTS → 真实时长 → 回写时间轴

```bash
python "<技能目录>/tts.py" \
  --text-file narration.txt \
  --out "<工作目录>/voice.mp3" \
  --voice zh-CN-YunxiNeural \
  --rate=-6% \
  --captions-json "<工作目录>/captions.json" \
  --captions-vtt "<工作目录>/captions.vtt"
```

用真实 `voice.mp3` 时长改 `beats[].start/end` 与 `meta.duration`。不要先拍脑袋写死时间再配音。

> 字幕说明：若 Edge TTS 返回 WordBoundary 则按字聚合；当前多数中文音色仅有 SentenceBoundary，脚本会按逗号/顿号比例切成短语级 VTT。

### 3. 填 film.html（或基于模板改）

- 同目录引用：`engine.js`、`scenes.js`（**不要** `../assets/`）
- 把 storyboard 嵌进页面，或保持与 `storyboard.json` 同步
- 调用 `MCScenes.drawScene(...)`；右侧装饰可手写，但内容尽量走场景组件

### 4. 静帧质检（必做）

先渲染短样或在浏览器拖 `t`，或先渲 1fps 关键点。至少检查：**开场、中段、数据/对比、收尾**。

检查：叠层、溢字、过暗、对齐、字幕可读。

### 5. 全量渲染

```bash
node "<技能目录>/render.js" \
  "<工作目录>/film.html" \
  "<工作目录>/frames" \
  30 \
  18
```

### 6. 合成

```bash
python "<技能目录>/compose.py" \
  --frames "<工作目录>/frames" \
  --voice-file "<工作目录>/voice.mp3" \
  --captions "<工作目录>/captions.vtt" \
  --out "<工作目录>/out.mp4" \
  --duration 18 \
  --width 1920 --height 1080
```

可选：`--bgm music.mp3`（旁白闪避）、`--burn-captions`、或 `--text` 让 compose 内联 TTS。

### 7. 读 qa-report.json + 四张 qa-stills

不过关就改分镜/排版，重渲——不要硬交。

## 引擎 API（engine.js）

```js
const {
  Ease, spring, springSeg, seg, lerp, beatAlpha,
  glow, beam, drawBackdrop, createParticles, drawParticles,
  drawGrain, drawVignette, drawColorGrade,
  drawTracked, wrapCN, camera, transition, applyWipe,
  divider, card, ring, bars,
  drawCaptions, captionsFromWordBoundaries, layoutGrid, Palette
} = MC;

const { TitleBeat, BulletReveal, StatCounter, CompareBars, QuoteCard, EndCard, drawScene } = MCScenes;
```

### Spring 建议参数（Claude 审美）

| 用途 | damping | stiffness | overshootClamping |
|---|---|---|---|
| 标题入场 | 16–18 | 140–160 | false（允许极轻回弹） |
| 列表项 | 18 | 145 | true |
| 数字跳动 | 14 | 120 | false |

## 画幅

| 用途 | 尺寸 |
|---|---|
| 默认横屏 | **1920×1080** |
| 课件 / 4:3 | 1440×1080 |
| 竖屏 | 1080×1920 |
| 方图 | 1080×1080 |

用 `layoutGrid(W,H)` 取边距与双栏。

## 交付物

- `storyboard.json`
- `film.html`（可重渲染）
- `voice.mp3` + `captions.vtt` / `captions.json`
- `out.mp4`（1080p 级）
- `qa-report.json` + `qa-stills/*.png` ≥ 4

## 边界

- 产出 **motion graphics**，不是实拍，不是扩散模型视频
- 复杂 3D / 角色表演 / 流体不在范围内
- Edge TTS 不是真人；情感上限有限
- 完整 Remotion 工程（React 生态、服务端渲染集群）不在本包内；本包是可上架的**轻量导演栈**
