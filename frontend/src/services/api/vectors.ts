import { VectorStatus, CollectionInfo, VectorConnectionTestResult, VectorInitializeResult } from "./types";
import { API_URL as API_BASE } from "./config";

export const getVectorStatus = async (): Promise<VectorStatus> => {
  const response = await fetch(`${API_BASE}/vectors/status`);
  if (!response.ok) throw new Error("Failed to get vector status");
  return response.json();
};

export const testVectorConnection = async (): Promise<VectorConnectionTestResult> => {
  const response = await fetch(`${API_BASE}/vectors/test-connection`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Connection test failed");
  return response.json();
};

export const initializeVectors = async (): Promise<VectorInitializeResult> => {
  const response = await fetch(`${API_BASE}/vectors/initialize`, {
    method: "POST",
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Initialize failed" }));
    throw new Error(error.detail || "Initialize failed");
  }
  return response.json();
};

export const getCollections = async (): Promise<CollectionInfo[]> => {
  const response = await fetch(`${API_BASE}/vectors/collections`);
  if (!response.ok) {
    if (response.status === 503) {
      return [];
    }
    throw new Error("Failed to get collections");
  }
  return response.json();
};

export const clearCollection = async (name: string): Promise<void> => {
  const response = await fetch(`${API_BASE}/vectors/collections/${name}/clear`, {
    method: "POST",
  });
  if (!response.ok) throw new Error(`Failed to clear collection ${name}`);
};

export const searchVectors = async (
  query: string,
  collection: string = "research_documents",
  limit: number = 5
): Promise<{ id: string; content: string; score: number; metadata: Record<string, unknown> }[]> => {
  const response = await fetch(`${API_BASE}/vectors/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, collection, limit }),
  });
  if (!response.ok) throw new Error("Vector search failed");
  return response.json();
};
