import { CanvasState, CanvasSummary, CanvasSection } from "./types";
import { API_URL as API_BASE_URL } from "./config";

export async function getCanvas(): Promise<CanvasState> {
  const response = await fetch(`${API_BASE_URL}/canvas`);
  if (!response.ok) {
    throw new Error(`Failed to get canvas: ${response.statusText}`);
  }
  return response.json();
}

export async function getCanvasSummary(): Promise<CanvasSummary> {
  const response = await fetch(`${API_BASE_URL}/canvas/summary`);
  if (!response.ok) {
    throw new Error(`Failed to get canvas summary: ${response.statusText}`);
  }
  return response.json();
}

export async function resetCanvas(): Promise<{ status: string; message: string }> {
  const response = await fetch(`${API_BASE_URL}/canvas/reset`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to reset canvas: ${response.statusText}`);
  }
  return response.json();
}

export async function getCanvasSection(sectionId: string): Promise<CanvasSection & { version: number }> {
  const response = await fetch(`${API_BASE_URL}/canvas/sections/${sectionId}`);
  if (!response.ok) {
    throw new Error(`Failed to get section: ${response.statusText}`);
  }
  return response.json();
}

export async function updateCanvasSection(
  sectionId: string,
  title: string,
  content: string,
  agentId?: string
): Promise<{ status: string; section_id: string }> {
  const response = await fetch(`${API_BASE_URL}/canvas/sections/${sectionId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, content, agent_id: agentId }),
  });
  if (!response.ok) {
    throw new Error(`Failed to update section: ${response.statusText}`);
  }
  return response.json();
}

export async function clearCanvasSection(sectionId: string): Promise<{ status: string; section_id: string }> {
  const response = await fetch(`${API_BASE_URL}/canvas/sections/${sectionId}/clear`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to clear section: ${response.statusText}`);
  }
  return response.json();
}

export async function rollbackCanvasSection(sectionId: string): Promise<{ status: string; section_id: string }> {
  const response = await fetch(`${API_BASE_URL}/canvas/sections/${sectionId}/rollback`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to rollback section: ${response.statusText}`);
  }
  return response.json();
}

export async function getCanvasPrompt(): Promise<{ prompt: string }> {
  const response = await fetch(`${API_BASE_URL}/canvas/export-prompt`);
  if (!response.ok) {
    throw new Error(`Failed to get canvas prompt: ${response.statusText}`);
  }
  return response.json();
}
