import { TelemetrySessionSummary, TelemetryCallMetrics } from "./types";
import { API_URL as API_BASE_URL } from "./config";

export async function getTelemetrySession(): Promise<TelemetrySessionSummary> {
  const response = await fetch(`${API_BASE_URL}/telemetry/session`);
  if (!response.ok) {
    throw new Error(`Failed to get telemetry session: ${response.statusText}`);
  }
  return response.json();
}

export async function resetTelemetrySession(): Promise<{ status: string; message: string }> {
  const response = await fetch(`${API_BASE_URL}/telemetry/session/reset`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to reset telemetry session: ${response.statusText}`);
  }
  return response.json();
}

export async function getTelemetryAgentStats(agentId: string): Promise<TelemetrySessionSummary["agents"][string]> {
  const response = await fetch(`${API_BASE_URL}/telemetry/agents/${agentId}`);
  if (!response.ok) {
    throw new Error(`Failed to get agent telemetry: ${response.statusText}`);
  }
  return response.json();
}

export async function getTelemetryCallLog(): Promise<TelemetryCallMetrics[]> {
  const response = await fetch(`${API_BASE_URL}/telemetry/calls`);
  if (!response.ok) {
    throw new Error(`Failed to get call log: ${response.statusText}`);
  }
  return response.json();
}

export async function exportTelemetrySession(): Promise<Record<string, unknown>> {
  const response = await fetch(`${API_BASE_URL}/telemetry/export`);
  if (!response.ok) {
    throw new Error(`Failed to export telemetry: ${response.statusText}`);
  }
  return response.json();
}

export async function importTelemetrySession(data: Record<string, unknown>): Promise<{ status: string; message: string }> {
  const response = await fetch(`${API_BASE_URL}/telemetry/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error(`Failed to import telemetry: ${response.statusText}`);
  }
  return response.json();
}
