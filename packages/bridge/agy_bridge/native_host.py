"""Local Chrome Native Messaging host and loopback MCP relay for Google Antigravity Work."""

from __future__ import annotations

import asyncio
import contextlib
import json
import os
from pathlib import Path
import secrets
import struct
import sys
import uuid
from collections.abc import Mapping
from typing import Any, BinaryIO

from . import __version__
from .agent_adapter import (
    BaseAgentAdapter, BridgeError, PageContext, build_agent_prompt, build_prompt, cli_failure, resolve_adapter,
)
from .tools_spec import BROWSER_TOOLS, extract_tool_calls

PROTOCOL_VERSION = 2
MAX_FRAME_BYTES = 1024 * 1024
MAX_REPLY_LENGTH = 32000
MAX_ACTIVE_REQUESTS = 4
TOOL_CALL_TIMEOUT = 25
VALID_TOOL_NAMES = frozenset(tool["name"] for tool in BROWSER_TOOLS)


if hasattr(contextlib, "aclosing"):
    _aclosing = contextlib.aclosing
else:
    @contextlib.asynccontextmanager
    async def _aclosing(thing: Any):
        try:
            yield thing
        finally:
            await thing.aclose()


def relay_info_path() -> Path:
    if sys.platform == "win32":
        base = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "AntigravityWork"
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support" / "AntigravityWork"
    else:
        base = Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local" / "share"))) / "antigravity-work"
    return base / "relay.json"


def encode_native_message(payload: dict[str, Any]) -> bytes:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(body) > MAX_FRAME_BYTES:
        raise ValueError("Native message exceeds the frame limit")
    return struct.pack("=I", len(body)) + body


def read_native_message(stream: BinaryIO) -> dict[str, Any] | None:
    header = stream.read(4)
    if not header:
        return None
    if len(header) != 4:
        raise ValueError("Incomplete native message header")

    size = struct.unpack("=I", header)[0]
    if not 0 < size <= MAX_FRAME_BYTES:
        raise ValueError("Invalid native message size")
    body = stream.read(size)
    if len(body) != size:
        raise ValueError("Incomplete native message body")
    value = json.loads(body)
    if not isinstance(value, dict):
        raise ValueError("Expected a JSON object")
    return value


def text(value: Any, limit: int) -> str:
    return value[:limit] if isinstance(value, str) else ""


def contexts_and_history(payload: Mapping[str, Any]) -> tuple[list[PageContext], list[dict]]:
    raw_contexts = payload.get("contexts")
    raw_history = payload.get("history")
    contexts = []
    history = []
    if isinstance(raw_contexts, list):
        for item in raw_contexts[:3]:
            if isinstance(item, dict):
                redacted = item.get("redactedCount")
                contexts.append(PageContext(
                    url=text(item.get("url"), 255),
                    title=text(item.get("title"), 150),
                    content=text(item.get("content"), 3500),
                    redacted_count=min(1000, max(0, redacted)) if isinstance(redacted, int) else 0,
                ))
    if isinstance(raw_history, list):
        for item in raw_history[-8:]:
            if isinstance(item, dict) and item.get("role") in ("user", "assistant"):
                history.append({"role": item["role"], "content": text(item.get("content"), 1200)})
    return contexts, history


