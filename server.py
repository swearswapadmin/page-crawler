#!/usr/bin/env python3
"""
Local helper for the Page Crawler extension.

Runs as a background process on 127.0.0.1:7837. The Chrome extension
talks to this helper over HTTP. The helper talks to NotebookLM via
notebooklm-py.

The lawyer never sees this file directly. Install.command sets it up
to autostart at login, and the extension calls into it.

Endpoints
    GET  /status                          Liveness + login state
    POST /login                           Trigger interactive Google sign-in
    GET  /notebooks                       List notebooks
    POST /notebooks                       Create a notebook  {name}
    POST /notebooks/<id>/sources          Add a text source  {name, text}
    POST /notebooks/<id>/persona          Set custom prompt  {custom_prompt}
    POST /notebooks/<id>/ask              Ask the chat       {question}
"""

from __future__ import annotations

import sys

sys.dont_write_bytecode = True

import asyncio
import json
import logging
import os
import re
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

HOST = "127.0.0.1"
PORT = 7837
LOG_PATH = Path.home() / ".cache" / "page-crawler-helper" / "helper.log"
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    filename=str(LOG_PATH),
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger("page-crawler-helper")

# CORS for the extension. Chrome extensions have an origin like
# chrome-extension://<id>. We accept any chrome-extension origin.
ALLOW_ORIGIN_RE = re.compile(r"^chrome-extension://[a-z0-9]+$")


# ---------------------------------------------------------------------------
# Client management (one persistent NotebookLMClient, lazy-initialized)
# ---------------------------------------------------------------------------

