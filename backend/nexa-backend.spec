# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_submodules, collect_data_files, copy_metadata
import os

block_cipher = None

data_files = [
    ('agent_settings.json', '.'),
    ('app_settings.json', '.'),
    ('llm_settings.json', '.'),
    ('questions.json', '.'),
]

for optional_file in ['presets.json', 'prompt_history.json']:
    if os.path.exists(optional_file):
        data_files.append((optional_file, '.'))

hiddenimports = [
    'uvicorn',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'websockets',
    'websockets.legacy',
    'websockets.legacy.server',
    'httptools',
    'dotenv',
    'email_validator',
    'multipart',
    'anyio',
    'anyio._backends',
    'anyio._backends._asyncio',
    'starlette',
    'starlette.responses',
    'starlette.routing',
    'starlette.middleware',
    'starlette.middleware.cors',
    'aiofiles',
    'ddgs',
    'httpx',
    'httpx._transports',
    'httpx._transports.default',
    'h11',
    'h2',
    'hpack',
    'certifi',
    'sniffio',
    'qdrant_client',
    'grpc',
    'grpcio',
    'numpy',
]

hiddenimports += collect_submodules('numpy')

all_datas = (
    data_files
    + copy_metadata('httpx')
    + copy_metadata('qdrant_client')
)

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=all_datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'matplotlib',
        'tkinter',
        'PIL',
        'cv2',
        'torch',
        'transformers',
        'sentence_transformers',
        'scipy',
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
    [],
    exclude_binaries=True,
    name='nexa-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='nexa-backend',
)
