# Nexa Thinking Framework - API Reference

## Base URL

```
http://localhost:8000/api
```

## Authentication

No authentication required (internal training tool).

## Response Format

All endpoints return JSON. Streaming endpoints use Server-Sent Events (SSE).

---

## Chain of Thought

### Submit CoT Request

```http
POST /api/chain-of-thought
```

**Request Body:**

```json
{
  "prompt": "string",
  "use_thinking": true,
  "web_search_enabled": false,
  "memory_search_enabled": false
}
```

**Response:** WebSocket events streamed to client.

### Get Request Details

```http
GET /api/chain-of-thought/{request_id}
```

**Response:**

```json
{
  "id": "uuid",
  "prompt": "string",
  "steps": [...],
  "final_answer": "string",
  "created_at": "ISO8601"
}
```

---

## Questions (CoT Analysis)

### List Questions

```http
GET /api/questions
```

**Response:**

```json
[
  {
    "id": "q1",
    "text": "What is the main problem?",
    "enabled": true,
    "order": 1
  }
]
```

### Update Question

```http
PUT /api/questions/{id}
```

**Request Body:**

```json
{
  "text": "string",
  "enabled": true
}
```

### Toggle Question

```http
POST /api/questions/{id}/toggle
```

**Response:**

```json
{
  "id": "q1",
  "enabled": false
}
```

---

## Prompt Transparency

### Get CoT Prompt Info

```http
GET /api/prompts/chain-of-thought
```

**Response:**

```json
{
  "system_prompt": "You are a reasoning assistant...",
  "questions": [
    { "id": "q1", "text": "...", "enabled": true }
  ],
  "token_counts": {
    "system": 450,
    "questions": 120,
    "total_base": 570
  }
}
```

---

## Experiment Presets

### List Presets

```http
GET /api/presets
```

**Response:**

```json
[
  {
    "id": "rag-comparison",
    "name": "RAG vs No-RAG",
    "description": "Compare retrieval impact",
    "category": "comparison",
    "is_builtin": true,
    "configs": [
      {
        "name": "With RAG",
        "rag_enabled": true,
        "temperature": 0.7
      },
      {
        "name": "Without RAG",
        "rag_enabled": false,
        "temperature": 0.7
      }
    ]
  }
]
```

### Get Single Preset

```http
GET /api/presets/{id}
```

### Create Preset

```http
POST /api/presets
```

**Request Body:**

```json
{
  "name": "My Custom Preset",
  "description": "Testing different settings",
  "category": "custom",
  "configs": [...]
}
```

### Update Preset

```http
PUT /api/presets/{id}
```

### Delete Preset

```http
DELETE /api/presets/{id}
```

---

## Prompt History

### List All Versions

```http
GET /api/prompt-history
GET /api/prompt-history?workspace=chain_of_thought
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `workspace` | string | Filter by workspace (chain_of_thought, research_lab, project_manager) |

**Response:**

```json
[
  {
    "id": "uuid",
    "name": "Python explanation test",
    "prompt": "What is Python?",
    "settings": {
      "temperature": 0.7,
      "use_thinking": true,
      "web_search_enabled": false,
      "rag_enabled": true,
      "model": "llama3"
    },
    "workspace": "chain_of_thought",
    "response_preview": "Python is a high-level...",
    "tokens_used": 712,
    "latency_ms": 2985,
    "created_at": "2026-01-26T18:10:49Z",
    "parent_id": null,
    "tags": []
  }
]
```

### Get Single Version

```http
GET /api/prompt-history/{id}
```

### Save New Version

```http
POST /api/prompt-history
```

**Request Body:**

```json
{
  "name": "Test v1",
  "prompt": "What is RAG?",
  "settings": {
    "temperature": 0.7,
    "use_thinking": true,
    "web_search_enabled": false,
    "rag_enabled": true,
    "model": "llama3"
  },
  "workspace": "chain_of_thought",
  "response_preview": "RAG stands for...",
  "tokens_used": 500,
  "latency_ms": 2000
}
```

### Update Version (Rename)

```http
PATCH /api/prompt-history/{id}
```

**Request Body:**

```json
{
  "name": "New Name"
}
```

### Delete Version

```http
DELETE /api/prompt-history/{id}
```

### Fork Version

```http
POST /api/prompt-history/{id}/fork?name=Forked%20Version
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | string | Name for the forked version |

### Export All History

```http
GET /api/prompt-history/export/json
GET /api/prompt-history/export/json?workspace=chain_of_thought
```

### Clear All History

```http
POST /api/prompt-history/clear
```

---

## Research Lab

### Stream Research Pipeline

```http
POST /api/researcher/chat/stream
```

**Request Body:**

```json
{
  "message": "Research topic",
  "rag_enabled": true
}
```

**Response:** Server-Sent Events stream.

### Get Research Greeting

```http
GET /api/researcher/greeting
```

### Reset Research Session

```http
POST /api/researcher/reset
```

### RAG Status

```http
GET /api/researcher/rag/status
```

**Response:**

```json
{
  "enabled": true,
  "collection": "research_documents",
  "document_count": 42
}
```

### Toggle RAG