class ClientHolder:
    def __init__(self) -> None:
        self._client = None
        self._loop = asyncio.new_event_loop()
        self._loop_thread = threading.Thread(target=self._run_loop, daemon=True)
        self._loop_thread.start()
        self._lock = threading.Lock()

    def _run_loop(self) -> None:
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()

    def call(self, coro_factory):
        """Schedule a coroutine on the helper's event loop and wait for the result."""
        fut = asyncio.run_coroutine_threadsafe(coro_factory(), self._loop)
        return fut.result()

    async def _get_client(self, force_refresh: bool = False):
        if self._client is None or force_refresh:
            # Always refresh cookies from Chrome before opening the client.
            # rookiepy is fast (just reads a SQLite file and decrypts with
            # the Keychain key), so doing this on every (re)open keeps the
            # session warm without round-tripping Playwright.
            from auth import refresh_auth, auth_state_path

            if not refresh_auth():
                raise RuntimeError(
                    "Could not read Google cookies from Chrome. Sign in to "
                    "Google in Chrome, allow Keychain access when prompted, "
                    "and try again."
                )

            try:
                from notebooklm import NotebookLMClient
            except ImportError as exc:
                raise RuntimeError(
                    "notebooklm-py is not bundled. Re-run build.sh."
                ) from exc

            if self._client is not None:
                # Close the old one before replacing.
                try:
                    await self._client.__aexit__(None, None, None)
                except Exception:  # noqa: BLE001
                    pass
                self._client = None

            self._client = await NotebookLMClient.from_storage(str(auth_state_path()))
            await self._client.__aenter__()
        return self._client

    async def _call_with_retry(self, coro_factory, max_attempts: int = 3):
        """Run a coroutine. On auth-shaped failures, refresh cookies from
        Chrome and try again. Up to max_attempts total. Brief sleep between
        attempts so the browser's cookie jar has time to settle if Chrome
        is actively refreshing it."""
        import asyncio as _asyncio

        last_exc = None
        for attempt in range(max_attempts):
            try:
                return await coro_factory()
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                msg = str(exc).lower()
                auth_indicators = (
                    "401",
                    "403",
                    "unauthor",
                    "auth",
                    "csrf",
                    "sign in",
                    "login",
                    "session",
                    "accountchooser",
                    "redirect",
                )
                if not any(ind in msg for ind in auth_indicators):
                    raise
                if attempt + 1 >= max_attempts:
                    break
                print(
                    f"Auth-related failure (attempt {attempt + 1}/{max_attempts}): {exc}. "
                    "Pausing and re-reading Chrome cookies.",
                    flush=True,
                )
                # Give Chrome a moment to rotate cookies before reading.
                await _asyncio.sleep(2 + attempt * 2)
                await self._get_client(force_refresh=True)
        raise last_exc

    async def status(self) -> dict[str, Any]:
        try:
            async def op():
                client = await self._get_client()
                return await client.notebooks.list()
            nbs = await self._call_with_retry(op)
            return {"ready": True, "loggedIn": True, "notebookCount": len(nbs)}
        except Exception as exc:  # noqa: BLE001
            return {"ready": False, "loggedIn": False, "error": str(exc)}

    async def refresh(self) -> dict[str, Any]:
        from auth import refresh_auth
        ok = refresh_auth()
        if ok:
            # Force client to be rebuilt with the new cookies.
            self._client = None
        return {"ok": ok}

    async def list_notebooks(self) -> list[dict[str, Any]]:
        async def op():
            client = await self._get_client()
            return await client.notebooks.list()
        nbs = await self._call_with_retry(op)
        out = []
        for nb in nbs:
            out.append(
                {
                    "id": getattr(nb, "id", None),
                    "name": getattr(nb, "name", None) or getattr(nb, "title", None),
                }
            )
        return out

    async def create_notebook(self, name: str) -> dict[str, Any]:
        async def op():
            client = await self._get_client()
            return await client.notebooks.create(name)
        nb = await self._call_with_retry(op)
        return {"id": getattr(nb, "id", None), "name": name}

    async def delete_notebook(self, nb_id: str) -> dict[str, Any]:
        async def op():
            client = await self._get_client()
            return await client.notebooks.delete(nb_id)
        await self._call_with_retry(op)
        return {"ok": True}

    async def replace_named_notebook(self, name: str) -> dict[str, Any]:
        """Delete every notebook with the given name, then create a fresh one.
        Idempotent. Keeps the account at exactly one notebook with this name."""
        async def list_op():
            client = await self._get_client()
            return await client.notebooks.list()
        nbs = await self._call_with_retry(list_op)
        for nb in nbs:
            nb_name = getattr(nb, "name", None) or getattr(nb, "title", None)
            if nb_name == name:
                nb_id = getattr(nb, "id", None)
                if nb_id:
                    async def del_op(_id=nb_id):
                        client = await self._get_client()
                        return await client.notebooks.delete(_id)
                    try:
                        await self._call_with_retry(del_op)
                    except Exception as exc:  # noqa: BLE001
                        print(f"delete {nb_id} failed: {exc}", flush=True)
        async def create_op():
            client = await self._get_client()
            return await client.notebooks.create(name)
        nb = await self._call_with_retry(create_op)
        return {"id": getattr(nb, "id", None), "name": name}

    async def add_text_source(
        self, notebook_id: str, name: str, text: str
    ) -> dict[str, Any]:
        # Signature per src/notebooklm/_sources.py:
        #   add_text(notebook_id, title, content, wait=False, wait_timeout=120.0)
        async def op():
            client = await self._get_client()
            return await client.sources.add_text(notebook_id, name, text, wait=True)

        source = await self._call_with_retry(op)
        return {
            "id": getattr(source, "id", None) or getattr(source, "source_id", None),
            "name": name,
        }

    async def set_persona(self, notebook_id: str, custom_prompt: str) -> dict[str, Any]:
        async def op():
            client = await self._get_client()
            try:
                from notebooklm import ChatGoal, ChatResponseLength
            except ImportError:
                from notebooklm.models import ChatGoal, ChatResponseLength
            return await client.chat.configure(
                notebook_id,
                goal=ChatGoal.CUSTOM,
                response_length=ChatResponseLength.LONGER,
                custom_prompt=custom_prompt,
            )

        ok = await self._call_with_retry(op)
        return {"ok": bool(ok)}

    async def ask(
        self,
        notebook_id: str,
        question: str,
        source_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        async def op():
            client = await self._get_client()
            if source_ids:
                return await client.chat.ask(
                    notebook_id, question, source_ids=source_ids
                )
            return await client.chat.ask(notebook_id, question)

        result = await self._call_with_retry(op)
        return {
            "answer": getattr(result, "answer", str(result)),
            "references": [
                {
                    "citation_number": getattr(r, "citation_number", None),
                    "source_id": getattr(r, "source_id", None),
                }
                for r in getattr(result, "references", []) or []
            ],
        }


HOLDER = ClientHolder()


# ---------------------------------------------------------------------------
# HTTP layer
# ---------------------------------------------------------------------------


def cors_headers(handler: BaseHTTPRequestHandler) -> None:
    origin = handler.headers.get("Origin") or ""
    if ALLOW_ORIGIN_RE.match(origin):
        handler.send_header("Access-Control-Allow-Origin", origin)
    else:
        handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "content-type")
    handler.send_header("Access-Control-Max-Age", "86400")


