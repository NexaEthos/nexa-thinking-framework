@echo off
setlocal
cd /d "%~dp0.."

echo [clean-win] Cleaning build artifacts...

if exist "release" rmdir /s /q "release"
if exist "frontend\dist" rmdir /s /q "frontend\dist"
if exist "frontend\node_modules\.vite" rmdir /s /q "frontend\node_modules\.vite"
if exist "frontend\src-tauri\target" rmdir /s /q "frontend\src-tauri\target"
if exist "frontend\src-tauri\binaries" rmdir /s /q "frontend\src-tauri\binaries"
if exist "backend\build" rmdir /s /q "backend\build"
if exist "backend\dist" rmdir /s /q "backend\dist"
if exist "backend\.mypy_cache" rmdir /s /q "backend\.mypy_cache"
if exist "backend\__pycache__" rmdir /s /q "backend\__pycache__"

echo [clean-win] Cleaned!
exit /b 0
