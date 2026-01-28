# Nexa Thinking Framework

## System Overview

An educational AI laboratory for architects and engineers experimenting with multi-agent orchestration, chain-of-thought reasoning, and retrieval-augmented generation (RAG). The framework provides three main workspaces plus comprehensive experimentation tools:

**Workspaces:**

1. **Chain of Thought** - Structured reasoning with configurable analysis questions
2. **Project Manager** - Multi-agent project canvas with orchestrated specialists
3. **Research Lab** - Document generation pipeline with web search and RAG

**Experimentation Tools:**

1. **Prompt Inspector** - Full transparency into system/user prompts and token breakdown
2. **A/B Comparison** - Side-by-side testing with different settings
3. **Experiment Presets** - One-click templates for common test scenarios
4. **Prompt History** - Version tracking, comparison, and forking
5. **RAG Chunk Viewer** - Browse and search vector database contents
6. **Export Reports** - Generate shareable Markdown/JSON experiment reports

## Architecture Components

### Backend Structure

```
backend/
├── main.py                           # FastAPI app with lifespan, CORS, WebSocket
├── agent_settings.json               # Agent prompts and configurations
├── app_settings.json                 # App behavior settings
├── llm_settings.json                 # LLM connection settings
├── questions.json                    # CoT analysis questions
├── presets.json                      # Experiment preset templates
├── prompt_history.json               # Saved prompt versions
└── app/
    ├── models/
    │   ├── agents.py                 # Agent, canvas, telemetry models
    │   ├── chain_of_thought.py       # CoT reasoning models
    │   └── vectors.py                # Vector/embedding models
    ├── routes/
    │   ├── agents.py                 # PM + specialist endpoints
    │   ├── canvas.py                 # Canvas CRUD endpoints
    │   ├── chain_of_thought.py       # CoT reasoning endpoints
    │   ├── chat.py                   # Direct chat endpoints
    │   ├── logs.py                   # Application logging endpoints
    │   ├── presets.py                # Experiment presets CRUD
    │   ├── project.py                # Project chat with pipeline
    │   ├── prompt_history.py         # Prompt versioning endpoints
    │   ├── prompts.py                # Prompt transparency endpoints
    │   ├── questions.py              # Question management
    │   ├── researcher.py             # Research Lab pipeline
    │   ├── settings.py               # Settings + system reset
    │   ├── telemetry.py              # Metrics endpoints
    │   └── vectors.py                # Qdrant vector operations + chunk viewer
    └── services/
        ├── agent_router.py           # @mention parsing and routing
        ├── agent_settings.py         # Settings loader with validation
        ├── app_settings.py           # App settings loader
        ├── canvas_agent.py           # Canvas content extraction
        ├── canvas_state.py           # Canvas state with versioning
        ├── embedding_service.py      # Text embedding generation
        ├── llm_proxy.py              # LLM API communication
        ├── llm_settings.py           # LLM settings management
        ├── logging_service.py        # Structured logging service
        ├── orchestrator.py           # CoT orchestrator
        ├── pm_orchestrator.py        # Project Manager orchestration
        ├── presets_service.py        # Preset management service
        ├── prompt_classifier.py      # Request complexity classifier
        ├── qdrant_service.py         # Vector database service
        ├── question_manager.py       # CoT question management
        ├── request_store.py          # Request state storage
        ├── researcher_orchestrator.py # Research pipeline orchestrator
        ├── telemetry.py              # Metrics recording service
        ├── web_search.py             # DuckDuckGo search integration
        └── websocket_manager.py      # WebSocket connection management
```

### Frontend Structure

