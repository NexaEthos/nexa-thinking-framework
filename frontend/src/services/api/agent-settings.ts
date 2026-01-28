import {
  PMGreetingResponse,
  AgentSettings,
  PMSettings,
  SpecialistSettings,
  AgentModelConfig,
  PMPromptsConfig,
  SpecialistPromptsConfig,
  SpecialistKeywordsConfig,
  ResearchSettingsResponse,
  ResearchOrchestratorPrompts,
  ResearchAgentPrompts,
} from "./types";
import { API_URL as API_BASE_URL } from "./config";

export async function getPMGreeting(): Promise<PMGreetingResponse> {
  const response = await fetch(`${API_BASE_URL}/settings/agents/pm/greeting`);
  if (!response.ok) {
    throw new Error(`Failed to get PM greeting: ${response.statusText}`);
  }
  return response.json();
}

export async function getAgentSettings(): Promise<AgentSettings> {
  const response = await fetch(`${API_BASE_URL}/settings/agents`);
  if (!response.ok) {
    throw new Error(`Failed to get agent settings: ${response.statusText}`);
  }
  return response.json();
}

export async function getPMSettings(): Promise<PMSettings> {
  const response = await fetch(`${API_BASE_URL}/settings/agents/pm`);
  if (!response.ok) {
    throw new Error(`Failed to get PM settings: ${response.statusText}`);
  }
  return response.json();
}

export async function getSpecialistSettings(agentId: string): Promise<SpecialistSettings> {
  const response = await fetch(`${API_BASE_URL}/settings/agents/specialists/${agentId}`);
  if (!response.ok) {
    throw new Error(`Failed to get specialist settings: ${response.statusText}`);
  }
  return response.json();
}

export async function getAllSpecialists(): Promise<Record<string, SpecialistSettings>> {
  const response = await fetch(`${API_BASE_URL}/settings/agents/specialists`);
  if (!response.ok) {
    throw new Error(`Failed to get specialists: ${response.statusText}`);
  }
  return response.json();
}

export async function reloadAgentSettings(): Promise<{ success: boolean; version: string }> {
  const response = await fetch(`${API_BASE_URL}/settings/agents/reload`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to reload agent settings: ${response.statusText}`);
  }
  return response.json();
}

export async function updatePMModelConfig(config: AgentModelConfig): Promise<AgentModelConfig> {
  const response = await fetch(`${API_BASE_URL}/settings/agents/pm/model`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    throw new Error(`Failed to update PM model config: ${response.statusText}`);
  }
  return response.json();
}

export async function updateSpecialistModelConfig(
  agentId: string,
  config: AgentModelConfig
): Promise<AgentModelConfig> {
  const response = await fetch(`${API_BASE_URL}/settings/agents/specialists/${agentId}/model`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    throw new Error(`Failed to update specialist model config: ${response.statusText}`);
  }
  return response.json();
}

export async function updatePMPrompts(prompts: PMPromptsConfig): Promise<PMPromptsConfig> {
  const response = await fetch(`${API_BASE_URL}/settings/agents/pm/prompts`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prompts),
  });
  if (!response.ok) {
    throw new Error(`Failed to update PM prompts: ${response.statusText}`);
  }
  return response.json();
}

export async function updateSpecialistPrompts(
  agentId: string,
  prompts: SpecialistPromptsConfig
): Promise<SpecialistPromptsConfig> {
  const response = await fetch(`${API_BASE_URL}/settings/agents/specialists/${agentId}/prompts`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prompts),
  });
  if (!response.ok) {
    throw new Error(`Failed to update specialist prompts: ${response.statusText}`);
  }
  return response.json();
}

export async function updateSpecialistKeywords(
  agentId: string,
  keywords: SpecialistKeywordsConfig
): Promise<SpecialistKeywordsConfig> {
  const response = await fetch(`${API_BASE_URL}/settings/agents/specialists/${agentId}/keywords`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(keywords),
  });
  if (!response.ok) {
    throw new Error(`Failed to update specialist keywords: ${response.statusText}`);
  }
  return response.json();
}

export async function getResearchSettings(): Promise<ResearchSettingsResponse> {
  const response = await fetch(`${API_BASE_URL}/settings/agents/research`);
  if (!response.ok) {
    throw new Error(`Failed to get research settings: ${response.statusText}`);
  }
  return response.json();
}

export async function updateResearchOrchestratorPrompts(
  prompts: ResearchOrchestratorPrompts
): Promise<ResearchOrchestratorPrompts> {
  const response = await fetch(
    `${API_BASE_URL}/settings/agents/research/orchestrator/prompts`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prompts),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to update research orchestrator prompts: ${response.statusText}`);
  }
  return response.json();
}

export async function updateResearchOrchestratorModel(
  config: AgentModelConfig
): Promise<AgentModelConfig> {
  const response = await fetch(
    `${API_BASE_URL}/settings/agents/research/orchestrator/model`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to update research orchestrator model: ${response.statusText}`);
  }
  return response.json();
}

export async function updateResearchAgentPrompts(
  agentId: string,
  prompts: ResearchAgentPrompts
): Promise<ResearchAgentPrompts> {
  const response = await fetch(
    `${API_BASE_URL}/settings/agents/research/${agentId}/prompts`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prompts),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to update research agent prompts: ${response.statusText}`);
  }
  return response.json();
}

export async function updateResearchAgentModel(
  agentId: string,
  config: AgentModelConfig
): Promise<AgentModelConfig> {
  const response = await fetch(
    `${API_BASE_URL}/settings/agents/research/${agentId}/model`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to update research agent model: ${response.statusText}`);
  }
  return response.json();
}
