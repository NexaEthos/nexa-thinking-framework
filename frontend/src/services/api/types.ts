import { Question } from "../../types";

export type { Question };

export type ServerType = "lm_studio" | "ollama" | "vllm";

export interface LLMSettings {
  server_type: ServerType;
  address: string;
  port: number;
  model: string;
  temperature: number;
  max_tokens: number;
  timeout: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  owned_by: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  models_count: number;
}

export interface ProjectChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface WebSearchSettings {
  enabled: boolean;
  max_results: number;
  max_results_for_questions: number;
  region: string;
  research_triggers: string[];
}

export interface ClassifierSettings {
  moderate_word_threshold: number;
  complex_indicators: string[];
}

export interface ChainOfThoughtSettings {
  max_steps: number;
  enable_verification: boolean;
  stream_tokens: boolean;
}

export type EmbeddingServerType = "lm_studio" | "ollama" | "vllm" | "openai";

export interface EmbeddingSettings {
  provider: "llm" | "openai";
  server_type: EmbeddingServerType;
  address: string;
  port: number;
  model: string;
  openai_api_key: string | null;
  vector_size: number;
}

export interface EmbeddingModelInfo {
  id: string;
  name: string;
  owned_by: string;
  is_embedding: boolean;
}

export interface EmbeddingTestResult {
  success: boolean;
  message: string;
  vector_size?: number;
}

export interface QdrantSettings {
  enabled: boolean;
  use_memory_search: boolean;
  deployment: "local" | "cloud";
  url: string;
  api_key: string | null;
  collection_research: string;
  collection_memory: string;
  collection_canvas: string;
}

export interface PromptSettings {
  canvas_agent_system: string;
  simple_assistant: string;
  question_answer: string;
  final_answer: string;
  cot_quick_prompt: string;
  quick_prompt: string;
}

export interface AppSettings {
  web_search: WebSearchSettings;
  classifier: ClassifierSettings;
  chain_of_thought: ChainOfThoughtSettings;
  prompts: PromptSettings;
  embedding: EmbeddingSettings;
  qdrant: QdrantSettings;
}

export interface VectorStatus {
  enabled: boolean;
  deployment: string | null;
  url: string | null;
}

export interface CollectionInfo {
  name: string;
  vectors_count: number;
  status: string;
}

export interface VectorConnectionTestResult {
  success: boolean;
  message: string;
  qdrant_connected: boolean;
  embedding_ready: boolean;
  latency_ms: number | null;
}

export interface VectorInitializeResult {
  success: boolean;
  message: string;
  collections_created: string[];
}

export interface PMGreetingResponse {
  greeting: string;
}

export interface AgentModelConfig {
  server_type: string;
  base_url: string;
  model: string;
  temperature: number;
  top_p: number;
  top_k: number;
  frequency_penalty: number;
  presence_penalty: number;
  max_tokens: number;
  stop_sequences: string[];
}

export interface PMPrompts {
  system: string;
  greeting: string;
  synthesis: string;
  conflict_resolution: string;
}

export interface PMSettings {
  enabled: boolean;
  name: string;
  nickname: string;
  emoji: string;
  mention_prefix: string;
  prompts: PMPrompts;
  model: AgentModelConfig;
}

export interface SpecialistPrompts {
  system: string;
  extraction: string;
}

export interface SpecialistSettings {
  enabled: boolean;
  name: string;
  nickname: string;
  emoji: string;
  section_id: string;
  prompts: SpecialistPrompts;
  model: AgentModelConfig;
  trigger_keywords: string[];
}

export interface AgentSettings {
  version: string;
  project_manager: PMSettings;
  specialists: Record<string, SpecialistSettings>;
  analysis: {
    request_analyzer: { prompt: string };
    canvas_extraction: { prompt: string };
    complexity_indicators: string[];
  };
  telemetry: {
    enabled: boolean;
    show_per_message: boolean;
    show_in_canvas: boolean;
    export_format: string;
    cost_estimation: {
      enabled: boolean;
      models: Record<string, { inputCostPer1M: number; outputCostPer1M: number }>;
    };
  };
}

