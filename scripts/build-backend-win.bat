@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0.."

echo [build-backend-win] Building Python backend with PyInstaller...

if not exist "backend\.venv\Scripts\python.exe" (
    echo Backend venv not found. Run scripts\install-win.bat first.
    exit /b 1
)

set "DIST_DIR=%TEMP%\pyi_dist"
set "WORK_DIR=%TEMP%\pyi_work"

if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"
if not exist "%WORK_DIR%" mkdir "%WORK_DIR%"

echo [build-backend-win] Running PyInstaller...
backend\.venv\Scripts\python -m PyInstaller backend\nexa-backend.spec --distpath "%DIST_DIR%" --workpath "%WORK_DIR%" --clean --noconfirm
if errorlevel 1 (
    echo PyInstaller build failed.
    exit /b 1
)

echo [build-backend-win] Copying backend to Tauri binaries...
if not exist "frontend\src-tauri\binaries" mkdir "frontend\src-tauri\binaries"

backend\.venv\Scripts\python -c "import os, shutil; src=os.path.join(os.environ.get('TEMP', os.environ.get('TMP', '')), 'pyi_dist', 'nexa-backend'); dst=os.path.join('frontend', 'src-tauri', 'binaries', 'nexa-backend'); shutil.rmtree(dst, ignore_errors=True); shutil.copytree(src, dst)"
if errorlevel 1 (
    echo Failed to copy backend binaries.
    exit /b 1
)

echo [build-backend-win] Verifying output...
dir "frontend\src-tauri\binaries\nexa-backend"

echo.
echo [build-backend-win] Backend build complete!
exit /b 0