```
frontend/src/
├── App.tsx                           # Main app with tab navigation
├── types.ts                          # Shared TypeScript types
├── types/
│   ├── agents.ts                     # Agent and canvas types
│   └── index.ts                      # Type exports
├── services/
│   ├── api.ts                        # Legacy API (re-exports)
│   ├── websocket.ts                  # WebSocket client with callbacks
│   └── api/
│       ├── agent-settings.ts         # Agent config API
│       ├── agents.ts                 # Agent endpoints
│       ├── canvas.ts                 # Canvas operations
│       ├── logs.ts                   # Logging API
│       ├── presets.ts                # Experiment presets API
│       ├── prompts.ts                # Prompt info API
│       ├── questions.ts              # Question management
│       ├── researcher.ts             # Research Lab API
│       ├── settings.ts               # Settings + system reset
│       ├── telemetry.ts              # Metrics API
│       └── vectors.ts                # Qdrant + chunk viewer API
└── components/
    ├── AgentsSettingsTab.tsx         # AI Agents configuration
    ├── CanvasPanel.tsx               # 4-section canvas UI
    ├── ChainOfThoughtViewer.tsx      # CoT reasoning display
    ├── Chat.tsx                      # Generic chat interface
    ├── ComparisonPanel.tsx           # A/B side-by-side comparison
    ├── ErrorBoundary.tsx             # Error handling wrapper
    ├── ExportReport.tsx              # Experiment report generator
    ├── FullContextView.tsx           # Export/import view
    ├── Glossary.tsx                  # Searchable term reference
    ├── GuidedTour.tsx                # First-time user walkthrough
    ├── LoggingPanel.tsx              # Application logs viewer
    ├── ModelConfigSection.tsx        # LLM model configuration
    ├── PresetSelector.tsx            # Experiment presets UI
    ├── ProjectManager.tsx            # Project workspace + canvas
    ├── PromptHistory.tsx             # Version tracking + comparison
    ├── PromptInspector.tsx           # Prompt transparency viewer
    ├── QuestionManager.tsx           # CoT question editor
    ├── RAGChunkViewer.tsx            # Vector chunk browser
    ├── ResearcherPanel.tsx           # Research Lab workspace
    ├── SettingsPanel.tsx             # Settings UI with tabs
    ├── TelemetryPanel.tsx            # Metrics badge + panel
    ├── ThinkingPanel.tsx             # CoT workspace main component
    └── Tooltips.tsx                  # Educational tooltip system
```

## Three Workspaces

### 1. Chain of Thought

Structured reasoning system for complex queries.

**Features:**

- 5 configurable analysis questions with toggle on/off
- Direct mode bypass (skip analysis, direct LLM response)
- Web search integration for real-time data
- Memory/RAG integration for context retrieval
- Real-time streaming of analysis steps

**Flow:**

```
User Prompt → Question Analysis (parallel) → Merge Responses → Verification → Final Answer
```

### 2. Project Manager

Multi-agent orchestrated project canvas.

**The 4-Section Canvas:**

| Section | Agent | Role |
|---------|-------|------|
| 🎯 Identity | The Namer | Project name + one-liner essence |
| 📐 Definition | The Architect | Scope, features, constraints, goals |
| 🧰 Resources | The Pragmatist | Materials, tools, skills, budget |
| 📋 Execution | The Planner | Steps, phases, milestones |

**Pipeline with Researcher:**

```
User Prompt → Researcher (web search + RAG) → PM orchestrates specialists → Canvas updates
```

**Features:**

- PM orchestrates 4 specialists via @mentions
- Integrated researcher agent for web data
- RAG memory for cumulative project knowledge
- Visual pipeline status
- Collapsible canvas sections
- Full context export/import

### 3. Research Lab

Document generation pipeline for comprehensive research.

**Pipeline Agents:**

| Agent | Role |
|-------|------|
| 🔍 Web Researcher | Searches web, gathers sources |
| 📚 RAG Indexer | Stores/retrieves from knowledge base |
| 📝 Document Writer | Composes research document |
| ✅ Fact Checker | Verifies claims with sources |

**Features:**

- 3-step walkthrough for each topic
- RAG toggle (on/off) for A/B comparison
- Visual pipeline progress
- Content popup showing indexed/retrieved data
- Paginated A4-style document view
- Verification notes with claim status
- Export to Markdown

## Experimentation Tools

### Prompt Inspector

Full transparency into what's being sent to the LLM.

