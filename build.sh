#!/usr/bin/env bash
# Build the self-contained Page Crawler helper binary and drop it inside
# PageCrawlerSetup.app.
#
# Run once on a Mac with Python 3.10+ installed. The resulting .app no
# longer requires Python on the target machine. Re-run this script when
# you change server.py / auth.py or when you want to pull a fresh
# notebooklm-py.
#
# Usage:
#   ./build.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# rookiepy's pyo3 binding only supports CPython 3.10–3.12. If $PYTHON isn't
# set, hunt for a compatible interpreter so the build never fails just
# because system python3 is 3.13+.
find_python() {
    for cand in \
        python3.12 python3.11 python3.10 \
        /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.11 /opt/homebrew/bin/python3.10 \
        /usr/local/bin/python3.12 /usr/local/bin/python3.11 /usr/local/bin/python3.10; do
        if command -v "$cand" >/dev/null 2>&1; then
            ver=$("$cand" -c 'import sys; print(sys.version_info.major*100+sys.version_info.minor)' 2>/dev/null || echo 0)
            if [ "$ver" -ge 310 ] && [ "$ver" -le 312 ]; then
                printf '%s' "$cand"
                return 0
            fi
        fi
    done
    return 1
}

PYTHON="${PYTHON:-$(find_python || true)}"
if [ -z "$PYTHON" ]; then
    echo "Need Python 3.10, 3.11, or 3.12 (rookiepy's Rust binding limit)." >&2
    echo "Install one with: brew install python@3.12" >&2
    echo "Or set PYTHON=/path/to/python3.12 and re-run." >&2
    exit 1
fi
echo "Using Python: $PYTHON ($("$PYTHON" --version 2>&1))"

VENV="$SCRIPT_DIR/.build-venv"
if [ ! -d "$VENV" ]; then
    echo "Creating build venv at $VENV..."
    "$PYTHON" -m venv "$VENV"
fi

# shellcheck disable=SC1091
source "$VENV/bin/activate"

echo "Installing build dependencies..."
pip install --quiet --upgrade pip
pip install --quiet --upgrade pyinstaller "notebooklm-py[cookies]" rookiepy

echo "Building helper binary..."
rm -rf build dist
pyinstaller --clean --noconfirm helper.spec

# PyInstaller (single-file mode) drops a `helper` binary under dist/.
BUILD_OUTPUT="$SCRIPT_DIR/dist/helper"
if [ ! -x "$BUILD_OUTPUT" ]; then
    echo "Build failed: $BUILD_OUTPUT not produced." >&2
    exit 1
fi

APP_MACOS="$SCRIPT_DIR/PageCrawlerSetup.app/Contents/MacOS"
mkdir -p "$APP_MACOS"
cp "$BUILD_OUTPUT" "$APP_MACOS/helper"
chmod +x "$APP_MACOS/helper"

echo
echo "Build complete."
echo "Helper binary placed at:"
echo "  $APP_MACOS/helper"
echo
echo "Next: double-click PageCrawlerSetup.app to install."
