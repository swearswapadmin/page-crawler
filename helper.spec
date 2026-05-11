# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the Page Crawler helper.
# Builds a single self-contained binary that includes a Python interpreter,
# notebooklm-py with cookie support, and rookiepy. No Python required on
# the target Mac.

block_cipher = None


a = Analysis(
    ["server.py"],
    pathex=["."],
    binaries=[],
    datas=[],
    hiddenimports=[
        "auth",
        "notebooklm",
        "notebooklm.auth",
        "notebooklm.models",
        "notebooklm.client",
        "rookiepy",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "playwright",
        "playwright._impl",
        "playwright.async_api",
        "playwright.sync_api",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="helper",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
