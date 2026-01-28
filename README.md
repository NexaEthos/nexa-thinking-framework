# Nexa Thinking Framework

[![Python 3.12+](https://img.shields.io/badge/python-3.12+-blue.svg)](https://www.python.org/downloads/)
[![TypeScript](https://img.shields.io/badge/typescript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18+-61dafb.svg)](https://reactjs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A multi-agent orchestration framework for structured AI reasoning. Designed as an educational laboratory for experimenting with multi-agent prompt engineering, chain-of-thought reasoning, and LLM orchestration patterns.

![Nexa Thinking Framework](https://img.shields.io/badge/🧠-Nexa%20Thinking-purple)

## Features

### 🔗 Chain of Thought Reasoning

- Step-by-step reasoning with configurable analysis questions
- Real-time streaming responses with thinking process visualization
- Web search integration for fact-based answers
- Request classification (simple, analytical, research)

### 📋 Multi-Agent Project Canvas

- **4-section collaborative canvas** with specialized AI agents:
  - 🎯 **Identity Agent** - Project naming and essence definition
  - 📐 **Definition Agent** - Scope, features, and constraints
  - 🧰 **Resources Agent** - Tools, skills, and requirements (with web research)
  - 📋 **Execution Agent** - Steps, phases, and milestones
- Project Manager orchestration with `@mention` routing
- Full context visibility across all agents

### � Research Lab

- **Multi-agent research pipeline** with specialized agents:
  - 🔍 **Web Researcher** - Searches the web for relevant information
  - 📚 **RAG Indexer** - Indexes content into vector database for retrieval
  - 📝 **Document Writer** - Composes structured research documents
  - ✅ **Fact Checker** - Verifies claims with source citations
- A4-style paginated document output with footnotes
- Guided walkthroughs for common research topics
- Real-time agent collaboration visualization

### 📚 RAG (Retrieval-Augmented Generation)

- Qdrant vector database integration
- Automatic document chunking and embedding
- Multiple embedding providers (OpenAI, local models)
- Chunk viewer for debugging and inspection
- Semantic search across indexed documents

### 📊 Telemetry & Observability

- Real-time API metrics (tokens, latency, throughput)
- Per-agent session statistics
- Cost estimation (configurable $/1M tokens)
- Application logs viewer with filtering

### 🧪 Experiment Presets

- Pre-configured settings for different use cases
- Per-workspace presets (Chain of Thought, Project Manager, Research Lab)
- Custom preset creation and management
- Quick switching between experiment configurations

### 📜 Prompt History

- Version tracking for all prompts and responses
- Response previews with token counts and latency
- Comparison mode for A/B testing prompts
- Tagging and organization features
- Export and reload previous experiments

### ⚙️ Flexible Configuration

- Support for OpenAI-compatible APIs (vLLM, Ollama, LM Studio, etc.)
- Customizable agent prompts and behaviors
- Adjustable model parameters (temperature, max tokens)
- Prompt inspector for debugging system prompts

## Tech Stack

**Backend:**

- Python 3.12+
- FastAPI with async/await
- WebSocket for real-time streaming
- Pydantic for data validation

**Frontend:**

- React 18 with TypeScript
- Vite for fast development
- Real-time WebSocket integration

**Desktop App:**

- Rust with Tauri 2.0
- PyInstaller for backend bundling
- Cross-platform support (macOS, Windows, Linux)

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+ and pnpm
- An OpenAI-compatible LLM API (local or remote)

### Installation

```bash
# Clone the repository
git clone https://github.com/NexaEthos/nexa-thinking-framework.git
cd nexa-thinking-framework

# Install all dependencies (backend + frontend)
make install

# Or manually:
# cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt
# cd frontend && pnpm install
```

### Configuration

Open the app and go to **Settings** to configure:

- **LLM Server** - Select your server type (LM Studio, Ollama, vLLM), address, port, and model
- **Web Search** - Enable/disable and configure search parameters
- **Vectors** - Set up Qdrant for RAG and configure embedding providers
- **AI Agents** - Customize agent prompts and behaviors

**Recommended Model:** We suggest using [LFM2.5-1.2B-Instruct](https://huggingface.co/LiquidAI/LFM2.5-1.2B-Instruct) by Liquid AI with a 32,768 context length. It's a fast, efficient model optimized for agentic tasks, data extraction, and RAG - perfect for this framework. Available for LM Studio, Ollama, and vLLM.

### Running

```bash
# Show all available commands
make help
```

**Development (macOS/Linux):**

| Command | Description |
|---------|-------------|
| `make install` | Set up Python venv and install all dependencies |
| `make start` | Start backend (port 8000) and frontend (port 5173) |
| `make stop` | Stop all running services |
| `make clean` | Remove build artifacts and caches |

**Desktop Application (macOS/Linux):**

| Command | Description |
|---------|-------------|
| `make desktop` | Build and open the desktop app |
| `make desktop-build` | Build desktop app (creates .app/.dmg or .AppImage) |
| `make desktop-dev` | Run desktop app in dev mode (hot reload) |
| `make build-backend` | Build Python backend with PyInstaller |

**Desktop Application (Windows - PowerShell or CMD):**

| Command | Description |
|---------|-------------|
| `make install-win` | Set up Python venv and install dependencies |
| `make build-backend-win` | Build Python backend with PyInstaller |
| `make desktop-build-win` | Build desktop app (creates .msi) |
| `make desktop-win` | Build and open the desktop app |
| `make clean-win` | Remove build artifacts |

**Release (triggers GitHub Actions CI build):**

| Command | Description |
|---------|-------------|
| `make release VERSION=v1.0.1` | Create new release |
| `make release-update VERSION=v1.0.0` | Replace existing release |

Access the application at `http://localhost:5173`

### Desktop Application

The desktop app is built with [Tauri 2.0](https://tauri.app/) and bundles the Python backend as a sidecar, so no separate server is needed. Use the commands above to build for your platform.

Output files are copied to the `release/` folder.

## Project Structure

```
nexa-thinking-framework/
├── backend/
│   ├── main.py                  # FastAPI application
│   ├── app/
│   │   ├── models/              # Pydantic data models
│   │   ├── routes/              # API endpoints
│   │   └── services/            # Business logic
│   ├── llm_settings.json        # LLM configuration
│   ├── agent_settings.json      # Agent prompts
│   └── app_settings.json        # Application settings
├── frontend/
│   ├── src/
│   │   ├── components/          # React components
│   │   ├── services/            # API and WebSocket clients
│   │   └── types/               # TypeScript definitions
│   ├── src-tauri/               # Tauri desktop app source
│   └── index.html
├── release/                     # Built desktop app (.app, .dmg)
├── ARCHITECTURE.md              # Detailed architecture docs
├── AGENTS.md                    # Development guidelines
└── Makefile                     # Build commands (run: make help)
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/chain-of-thought/stream` | POST | Stream chain-of-thought reasoning |
| `/api/chat/direct` | POST | Direct LLM chat without chain-of-thought |
| `/api/project/chat` | POST | Multi-agent project chat |
| `/api/canvas/*` | GET/POST/PUT | Canvas state management |
| `/api/researcher/chat/stream` | POST | Stream research pipeline responses |
| `/api/researcher/agents` | GET | List research pipeline agents |
| `/api/vectors/index` | POST | Index content into vector database |
| `/api/vectors/search` | POST | Semantic search in vector database |
| `/api/presets/*` | GET/POST/DELETE | Experiment preset management |
| `/api/prompt-history/*` | GET/POST/DELETE | Prompt version history |
| `/api/prompts/*` | GET | Inspect system prompts |
| `/api/settings/*` | GET/PUT | Configuration management |
| `/api/telemetry/*` | GET | Metrics and statistics |
| `/api/logs/*` | GET/DELETE | Application logs |

## Development

```bash
# Run linters
cd backend && ruff check .
cd frontend && pnpm lint

# Type checking
cd backend && mypy .
cd frontend && pnpm tsc --noEmit
```

## Architecture

The framework implements a multi-agent orchestration pattern with three main workspaces:

**Chain of Thought:**

1. User input is analyzed and classified (simple, analytical, research)
2. Complex queries are broken into structured reasoning steps
3. Each step streams thinking process in real-time
4. Optional web search augments responses with current information

**Project Manager:**

1. Project Manager receives user requests
2. Routes to specialized agents via @mentions (Identity, Definition, Resources, Execution)
3. Agents process their sections with full canvas context visibility
4. Canvas maintains collaborative state across all agents

**Research Lab:**

1. Orchestrator coordinates the research pipeline
2. Web Researcher gathers information from the internet
3. RAG Indexer stores content in vector database for retrieval
4. Document Writer composes structured research documents
5. Fact Checker verifies claims and adds source citations

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed documentation.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Acknowledgments

- Built with [FastAPI](https://fastapi.tiangolo.com/), [React](https://reactjs.org/), and [Tauri](https://tauri.app/)
- Inspired by chain-of-thought prompting research
- Designed for learning and experimentation with multi-agent systems

---

**Repository:** [github.com/NexaEthos/nexa-thinking-framework](https://github.com/NexaEthos/nexa-thinking-framework)
