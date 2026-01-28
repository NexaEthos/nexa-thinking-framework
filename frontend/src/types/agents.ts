export type AgentId = "pm" | "identity" | "definition" | "resources" | "execution";
export type CanvasSectionId = "identity" | "definition" | "resources" | "execution";

export interface AgentModelConfig {
  serverType: "inherit" | "lm_studio" | "ollama" | "vllm";
  baseUrl: string;
  model: string;
  temperature: number;
  topP: number;
  topK: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxTokens: number;
  stopSequences: string[];
}

export interface PMPrompts {
  system: string;
  greeting: string;
  synthesis: string;
  conflictResolution: string;
}

export interface SpecialistPrompts {
  system: string;
  extraction: string;
}

export interface ProjectManagerConfig {
  enabled: boolean;
  name: string;
  nickname: string;
  emoji: string;
  mentionPrefix: string;
  prompts: PMPrompts;
  model: AgentModelConfig;
}

export interface SpecialistConfig {
  enabled: boolean;
  name: string;
  nickname: string;
  emoji: string;
  sectionId: CanvasSectionId;
  prompts: SpecialistPrompts;
  model: AgentModelConfig;
  triggerKeywords: string[];
}

export interface AnalysisConfig {
  requestAnalyzer: { prompt: string };
  canvasExtraction: { prompt: string };
  complexityIndicators: string[];
}

export interface CostEstimationModelConfig {
  inputCostPer1M: number;
  outputCostPer1M: number;
}

export interface CostEstimationConfig {
  enabled: boolean;
  models: Record<string, CostEstimationModelConfig>;
}

export interface TelemetryConfig {
  enabled: boolean;
  showPerMessage: boolean;
  showInCanvas: boolean;
  exportFormat: "json" | "csv";
  costEstimation: CostEstimationConfig;
}

export interface AgentSettings {
  version: string;
  projectManager: ProjectManagerConfig;
  specialists: Record<CanvasSectionId, SpecialistConfig>;
  analysis: AnalysisConfig;
  telemetry: TelemetryConfig;
}

export interface CanvasSection {
  id: CanvasSectionId;
  title: string;
  content: string;
  agentId: CanvasSectionId;
  lastUpdated: string | null;
  isLoading: boolean;
  metrics: SectionMetrics | null;
}

export interface SectionMetrics {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  durationMs: number;
  tokensPerSecond: number;
  timestamp: string;
}

export interface APICallMetrics {
  agentId: AgentId;
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  durationMs: number;
  model: string;
  success: boolean;
  error: string | null;
}

export interface AgentSessionStats {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  avgLatencyMs: number;
  avgTokensPerSec: number;
  estimatedCost: number | null;
}

export interface SessionSummary {
  sessionDuration: number;
  totalCalls: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCost: number | null;
  agents: Record<AgentId, AgentSessionStats>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  agentId?: AgentId;
  metrics?: APICallMetrics;
  streaming?: boolean;
  mentions?: AgentId[];
}

export interface ProjectCanvas {
  identity: CanvasSection;
  definition: CanvasSection;
  resources: CanvasSection;
  execution: CanvasSection;
}

export interface SessionExport {
  version: string;
  exportedAt: string;
  
  project: ProjectCanvas;
  
  conversation: {
    messages: ChatMessage[];
  };
  
  telemetry: {
    sessionDuration: number;
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    estimatedCost: number | null;
    agents: Record<AgentId, AgentSessionStats>;
    callLog: APICallMetrics[];
  };
  
  agentConfigs: AgentSettings;
}

export interface AgentWorkingEvent {
  type: "agent_working";
  agentId: AgentId;
  sectionId?: CanvasSectionId;
  status: string;
}

export interface AgentCompleteEvent {
  type: "agent_complete";
  agentId: AgentId;
  sectionId?: CanvasSectionId;
  success: boolean;
  metrics?: APICallMetrics;
}

export interface CanvasUpdateEvent {
  type: "canvas_update";
  sectionId: CanvasSectionId;
  title: string;
  content: string;
  metrics?: SectionMetrics;
}

export interface MetricsUpdateEvent {
  type: "metrics_update";
  data: APICallMetrics;
}

export interface TokenStreamEvent {
  type: "token_stream";
  agentId: AgentId;
  token: string;
}

export type AgentWebSocketEvent = 
  | AgentWorkingEvent 
  | AgentCompleteEvent 
  | CanvasUpdateEvent 
  | MetricsUpdateEvent
  | TokenStreamEvent;

export function createEmptyCanvas(): ProjectCanvas {
  const createSection = (id: CanvasSectionId, title: string): CanvasSection => ({
    id,
    title,
    content: "",
    agentId: id,
    lastUpdated: null,
    isLoading: false,
    metrics: null,
  });

  return {
    identity: createSection("identity", "Identity"),
    definition: createSection("definition", "Definition"),
    resources: createSection("resources", "Resources"),
    execution: createSection("execution", "Execution"),
  };
}

export function createEmptySessionSummary(): SessionSummary {
  const createAgentStats = (): AgentSessionStats => ({
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    avgLatencyMs: 0,
    avgTokensPerSec: 0,
    estimatedCost: null,
  });

  return {
    sessionDuration: 0,
    totalCalls: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    estimatedCost: null,
    agents: {
      pm: createAgentStats(),
      identity: createAgentStats(),
      definition: createAgentStats(),
      resources: createAgentStats(),
      execution: createAgentStats(),
    },
  };
}

export const AGENT_INFO: Record<AgentId, { name: string; nickname: string; emoji: string }> = {
  pm: { name: "Project Manager", nickname: "The Orchestrator", emoji: "👔" },
  identity: { name: "Identity", nickname: "The Namer", emoji: "🎯" },
  definition: { name: "Definition", nickname: "The Architect", emoji: "📐" },
  resources: { name: "Resources", nickname: "The Pragmatist", emoji: "🧰" },
  execution: { name: "Execution", nickname: "The Planner", emoji: "📋" },
};

export const SECTION_ORDER: CanvasSectionId[] = ["identity", "definition", "resources", "execution"];
