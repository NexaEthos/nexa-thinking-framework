import { API_BASE_URL as API_BASE } from "./config";

export interface PromptSection {
  label: string;
  content: string;
  token_estimate: number;
  source: string;
}

export interface PromptInfo {
  workspace: string;
  system_prompt: PromptSection;
  context_sections: PromptSection[];
  user_message: PromptSection | null;
  total_token_estimate: number;
  rag_enabled: boolean;
  web_search_enabled: boolean;
  active_features: string[];
}

export async function getChainOfThoughtPromptInfo(): Promise<PromptInfo> {
  const response = await fetch(`${API_BASE}/api/prompts/chain-of-thought`);
  if (!response.ok) {
    throw new Error(`Failed to fetch CoT prompt info: ${response.status}`);
  }
  return response.json();
}

export async function getProjectManagerPromptInfo(): Promise<PromptInfo> {
  const response = await fetch(`${API_BASE}/api/prompts/project-manager`);
  if (!response.ok) {
    throw new Error(`Failed to fetch PM prompt info: ${response.status}`);
  }
  return response.json();
}

export async function getResearchLabPromptInfo(): Promise<PromptInfo> {
  const response = await fetch(`${API_BASE}/api/prompts/research-lab`);
  if (!response.ok) {
    throw new Error(`Failed to fetch Research Lab prompt info: ${response.status}`);
  }
  return response.json();
}