export interface PMPromptsConfig {
  system: string;
  greeting: string;
  synthesis: string;
  conflict_resolution: string;
}

export interface SpecialistPromptsConfig {
  system: string;
  extraction: string;
}

export interface SpecialistKeywordsConfig {
  trigger_keywords: string[];
}

export interface TelemetrySessionSummary {
  session_duration: number;
  total_calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  estimated_cost: number | null;
  agents: Record<string, {
    calls: number;
    input_tokens: number;
    output_tokens: number;
    avg_latency_ms: number;
    avg_tokens_per_sec: number;
    estimated_cost: number | null;
  }>;
}

export interface TelemetryCallMetrics {
  agent_id: string;
  timestamp: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  duration_ms: number;
  model: string;
  success: boolean;
  error: string | null;
  request_messages: Array<{ role: string; content: string }> | null;
  response_content: string | null;
  endpoint: string | null;
}

export interface CanvasSection {
  id: string;
  title: string;
  content: string;
  agent_id: string;
  last_updated: string | null;
}

export interface CanvasSummary {
  sections: Record<string, {
    has_content: boolean;
    version: number;
    last_updated: string | null;
  }>;
  completion: {
    completed: number;
    total: number;
    percentage: number;
  };
}

export interface CanvasState {
  canvas: {
    researcher: CanvasSection;
    identity: CanvasSection;
    definition: CanvasSection;
    resources: CanvasSection;
    execution: CanvasSection;
  };
  summary: CanvasSummary;
}

export interface PMChatResponse {
  response: string;
  canvas_updates: string[];
  agent_invocations: Array<{
    agent_id: string;
    triggered_by: string;
    success: boolean;
    error: string | null;
  }>;
  suggestions: string[];
}

export interface PMConversation {
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: string;
    agent_id: string | null;
    mentions: string[];
  }>;
  count: number;
}

export interface SpecialistInfo {
  name: string;
  nickname: string;
  emoji: string;
  enabled: boolean;
  section_id: string;
}

export interface SpecialistResponse {
  agent_id: string;
  content: string;
  section_updated: boolean;
  metrics: Record<string, unknown> | null;
}

export interface AgentsInfo {
  agents: Record<string, { name: string; nickname: string; emoji: string }>;
  section_order: string[];
}

export interface LogEntry {
  timestamp: string;
  level: "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";
  logger: string;
  message: string;
  module?: string;
  function?: string;
  line?: number;
  extra?: Record<string, unknown>;
}

export interface LogsResponse {
  logs: LogEntry[];
  total: number;
  filtered: number;
}

export interface LogStats {
  total_entries: number;
  by_level: Record<string, number>;
  file_size_bytes: number;
  loggers: string[];
}

export interface LogFilterParams {
  levels?: string;
  logger?: string;
  search?: string;
  start_time?: string;
  end_time?: string;
  limit?: number;
  offset?: number;
}

export interface ResearchAgentInvocation {
  agent_id: string;
  success: boolean;
  content: string;
  error: string | null;
}

export interface ResearcherChatResponse {
  response: string;
  research_data: string;
  agent_invocations: ResearchAgentInvocation[];
}

export interface ResearcherAgentInfo {
  name: string;
  emoji: string;
  enabled: boolean;
}

export interface ResearchAgentPrompts {
  system: string;
  extraction: string;
  search_query_generation: string;
}

export interface ResearchOrchestratorPrompts {
  system: string;
  greeting: string;
  synthesis: string;
}

export interface ResearchAgentSettings {
  enabled: boolean;
  name: string;
  nickname: string;
  emoji: string;
  prompts: ResearchAgentPrompts;
  model: AgentModelConfig;
}

export interface ResearchOrchestratorSettings {
  enabled: boolean;
  name: string;
  nickname: string;
  emoji: string;
  prompts: ResearchOrchestratorPrompts;
  model: AgentModelConfig;
}

export interface ResearchSettingsResponse {
  orchestrator?: ResearchOrchestratorSettings;
  agents?: Record<string, ResearchAgentSettings>;
}
