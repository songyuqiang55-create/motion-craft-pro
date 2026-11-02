#!/usr/bin/env python3
"""Pack Motion Craft Pro expert zip + skill-only zip (contents at zip root)."""
from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

VERSION = "2.0.0"
HERE = Path(__file__).resolve().parent
DIST = HERE / "dist"
RELEASES = HERE / "releases"
SKILL_DIR = HERE / "skills" / "motion-craft"

EXPERT_NAME = f"expert-motion-craft-pro-v{VERSION}.zip"
SKILL_NAME = f"motion-craft-pro-skill-v{VERSION}.zip"

SKIP_SUFFIX = {".pyc", ".pyo"}


def pack_expert(target: Path) -> None:
    if target.exists():
        target.unlink()
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(HERE / ".codebuddy-plugin" / "plugin.json", ".codebuddy-plugin/plugin.json")
        zf.write(HERE / "agents" / "motion-director.md", "agents/motion-director.md")
        avatar = HERE / "avatars" / "expert.png"
        if avatar.exists():
            zf.write(avatar, "avatars/expert.png")
        # WorkBuddy expert package: short premium README + expert SKILL entry
        expert_readme = HERE / "README.expert.md"
        if expert_readme.exists():
            zf.write(expert_readme, "README.md")
        elif (HERE / "README.md").exists():
            zf.write(HERE / "README.md", "README.md")
        skill_entry = HERE / "SKILL.md"
        if skill_entry.exists():
            zf.write(skill_entry, "SKILL.md")
        for p in sorted(SKILL_DIR.iterdir()):
            if p.is_file() and p.suffix not in SKIP_SUFFIX and p.name != ".DS_Store":
                zf.write(p, f"skills/motion-craft/{p.name}")
    print("expert:", target, target.stat().st_size)


def pack_skill(target: Path) -> None:
    if target.exists():
        target.unlink()
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(SKILL_DIR.iterdir()):
            if p.is_file() and p.suffix not in SKIP_SUFFIX and p.name != ".DS_Store":
                zf.write(p, p.name)  # skill files at zip ROOT
    print("skill:", target, target.stat().st_size)


def verify(expert: Path, skill: Path) -> None:
    with zipfile.ZipFile(expert) as zf:
        names = zf.namelist()
        assert ".codebuddy-plugin/plugin.json" in names
        assert "skills/motion-craft/SKILL.md" in names
        assert "skills/motion-craft/engine.js" in names
        assert "agents/motion-director.md" in names
        assert "avatars/expert.png" in names
        for n in names:
            if n.startswith("skills/motion-craft/") and n.count("/") > 2:
                raise SystemExit(f"nested path not allowed: {n}")
            if n.startswith("motion-craft-pro/"):
                raise SystemExit(f"wrapper folder not allowed: {n}")
    with zipfile.ZipFile(skill) as zf:
        names = zf.namelist()
        assert "SKILL.md" in names
        assert "engine.js" in names
        assert "scenes.js" in names
        assert all("/" not in n for n in names), names
        text = zf.read("SKILL.md").decode("utf-8", errors="replace")
        assert "name: motion-craft" in text or 'name: "motion-craft"' in text or "name:motion-craft" in text.replace(" ", "")
    print("verify: OK")


def main() -> None:
    DIST.mkdir(parents=True, exist_ok=True)
    RELEASES.mkdir(parents=True, exist_ok=True)
    expert = DIST / EXPERT_NAME
    skill = DIST / SKILL_NAME
    pack_expert(expert)
    pack_skill(skill)
    verify(expert, skill)
    shutil.copy2(expert, RELEASES / EXPERT_NAME)
    shutil.copy2(skill, RELEASES / SKILL_NAME)
    print("copied to releases/")


if __name__ == "__main__":
    main()
