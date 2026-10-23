#!/usr/bin/env python3
"""从 icon/icon.svg 生成各尺寸 PNG（需要 ImageMagick 的 magick 命令）。

    python3 tools/make_icons.py

小尺寸（16/32）会先裁掉一点边缘再缩放，让中间的播放键在工具栏里更清楚。
"""
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageEnhance

ROOT = Path(__file__).resolve().parent.parent
SVG = ROOT / "icon" / "icon.svg"
SIZES = (16, 32, 48, 128, 512)
SMALL = (16, 32)


def main() -> None:
    if not SVG.exists():
        raise SystemExit(f"缺少 {SVG}")
    if not shutil.which("magick"):
        raise SystemExit("需要 ImageMagick：sudo dnf install ImageMagick")

    big = ROOT / "icon" / f"icon{SIZES[-1]}.png"
    subprocess.run(
        ["magick", "-background", "none", "-density", "384", str(SVG), "-resize", "512x512", str(big)],
        check=True,
    )

    for size in SIZES[:-1]:
        out = ROOT / "icon" / f"icon{size}.png"
        if size in SMALL:
            im = Image.open(big).convert("RGBA")
            w, h = im.size
            margin = int(w * 0.08)
            im = im.crop((margin, margin, w - margin, h - margin))
            im = ImageEnhance.Brightness(im).enhance(1.12)
            im = ImageEnhance.Contrast(im).enhance(1.08)
            im.resize((size, size), Image.LANCZOS).save(out)
        else:
            subprocess.run(["magick", str(big), "-resize", f"{size}x{size}", str(out)], check=True)

    print("icons:", ", ".join(f"icon{s}.png" for s in SIZES))


if __name__ == "__main__":
    main()