```http
POST /api/researcher/rag/toggle
```

---

## Project Manager

### Stream PM Chat

```http
POST /api/project/chat/stream
```

**Request Body:**

```json
{
  "message": "Create a mobile app project"
}
```

### Get Project Greeting

```http
GET /api/project/greeting
```

### Reset Project Session

```http
POST /api/project/reset
```

### Get Canvas State

```http
GET /api/project/canvas
```

**Response:**

```json
{
  "sections": {
    "identity": { "content": "...", "updated_at": "..." },
    "definition": { "content": "...", "updated_at": "..." },
    "resources": { "content": "...", "updated_at": "..." },
    "execution": { "content": "...", "updated_at": "..." }
  }
}
```

---

## Vector Operations (Qdrant)

### Connection Status

```http
GET /api/vectors/status
```

**Response:**

```json
{
  "connected": true,
  "host": "localhost",
  "port": 6333
}
```

### Test Connection

```http
POST /api/vectors/test-connection
```

### Initialize Collections

```http
POST /api/vectors/init-collections
```

### List Collections

```http
GET /api/vectors/collections
```

**Response:**

```json
[
  {
    "name": "research_documents",
    "count": 42,
    "vector_size": 384
  }
]
```

### Browse Chunks

```http
GET /api/vectors/chunks?collection=research_documents&offset=0&limit=20
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `collection` | string | - | Collection name |
| `offset` | int | 0 | Pagination offset |
| `limit` | int | 20 | Items per page |

**Response:**

```json
{
  "chunks": [
    {
      "id": "uuid",
      "content": "Chunk text...",
      "metadata": {
        "source": "web_search",
        "timestamp": "2026-01-26T12:00:00Z"
      },
      "vector_preview": [0.123, -0.456, ...]
    }
  ],
  "total": 42,
  "offset": 0,
  "limit": 20
}
```

### Search Chunks

```http
POST /api/vectors/search
```

**Request Body:**

```json
{
  "query": "What is machine learning?",
  "collection": "research_documents",
  "limit": 10
}
```

**Response:**

```json
{
  "results": [
    {
      "id": "uuid",
      "content": "Machine learning is...",
      "score": 0.87,
      "metadata": {...}
    }
  ],
  "query_embedding_preview": [0.123, ...]
}
```

### Embedding Info

```http
GET /api/vectors/embedding-info
```

**Response:**

```json
{
  "model": "all-MiniLM-L6-v2",
  "dimensions": 384,
  "max_tokens": 256
}
```

---

## Settings

### LLM Settings

```http
GET /api/settings/llm
PUT /api/settings/llm
```

**Schema:**

```json
{
  "host": "localhost",
  "port": 1234,
  "model": "llama3",
  "temperature": 0.7,
  "max_tokens": 4096
}
```

### App Settings

```http
GET /api/settings/app
PUT /api/settings/app
```

### Agent Settings

```http
GET /api/settings/agents
POST /api/settings/agents/reload
```

### System Reset

```http
POST /api/system/reset
```

Clears telemetry, logs, and Qdrant collections.

---

## Logging

### Get Logs

```http
GET /api/logs?level=INFO&limit=100
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `level` | string | Filter by level (DEBUG, INFO, WARNING, ERROR) |
| `limit` | int | Max entries to return |
| `since` | ISO8601 | Filter by timestamp |

### Log Statistics

```http
GET /api/logs/stats
```

### Clear Logs

```http
POST /api/logs/clear
```

### Export Logs

```http
GET /api/logs/export?format=json
GET /api/logs/export?format=text
```

---

## Telemetry

### Session Summary

```http
GET /api/telemetry/session
```

**Response:**

```json
{
  "total_calls": 42,
  "total_tokens": 15000,
  "total_latency_ms": 45000,
  "calls_by_agent": {...},
  "session_start": "2026-01-26T10:00:00Z"
}
```

### Reset Metrics

```http
POST /api/telemetry/session/reset
```

### Agent Stats

```http
GET /api/telemetry/agents/{agent_id}
```

### Call Log

```http
GET /api/telemetry/calls
```

---

## WebSocket Events

Connect to `ws://localhost:8000/ws` for real-time updates.

### Event Types

| Event | Description |
|-------|-------------|
| `connection_status` | Connection state change |
| `chain_progress` | CoT step completion |
| `chain_complete` | CoT request finished |
| `token_stream` | Streaming token |
| `stream_complete` | Stream finished |
| `research_pipeline` | Research agent progress |
| `research_agent_message` | Agent status message |
| `rag_content` | RAG retrieval/indexing |
| `project_thinking` | PM thinking status |
| `project_token` | PM streaming token |
| `project_complete` | PM response complete |
| `project_tools` | Tools used in PM request |
| `pipeline_progress` | Agent pipeline status |
| `agent_message` | Agent status update |
| `canvas_update` | Canvas section changed |
| `metrics_update` | Telemetry updated |

### Event Schema

```typescript
interface WebSocketEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp?: string;
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "detail": "Error message describing what went wrong"
}
```

**HTTP Status Codes:**

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request |
| 404 | Not Found |
| 422 | Validation Error |
| 500 | Internal Server Error |
