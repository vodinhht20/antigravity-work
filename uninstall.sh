#!/usr/bin/env bash
set -euo pipefail

HOST="com.antigravity.browser_bridge"
MCP_KEY="gecko-for-antigravity"
BROWSER="all"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --browser)
      BROWSER="${2:-all}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

remove_manifest() {
  local path="$1"
  if [ -f "$path" ]; then
    rm -f "$path"
    echo "Removed manifest: $path"
  fi
}

OS="$(uname -s)"
if [ "$OS" = "Darwin" ]; then
  SUPPORT="$HOME/Library/Application Support"
  [ "$BROWSER" = "all" ] || [ "$BROWSER" = "chrome" ]   && remove_manifest "$SUPPORT/Google/Chrome/NativeMessagingHosts/${HOST}.json"
  [ "$BROWSER" = "all" ] || [ "$BROWSER" = "chromium" ] && remove_manifest "$SUPPORT/Chromium/NativeMessagingHosts/${HOST}.json"
  [ "$BROWSER" = "all" ] || [ "$BROWSER" = "edge" ]     && remove_manifest "$SUPPORT/Microsoft Edge/NativeMessagingHosts/${HOST}.json"
  [ "$BROWSER" = "all" ] || [ "$BROWSER" = "brave" ]    && remove_manifest "$SUPPORT/BraveSoftware/Brave-Browser/NativeMessagingHosts/${HOST}.json"

  if [ "$BROWSER" = "all" ]; then
    for dir in "$SUPPORT/Gecko for Antigravity" "$SUPPORT/Gravity Panel" "$SUPPORT/AntigravityWork"; do
      if [ -d "$dir" ]; then
        rm -rf "$dir"
        echo "Removed companion directory: $dir"
      fi
    done
  fi
else
  CFG="$HOME/.config"
  DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
  [ "$BROWSER" = "all" ] || [ "$BROWSER" = "chrome" ]   && remove_manifest "$CFG/google-chrome/NativeMessagingHosts/${HOST}.json"
  [ "$BROWSER" = "all" ] || [ "$BROWSER" = "chromium" ] && remove_manifest "$CFG/chromium/NativeMessagingHosts/${HOST}.json"
  [ "$BROWSER" = "all" ] || [ "$BROWSER" = "edge" ]     && remove_manifest "$CFG/microsoft-edge/NativeMessagingHosts/${HOST}.json"
  [ "$BROWSER" = "all" ] || [ "$BROWSER" = "brave" ]    && remove_manifest "$CFG/BraveSoftware/Brave-Browser/NativeMessagingHosts/${HOST}.json"

  if [ "$BROWSER" = "all" ]; then
    for dir in "$DATA/gecko-antigravity" "$DATA/gravity-panel" "$DATA/antigravity-work"; do
      if [ -d "$dir" ]; then
        rm -rf "$dir"
        echo "Removed companion directory: $dir"
      fi
    done
  fi
fi

# Remove MCP registration from ~/.gemini/antigravity/mcp_config.json without touching other servers
MCP_CONFIG="$HOME/.gemini/antigravity/mcp_config.json"
if [ -f "$MCP_CONFIG" ] && command -v python3 >/dev/null 2>&1; then
  python3 - "$MCP_CONFIG" "$MCP_KEY" <<'PY'
import json, sys
from pathlib import Path

cfg_path = Path(sys.argv[1])
mcp_key = sys.argv[2]
try:
    data = json.loads(cfg_path.read_text(encoding="utf-8"))
    if isinstance(data, dict) and isinstance(data.get("mcpServers"), dict) and mcp_key in data["mcpServers"]:
        del data["mcpServers"][mcp_key]
        cfg_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        print(f"Removed MCP server '{mcp_key}' from {cfg_path}")
except Exception:
    pass
PY
fi

echo ""
echo "Gecko for Antigravity companion has been uninstalled."
echo "Note: To also remove the Chrome extension, open chrome://extensions and click Remove."