class NativeMessagingBridge:
    def __init__(self, adapter: BaseAgentAdapter | None = None, out_stream: BinaryIO | None = None) -> None:
        self.adapter = adapter
        self.out_stream = out_stream if out_stream is not None else sys.stdout.buffer
        self._active_tasks: dict[str, asyncio.Task] = {}
        self._pending_tools: dict[str, asyncio.Future[dict[str, Any]]] = {}
        self._relay_token: str = secrets.token_hex(24)
        self._relay_server: asyncio.AbstractServer | None = None
        self._relay_path: Path | None = None

    def send(self, message: dict[str, Any]) -> None:
        self.out_stream.write(encode_native_message(message))
        self.out_stream.flush()

    def error(self, request_id: str, code: str) -> None:
        self.send({"id": request_id, "type": "error", "payload": {"code": code}})

    async def handle_message(self, message: dict[str, Any]) -> None:
        message_type = message.get("type")
        request_id = text(message.get("id"), 100)
        raw_payload = message.get("payload")
        payload = raw_payload if isinstance(raw_payload, dict) else {}

        if message_type == "ping":  # Lets newer extensions diagnose an older bridge host.
            self.send({"id": request_id, "type": "pong", "payload": {"version": __version__}})
        elif message_type == "hello":
            await self._handshake(payload)
        elif message_type == "cancel":
            task = self._active_tasks.get(request_id)
            if task:
                task.cancel()
        elif message_type == "tool.result":
            call_id = text(payload.get("callId"), 120)
            future = self._pending_tools.pop(call_id, None)
            if future and not future.done():
                future.set_result(payload)
        elif message_type == "chat" and request_id:
            if request_id in self._active_tasks or len(self._active_tasks) >= MAX_ACTIVE_REQUESTS:
                self.error(request_id, "BUSY")
            elif not self.adapter:
                self.error(request_id, "DISCONNECTED")
            else:
                adapter = self.adapter
                task = asyncio.create_task(self._chat(request_id, payload, adapter))
                self._active_tasks[request_id] = task
                task.add_done_callback(lambda _: self._active_tasks.pop(request_id, None))

    async def _handshake(self, payload: dict) -> None:
        status = {"protocol": PROTOCOL_VERSION, "version": __version__}
        config = payload.get("config")
        config = config if isinstance(config, dict) else {}
        backend = config.get("backend", "auto")
        try:
            if payload.get("protocol") != PROTOCOL_VERSION:
                raise BridgeError("HOST_INCOMPATIBLE")
            if self.adapter is None:
                backend = backend if backend in ("auto", "cli", "sdk") else "auto"
                self.adapter = await resolve_adapter(backend, text(config.get("cliPath"), 1024).strip())
            status["backend"] = self.adapter.backend_name
        except BridgeError as exc:
            status["code"] = exc.code
        except Exception:
            status["code"] = "BACKEND_ERROR"
        self.send({"type": "hello.result", "payload": status})

    async def _chat(self, request_id: str, payload: dict, adapter: BaseAgentAdapter) -> None:
        message = text(payload.get("message"), 8000).strip()
        if not message:
            self.error(request_id, "EMPTY_RESPONSE")
            return
        contexts, history = contexts_and_history(payload)
        model = text(payload.get("model"), 100).strip()
        if model.startswith("-"):
            self.error(request_id, "BACKEND_ERROR")
            return
        agent_mode = payload.get("agentMode") is True
        raw_snapshot = payload.get("initialSnapshot")
        initial_snapshot = raw_snapshot if isinstance(raw_snapshot, dict) and raw_snapshot.get("ok") else None
        try:
            if agent_mode:
                await self._run_agent_chat(request_id, message, contexts, history, model, adapter, initial_snapshot)
            else:
                generator = adapter.stream_chat(build_prompt(message, contexts, history), model)
                async with _aclosing(generator):
                    await asyncio.wait_for(self._stream(request_id, generator), timeout=100)
            self.send({"id": request_id, "type": "chat.done"})
        except asyncio.CancelledError:
            self.error(request_id, "CANCELLED")
        except asyncio.TimeoutError:
            self.error(request_id, "TIMEOUT")
        except BridgeError as exc:
            self.error(request_id, exc.code)
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception as exc:
            self.error(request_id, cli_failure(str(exc)).code)

    async def _collect_turn(self, generator) -> str:
        chunks: list[str] = []
        count = 0
        async for delta in generator:
            chunk = delta[: MAX_REPLY_LENGTH - count]
            if chunk:
                count += len(chunk)
                chunks.append(chunk)
            if count >= MAX_REPLY_LENGTH:
                break
        return "".join(chunks)

    async def _invoke_browser_tool(self, request_id: str, name: str, args: dict[str, Any]) -> dict[str, Any]:
        call_id = f"{request_id}-{uuid.uuid4().hex[:10]}"
        future: asyncio.Future[dict[str, Any]] = asyncio.get_running_loop().create_future()
        self._pending_tools[call_id] = future
        try:
            self.send({
                "id": request_id,
                "type": "tool.call",
                "payload": {"callId": call_id, "name": name, "args": args},
            })
            return await asyncio.wait_for(future, timeout=TOOL_CALL_TIMEOUT)
        except asyncio.TimeoutError:
            return {"ok": False, "error": "Tool execution timed out in browser."}
        finally:
            self._pending_tools.pop(call_id, None)

    async def _run_agent_chat(
        self,
        request_id: str,
        message: str,
        contexts: list[PageContext],
        history: list[dict],
        model: str,
        adapter: BaseAgentAdapter,
        initial_snapshot: dict[str, Any] | None = None,
    ) -> None:
        tool_trace: list[dict[str, Any]] = []
        last_signature: str | None = None
        repeat_count = 0

        # Unlimited steps; user can stop anytime via cancel, and older steps auto-compress.
        while True:
            prompt = build_agent_prompt(message, contexts, history, tool_trace, initial_snapshot)
            generator = adapter.stream_chat(prompt, model)
            async with _aclosing(generator):
                turn_text = await asyncio.wait_for(self._collect_turn(generator), timeout=100)
            calls = extract_tool_calls(turn_text)
            if calls:
                for tool_name, tool_args in calls[:8]:
                    sig = json.dumps({"name": tool_name, "args": tool_args}, sort_keys=True, ensure_ascii=False)
                    if sig == last_signature:
                        repeat_count += 1
                    else:
                        last_signature = sig
                        repeat_count = 1

                    if repeat_count >= 3:
                        result: dict[str, Any] = {
                            "ok": False,
                            "error": (
                                f"You already called {tool_name} with the exact same arguments {repeat_count} times. "
                                "Do NOT repeat the same call again. Try a different approach or reply to the user."
                            ),
                        }
                    elif tool_name in VALID_TOOL_NAMES:
                        result = await self._invoke_browser_tool(request_id, tool_name, tool_args)
                    else:
                        result = {"ok": False, "error": f"Unknown tool: {tool_name}"}
                    tool_trace.append({"name": tool_name, "args": tool_args, "result": result})
                    if not result.get("ok"):
                        # Stop remaining batched steps if a step failed so the model can inspect and recover.
                        break
                continue
            final_text = turn_text.strip()
            if not final_text:
                raise BridgeError("EMPTY_RESPONSE")
            self.send({"id": request_id, "type": "chat.delta", "payload": {"text": final_text[:MAX_REPLY_LENGTH]}})
            return

    async def _stream(self, request_id: str, generator) -> None:
        count = 0
        async for delta in generator:
            chunk = delta[: MAX_REPLY_LENGTH - count]
            if chunk:
                count += len(chunk)
                self.send({"id": request_id, "type": "chat.delta", "payload": {"text": chunk}})
            if count >= MAX_REPLY_LENGTH:
                break
        if not count:
            raise BridgeError("EMPTY_RESPONSE")

    async def _handle_relay_client(
        self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter
    ) -> None:
        try:
            raw = await asyncio.wait_for(reader.readline(), timeout=5)
            if not raw:
                return
            req = json.loads(raw.decode("utf-8"))
            if not isinstance(req, dict):
                raise ValueError("Invalid request")
            token = req.get("token")
            if not isinstance(token, str) or not secrets.compare_digest(token, self._relay_token):
                resp = {"ok": False, "error": "Unauthorized relay token."}
            else:
                tool_name = text(req.get("name"), 100)
                tool_args = req.get("args") if isinstance(req.get("args"), dict) else {}
                if tool_name not in VALID_TOOL_NAMES:
                    resp = {"ok": False, "error": f"Unknown tool: {tool_name}"}
                else:
                    remote_id = f"remote-{uuid.uuid4().hex[:8]}"
                    resp = await self._invoke_browser_tool(remote_id, tool_name, tool_args)
        except Exception as exc:
            resp = {"ok": False, "error": str(exc)}
        try:
            writer.write((json.dumps(resp, ensure_ascii=False) + "\n").encode("utf-8"))
            await writer.drain()
        except OSError:
            pass
        finally:
            writer.close()
            with contextlib.suppress(OSError):
                await writer.wait_closed()

    async def _start_relay(self) -> None:
        try:
            server = await asyncio.start_server(self._handle_relay_client, "127.0.0.1", 0)
            sockets = server.sockets or []
            if not sockets:
                server.close()
                return
            port = sockets[0].getsockname()[1]
            info_path = relay_info_path()
            info_path.parent.mkdir(parents=True, exist_ok=True)
            info = {"port": port, "token": self._relay_token, "pid": os.getpid(), "version": __version__}
            tmp_path = info_path.with_suffix(".tmp")
            tmp_path.write_text(json.dumps(info), encoding="utf-8")
            if os.name != "nt":
                with contextlib.suppress(OSError):
                    os.chmod(tmp_path, 0o600)
            os.replace(tmp_path, info_path)
            self._relay_server = server
            self._relay_path = info_path
        except OSError:
            self._relay_server = None

    async def _stop_relay(self) -> None:
        if self._relay_server is not None:
            self._relay_server.close()
            with contextlib.suppress(OSError):
                await self._relay_server.wait_closed()
            self._relay_server = None
        if self._relay_path is not None:
            try:
                existing = json.loads(self._relay_path.read_text(encoding="utf-8"))
                if existing.get("token") == self._relay_token:
                    self._relay_path.unlink(missing_ok=True)
            except (OSError, ValueError):
                pass
            self._relay_path = None

    async def run(self, in_stream: BinaryIO) -> None:
        await self._start_relay()
        try:
            while (message := await asyncio.to_thread(read_native_message, in_stream)) is not None:
                await self.handle_message(message)
        except (ValueError, OSError):
            pass
        finally:
            await self._stop_relay()
            for future in list(self._pending_tools.values()):
                if not future.done():
                    future.cancel()
            self._pending_tools.clear()
            tasks = list(self._active_tasks.values())
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)


def main() -> None:
    if os.name == "nt":
        import msvcrt

        for file in (sys.stdin, sys.stdout):
            msvcrt.setmode(file.fileno(), os.O_BINARY)
    asyncio.run(NativeMessagingBridge().run(sys.stdin.buffer))


if __name__ == "__main__":
    main()
