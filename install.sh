#!/usr/bin/env bash
set -euo pipefail

REPO="vodinhht20/antigravity-work"
REF="${GECKO_REF:-main}"
BROWSER="${GECKO_BROWSER:-all}"
USE_SDK="${GECKO_SDK:-0}"
SKIP_CLI="${GECKO_SKIP_CLI:-0}"
EXT_ID="${GECKO_EXT_ID:-}"

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.agy/bin:$HOME/.antigravity/bin:$PATH"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --sdk)
      USE_SDK=1
      shift
      ;;
    --skip-cli)
      SKIP_CLI=1
      shift
      ;;
    --browser)
      BROWSER="${2:-all}"
      shift 2
      ;;
    --ref)
      REF="${2:-main}"
      shift 2
      ;;
    --extension-id)
      EXT_ID="${2:-}"
      shift 2
      ;;
    -*)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
    *)
      if [ -z "$EXT_ID" ]; then
        EXT_ID="$1"
      fi
      shift
      ;;
  esac
done

if ! [[ "$EXT_ID" =~ ^[a-p]{32}$ ]]; then
  echo "Error: Please pass the 32-letter Chrome Extension ID." >&2
  echo "Usage: curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash -s -- <EXTENSION_ID> [--sdk]" >&2
  exit 1
fi

PYTHON_BIN=""
for candidate in /opt/homebrew/bin/python3 /usr/local/bin/python3 "$(command -v python3 || true)" /usr/bin/python3; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then
    if "$candidate" -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 9) else 1)" 2>/dev/null; then
      PYTHON_BIN="$candidate"
      break
    fi
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  echo "Error: Python 3.9+ is required. Install it via Homebrew (brew install python) or https://www.python.org/downloads/." >&2
  exit 1
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/gecko-antigravity-XXXXXX")"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Downloading Gecko for Antigravity companion from github.com/${REPO} (${REF})..."
TARBALL_URL="https://codeload.github.com/${REPO}/tar.gz/refs/heads/${REF}"
curl -fsSL "$TARBALL_URL" | tar -xz -C "$TMP_DIR"

BRIDGE_INSTALLER="$(find "$TMP_DIR" -maxdepth 4 -path '*/packages/bridge/scripts/install_host.py' | head -n 1)"
if [ -z "$BRIDGE_INSTALLER" ] || [ ! -f "$BRIDGE_INSTALLER" ]; then
  echo "Error: Could not find packages/bridge/scripts/install_host.py in downloaded archive." >&2
  exit 1
fi

ARGS=(--extension-id "$EXT_ID" --browser "$BROWSER" --mcp)
if [ "$USE_SDK" -eq 1 ]; then
  ARGS+=(--sdk)
fi

CLI_JUST_INSTALLED=0
if [ "$SKIP_CLI" -ne 1 ] && ! command -v agy >/dev/null 2>&1; then
  echo "Antigravity CLI ('agy') not found. Installing official Antigravity CLI..."
  if curl -fsSL https://antigravity.google/cli/install.sh | bash; then
    CLI_JUST_INSTALLED=1
    export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.agy/bin:$HOME/.antigravity/bin:$PATH"
  else
    echo "Warning: Could not auto-install Antigravity CLI. Continuing with companion & MCP installation..." >&2
  fi
fi

echo "Installing companion with ${PYTHON_BIN}..."
"$PYTHON_BIN" "$BRIDGE_INSTALLER" "${ARGS[@]}"

echo ""
echo "Done! Return to Chrome -> Gecko for Antigravity Side Panel (it will auto-connect within 3 seconds)."
if [ "$CLI_JUST_INSTALLED" -eq 1 ]; then
  echo "Next step: Run 'agy' once in Terminal to sign in with your Google account, then start chatting in Gecko!"
elif ! command -v agy >/dev/null 2>&1 && [ "$USE_SDK" -eq 0 ]; then
  echo "Note: 'agy' CLI was not found. Antigravity Desktop MCP is registered; install 'agy' or re-run with --sdk for Side Panel chat."
fi
