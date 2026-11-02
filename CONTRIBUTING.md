# Contributing · 贡献指南

感谢你愿意改进 **Motion Craft Pro / 动效工坊 Pro**。

本项目对标 **Claude Opus 5.5** 写代码做动效的审美与导演习惯。贡献在合并前必须守住同一契约。

## 原则

1. **审美**：冷静、留白、克制青铜点缀；禁止满屏弹性狂欢与堆特效。
2. **流程**：分镜 JSON → TTS → 静帧质检 → 整段渲染，不可跳过。
3. **扁平结构**：WorkBuddy 专家包最多两级目录；技能文件必须与 `SKILL.md` 同级。
4. **`renderFrame(t)` 纯函数**：禁止 `Date.now()` / `Math.random()`。
5. **数字说话**：分镜与 PR 描述写 px / s / damping，不写「大气一点」。

## 开发前

```bash
pip install edge-tts
npm i puppeteer-core
# 需要本机 Chrome / Chromium + 完整 FFmpeg
python skills/motion-craft/compose.py --check
```

## 提 PR 前请自检

- [ ] `plugin.json`：`tags` 正好 3 个；`defaultInitPrompt` 与 `quickPrompts[0]` 中英文一致
- [ ] `profession.zh` 在同类型资产中唯一（当前：`程序化动效导演`）
- [ ] 技能 `name` 必须是 `motion-craft`；专家 `name` 是 `motion-director`
- [ ] 头像 / 技能图标 **512×512** PNG
- [ ] 未把 `node_modules`、大体积 mp4、frames 打进 zip
- [ ] 若改场景组件：同步 `storyboard.schema.json` 的 `enum` 与根 README 场景表
- [ ] 专家包短说明改 `README.expert.md`（`build.py` 会把它打成包内 `README.md`）

## 打包

```bash
python build.py
# → dist/ 与 releases/
```

## 许可

贡献默认按 **Apache License 2.0** 授权。
