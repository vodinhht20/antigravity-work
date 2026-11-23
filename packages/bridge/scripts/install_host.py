#!/usr/bin/env python3
"""Install or unregister the per-user Native Messaging companion for Gecko for Antigravity."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import venv

HOST = "com.antigravity.browser_bridge"
MCP_SERVER_KEY = "gecko-for-antigravity"
SOURCE = Path(__file__).resolve().parent.parent
PROFILE_DIRS = {
    "chrome": ("Google/Chrome", "google-chrome"),
    "chromium": ("Chromium", "chromium"),
    "edge": ("Microsoft Edge", "microsoft-edge"),
    "brave": ("BraveSoftware/Brave-Browser", "BraveSoftware/Brave-Browser"),
}
WINDOWS_KEYS = {
    "chrome": r"Software\Google\Chrome",
    "chromium": r"Software\Chromium",
    "edge": r"Software\Microsoft\Edge",
    "brave": r"Software\BraveSoftware\Brave-Browser",
}


def location(browser: str) -> tuple[Path, Path]:
    if sys.platform == "win32":
        base = Path(os.environ["LOCALAPPDATA"]) / "GeckoAntigravity"
        manifests = base / "manifests" / browser
    elif sys.platform == "darwin":
        support = Path.home() / "Library" / "Application Support"
        base = support / "Gecko for Antigravity"
        manifests = support / PROFILE_DIRS[browser][0] / "NativeMessagingHosts"
    elif sys.platform.startswith("linux"):
        base = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "gecko-antigravity"
        manifests = Path.home() / ".config" / PROFILE_DIRS[browser][1] / "NativeMessagingHosts"
    else:
        raise RuntimeError("Unsupported operating system")
    return base, manifests / f"{HOST}.json"


def install_runtime(base: Path, sdk: bool) -> tuple[Path, Path]:
    """Install bridge into an isolated venv and return (host_executable, mcp_executable)."""
    base.mkdir(parents=True, exist_ok=True)
    runtime = Path(tempfile.mkdtemp(prefix="runtime-", dir=base))
    try:
        venv.create(runtime, with_pip=True)
        bin_dir = runtime / ("Scripts" if sys.platform == "win32" else "bin")
        python = bin_dir / ("python.exe" if sys.platform == "win32" else "python")
        host_bin = bin_dir / ("agy-bridge-host.exe" if sys.platform == "win32" else "agy-bridge-host")
        mcp_bin = bin_dir / ("agy-bridge-mcp.exe" if sys.platform == "win32" else "agy-bridge-mcp")
        with tempfile.TemporaryDirectory(prefix="gecko-source-") as temp:
            project = Path(temp) / "bridge"
            project.mkdir()
            shutil.copy2(SOURCE / "pyproject.toml", project)
            shutil.copytree(SOURCE / "agy_bridge", project / "agy_bridge", ignore=shutil.ignore_patterns("__pycache__"))
            package = str(project) + ("[sdk]" if sdk else "")
            subprocess.run([str(python), "-m", "pip", "--disable-pip-version-check", "install", package], check=True)
        if not host_bin.is_file():
            raise RuntimeError("Native Messaging executable was not generated")

        if sys.platform != "win32":
            # Wrap on macOS/Linux so Chrome's stripped PATH still finds Homebrew/local agy CLI.
            launcher = bin_dir / "launch-gecko-host.sh"
            script = (
                "#!/bin/sh\n"
                'export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.agy/bin:$HOME/.antigravity/bin:$PATH"\n'
                f"exec {shlex.quote(str(host_bin))} \"$@\"\n"
            )
            launcher.write_bytes(script.encode("utf-8"))
            os.chmod(launcher, 0o755)
            return launcher, mcp_bin

        return host_bin, mcp_bin
    except BaseException:
        shutil.rmtree(runtime, ignore_errors=True)
        raise


def register_windows(browser: str, manifest: Path, uninstall: bool) -> None:
    if sys.platform != "win32":
        return
    import winreg

    name = WINDOWS_KEYS[browser] + "\\NativeMessagingHosts\\" + HOST
    if uninstall:
        try:
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, name) as key:
                path, _ = winreg.QueryValueEx(key, None)
            if Path(path) == manifest:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, name)
        except FileNotFoundError:
            pass
        return

    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, name) as key:
        winreg.SetValueEx(key, None, 0, winreg.REG_SZ, str(manifest))


def read_manifest(manifest: Path) -> dict:
    try:
        return json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def register_antigravity_mcp(mcp_bin: Path, uninstall: bool = False) -> Path | None:
    """Register or remove Gecko MCP server in ~/.gemini/antigravity/mcp_config.json."""
    config_path = Path.home() / ".gemini" / "antigravity" / "mcp_config.json"
    try:
        data = json.loads(config_path.read_text(encoding="utf-8")) if config_path.is_file() else {}
        if not isinstance(data, dict):
            data = {}
    except (OSError, ValueError):
        data = {}

    servers = data.get("mcpServers")
    if not isinstance(servers, dict):
        servers = {}

    if uninstall:
        if MCP_SERVER_KEY in servers:
            del servers[MCP_SERVER_KEY]
            data["mcpServers"] = servers
            config_path.parent.mkdir(parents=True, exist_ok=True)
            config_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
        return config_path

    servers[MCP_SERVER_KEY] = {
        "command": str(mcp_bin),
        "args": [],
    }
    data["mcpServers"] = servers
    config_path.parent.mkdir(parents=True, exist_ok=True)
    config_path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return config_path


def prune_unused_runtimes(base: Path) -> None:
    if not base.is_dir():
        return
    base_resolved = base.resolve()
    referenced: set[Path] = set()
    for browser in PROFILE_DIRS:
        _, manifest_path = location(browser)
        host_path = read_manifest(manifest_path).get("path")
        if isinstance(host_path, str) and host_path:
            try:
                resolved = Path(host_path).resolve()
            except OSError:
                continue
            for parent in resolved.parents:
                if parent.parent == base_resolved and parent.name.startswith("runtime-"):
                    referenced.add(parent)
                    break
    for entry in base.iterdir():
        if entry.is_dir() and entry.name.startswith("runtime-") and entry.resolve() not in referenced:
            shutil.rmtree(entry, ignore_errors=True)


def write_manifest_atomic(manifest: Path, config: dict) -> None:
    manifest.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=manifest.parent, delete=False) as handle:
            tmp_path = Path(handle.name)
            json.dump(config, handle, indent=2)
        os.replace(tmp_path, manifest)
    except BaseException:
        if tmp_path is not None:
            tmp_path.unlink(missing_ok=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--extension-id", help="Extension ID shown in chrome://extensions")
    parser.add_argument("--browser", choices=[*PROFILE_DIRS, "all"], default="chrome")
    parser.add_argument("--sdk", action="store_true", help="Install the optional Antigravity Python SDK")
    parser.add_argument("--mcp", action="store_true", help="Register Gecko MCP server for Antigravity App/IDE")
    parser.add_argument("--uninstall", action="store_true", help="Unregister the companion")
    args = parser.parse_args()

    browsers = list(PROFILE_DIRS) if args.browser == "all" else [args.browser]
    base, _ = location(browsers[0])

    if args.uninstall:
        for browser in browsers:
            _, manifest = location(browser)
            register_windows(browser, manifest, uninstall=True)
            manifest.unlink(missing_ok=True)
            print(f"Companion unregistered for {browser}.")
        if args.mcp:
            register_antigravity_mcp(Path(), uninstall=True)
            print("MCP server unregistered from Antigravity.")
        prune_unused_runtimes(base)
        return

    if not args.extension_id or not re.fullmatch(r"[a-p]{32}", args.extension_id):
        parser.error("--extension-id must be the 32-letter Chrome extension ID")

    host, mcp_bin = install_runtime(base, args.sdk)
    for browser in browsers:
        _, manifest = location(browser)
        previous = read_manifest(manifest)
        origins = set(previous.get("allowed_origins", []))
        origins.add(f"chrome-extension://{args.extension_id}/")
        config = {
            "name": HOST,
            "description": "Gecko for Antigravity companion",
            "path": str(host),
            "type": "stdio",
            "allowed_origins": sorted(origins),
        }
        write_manifest_atomic(manifest, config)
        register_windows(browser, manifest, uninstall=False)
        print(f"Companion registered for {browser}: {manifest}")

    if args.mcp and mcp_bin.is_file():
        mcp_cfg = register_antigravity_mcp(mcp_bin)
        print(f"MCP server registered for Antigravity App/IDE: {mcp_cfg}")

    prune_unused_runtimes(base)


if __name__ == "__main__":
    main()