**Features:**

- View complete system prompt with all instructions
- See assembled user prompt with injected context
- RAG content highlighted with visual markers
- Token count breakdown (system/user/context/total)
- Active questions display (CoT workspace)

### A/B Comparison Mode

Side-by-side testing with different configurations.

**Features:**

- Run same query with different settings simultaneously
- Compare RAG on vs off, different temperatures
- Visual diff of token usage and latency
- Collapsible config sections for full-height results
- Web search sources displayed per configuration
- 80% viewport width modal with 95% height

### Experiment Presets

Pre-configured templates for common test scenarios.

**Built-in Presets:**

| Preset | Purpose |
|--------|---------|
| Basic RAG vs No-RAG | Compare retrieval impact |
| Temperature Sensitivity | Test 0.1 vs 0.5 vs 0.9 |
| Context Window Optimization | Measure context effects |
| Prompt Structure Comparison | CoT vs Direct mode |

**Features:**

- One-click load with all settings configured
- Create and save custom presets
- Edit, delete, duplicate presets

### Prompt History & Versioning

Track prompt iterations over time.

**Features:**

- Save prompt versions with name, settings, metrics
- Filter by workspace (CoT, Research, PM)
- Fork successful configurations
- Side-by-side version comparison
- Export full history as JSON
- Rename, delete versions

### RAG Chunk Viewer

Browse and search vector database contents.

**Features:**

- List all chunks in any collection with metadata
- Similarity score visualization with color-coded bars
- Search with detailed similarity breakdown
- Expand/collapse chunk content
- Embedding model info and vector dimensions
- Score legend explaining cosine similarity ranges

### Export Reports

Generate shareable experiment documentation.

**Report Contents:**

- Prompt text and settings used
- Full response with thinking steps
- Token count and latency metrics
- Web search sources (if enabled)
- Timestamp and model info

**Export Formats:**

- Markdown - For documentation/sharing
- JSON - For programmatic analysis
- Copy to clipboard functionality

### Guided Tour & Learning Resources

First-time user experience and educational content.

**Guided Tour:**

- Step-by-step walkthrough of all workspaces
- Explains key features and controls
- Skip option and restart button
- Persisted completion state (localStorage)

**Learning Resources:**

- Tooltips for technical terms (RAG, CoT, temperature, etc.)
- Expandable "Learn more" sections
- Searchable glossary panel

## RAG Integration (Qdrant)

Vector database for retrieval-augmented generation.

**Collections:**

- `research_documents` - Research facts and findings
- `conversation_memory` - Chat context history
- `canvas_content` - Project canvas snapshots

**Features:**

- LLM endpoint embeddings (LM Studio, Ollama, vLLM, OpenAI)
- Configurable similarity threshold
- Collection size display
- Content preview in popup
- Source attribution in documents

**Settings UI:**

- Enable/disable Qdrant
- Server connection (host:port)
- Embedding server type selection (LM Studio, Ollama, vLLM, OpenAI)
- Model selection with auto-fetch from endpoint
- Test embedding connection button
- Initialize collections button

## API Endpoints

### Research Lab

```
POST /api/researcher/chat/stream      # Streaming research pipeline
GET  /api/researcher/greeting         # Welcome message
POST /api/researcher/reset            # Reset session
GET  /api/researcher/rag/status       # RAG status and stats
POST /api/researcher/rag/toggle       # Enable/disable RAG
```

### Project Manager

```
POST /api/project/chat/stream         # Streaming PM chat
GET  /api/project/greeting            # PM greeting
POST /api/project/reset               # Reset project
GET  /api/project/canvas              # Get canvas state
```

### Chain of Thought

```
POST /api/chain-of-thought            # Submit CoT request
GET  /api/chain-of-thought/{id}       # Get request details
GET  /api/questions                   # Get analysis questions
PUT  /api/questions/{id}              # Update question
POST /api/questions/{id}/toggle       # Enable/disable question
```

### Prompt Transparency

