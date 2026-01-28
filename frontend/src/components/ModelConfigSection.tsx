import { type AgentModelConfig, type ModelInfo, type ServerType } from "../services/api";

const SERVER_TYPES: { value: ServerType; label: string; defaultPort: number }[] = [
  { value: "lm_studio", label: "LM Studio", defaultPort: 1234 },
  { value: "ollama", label: "Ollama", defaultPort: 11434 },
  { value: "vllm", label: "vLLM", defaultPort: 8000 },
];

function parseEndpoint(baseUrl: string): { address: string; port: number } {
  if (baseUrl === "inherit" || !baseUrl) {
    return { address: "localhost", port: 1234 };
  }
  try {
    const url = new URL(baseUrl);
    return { address: url.hostname, port: parseInt(url.port) || 80 };
  } catch {
    return { address: "localhost", port: 1234 };
  }
}

function buildBaseUrl(address: string, port: number): string {
  return `http://${address}:${port}`;
}

interface ModelConfigSectionProps {
  agentId: string;
  model: AgentModelConfig;
  workspaceEndpoint: { baseUrl: string; model: string; serverType: string };
  customModels: ModelInfo[];
  testResult?: { success: boolean; message: string };
  isTesting: boolean;
  saving: boolean;
  onSave: (config: AgentModelConfig) => void;
  onTest: (serverType: string, address: string, port: number) => void;
  compact?: boolean;
}

