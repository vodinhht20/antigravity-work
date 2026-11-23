"""MCP Server (JSON-RPC 2.0 over stdio) routing Antigravity IDE/CLI commands to Chrome via local relay."""

from __future__ import annotations

import json
import socket
import sys
from typing import Any, Dict

from . import __version__
from .native_host import relay_info_path
from .tools_spec import BROWSER_TOOLS


def call_chrome_relay(tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    info_path = relay_info_path()
    try:
        info = json.loads(info_path.read_text(encoding="utf-8"))
        port = int(info["port"])
        token = str(info["token"])
    except (OSError, ValueError, KeyError):
        return {
            "ok": False,
            "error": (
                "Chrome extension 'Gecko for Antigravity' is not currently connected. "
                "Open the Gecko for Antigravity side panel in Chrome and retry."
            ),
        }

    payload = (json.dumps({"token": token, "name": tool_name, "args": args}, ensure_ascii=False) + "\n").encode("utf-8")
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=30) as sock:
            sock.sendall(payload)
            chunks: list[bytes] = []
            while True:
                data = sock.recv(65536)
                if not data:
                    break
                chunks.append(data)
                if b"\n" in data:
                    break
        raw = b"".join(chunks).split(b"\n", 1)[0].decode("utf-8", errors="replace")
        result = json.loads(raw) if raw else {"ok": False, "error": "Empty relay response."}
        return result if isinstance(result, dict) else {"ok": False, "error": "Invalid relay response."}
    except OSError as exc:
        return {
            "ok": False,
            "error": (
                f"Could not reach Chrome relay on 127.0.0.1:{port} ({exc}). "
                "Ensure the Gecko for Antigravity side panel is open in Chrome."
            ),
        }


def handle_mcp_request(req: Dict[str, Any]) -> Dict[str, Any] | None:
    method = req.get("method", "")
    req_id = req.get("id")

    if method == "notifications/initialized":
        return None

    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {
                    "name": "gecko-for-antigravity-mcp",
                    "version": __version__,
                },
            },
        }

    if method == "tools/list":
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"tools": BROWSER_TOOLS},
        }

    if method == "tools/call":
        params = req.get("params") or {}
        tool_name = str(params.get("name", ""))
        tool_args = params.get("arguments")
        if not isinstance(tool_args, dict):
            tool_args = {}
        result = call_chrome_relay(tool_name, tool_args)
        return {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "isError": not bool(result.get("ok")),
                "content": [
                    {
                        "type": "text",
                        "text": json.dumps(result, ensure_ascii=False),
                    }
                ],
            },
        }

    return {
        "jsonrpc": "2.0",
        "id": req_id,
        "error": {"code": -32601, "message": f"Method not found: {method}"},
    }


def main() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            resp = handle_mcp_request(req)
            if resp is not None:
                sys.stdout.write(json.dumps(resp, ensure_ascii=False) + "\n")
                sys.stdout.flush()
        except Exception as exc:
            sys.stdout.write(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": None,
                        "error": {"code": -32700, "message": str(exc)},
                    }
                )
                + "\n"
            )
            sys.stdout.flush()


if __name__ == "__main__":
    main()