```
GET  /api/prompts/chain-of-thought    # Get CoT prompt info (system, user, tokens)
```

### Experiment Presets

```
GET    /api/presets                   # List all presets
GET    /api/presets/{id}              # Get single preset
POST   /api/presets                   # Create preset
PUT    /api/presets/{id}              # Update preset
DELETE /api/presets/{id}              # Delete preset
```

### Prompt History

```
GET    /api/prompt-history            # List all versions (optional ?workspace= filter)
GET    /api/prompt-history/{id}       # Get single version
POST   /api/prompt-history            # Save new version
PATCH  /api/prompt-history/{id}       # Update version (rename)
DELETE /api/prompt-history/{id}       # Delete version
POST   /api/prompt-history/clear      # Clear all history
POST   /api/prompt-history/{id}/fork  # Fork a version
GET    /api/prompt-history/export/json # Export all as JSON
```

### Settings & System

```
GET  /api/settings/llm                # LLM settings
PUT  /api/settings/llm                # Update LLM settings
GET  /api/settings/app                # App settings
PUT  /api/settings/app                # Update app settings
GET  /api/settings/agents             # Agent configs
POST /api/settings/agents/reload      # Reload from files
POST /api/system/reset                # Global reset (telemetry, logs, Qdrant)
```

### Vector Operations & Chunk Viewer

```
GET  /api/vectors/status              # Qdrant connection status
POST /api/vectors/test-connection     # Test Qdrant server
POST /api/vectors/init-collections    # Initialize collections
GET  /api/vectors/collections         # List collections with counts
GET  /api/vectors/chunks              # Browse chunks (pagination, collection filter)
POST /api/vectors/search              # Search chunks with similarity scores
GET  /api/vectors/embedding-info      # Get embedding model metadata
```

### Logging

```
GET  /api/logs                        # Get filtered logs
GET  /api/logs/stats                  # Log statistics
POST /api/logs/clear                  # Clear logs
GET  /api/logs/export                 # Export logs (JSON/text)
```

### Telemetry

```
GET  /api/telemetry/session           # Session summary
POST /api/telemetry/session/reset     # Reset metrics
GET  /api/telemetry/agents/{id}       # Per-agent stats
GET  /api/telemetry/calls             # Full call log
```

## WebSocket Events

```typescript
// Connection
{ type: "connection_status", data: { connected: boolean } }

// Research Pipeline
{ type: "research_pipeline", data: { agents: Agent[], current_agent: string } }
{ type: "research_agent_message", data: { agent_id, message, message_type } }
{ type: "rag_content", data: { action: "retrieved"|"indexed", content, metadata } }

// Project Manager
{ type: "project_thinking", data: { status, thinking } }
{ type: "project_token", data: { token } }
{ type: "project_complete", data: { response, canvas_updates, mentioned_agents } }
{ type: "project_tools", data: { web_search_used, memory_search_used, rag_results } }
{ type: "pipeline_progress", data: { agents, current_agent } }
{ type: "agent_message", data: { agent_id, agent_name, message, message_type } }

// Chain of Thought
{ type: "chain_progress", data: Step }
{ type: "chain_complete", data: ChainOfThought }
{ type: "token_stream", data: { step_number, token } }
{ type: "stream_complete", data: { step_number, full_response } }

// Telemetry
{ type: "metrics_update", data: APICallMetrics }

// Canvas
{ type: "canvas_update", data: CanvasSection }
{ type: "project_canvas", data: { canvas_updates } }
```

## Configuration

### JSON Configuration Files

| File | Purpose |
|------|---------|
| `agent_settings.json` | Agent prompts, model configs, telemetry |
| `app_settings.json` | Web search, classifier, Qdrant, UI prompts |
| `llm_settings.json` | LLM server connection |
| `questions.json` | CoT analysis questions |
| `presets.json` | Experiment preset templates |
| `prompt_history.json` | Saved prompt versions (auto-generated) |

### Embedding Configuration

Embeddings are generated via LLM endpoint APIs (not local models). Configure in `app_settings.json`:

