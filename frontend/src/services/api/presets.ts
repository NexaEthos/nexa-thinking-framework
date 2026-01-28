import { API_BASE_URL as API_BASE } from "./config";

export interface PresetSettings {
  temperature: number;
  use_thinking: boolean;
  web_search_enabled: boolean;
  rag_enabled: boolean;
  max_tokens: number;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  workspace: "chain_of_thought" | "project_manager" | "research_lab";
  settings: PresetSettings;
  is_default: boolean;
  icon: string;
}

export async function getAllPresets(): Promise<Preset[]> {
  const response = await fetch(`${API_BASE}/api/presets`);
  if (!response.ok) throw new Error("Failed to fetch presets");
  return response.json();
}

export async function getPresetsByWorkspace(
  workspace: "chain_of_thought" | "project_manager" | "research_lab"
): Promise<Preset[]> {
  const response = await fetch(`${API_BASE}/api/presets/workspace/${workspace}`);
  if (!response.ok) throw new Error("Failed to fetch presets");
  return response.json();
}

export async function getPreset(id: string): Promise<Preset> {
  const response = await fetch(`${API_BASE}/api/presets/${id}`);
  if (!response.ok) throw new Error("Failed to fetch preset");
  return response.json();
}

export async function createPreset(preset: Omit<Preset, "is_default">): Promise<Preset> {
  const response = await fetch(`${API_BASE}/api/presets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preset),
  });
  if (!response.ok) throw new Error("Failed to create preset");
  return response.json();
}

export async function deletePreset(id: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/presets/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error("Failed to delete preset");
}
