import { ResearcherChatResponse, ResearcherAgentInfo } from "./types";
import { API_URL as API_BASE_URL } from "./config";

export async function getResearcherGreeting(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/researcher/greeting`);
  if (!response.ok) {
    throw new Error(`Failed to get researcher greeting: ${response.statusText}`);
  }
  const data = await response.json();
  return data.greeting;
}

export async function sendResearcherChat(
  message: string,
  researchData: string = ""
): Promise<ResearcherChatResponse> {
  const response = await fetch(`${API_BASE_URL}/researcher/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      research_data: researchData,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to send researcher chat: ${response.statusText}`);
  }
  return response.json();
}

export async function getResearchData(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/researcher/data`);
  if (!response.ok) {
    throw new Error(`Failed to get research data: ${response.statusText}`);
  }
  const data = await response.json();
  return data.data;
}

export async function setResearchData(data: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/researcher/data`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data }),
  });
  if (!response.ok) {
    throw new Error(`Failed to set research data: ${response.statusText}`);
  }
}

export async function resetResearcher(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/researcher/reset`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to reset researcher: ${response.statusText}`);
  }
}

export async function getResearchAgents(): Promise<Record<string, ResearcherAgentInfo>> {
  const response = await fetch(`${API_BASE_URL}/researcher/agents`);
  if (!response.ok) {
    throw new Error(`Failed to get research agents: ${response.statusText}`);
  }
  const data = await response.json();
  return data.agents;
}

export interface RAGStatus {
  rag_enabled: boolean;
  qdrant_configured: boolean;
  collection_size: number;
  connected: boolean;
}

export async function getRAGStatus(): Promise<RAGStatus> {
  const response = await fetch(`${API_BASE_URL}/researcher/rag/status`);
  if (!response.ok) {
    throw new Error(`Failed to get RAG status: ${response.statusText}`);
  }
  return response.json();
}

export async function toggleRAG(enabled: boolean): Promise<{ success: boolean; rag_enabled: boolean }> {
  const response = await fetch(`${API_BASE_URL}/researcher/rag/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!response.ok) {
    throw new Error(`Failed to toggle RAG: ${response.statusText}`);
  }
  return response.json();
}
