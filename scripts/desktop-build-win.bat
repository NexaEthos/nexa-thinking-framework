@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0.."

set "PATH=%APPDATA%\npm;%PATH%"

echo [desktop-build-win] Starting Windows desktop build...

echo.
echo [desktop-build-win] Step 1: Building backend...
call scripts\build-backend-win.bat
if errorlevel 1 (
    echo Backend build failed.
    exit /b 1
)

echo.
echo [desktop-build-win] Step 2: Installing frontend dependencies...
cd frontend
cmd /c "pnpm install"
if errorlevel 1 (
    echo Frontend dependency install failed.
    cd ..
    exit /b 1
)

echo.
echo [desktop-build-win] Step 3: Building Tauri desktop application...
set "CI=false"
cmd /c "pnpm tauri build"
if errorlevel 1 (
    echo Tauri build failed.
    cd ..
    exit /b 1
)
cd ..

echo.
echo [desktop-build-win] Step 4: Copying builds to release folder...
if not exist "release" mkdir "release"
del /q "release\*.msi" 2>nul
del /q "release\*.exe" 2>nul

copy "frontend\src-tauri\target\release\bundle\msi\*.msi" "release\" 2>nul
copy "frontend\src-tauri\target\release\bundle\nsis\*.exe" "release\" 2>nul

echo.
echo ============================================
echo   Windows Build complete!
echo ============================================
echo.
dir release\
echo.
exit /b 0
