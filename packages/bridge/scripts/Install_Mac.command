#!/usr/bin/env bash
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.agy/bin:$HOME/.antigravity/bin:$PATH"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=================================================="
echo "  Gecko for Antigravity - macOS Companion Setup"
echo "=================================================="

PYTHON_BIN=""
for candidate in /opt/homebrew/bin/python3 /usr/local/bin/python3 "$(command -v python3 || true)" /usr/bin/python3; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    PYTHON_BIN="$candidate"
    break
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  echo "Khong tim thay Python 3.10+. Hay cai Python tu https://www.python.org/downloads/ hoac Homebrew (brew install python)."
  read -r -p "Nhan Enter de dong..."
  exit 1
fi

EXT_ID="${1:-}"
while [ -z "$EXT_ID" ]; do
  echo ""
  echo "Mo Chrome -> chrome://extensions -> sao chep Extension ID cua 'Gecko for Antigravity' (32 chu cai)."
  read -r -p "Dan Extension ID vao day: " EXT_ID
done

EXTRA_ARGS=(--mcp)
if ! command -v agy >/dev/null 2>&1; then
  echo ""
  echo "Khong thay lenh 'agy' CLI tren may nay (chi thay Antigravity App hoac chua cai CLI)."
  read -r -p "Ban co muon cai them Antigravity Python SDK de dung Side Panel luon khong? [Y/n]: " USE_SDK
  if [ -z "$USE_SDK" ] || [ "$USE_SDK" = "y" ] || [ "$USE_SDK" = "Y" ]; then
    EXTRA_ARGS+=(--sdk)
  fi
fi

echo ""
echo "Dang cai dat companion cho Chrome/Edge/Brave/Chromium..."
"$PYTHON_BIN" "$SCRIPT_DIR/install_host.py" --extension-id "$EXT_ID" --browser all "${EXTRA_ARGS[@]}"

echo ""
echo "Hoan tat! Hay quay lai Chrome Side Panel, ket noi se tu dong chuyen sang trang thai San sang."
read -r -p "Nhan Enter de dong cua so nay..."
