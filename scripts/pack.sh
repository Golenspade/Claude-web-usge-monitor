#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$ROOT_DIR/dist"
PKG_DIR="$ROOT_DIR/claude-usage-monitor"
ZIP_PATH="$OUT_DIR/claude-usage-monitor.zip"

mkdir -p "$OUT_DIR"
rm -f "$ZIP_PATH"

# Create a clean zip with only the extension folder (exclude hidden files)
(cd "$ROOT_DIR" && zip -r "$ZIP_PATH" "$(basename "$PKG_DIR")" -x "*/.*")

echo "Built $ZIP_PATH"