export default function ModelConfigSection({
  agentId,
  model,
  workspaceEndpoint,
  customModels,
  testResult,
  isTesting,
  saving,
  onSave,
  onTest,
  compact = false,
}: ModelConfigSectionProps) {
  const useInherit = model.server_type === "inherit";
  const parsed = parseEndpoint(model.base_url);

  const toggleInherit = (inherit: boolean) => {
    const newConfig: AgentModelConfig = inherit
      ? { ...model, server_type: "inherit", base_url: "inherit", model: "inherit" }
      : {
          ...model,
          server_type: workspaceEndpoint.serverType,
          base_url: workspaceEndpoint.baseUrl,
          model: workspaceEndpoint.model,
        };
    onSave(newConfig);
  };

  const updateField = (field: keyof AgentModelConfig, value: string | number | string[]) => {
    const newConfig = { ...model, [field]: value };
    if (field === "server_type") {
      const serverInfo = SERVER_TYPES.find((s) => s.value === value);
      if (serverInfo) {
        const currentParsed = parseEndpoint(model.base_url);
        newConfig.base_url = buildBaseUrl(currentParsed.address, serverInfo.defaultPort);
      }
    }
    onSave(newConfig);
  };

  const updateEndpoint = (address: string, port: number) => {
    onSave({ ...model, base_url: buildBaseUrl(address, port) });
  };

  return (
    <div className="config-section model-config-section">
      <div className="config-section-title">LLM Endpoint Configuration</div>
      <div className="prompt-info">
        Choose to use the workspace default LLM endpoint or configure a dedicated endpoint for this agent.
      </div>

      <div className="endpoint-toggle" role="radiogroup" aria-label="Endpoint configuration mode">
        <button
          className={`toggle-btn ${useInherit ? "active" : ""}`}
          onClick={() => toggleInherit(true)}
          disabled={saving}
          role="radio"
          aria-checked={useInherit}
        >
          📡 Use Workspace Default
        </button>
        <button
          className={`toggle-btn ${!useInherit ? "active" : ""}`}
          onClick={() => toggleInherit(false)}
          disabled={saving}
          role="radio"
          aria-checked={!useInherit}
        >
          ⚙️ Custom Endpoint
        </button>
      </div>

      {useInherit ? (
        <div className="inherit-info">
          <div className="inherit-label">Using workspace default:</div>
          <div className="inherit-details">
            <span className="detail-item">
              <strong>Endpoint:</strong> {workspaceEndpoint.baseUrl}
            </span>
            <span className="detail-item">
              <strong>Model:</strong> {workspaceEndpoint.model || "(not set)"}
            </span>
          </div>
        </div>
      ) : (
        <div className="custom-endpoint-config">
          <div className="endpoint-row">
            <div className="endpoint-field">
              <label htmlFor={`${agentId}-server-type`}>Server Type</label>
              <select
                id={`${agentId}-server-type`}
                value={model.server_type}
                onChange={(e) => updateField("server_type", e.target.value)}
                disabled={saving}
                aria-label="Select LLM server type"
              >
                {SERVER_TYPES.map((st) => (
                  <option key={st.value} value={st.value}>
                    {st.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="endpoint-field address-field">
              <label htmlFor={`${agentId}-address`}>Address</label>
              <input
                type="text"
                id={`${agentId}-address`}
                value={parsed.address}
                onChange={(e) => updateEndpoint(e.target.value, parsed.port)}
                disabled={saving}
                placeholder="localhost"
                aria-label="Server address"
              />
            </div>

            <div className="endpoint-field port-field">
              <label htmlFor={`${agentId}-port`}>Port</label>
              <input
                type="number"
                id={`${agentId}-port`}
                className="port-input"
                value={parsed.port}
                onChange={(e) => updateEndpoint(parsed.address, parseInt(e.target.value) || 1234)}
                disabled={saving}
                aria-label="Server port"
              />
            </div>

            <div className="endpoint-field test-field">
              <label>&nbsp;</label>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => onTest(model.server_type, parsed.address, parsed.port)}
                disabled={saving || isTesting}
                aria-label="Test connection and fetch models"
              >
                {isTesting ? "Testing..." : "🔌 Test & Fetch"}
              </button>
            </div>
          </div>

          {testResult && (
            <div className={`test-result ${testResult.success ? "success" : "error"}`}>
              {testResult.success ? "✓" : "✗"} {testResult.message}
            </div>
          )}

          <div className="endpoint-row">
            <div className="endpoint-field model-field">
              <label htmlFor={`${agentId}-model`}>Model</label>
              {customModels.length > 0 ? (
                <select
                  id={`${agentId}-model`}
                  value={model.model}
                  onChange={(e) => updateField("model", e.target.value)}
                  disabled={saving}
                  aria-label="Select model"
                >
                  <option value="">-- Select Model --</option>
                  {customModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.id}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  id={`${agentId}-model`}
                  value={model.model === "inherit" ? "" : model.model}
                  onChange={(e) => updateField("model", e.target.value)}
                  disabled={saving}
                  placeholder="Enter model name or test endpoint to fetch"
                  aria-label="Model name"
                />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="config-section-title param-title">Model Parameters</div>
      <div className="prompt-info param-description">
        Fine-tune how the LLM generates responses for this agent.
      </div>
      <div className="config-grid params-grid">
        <div className="config-item editable with-description">
          <label htmlFor={`${agentId}-temp`}>Temperature</label>
          <input
            type="number"
            id={`${agentId}-temp`}
            className="param-number"
            step="0.1"
            min="0"
            max="2"
            value={model.temperature}
            onChange={(e) => updateField("temperature", parseFloat(e.target.value) || 0.7)}
            disabled={saving}
            aria-label="Temperature"
          />
          {!compact && (
            <span className="param-hint">Controls randomness. Lower = more focused and deterministic. Higher = more creative and varied.</span>
          )}
        </div>
        <div className="config-item editable with-description">
          <label htmlFor={`${agentId}-max-tokens`}>Max Tokens</label>
          <input
            type="number"
            id={`${agentId}-max-tokens`}
            className="param-number-wide"
            min="1"
            max="128000"
            value={model.max_tokens}
            onChange={(e) => updateField("max_tokens", parseInt(e.target.value) || 2048)}
            disabled={saving}
            aria-label="Max tokens"
          />
          {!compact && (
            <span className="param-hint">Maximum length of the response. 1 token ≈ 4 characters. Higher values allow longer outputs.</span>
          )}
        </div>
        {!compact && (
          <>
            <div className="config-item editable with-description">
              <label htmlFor={`${agentId}-top-p`}>Top P</label>
              <input
                type="number"
                id={`${agentId}-top-p`}
                className="param-number"
                step="0.05"
                min="0"
                max="1"
                value={model.top_p}
                onChange={(e) => updateField("top_p", parseFloat(e.target.value) || 0.9)}
                disabled={saving}
                aria-label="Top P"
              />
              <span className="param-hint">Nucleus sampling. Only considers tokens within the top P probability mass. Lower = more focused.</span>
            </div>
            <div className="config-item editable with-description">
              <label htmlFor={`${agentId}-freq-penalty`}>Freq Penalty</label>
              <input
                type="number"
                id={`${agentId}-freq-penalty`}
                className="param-number"
                step="0.1"
                min="0"
                max="2"
                value={model.frequency_penalty}
                onChange={(e) => updateField("frequency_penalty", parseFloat(e.target.value) || 0)}
                disabled={saving}
                aria-label="Frequency penalty"
              />
              <span className="param-hint">Penalizes repeated tokens. Higher values reduce repetition and encourage diverse vocabulary.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
