"""
Pull Google session cookies from the user's local Chrome profile and write
them as a notebooklm-py storage_state.json. This replaces notebooklm-py's
Playwright login flow.

The user is already signed in to Google in Chrome. We borrow those cookies.

The first call to refresh_auth() triggers a macOS Keychain prompt asking
permission to read "Chrome Safe Storage." The user clicks Always Allow
once. Every subsequent call runs silently.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Iterable

DEFAULT_STORAGE_PATH = (
    Path.home() / ".notebooklm" / "profiles" / "default" / "storage_state.json"
)

# Domains the NotebookLM client needs cookies for. Google's auth is split
# across .google.com (login state) and notebooklm.google.com (app state).
COOKIE_DOMAINS = [".google.com", "notebooklm.google.com"]


def refresh_auth(
    storage_path: Path = DEFAULT_STORAGE_PATH,
    domains: Iterable[str] = COOKIE_DOMAINS,
) -> bool:
    """Read Chrome cookies, build a fresh notebooklm-py storage state, and
    persist it at the given path.

    Returns True on success, False on any kind of failure (Chrome not
    installed, no Google session, Keychain denied, etc.). Failures are
    logged but don't raise.
    """
    try:
        import rookiepy
        from notebooklm.auth import convert_rookiepy_cookies_to_storage_state
    except ImportError as exc:
        print(f"auth.refresh: missing dependency: {exc}", flush=True)
        return False

    try:
        raw = rookiepy.chrome(domains=list(domains))
    except Exception as exc:  # broad: rookiepy raises a variety
        print(f"auth.refresh: rookiepy.chrome failed: {exc}", flush=True)
        return False

    if not raw:
        print(
            "auth.refresh: no cookies found for "
            + ", ".join(domains)
            + ". Sign in to Google in Chrome first.",
            flush=True,
        )
        return False

    try:
        state = convert_rookiepy_cookies_to_storage_state(raw)
    except Exception as exc:
        print(f"auth.refresh: convert failed: {exc}", flush=True)
        return False

    storage_path.parent.mkdir(parents=True, exist_ok=True)
    with open(storage_path, "w") as f:
        json.dump(state, f)
    try:
        os.chmod(storage_path, 0o600)
    except OSError:
        pass

    print(
        f"auth.refresh: wrote {len(raw)} cookies to {storage_path}", flush=True
    )
    return True


def auth_state_path() -> Path:
    return DEFAULT_STORAGE_PATH


if __name__ == "__main__":
    import sys

    sys.exit(0 if refresh_auth() else 1)
