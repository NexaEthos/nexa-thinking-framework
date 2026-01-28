@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0.."

echo [install-win] Checking for Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo Python is not installed. Please install Python 3.8+ and try again.
    exit /b 1
)

echo [install-win] Setting up Python virtual environment...
cd backend
python -m venv .venv
if errorlevel 1 (
    echo [install-win] venv creation failed. Ensure Python 3.8+ is installed with ensurepip, or run: python -m ensurepip --upgrade
    exit /b 1
)

echo [install-win] Installing Python dependencies...
.venv\Scripts\pip install -r requirements.txt
if errorlevel 1 exit /b 1
.venv\Scripts\pip install pyinstaller
if errorlevel 1 exit /b 1
cd ..

echo [install-win] Checking for Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo Node.js is not installed. Please install Node.js from https://nodejs.org/ and try again.
    exit /b 1
)

echo [install-win] Checking for pnpm...
set "PATH=%APPDATA%\npm;%PATH%"
pnpm --version >nul 2>&1
if errorlevel 1 (
    echo pnpm not found, trying Corepack...
    corepack enable pnpm >nul 2>&1
    pnpm --version >nul 2>&1
    if errorlevel 1 (
        echo Corepack did not work, installing pnpm via npm...
        cmd /c "npm install -g pnpm"
        if errorlevel 1 (
            echo pnpm installation failed. Please install pnpm manually: npm install -g pnpm
            exit /b 1
        )
    )
)

pnpm --version >nul 2>&1
if errorlevel 1 (
    echo pnpm not available. Please install pnpm manually: npm install -g pnpm
    exit /b 1
)

echo [install-win] Installing frontend dependencies...
cd frontend
cmd /c "pnpm install"
if errorlevel 1 exit /b 1
cd ..

echo [install-win] Setup complete!
exit /b 0
