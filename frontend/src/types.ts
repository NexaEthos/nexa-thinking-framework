export interface WebSource {
  title: string;
  url: string;
  snippet: string;
}

export interface MemorySource {
  id: string;
  content: string;
  score: number;
  collection: string;
}

export interface Step {
  step_number: number;
  type: string;
  question?: string;
  content?: string;
  llm_response?: string;
  reasoning?: string;
  decision?: string;
  confidence?: number;
  thinking?: string;
  tokens_used?: number;
  duration_ms?: number;
  sources?: WebSource[];
  memory_sources?: MemorySource[];
  timestamp: string;
  streaming?: boolean;
}

export interface Verification {
  passed: boolean;
  notes?: string;
}

export interface Question {
  id: number;
  text: string;
  category?: string;
  enabled: boolean;
  created_at: string;
}

export interface ChainOfThoughtRequest {
  query: string;
  context?: string;
  max_steps?: number;
  enable_verification?: boolean;
}

export interface ChainOfThoughtResponse {
  request_id: string;
  request: string;
  status: string;
  steps: Step[];
  final_answer?: string;
  verification?: Verification;
  created_at: string;
  completed_at?: string;
}

export interface RAGResult {
  id: string;
  content: string;
  score: number;
  collection: string;
}

export interface PipelineAgent {
  id: string;
  name: string;
  status: "pending" | "active" | "complete" | "skipped";
  result_summary?: string;
}

export interface AgentMessageData {
  agent_id: string;
  agent_name: string;
  message: string;
  message_type: "task" | "acknowledgment" | "info";
  timestamp: string;
}

export interface ResearchPipelineAgent {
  id: string;
  name: string;
  emoji: string;
  status: "pending" | "active" | "complete" | "skipped";
}

export interface ResearchAgentMessageData {
  agent_id: string;
  agent_name: string;
  message: string;
  message_type: "task" | "acknowledgment" | "info";
  timestamp: string;
}

export interface RAGContentData {
  action: "retrieved" | "indexed";
  content: string;
  metadata: {
    count?: number;
    avg_score?: number;
    snippets?: Array<{
      source: string;
      score: number;
      preview: string;
      full_content?: string;
      indexed_at?: string;
    }>;
    chars?: number;
    topics?: string[];
    collection_size?: number;
    preview?: string;
  };
  timestamp: string;
}

export type WebSocketMessage =
  | { type: "chain_progress"; data: { request?: string; status: string; steps: Step[]; final_answer?: string; verification?: Verification | null } }
  | { type: "chain_complete"; data: { steps?: Step[]; final_answer?: string; finalAnswer?: string; verification?: Verification | null } }
  | { type: "chain_error"; data: string }
  | { type: "connection_status"; data: { connected: boolean } }
  | { type: "token_stream"; data: { request_id: string; step_number: number; token: string } }
  | { type: "stream_complete"; data: { request_id: string; step_number: number; full_response: string } }
  | { type: "step_update"; data: Step }
  | { type: "project_thinking"; data: { status: string; thinking: string } }
  | { type: "project_token"; data: { token: string } }
  | { type: "project_response"; data: { response: string } }
  | { type: "project_canvas"; data: { canvas_updates: CanvasUpdate[] } }
  | { type: "project_tools"; data: { web_search_used: boolean; memory_search_used: boolean; rag_results: RAGResult[] } }
  | { type: "project_complete"; data: { response: string; canvas_updates: CanvasUpdate[]; reasoning_used: boolean } }
  | { type: "project_error"; data: { error: string } }
  | { type: "pipeline_progress"; data: { agents: PipelineAgent[]; current_agent: string | null } }
  | { type: "agent_message"; data: AgentMessageData }
  | { type: "metrics_update"; data: MetricsUpdate }
  | { type: "research_pipeline"; data: { agents: ResearchPipelineAgent[]; current_agent: string | null } }
  | { type: "research_agent_message"; data: ResearchAgentMessageData }
  | { type: "rag_content"; data: RAGContentData };

export interface MetricsUpdate {
  agent_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  duration_ms: number;
  tokens_per_second: number;
  success: boolean;
  timestamp: string;
}

export interface CanvasUpdate {
  id: string;
  title: string;
  content: string;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  streaming?: boolean;
}
