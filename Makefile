.PHONY: help start stop clean install desktop desktop-dev desktop-build build-backend release release-update
.PHONY: install-win install-win-bat install-win-sh build-backend-win desktop-build-win desktop-win clean-win

help:
	@echo ""
	@echo "Nexa Thinking Framework - Available Commands"
	@echo "============================================="
	@echo ""
	@echo "  Development (macOS/Linux):"
	@echo "    make install       Set up Python venv and install all dependencies"
	@echo "    make start         Start backend (port 8000) and frontend (port 5173)"
	@echo "    make stop          Stop all running services"
	@echo "    make clean         Remove build artifacts and caches"
	@echo ""
	@echo "  Desktop Application - macOS/Linux:"
	@echo "    make desktop       Build and open the desktop app"
	@echo "    make desktop-build Build desktop app (creates .app/.dmg or .AppImage)"
	@echo "    make desktop-dev   Run desktop app in dev mode (hot reload)"
	@echo "    make build-backend Build Python backend with PyInstaller"
	@echo ""
	@echo "  Desktop Application - Windows (PowerShell or CMD):"
	@echo "    make install-win        Set up Python venv and install dependencies"
	@echo "    make build-backend-win  Build Python backend with PyInstaller"
	@echo "    make desktop-build-win  Build desktop app (creates .msi)"
	@echo "    make desktop-win        Build and open the desktop app"
	@echo "    make clean-win          Remove build artifacts"
	@echo ""
	@echo "  Or run scripts directly from PowerShell/CMD:"
	@echo "    scripts\\install-win.bat"
	@echo "    scripts\\desktop-build-win.bat"
	@echo "    scripts\\clean-win.bat"
	@echo ""
	@echo "  Release (triggers GitHub Actions CI build):"
	@echo "    make release VERSION=v1.0.1        Create new release"
	@echo "    make release-update VERSION=v1.0.0 Replace existing release"
	@echo ""
	@echo "  Output Location:"
	@echo "    release/    Contains local build artifacts"
	@echo ""

install:
	@echo "Setting up Python virtual environment..."
	@cd backend && python3 -m venv .venv
	@echo "Installing Python dependencies..."
	@cd backend && .venv/bin/pip install -r requirements.txt
	@echo "Installing frontend dependencies..."
	@cd frontend && pnpm install
	@echo "Setup complete!"

start:
	@echo "Starting services..."
	@if [ ! -d "backend/.venv" ]; then \
		echo "Virtual environment not found. Run 'make install' first."; \
		exit 1; \
	fi
	@echo "Starting backend server on http://0.0.0.0:8000..."
	@cd backend && .venv/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
	@sleep 2
	@echo "Starting frontend dev server on http://0.0.0.0:5173..."
	@cd frontend && pnpm dev
	
stop:
	@echo "Stopping services..."
	@pkill -f "uvicorn main:app" || true
	@pkill -f "vite" || true
	@echo "Services stopped!"

clean:
	@echo "Cleaning build artifacts..."
	@rm -rf release || true
	@cd frontend && rm -rf dist node_modules/.vite || true
	@cd frontend/src-tauri && rm -rf target binaries || true
	@cd backend && rm -rf build dist .mypy_cache __pycache__ app/**/__pycache__ app/**/**/__pycache__ || true
	@echo "Cleaned!"

build-backend:
	@echo "Building Python backend with PyInstaller..."
	@if [ ! -d "backend/.venv" ]; then \
		echo "Virtual environment not found. Run 'make install' first."; \
		exit 1; \
	fi
	@cd backend && .venv/bin/python -m PyInstaller nexa-backend.spec --clean --noconfirm
	@echo ""
	@echo "Copying backend to Tauri binaries..."
	@rm -rf frontend/src-tauri/binaries
	@mkdir -p frontend/src-tauri/binaries
	@cp -r backend/dist/nexa-backend frontend/src-tauri/binaries/
	@echo "Backend build complete!"

desktop-dev:
	@echo "Starting desktop app in development mode..."
	@echo "Note: Start backend separately first, or it will auto-start from .venv"
	@cd frontend && pnpm tauri dev

