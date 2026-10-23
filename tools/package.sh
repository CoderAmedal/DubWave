#!/usr/bin/env bash
# 打包成可上传 Chrome Web Store 的 zip（只含扩展运行所需文件）
set -euo pipefail

cd "$(dirname "$0")/.."

VERSION=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
OUT="dist/dubwave-${VERSION}.zip"

mkdir -p dist
rm -f "$OUT"

zip -qr "$OUT" manifest.json src icon LICENSE \
  -x "*.DS_Store" "*/__pycache__/*"

echo "built: $OUT"
unzip -l "$OUT" | tail -3