def write_json(handler: BaseHTTPRequestHandler, status: int, body: Any) -> None:
    raw = json.dumps(body).encode("utf-8")
    handler.send_response(status)
    cors_headers(handler)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(raw)))
    handler.end_headers()
    handler.wfile.write(raw)


def read_json(handler: BaseHTTPRequestHandler) -> Any:
    length = int(handler.headers.get("Content-Length") or "0")
    if not length:
        return {}
    raw = handler.rfile.read(length)
    return json.loads(raw.decode("utf-8"))


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        logger.info("%s - %s", self.address_string(), format % args)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        cors_headers(self)
        self.send_header(
            "Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS"
        )
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        try:
            if self.path == "/status":
                return write_json(self, 200, HOLDER.call(HOLDER.status))
            if self.path == "/notebooks":
                return write_json(self, 200, HOLDER.call(HOLDER.list_notebooks))
        except Exception as exc:  # noqa: BLE001
            logger.exception("GET %s failed", self.path)
            return write_json(self, 500, {"error": str(exc), "trace": traceback.format_exc()})
        return write_json(self, 404, {"error": "not found"})

    def do_DELETE(self) -> None:  # noqa: N802
        try:
            m = re.match(r"^/notebooks/([^/]+)$", self.path)
            if m:
                nb_id = m.group(1)
                return write_json(
                    self, 200, HOLDER.call(lambda: HOLDER.delete_notebook(nb_id))
                )
        except Exception as exc:  # noqa: BLE001
            logger.exception("DELETE %s failed", self.path)
            return write_json(self, 500, {"error": str(exc), "trace": traceback.format_exc()})
        return write_json(self, 404, {"error": "not found"})

    def do_POST(self) -> None:  # noqa: N802
        try:
            body = read_json(self)
            if self.path == "/refresh":
                return write_json(self, 200, HOLDER.call(HOLDER.refresh))
            if self.path == "/notebooks":
                name = (body.get("name") or "Page Crawler").strip()
                return write_json(
                    self, 200, HOLDER.call(lambda: HOLDER.create_notebook(name))
                )
            if self.path == "/notebooks/replace":
                name = (body.get("name") or "Page Crawler").strip()
                return write_json(
                    self,
                    200,
                    HOLDER.call(lambda: HOLDER.replace_named_notebook(name)),
                )
            m = re.match(r"^/notebooks/([^/]+)/sources$", self.path)
            if m:
                nb_id = m.group(1)
                name = (body.get("name") or "Source").strip()
                text = body.get("text") or ""
                return write_json(
                    self,
                    200,
                    HOLDER.call(lambda: HOLDER.add_text_source(nb_id, name, text)),
                )
            m = re.match(r"^/notebooks/([^/]+)/persona$", self.path)
            if m:
                nb_id = m.group(1)
                custom = body.get("custom_prompt") or ""
                return write_json(
                    self, 200, HOLDER.call(lambda: HOLDER.set_persona(nb_id, custom))
                )
            m = re.match(r"^/notebooks/([^/]+)/ask$", self.path)
            if m:
                nb_id = m.group(1)
                question = body.get("question") or ""
                source_ids = body.get("source_ids") or None
                return write_json(
                    self,
                    200,
                    HOLDER.call(lambda: HOLDER.ask(nb_id, question, source_ids)),
                )
        except Exception as exc:  # noqa: BLE001
            logger.exception("POST %s failed", self.path)
            return write_json(self, 500, {"error": str(exc), "trace": traceback.format_exc()})
        return write_json(self, 404, {"error": "not found"})


def main() -> None:
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    logger.info("Page Crawler helper listening on http://%s:%d", HOST, PORT)
    print(f"Page Crawler helper listening on http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