desktop-build: build-backend
	@echo ""
	@echo "Building Tauri desktop application..."
	@cd frontend && CI=false pnpm tauri build
	@echo ""
	@echo "Copying builds to release folder..."
	@mkdir -p release
	@rm -rf release/*.app release/*.dmg 2>/dev/null || true
	@cp -r frontend/src-tauri/target/release/bundle/macos/*.app release/ 2>/dev/null || true
	@cp frontend/src-tauri/target/release/bundle/dmg/*.dmg release/ 2>/dev/null || true
	@echo ""
	@echo "============================================"
	@echo "  Build complete!"
	@echo "============================================"
	@echo ""
	@ls -lh release/ 2>/dev/null || true
	@echo ""

desktop: desktop-build
	@echo "Opening desktop application..."
	@open release/*.app 2>/dev/null || \
		echo "Run the app from release/"

release:
	@echo ""
	@echo "Creating new GitHub release (triggers CI build)..."
	@if [ -z "$(VERSION)" ]; then \
		echo "Usage: make release VERSION=v1.0.1"; \
		exit 1; \
	fi
	@if git rev-parse $(VERSION) >/dev/null 2>&1; then \
		echo "Error: Tag $(VERSION) already exists. Use 'make release-update VERSION=$(VERSION)' to replace it."; \
		exit 1; \
	fi
	@git tag $(VERSION)
	@git push origin $(VERSION)
	@echo ""
	@echo "Tag $(VERSION) pushed! GitHub Actions will build and publish the release."
	@echo "Monitor at: https://github.com/NexaEthos/nexa-thinking-framework/actions"

release-update:
	@echo ""
	@echo "Updating existing GitHub release (triggers CI rebuild)..."
	@if [ -z "$(VERSION)" ]; then \
		echo "Usage: make release-update VERSION=v1.0.0"; \
		exit 1; \
	fi
	@echo "Deleting existing release and tag for $(VERSION)..."
	@gh release delete $(VERSION) --yes 2>/dev/null || echo "No existing release to delete"
	@git push origin :refs/tags/$(VERSION) 2>/dev/null || echo "No remote tag to delete"
	@git tag -d $(VERSION) 2>/dev/null || echo "No local tag to delete"
	@echo "Creating new tag $(VERSION)..."
	@git tag $(VERSION)
	@git push origin $(VERSION)
	@echo ""
	@echo "Tag $(VERSION) re-pushed! GitHub Actions will rebuild and publish the release."
	@echo "Monitor at: https://github.com/NexaEthos/nexa-thinking-framework/actions"

# ============================================
# Windows Build Commands (use with Git Bash or PowerShell)
# ============================================
# On Windows (PowerShell/CMD), install-win runs scripts/install-win.bat via cmd.
# On Unix/Git Bash, install-win runs the POSIX recipe (install-win-sh).

ifeq ($(OS),Windows_NT)
install-win: install-win-bat
else
install-win: install-win-sh
endif

install-win-bat:
	@echo "[install-win] Running Windows install script..."
	@cmd //c "scripts\\install-win.bat"

install-win-sh:
	@echo "[install-win] Checking for Python..."
	@python --version >/dev/null 2>&1 || { echo "Python is not installed. Please install Python 3.8+ and try again."; exit 1; }
	@echo "[install-win] Setting up Python virtual environment..."
	@cd backend && python -m venv .venv
	@echo "[install-win] Installing Python dependencies..."
	@cd backend && .venv/Scripts/pip install -r requirements.txt
	@cd backend && .venv/Scripts/pip install pyinstaller
	@echo "[install-win] Checking for Node.js..."
	@node --version >/dev/null 2>&1 || { echo "Node.js is not installed. Please install Node.js from https://nodejs.org/ and try again."; exit 1; }
	@echo "[install-win] Checking for pnpm..."
	@command -v pnpm >/dev/null 2>&1 || (echo "pnpm not found, trying Corepack..." && corepack enable pnpm 2>/dev/null) || true
	@command -v pnpm >/dev/null 2>&1 || (echo "Installing pnpm via npm..." && npm install -g pnpm)
	@command -v pnpm >/dev/null 2>&1 || { echo "pnpm installation failed. Please install pnpm manually: npm install -g pnpm"; exit 1; }
	@echo "[install-win] Installing frontend dependencies..."
	@cd frontend && pnpm install
	@echo "[install-win] Setup complete!"

build-backend-win:
	@cmd //c "scripts\\build-backend-win.bat"

desktop-build-win:
	@cmd //c "scripts\\desktop-build-win.bat"

desktop-win: desktop-build-win
	@echo "Opening release folder..."
	@cmd //c "explorer release" || echo "Run the installer from release/"

clean-win:
	@cmd //c "scripts\\clean-win.bat"
