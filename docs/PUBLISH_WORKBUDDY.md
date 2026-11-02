# WorkBuddy 发布指南 · Publish to WorkBuddy

动效工坊 Pro / Motion Craft Pro **v2.0.0**

对标 **Claude Opus 5.5** 代码动效审美的技能包与专家包，如何一次传对、一次过审。

---

## 1. 两个包，两个入口（最容易传错）

| 页面 | Zip 文件 | Zip 根目录必须有 | 关键 `name` |
|---|---|---|---|
| **技能 Skill** | `dist/motion-craft-pro-skill-v2.0.0.zip` | `SKILL.md` + 引擎文件（**扁平同级**） | **`motion-craft`** |
| **专家 Expert** | `dist/expert-motion-craft-pro-v2.0.0.zip` | `.codebuddy-plugin/plugin.json` | **`motion-director`** |

> 技能页上传专家包 → name 对不上（`motion-director` ≠ 资产名 `motion-craft`）。  
> 专家页上传技能包 → 「未找到 `.codebuddy-plugin/plugin.json`」。

图标：

| 用途 | 文件 | 尺寸 |
|---|---|---|
| 技能图标 | `docs/assets/skill_icon_512.png` | **512×512** PNG |
| 专家头像 | `avatars/expert.png`（已打进专家 zip） | **512×512** PNG |

---

## 2. 专家包字段核对（v2.0.0 已修好）

打开 `.codebuddy-plugin/plugin.json`：

| 检查项 | 要求 | 当前 |
|---|---|---|
| `tags` | **正好 3 个** | 动效视频 / 分镜优先 / Claude 审美 |
| `defaultInitPrompt.zh` | = `quickPrompts[0].zh` | 已对齐 |
| `defaultInitPrompt.en` | = `quickPrompts[0].en` | 已对齐 |
| `profession.zh` | 同类型资产**唯一** | **`程序化动效导演`** |
| `profession.en` | — | `Programmatic Motion Director` |
| `avatar` | 指向包内路径 | `avatars/expert.png` |
| Zip 结构 | 根目录即 `.codebuddy-plugin/`… | **不要**再套一层文件夹 |

`displayDescription` 建议（已写入 plugin.json，页面也可再贴）：

- 中文：分镜优先的程序化动效：Spring、场景组件、字级字幕、1080p Canvas。对标 Claude Opus 5.5 审美。不是写实 AI 视频。
- English：Storyboard-first motion graphics with spring, scene helpers, captions, 1080p Canvas. Claude Opus 5.5 aesthetic. Not photoreal AI video.

---

## 3. 技能包字段核对

打开 zip 根目录 `SKILL.md` frontmatter：

1. **`name: motion-craft`**（资产固定名，勿改）
2. `engine.js` / `scenes.js` / `render.js` / `tts.py` / `compose.py` / `film.html` 与 `SKILL.md` **同级**（禁止 `scripts/` 子目录）
3. 技能页上传图标用 **512×512**（仓库：`docs/assets/skill_icon_512.png`）

---

## 4. 常见报错 ↔ 修复

| 报错 | 原因 | 修复 |
|---|---|---|
| `tags 须固定 3 个，当前 4 个` | tags 多了 | 删到正好 3 个 |
| `defaultInitPrompt.zh 必须与 quickPrompts[0].zh 一致` | 默认开场 ≠ 第一条快捷提示 | 两边改成**完全相同**字符串（en 同理） |
| `未找到 .codebuddy-plugin/plugin.json` | 传错包 / zip 多包一层目录 | 专家页用专家 zip；确认 plugin.json 在 zip 根路径 |
| `该名称「动效导演」已被使用` | `profession.zh` 撞名 | 改为唯一名（现为「程序化动效导演」） |
| 技能 name 与资产不一致 | 专家包传到技能页 | 传 `motion-craft-pro-skill-*.zip` |
| 头像尺寸不符 | 非 512×512 | 用仓库内 512 图重新上传 |

---

## 5. 发布文案（可直接粘贴）

### 技能页

- **名称**：动效工坊 Pro / Motion Craft Pro  
- **简介**：对标 Claude Opus 5.5 代码动效审美。分镜 JSON → Edge TTS → 静帧质检 → 1080p Canvas。Spring、六场景组件、字幕时间轴。不是写实 AI 视频。  
- **图标**：`docs/assets/skill_icon_512.png`

### 专家页

- **显示名**：动效工坊 Pro  
- **职业**：程序化动效导演  
- **简介**：分镜优先 · Spring · 场景组件 · 字级字幕 · 1080p。对标 Claude Opus 5.5 写代码做片的导演习惯。  
- **头像**：包内 `avatars/expert.png`

---

## 6. 重新打 zip

```bash
python build.py
# 输出到 dist/ 与 releases/
# 专家包内 README 使用 README.expert.md 短版
```

已打好的文件：

- `dist/motion-craft-pro-skill-v2.0.0.zip`
- `dist/expert-motion-craft-pro-v2.0.0.zip`

同内容副本在 `releases/`，方便挂 GitHub Release。

---

## 7. 开源仓库

完整说明、架构图、七步工作流、场景 API：仓库根目录 [README.md](../README.md)  
网页上传 GitHub：[GITHUB_UPLOAD.txt](../GITHUB_UPLOAD.txt)
