import { API_BASE_URL as API_BASE } from "./config";

export interface ComparisonConfig {
  label: string;
  temperature: number;
  use_thinking: boolean;
  web_search_enabled: boolean;
  rag_enabled: boolean;
}

export interface WebSource {
  title: string;
  url: string;
  snippet: string;
}

export interface ComparisonResult {
  label: string;
  response: string;
  tokens_used: number;
  latency_ms: number;
  steps_count: number;
  web_sources: WebSource[];
  error: string | null;
}

export interface ComparisonResponse {
  query: string;
  result_a: ComparisonResult;
  result_b: ComparisonResult;
  timestamp: string;
}

export async function runComparison(
  query: string,
  configA: ComparisonConfig,
  configB: ComparisonConfig
): Promise<ComparisonResponse> {
  const response = await fetch(`${API_BASE}/api/chain-of-thought/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      config_a: configA,
      config_b: configB,
    }),
  });

  if (!response.ok) {
    throw new Error(`Comparison failed: ${response.status}`);
  }

  return response.json();
}
