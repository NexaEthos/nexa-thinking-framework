import {
  LLMSettings,
  ModelInfo,
  ConnectionTestResult,
  ProjectChatMessage,
  AppSettings,
  WebSearchSettings,
  PromptSettings,
  ServerType,
  EmbeddingServerType,
  EmbeddingModelInfo,
  EmbeddingTestResult,
} from "./types";
import { API_URL as API_BASE_URL } from "./config";

export async function getLLMSettings(): Promise<LLMSettings> {
  const response = await fetch(`${API_BASE_URL}/settings/llm`);
  if (!response.ok) {
    throw new Error(`Failed to get LLM settings: ${response.statusText}`);
  }
  return response.json();
}

export async function updateLLMSettings(settings: LLMSettings): Promise<LLMSettings> {
  const response = await fetch(`${API_BASE_URL}/settings/llm`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error(`Failed to update LLM settings: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchModels(
  serverType: ServerType,
  address: string,
  port: number
): Promise<ModelInfo[]> {
  const response = await fetch(`${API_BASE_URL}/settings/llm/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ server_type: serverType, address, port }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || `Failed to fetch models: ${response.statusText}`);
  }
  const data = await response.json();
  return data.models;
}

export async function testLLMConnection(
  serverType: ServerType,
  address: string,
  port: number
): Promise<ConnectionTestResult> {
  const response = await fetch(`${API_BASE_URL}/settings/llm/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ server_type: serverType, address, port }),
  });
  if (!response.ok) {
    throw new Error(`Failed to test connection: ${response.statusText}`);
  }
  return response.json();
}

export async function sendProjectChat(
  messages: ProjectChatMessage[],
  systemPrompt: string
): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/project/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      system_prompt: systemPrompt,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to send project chat: ${response.statusText}`);
  }
  const data = await response.json();
  return data.content;
}

export async function getAppSettings(): Promise<AppSettings> {
  const response = await fetch(`${API_BASE_URL}/settings/app`);
  if (!response.ok) {
    throw new Error(`Failed to get app settings: ${response.statusText}`);
  }
  return response.json();
}

export async function updateAppSettings(settings: AppSettings): Promise<AppSettings> {
  const response = await fetch(`${API_BASE_URL}/settings/app`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error(`Failed to update app settings: ${response.statusText}`);
  }
  return response.json();
}

export async function updateWebSearchSettings(
  settings: Partial<WebSearchSettings>
): Promise<AppSettings> {
  const response = await fetch(`${API_BASE_URL}/settings/app/web-search`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error(`Failed to update web search settings: ${response.statusText}`);
  }
  return response.json();
}

export async function updatePromptSettings(
  settings: Partial<PromptSettings>
): Promise<AppSettings> {
  const response = await fetch(`${API_BASE_URL}/settings/app/prompts`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error(`Failed to update prompt settings: ${response.statusText}`);
  }
  return response.json();
}

export async function resetPromptSettings(): Promise<AppSettings> {
  const response = await fetch(`${API_BASE_URL}/settings/app/prompts/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to reset prompt settings: ${response.statusText}`);
  }
  return response.json();
}

export interface SystemResetResult {
  status: string;
  message: string;
  results: {
    telemetry: boolean;
    logs: boolean;
    qdrant_research: boolean;
    qdrant_memory: boolean;
    qdrant_canvas: boolean;
    telemetry_error?: string;
    logs_error?: string;
    qdrant_error?: string;
  };
}

export async function globalSystemReset(): Promise<SystemResetResult> {
  const response = await fetch(`${API_BASE_URL}/system/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to reset system: ${response.statusText}`);
  }
  return response.json();
}

export async function testEmbeddingConnection(
  serverType: EmbeddingServerType,
  address: string,
  port: number,
  model: string,
  apiKey?: string | null
): Promise<EmbeddingTestResult> {
  const response = await fetch(`${API_BASE_URL}/settings/embedding/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      server_type: serverType,
      address,
      port,
      model,
      api_key: apiKey || null,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to test embedding connection: ${response.statusText}`);
  }
  return response.json();
}

export async function fetchEmbeddingModels(
  serverType: EmbeddingServerType,
  address: string,
  port: number
): Promise<EmbeddingModelInfo[]> {
  const response = await fetch(`${API_BASE_URL}/settings/embedding/models`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ server_type: serverType, address, port }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(error.detail || `Failed to fetch embedding models: ${response.statusText}`);
  }
  const data = await response.json();
  return data.models;
}

export async function reinitializeEmbeddingService(): Promise<{ success: boolean; message: string }> {
  const response = await fetch(`${API_BASE_URL}/settings/embedding/reinitialize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Failed to reinitialize embedding service: ${response.statusText}`);
  }
  return response.json();
}
