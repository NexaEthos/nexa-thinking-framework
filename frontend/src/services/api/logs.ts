import { LogsResponse, LogStats, LogFilterParams } from "./types";
import { API_URL as API_BASE_URL } from "./config";

export async function getLogs(params: LogFilterParams = {}): Promise<LogsResponse> {
  const searchParams = new URLSearchParams();
  if (params.levels) searchParams.set("levels", params.levels);
  if (params.logger) searchParams.set("logger", params.logger);
  if (params.search) searchParams.set("search", params.search);
  if (params.start_time) searchParams.set("start_time", params.start_time);
  if (params.end_time) searchParams.set("end_time", params.end_time);
  if (params.limit) searchParams.set("limit", String(params.limit));
  if (params.offset) searchParams.set("offset", String(params.offset));

  const query = searchParams.toString();
  const url = query ? `${API_BASE_URL}/logs?${query}` : `${API_BASE_URL}/logs`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch logs: ${response.statusText}`);
  }
  return response.json();
}

export async function getLogStats(): Promise<LogStats> {
  const response = await fetch(`${API_BASE_URL}/logs/stats`);
  if (!response.ok) {
    throw new Error(`Failed to fetch log stats: ${response.statusText}`);
  }
  return response.json();
}

export async function clearLogs(): Promise<{ message: string }> {
  const response = await fetch(`${API_BASE_URL}/logs`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Failed to clear logs: ${response.statusText}`);
  }
  return response.json();
}

export async function exportLogs(format: "json" | "text" = "json"): Promise<Blob> {
  const response = await fetch(`${API_BASE_URL}/logs/export?format=${format}`);
  if (!response.ok) {
    throw new Error(`Failed to export logs: ${response.statusText}`);
  }
  return response.blob();
}

export async function getLogLevels(): Promise<{ levels: string[] }> {
  const response = await fetch(`${API_BASE_URL}/logs/levels`);
  if (!response.ok) {
    throw new Error(`Failed to fetch log levels: ${response.statusText}`);
  }
  return response.json();
}
