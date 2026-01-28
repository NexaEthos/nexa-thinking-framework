import {
  PMChatResponse,
  PMConversation,
  SpecialistInfo,
  SpecialistResponse,
  AgentsInfo,
} from "./types";
import { API_URL as API_BASE_URL } from "./config";

export async function sendPMChat(message: string): Promise<PMChatResponse> {
  const response = await fetch(`${API_BASE_URL}/agents/pm/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!response.ok) {
    throw new Error(`Failed to send PM chat: ${response.statusText}`);
  }
  return response.json();
}

export async function getPMConversation(): Promise<PMConversation> {
  const response = await fetch(`${API_BASE_URL}/agents/pm/conversation`);
  if (!response.ok) {
    throw new Error(`Failed to get PM conversation: ${response.statusText}`);
  }
  return response.json();
}

export async function resetPM(): Promise<{ status: string; message: string }> {
  const response = await fetch(`${API_BASE_URL}/agents/pm/reset`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to reset PM: ${response.statusText}`);
  }
  return response.json();
}

export async function clearPMConversation(): Promise<{ status: string; message: string }> {
  const response = await fetch(`${API_BASE_URL}/agents/pm/clear-conversation`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to clear PM conversation: ${response.statusText}`);
  }
  return response.json();
}

export async function listSpecialists(): Promise<{ specialists: Record<string, SpecialistInfo> }> {
  const response = await fetch(`${API_BASE_URL}/agents/specialists`);
  if (!response.ok) {
    throw new Error(`Failed to list specialists: ${response.statusText}`);
  }
  return response.json();
}

export async function getSpecialist(agentId: string): Promise<SpecialistInfo & { id: string; trigger_keywords: string[] }> {
  const response = await fetch(`${API_BASE_URL}/agents/specialists/${agentId}`);
  if (!response.ok) {
    throw new Error(`Failed to get specialist: ${response.statusText}`);
  }
  return response.json();
}

export async function analyzeWithSpecialist(agentId: string, context: string): Promise<SpecialistResponse> {
  const response = await fetch(`${API_BASE_URL}/agents/specialists/${agentId}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context }),
  });
  if (!response.ok) {
    throw new Error(`Failed to analyze with specialist: ${response.statusText}`);
  }
  return response.json();
}

export async function getAgentsInfo(): Promise<AgentsInfo> {
  const response = await fetch(`${API_BASE_URL}/agents/info`);
  if (!response.ok) {
    throw new Error(`Failed to get agents info: ${response.statusText}`);
  }
  return response.json();
}