```json
{
  "embedding": {
    "provider": "llm",
    "server_type": "lm_studio",
    "address": "localhost",
    "port": 1234,
    "model": "text-embedding-nomic-embed-text-v1.5",
    "vector_size": 768
  }
}
```

The Settings panel provides:
- Server type selection buttons (LM Studio, Ollama, vLLM, OpenAI)
- Model dropdown with auto-fetch from endpoint
- Test connection button with vector size detection
- Autosave on model selection

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_HOST` | localhost | LLM server address |
| `LLM_PORT` | 1234 | LLM server port |
| `QUESTIONS_FILE` | questions.json | Questions path |

## Data Flow

### Research Lab Flow

```
User selects topic
        ↓
    Quick prompt or custom query
        ↓
    ┌─── Web Researcher ───┐
    │  DuckDuckGo search   │
    │  Extract sources     │
    └──────────┬───────────┘
               ↓
    ┌─── RAG Indexer ──────┐
    │  Retrieve relevant   │
    │  Index new content   │
    └──────────┬───────────┘
               ↓
    ┌─── Document Writer ──┐
    │  Compose document    │
    │  Stream tokens       │
    └──────────┬───────────┘
               ↓
    ┌─── Fact Checker ─────┐
    │  Verify claims       │
    │  Add source notes    │
    └──────────┬───────────┘
               ↓
    WebSocket broadcasts → UI updates
```

### Project Manager Flow

```
User input
    ↓
PM analyzes request
    ↓
┌── Researcher (if enabled) ──┐
│  Web search + RAG           │
└─────────────┬───────────────┘
              ↓
PM invokes specialists via @mentions
              ↓
    ┌─────────┼─────────┐─────────┐
    ↓         ↓         ↓         ↓
@identity @definition @resources @execution
    ↓         ↓         ↓         ↓
    └─────────┴─────────┴─────────┘
              ↓
        Canvas updates
              ↓
    Index to Qdrant (if enabled)
              ↓
    WebSocket broadcast → UI
```

## Performance Optimizations

1. **Async-first design** - Concurrent agent execution
2. **WebSocket callbacks** - Direct message processing (no React batching issues)
3. **Streaming responses** - Token-by-token LLM output
4. **LLM endpoint embeddings** - Flexible embedding via LM Studio, Ollama, vLLM, or OpenAI
5. **Efficient state management** - Canvas versioning, lazy loading
6. **Desktop app startup** - Frontend retry logic for backend sidecar initialization

## Security Considerations

1. Input validation on all endpoints
2. CORS configuration for frontend origin
3. Settings validation (error on missing, no silent fallbacks)
4. WebSocket connection lifecycle management
5. No authentication (internal training tool)

## Deployment

### Development Mode

```bash
# Backend (FastAPI + Uvicorn)
make start     # Starts backend on port 8000, frontend on port 5173
make stop      # Stops all services
```

### Desktop Application (Tauri)

The framework can be bundled as a standalone desktop application using Tauri.
The Python backend is packaged with PyInstaller and runs as a sidecar process.

```bash
# Build and run desktop app
make desktop        # Build and open app

# Development mode (hot reload)
make desktop-dev    # Requires backend running separately

# Build only
make desktop-build  # Creates .app and .dmg bundles
```

**Output locations:**
- macOS: `frontend/src-tauri/target/release/bundle/macos/Nexa Thinking Framework.app`
- DMG: `frontend/src-tauri/target/release/bundle/dmg/Nexa Thinking Framework_*.dmg`

### Requirements

**Backend:**

- Python 3.12+
- FastAPI, Uvicorn
- qdrant-client (vector DB)
- duckduckgo-search (web search)
- httpx (LLM/embedding API calls)

**Frontend:**

- Node.js 18+
- React 18, TypeScript
- Vite build system

**Desktop App (Optional):**

- Rust (for Tauri)
- Tauri CLI

**Optional:**

- Qdrant server (for RAG features)
- OpenAI-compatible LLM server (LM Studio, Ollama, vLLM, etc.)
