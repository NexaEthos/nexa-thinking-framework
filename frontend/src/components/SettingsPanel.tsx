import { useState, useEffect, useCallback, memo } from "react";
import {
  getLLMSettings,
  updateLLMSettings,
  fetchModels,
  testLLMConnection,
  getAppSettings,
  updateAppSettings,
  resetPromptSettings,
  getCollections,
  clearCollection,
  testVectorConnection,
  initializeVectors,
  testEmbeddingConnection,
  fetchEmbeddingModels,
  type LLMSettings,
  type ModelInfo,
  type ServerType,
  type AppSettings,
  type CollectionInfo,
  type VectorConnectionTestResult,
  type EmbeddingServerType,
  type EmbeddingModelInfo,
  type EmbeddingTestResult,
} from "../services/api";
import AgentsSettingsTab from "./AgentsSettingsTab";
import "./SettingsPanel.css";

type SettingsTab = "llm" | "search" | "behavior" | "prompts" | "agents" | "vectors";

const SERVER_TYPES: { value: ServerType; label: string; defaultPort: number }[] = [
  { value: "lm_studio", label: "LM Studio", defaultPort: 1234 },
  { value: "ollama", label: "Ollama", defaultPort: 11434 },
  { value: "vllm", label: "vLLM", defaultPort: 8000 },
];

const EMBEDDING_SERVER_TYPES: { value: EmbeddingServerType; label: string; defaultPort: number }[] = [
  { value: "lm_studio", label: "LM Studio", defaultPort: 1234 },
  { value: "ollama", label: "Ollama", defaultPort: 11434 },
  { value: "vllm", label: "vLLM", defaultPort: 8000 },
  { value: "openai", label: "OpenAI API", defaultPort: 443 },
];

const EMPTY_APP_SETTINGS: AppSettings = {
  web_search: {
    enabled: true,
    max_results: 5,
    max_results_for_questions: 3,
    region: "wt-wt",
    research_triggers: [],
  },
  classifier: {
    moderate_word_threshold: 4,
    complex_indicators: [],
  },
  chain_of_thought: {
    max_steps: 10,
    enable_verification: true,
    stream_tokens: true,
  },
  prompts: {
    canvas_agent_system: "",
    simple_assistant: "",
    question_answer: "",
    final_answer: "",
    cot_quick_prompt: "",
    quick_prompt: "",
  },
  embedding: {
    provider: "llm",
    server_type: "lm_studio",
    address: "localhost",
    port: 1234,
    model: "",
    openai_api_key: null,
    vector_size: 384,
  },
  qdrant: {
    enabled: false,
    use_memory_search: true,
    deployment: "local",
    url: "http://localhost:6333",
    api_key: null,
    collection_research: "research_documents",
    collection_memory: "conversation_memory",
    collection_canvas: "canvas_content",
  },
};

function SettingsPanel() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("llm");
  const [settings, setSettings] = useState<LLMSettings>({
    server_type: "lm_studio",
    address: "localhost",
    port: 1234,
    model: "",
    temperature: 0.7,
    max_tokens: 4096,
    timeout: 300,
  });
  const [appSettings, setAppSettings] = useState<AppSettings>(EMPTY_APP_SETTINGS);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [collections, setCollections] = useState<CollectionInfo[]>([]);
  const [loadingCollections, setLoadingCollections] = useState(false);
  const [testingVector, setTestingVector] = useState(false);
  const [vectorTestResult, setVectorTestResult] = useState<VectorConnectionTestResult | null>(null);
  const [initializingVector, setInitializingVector] = useState(false);
  const [embeddingModels, setEmbeddingModels] = useState<EmbeddingModelInfo[]>([]);
  const [fetchingEmbeddingModels, setFetchingEmbeddingModels] = useState(false);
  const [testingEmbedding, setTestingEmbedding] = useState(false);
  const [embeddingTestResult, setEmbeddingTestResult] = useState<EmbeddingTestResult | null>(null);

  const loadCollections = useCallback(async () => {
    setLoadingCollections(true);
    try {
      const cols = await getCollections();
      setCollections(cols);
    } catch {
      setCollections([]);
    } finally {
      setLoadingCollections(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [llmSettings, appSettingsLoaded] = await Promise.all([
        getLLMSettings(),
        getAppSettings(),
      ]);
      setSettings(llmSettings);
      setAppSettings(appSettingsLoaded);
      if (llmSettings.address && llmSettings.port) {
        await loadModels(llmSettings.server_type, llmSettings.address, llmSettings.port);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    const handler = (e: Event) => {
      const ev = e as CustomEvent<{ tab: SettingsTab }>;
      if (ev.detail?.tab) setActiveTab(ev.detail.tab);
    };
    window.addEventListener("nexa-tour-settings-tab", handler);
    return () => window.removeEventListener("nexa-tour-settings-tab", handler);
  }, []);

  async function loadModels(serverType: ServerType, address: string, port: number) {
    setFetchingModels(true);
    setError(null);
    try {
      const fetched = await fetchModels(serverType, address, port);
      setModels(fetched);
    } catch (e) {
      setModels([]);
      setError(e instanceof Error ? e.message : "Failed to fetch models");
    } finally {
      setFetchingModels(false);
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testLLMConnection(settings.server_type, settings.address, settings.port);
      setTestResult(result);
      if (result.success) {
        await loadModels(settings.server_type, settings.address, settings.port);
      }
    } catch (e) {
      setTestResult({
        success: false,
        message: e instanceof Error ? e.message : "Connection failed",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setLoading(true);
    setSaved(false);
    try {
      await Promise.all([updateLLMSettings(settings), updateAppSettings(appSettings)]);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setLoading(false);
    }
  }

  function handleServerTypeChange(serverType: ServerType) {
    const serverConfig = SERVER_TYPES.find((s) => s.value === serverType);
    setSettings((prev) => ({
      ...prev,
      server_type: serverType,
      port: serverConfig?.defaultPort || prev.port,
      model: "",
    }));
    setModels([]);
    setTestResult(null);
  }

  function handleAddressChange(address: string) {
    const sanitized = address
      .replace(/^https?:\/\//, "")
      .replace(/\/+$/, "")
      .replace(/:\d+$/, "");
    setSettings((prev) => ({ ...prev, address: sanitized }));
    setModels([]);
    setTestResult(null);
  }

  function handlePortChange(port: number) {
    setSettings((prev) => ({ ...prev, port }));
    setModels([]);
    setTestResult(null);
  }

  const renderLLMSettings = () => (
    <>
      <div className="settings-section">
        <label className="settings-label">Server Type</label>
        <div className="server-type-grid">
          {SERVER_TYPES.map((server) => (
            <button
              key={server.value}
              className={`server-type-btn ${settings.server_type === server.value ? "active" : ""}`}
              onClick={() => handleServerTypeChange(server.value)}
            >
              <span className="server-icon">
                {server.value === "lm_studio" && "🖥️"}
                {server.value === "ollama" && "🦙"}
                {server.value === "vllm" && "⚡"}
              </span>
              <span className="server-name">{server.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <label className="settings-label">Server Address</label>
        <div className="address-row">
          <input
            type="text"
            value={settings.address}
            onChange={(e) => handleAddressChange(e.target.value)}
            placeholder="localhost"
            className="input address-input"
          />
          <span className="address-separator">:</span>
          <input
            type="number"
            value={settings.port}
            onChange={(e) => handlePortChange(parseInt(e.target.value) || 0)}
            placeholder="Port"
            className="input port-input"
          />
          <button
            onClick={handleTestConnection}
            disabled={testing || !settings.address}
            className="btn btn-secondary"
          >
            {testing ? "Testing..." : "Test"}
          </button>
        </div>
        {testResult && (
          <div className={`test-result ${testResult.success ? "success" : "error"}`}>
            <span>{testResult.success ? "✅" : "❌"}</span>
            <span>{testResult.message}</span>
          </div>
        )}
      </div>

      <div className="settings-section">
        <label className="settings-label">
          Model
          {fetchingModels && <span className="loading-text"> (loading...)</span>}
        </label>
        <select
          value={settings.model}
          onChange={(e) => setSettings((prev) => ({ ...prev, model: e.target.value }))}
          className="input model-select"
          disabled={models.length === 0}
        >
          <option value="">
            {models.length === 0 ? "Connect to server to load models" : "Select a model..."}
          </option>
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name} ({model.owned_by})
            </option>
          ))}
        </select>
        {models.length > 0 && <div className="model-count">{models.length} model(s) available</div>}
      </div>

      <div className="settings-section">
        <label className="settings-label">Generation Parameters</label>
        <div className="params-grid">
          <div className="param-item">
            <label className="param-label">Temperature</label>
            <div className="param-input-row">
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={settings.temperature}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, temperature: parseFloat(e.target.value) }))
                }
                className="slider"
              />
              <input
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={settings.temperature}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, temperature: parseFloat(e.target.value) || 0 }))
                }
                className="input param-number"
              />
            </div>
            <span className="param-hint">
              Controls randomness (0 = deterministic, 2 = creative)
            </span>
          </div>
          <div className="param-item">
            <label className="param-label">Max Tokens</label>
            <input
              type="number"
              min="256"
              max="32768"
              step="256"
              value={settings.max_tokens}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, max_tokens: parseInt(e.target.value) || 4096 }))
              }
              className="input param-number-wide"
            />
            <span className="param-hint">Maximum response length</span>
          </div>
          <div className="param-item">
            <label className="param-label">Timeout (seconds)</label>
            <input
              type="number"
              min="30"
              max="600"
              step="30"
              value={settings.timeout}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, timeout: parseInt(e.target.value) || 300 }))
              }
              className="input param-number-narrow"
            />
            <span className="param-hint">Request timeout for LLM calls</span>
          </div>
        </div>
      </div>
    </>
  );

  const renderSearchSettings = () => (
    <>
      <div className="settings-section">
        <label className="settings-label">Web Search</label>
        <div className="toggle-row">
          <span>Enable web search for research</span>
          <button
            className={`toggle-btn ${appSettings.web_search.enabled ? "active" : ""}`}
            onClick={() =>
              setAppSettings((prev) => ({
                ...prev,
                web_search: { ...prev.web_search, enabled: !prev.web_search.enabled },
              }))
            }
          >
            {appSettings.web_search.enabled ? "ON" : "OFF"}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <label className="settings-label">Search Results</label>
        <div className="params-grid">
          <div className="param-item">
            <label className="param-label">Max Results (General)</label>
            <input
              type="number"
              min="1"
              max="20"
              value={appSettings.web_search.max_results}
              onChange={(e) =>
                setAppSettings((prev) => ({
                  ...prev,
                  web_search: { ...prev.web_search, max_results: parseInt(e.target.value) || 5 },
                }))
              }
              className="input"
            />
            <span className="param-hint">Results for canvas agent research</span>
          </div>
          <div className="param-item">
            <label className="param-label">Max Results (Questions)</label>
            <input
              type="number"
              min="1"
              max="10"
              value={appSettings.web_search.max_results_for_questions}
              onChange={(e) =>
                setAppSettings((prev) => ({
                  ...prev,
                  web_search: {
                    ...prev.web_search,
                    max_results_for_questions: parseInt(e.target.value) || 3,
                  },
                }))
              }
              className="input"
            />
            <span className="param-hint">Results for chain-of-thought questions</span>
          </div>
          <div className="param-item">
            <label className="param-label">Search Region</label>
            <select
              value={appSettings.web_search.region}
              onChange={(e) =>
                setAppSettings((prev) => ({
                  ...prev,
                  web_search: { ...prev.web_search, region: e.target.value },
                }))
              }
              className="input"
            >
              <option value="wt-wt">Worldwide</option>
              <option value="us-en">United States</option>
              <option value="uk-en">United Kingdom</option>
              <option value="de-de">Germany</option>
              <option value="fr-fr">France</option>
            </select>
            <span className="param-hint">Region for search results</span>
          </div>
        </div>
      </div>
    </>
  );

  const renderBehaviorSettings = () => (
    <>
      <div className="settings-section">
        <label className="settings-label">Prompt Classification</label>
        <div className="param-item">
          <label className="param-label">Moderate Word Threshold</label>
          <input
            type="number"
            min="1"
            max="20"
            value={appSettings.classifier.moderate_word_threshold}
            onChange={(e) =>
              setAppSettings((prev) => ({
                ...prev,
                classifier: {
                  ...prev.classifier,
                  moderate_word_threshold: parseInt(e.target.value) || 4,
                },
              }))
            }
            className="input"
          />
          <span className="param-hint">Prompts with fewer words use single-pass (faster)</span>
        </div>
      </div>

      <div className="settings-section">
        <label className="settings-label">Chain of Thought</label>
        <div className="params-grid">
          <div className="param-item">
            <label className="param-label">Max Steps</label>
            <input
              type="number"
              min="3"
              max="20"
              value={appSettings.chain_of_thought.max_steps}
              onChange={(e) =>
                setAppSettings((prev) => ({
                  ...prev,
                  chain_of_thought: {
                    ...prev.chain_of_thought,
                    max_steps: parseInt(e.target.value) || 10,
                  },
                }))
              }
              className="input"
            />
            <span className="param-hint">Maximum reasoning steps per request</span>
          </div>
        </div>
        <div className="toggle-row" style={{ marginTop: "1rem" }}>
          <span>Enable verification step</span>
          <button
            className={`toggle-btn ${appSettings.chain_of_thought.enable_verification ? "active" : ""}`}
            onClick={() =>
              setAppSettings((prev) => ({
                ...prev,
                chain_of_thought: {
                  ...prev.chain_of_thought,
                  enable_verification: !prev.chain_of_thought.enable_verification,
                },
              }))
            }
          >
            {appSettings.chain_of_thought.enable_verification ? "ON" : "OFF"}
          </button>
        </div>
        <div className="toggle-row">
          <span>Stream tokens in real-time</span>
          <button
            className={`toggle-btn ${appSettings.chain_of_thought.stream_tokens ? "active" : ""}`}
            onClick={() =>
              setAppSettings((prev) => ({
                ...prev,
                chain_of_thought: {
                  ...prev.chain_of_thought,
                  stream_tokens: !prev.chain_of_thought.stream_tokens,
                },
              }))
            }
          >
            {appSettings.chain_of_thought.stream_tokens ? "ON" : "OFF"}
          </button>
        </div>
      </div>
    </>
  );

  const [resettingPrompts, setResettingPrompts] = useState(false);

  const handleResetPrompts = async () => {
    setResettingPrompts(true);
    try {
      const updated = await resetPromptSettings();
      setAppSettings((prev) => ({ ...prev, prompts: updated.prompts }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset prompts");
    }
    setResettingPrompts(false);
  };

  const renderPromptsSettings = () => (
    <>
      <div className="settings-section">
        <div className="prompts-header">
          <label className="settings-label">Quick Prompts</label>
          <button
            className="btn btn-ghost btn-xs reset-prompts-btn"
            onClick={handleResetPrompts}
            disabled={resettingPrompts}
          >
            {resettingPrompts ? "Resetting..." : "🔄 Reset to Defaults"}
          </button>
        </div>
        <span className="param-hint">Pre-configured prompts to quickly start a session. Click ⚡ in each panel to use them.</span>
      </div>

      <div className="settings-divider">
        <span className="divider-icon">🔗</span>
        <span className="divider-text">Chain of Thoughts</span>
      </div>

      <div className="settings-section">
        <label className="settings-label">Quick Prompt</label>
        <span className="param-hint">
          Example prompt for Chain of Thoughts panel.
        </span>
        <textarea
          value={appSettings.prompts?.cot_quick_prompt || ""}
          onChange={(e) =>
            setAppSettings((prev) => ({
              ...prev,
              prompts: { ...prev.prompts, cot_quick_prompt: e.target.value },
            }))
          }
          className="prompt-textarea"
          rows={4}
        />
      </div>

      <div className="settings-divider">
        <span className="divider-icon">📋</span>
        <span className="divider-text">Project Manager</span>
      </div>

      <div className="settings-section">
        <label className="settings-label">Quick Prompt</label>
        <span className="param-hint">
          Example prompt for Project Manager panel.
        </span>
        <textarea
          value={appSettings.prompts?.quick_prompt || ""}
          onChange={(e) =>
            setAppSettings((prev) => ({
              ...prev,
              prompts: { ...prev.prompts, quick_prompt: e.target.value },
            }))
          }
          className="prompt-textarea"
          rows={4}
        />
      </div>
    </>
  );

  const handleClearCollection = async (name: string) => {
    if (!confirm(`Clear all vectors from collection "${name}"?`)) return;
    try {
      await clearCollection(name);
      await loadCollections();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to clear collection");
    }
  };

  async function loadEmbeddingModels(
    serverType: EmbeddingServerType,
    address: string,
    port: number
  ) {
    if (serverType === "openai") {
      setEmbeddingModels([
        { id: "text-embedding-3-small", name: "text-embedding-3-small", owned_by: "openai", is_embedding: true },
        { id: "text-embedding-3-large", name: "text-embedding-3-large", owned_by: "openai", is_embedding: true },
        { id: "text-embedding-ada-002", name: "text-embedding-ada-002", owned_by: "openai", is_embedding: true },
      ]);
      return;
    }
    setFetchingEmbeddingModels(true);
    try {
      const models = await fetchEmbeddingModels(serverType, address, port);
      setEmbeddingModels(models);
    } catch (e) {
      setEmbeddingModels([]);
      setError(e instanceof Error ? e.message : "Failed to fetch embedding models");
    } finally {
      setFetchingEmbeddingModels(false);
    }
  }

  async function handleTestEmbeddingConnection() {
    const emb = appSettings.embedding;
    if (!emb?.model) {
      setEmbeddingTestResult({ success: false, message: "Please select a model first" });
      return;
    }
    setTestingEmbedding(true);
    setEmbeddingTestResult(null);
    try {
      const result = await testEmbeddingConnection(
        emb.server_type,
        emb.address,
        emb.port,
        emb.model,
        emb.openai_api_key
      );
      setEmbeddingTestResult(result);
      if (result.success && result.vector_size) {
        setAppSettings((prev) => ({
          ...prev,
          embedding: { ...prev.embedding, vector_size: result.vector_size! },
        }));
      }
    } catch (e) {
      setEmbeddingTestResult({
        success: false,
        message: e instanceof Error ? e.message : "Test failed",
      });
    } finally {
      setTestingEmbedding(false);
    }
  }

  function handleEmbeddingServerTypeChange(serverType: EmbeddingServerType) {
    const serverConfig = EMBEDDING_SERVER_TYPES.find((s) => s.value === serverType);
    const isOpenAI = serverType === "openai";
    setAppSettings((prev) => ({
      ...prev,
      embedding: {
        ...prev.embedding,
        provider: isOpenAI ? "openai" : "llm",
        server_type: serverType,
        port: serverConfig?.defaultPort || prev.embedding.port,
        model: "",
      },
    }));
    setEmbeddingModels([]);
    setEmbeddingTestResult(null);
  }

  async function handleEmbeddingModelChange(model: string) {
    const newSettings = {
      ...appSettings,
      embedding: { ...appSettings.embedding, model },
    };
    setAppSettings(newSettings);
    if (model) {
      try {
        await updateAppSettings(newSettings);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save embedding model");
      }
    }
  }

  const renderVectorSettings = () => (
    <>
      <div className="settings-section">
        <label className="settings-label">Vector Storage (Qdrant)</label>
        <div className="toggle-row">
          <span>Enable semantic memory with Qdrant</span>
          <button
            className={`toggle-btn ${appSettings.qdrant?.enabled ? "active" : ""}`}
            onClick={() =>
              setAppSettings((prev) => ({
                ...prev,
                qdrant: { ...prev.qdrant, enabled: !prev.qdrant?.enabled },
              }))
            }
          >
            {appSettings.qdrant?.enabled ? "ON" : "OFF"}
          </button>
        </div>
        <span className="param-hint">
          Store and retrieve research, reasoning, and canvas content using vector search
        </span>
      </div>

      {appSettings.qdrant?.enabled && (
        <>
          <div className="settings-section">
            <label className="settings-label">Qdrant Connection</label>
            <div className="params-grid">
              <div className="param-item">
                <label className="param-label">Deployment</label>
                <select
                  value={appSettings.qdrant?.deployment || "local"}
                  onChange={(e) =>
                    setAppSettings((prev) => ({
                      ...prev,
                      qdrant: { ...prev.qdrant, deployment: e.target.value as "local" | "cloud" },
                    }))
                  }
                  className="input"
                >
                  <option value="local">Local (Docker/Binary)</option>
                  <option value="cloud">Qdrant Cloud</option>
                </select>
                <span className="param-hint">Where Qdrant is running</span>
              </div>
              <div className="param-item">
                <label className="param-label">URL</label>
                <input
                  type="text"
                  value={appSettings.qdrant?.url ?? "http://localhost:6333"}
                  onChange={(e) =>
                    setAppSettings((prev) => ({
                      ...prev,
                      qdrant: { ...prev.qdrant, url: e.target.value },
                    }))
                  }
                  className="input"
                  placeholder="http://localhost:6333"
                />
                <span className="param-hint">Qdrant server URL</span>
              </div>
              {appSettings.qdrant?.deployment === "cloud" && (
                <div className="param-item">
                  <label className="param-label">API Key</label>
                  <input
                    type="password"
                    value={appSettings.qdrant?.api_key || ""}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        qdrant: { ...prev.qdrant, api_key: e.target.value || null },
                      }))
                    }
                    className="input"
                    placeholder="Your Qdrant Cloud API key"
                  />
                  <span className="param-hint">Required for Qdrant Cloud</span>
                </div>
              )}
            </div>
            <div className="vector-actions">
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  setTestingVector(true);
                  setVectorTestResult(null);
                  try {
                    const result = await testVectorConnection();
                    setVectorTestResult(result);
                  } catch (e) {
                    setVectorTestResult({
                      success: false,
                      message: e instanceof Error ? e.message : "Test failed",
                      qdrant_connected: false,
                      embedding_ready: false,
                      latency_ms: null,
                    });
                  } finally {
                    setTestingVector(false);
                  }
                }}
                disabled={testingVector}
              >
                {testingVector ? "Testing..." : "🔌 Test Connection"}
              </button>
              <button
                className="btn btn-secondary"
                onClick={async () => {
                  setInitializingVector(true);
                  try {
                    const result = await initializeVectors();
                    if (result.success) {
                      await loadCollections();
                      setVectorTestResult({
                        success: true,
                        message: result.message,
                        qdrant_connected: true,
                        embedding_ready: true,
                        latency_ms: null,
                      });
                    }
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Initialize failed");
                  } finally {
                    setInitializingVector(false);
                  }
                }}
                disabled={initializingVector}
              >
                {initializingVector ? "Initializing..." : "🚀 Initialize Collections"}
              </button>
            </div>
            {vectorTestResult && (
              <div className={`test-result ${vectorTestResult.success ? "success" : "error"}`}>
                <span>{vectorTestResult.success ? "✅" : "❌"}</span>
                <span>{vectorTestResult.message}</span>
                {vectorTestResult.success && (
                  <span className="test-details">
                    {vectorTestResult.qdrant_connected && " Qdrant ✓"}
                    {vectorTestResult.embedding_ready && " Embedding ✓"}
                    {vectorTestResult.latency_ms && ` (${vectorTestResult.latency_ms}ms)`}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="settings-section">
            <label className="settings-label">Embedding Provider</label>
            <span className="param-hint">
              Connect to an embedding model served by LM Studio, Ollama, vLLM, or OpenAI
            </span>
            <div className="server-type-grid" style={{ marginTop: "0.75rem" }}>
              {EMBEDDING_SERVER_TYPES.map((server) => (
                <button
                  key={server.value}
                  className={`server-type-btn ${appSettings.embedding?.server_type === server.value ? "active" : ""}`}
                  onClick={() => handleEmbeddingServerTypeChange(server.value)}
                >
                  <span className="server-icon">
                    {server.value === "lm_studio" && "🖥️"}
                    {server.value === "ollama" && "🦙"}
                    {server.value === "vllm" && "⚡"}
                    {server.value === "openai" && "🤖"}
                  </span>
                  <span className="server-name">{server.label}</span>
                </button>
              ))}
            </div>
          </div>

          {appSettings.embedding?.server_type === "openai" ? (
            <div className="settings-section">
              <label className="settings-label">OpenAI Configuration</label>
              <div className="params-grid">
                <div className="param-item">
                  <label className="param-label">API Key</label>
                  <input
                    type="password"
                    value={appSettings.embedding?.openai_api_key || ""}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        embedding: { ...prev.embedding, openai_api_key: e.target.value || null },
                      }))
                    }
                    className="input"
                    placeholder="sk-..."
                  />
                  <span className="param-hint">Your OpenAI API key</span>
                </div>
                <div className="param-item">
                  <label className="param-label">Model</label>
                  <select
                    value={appSettings.embedding?.model || ""}
                    onChange={(e) => handleEmbeddingModelChange(e.target.value)}
                    className="input"
                  >
                    <option value="">Select a model...</option>
                    <option value="text-embedding-3-small">text-embedding-3-small (1536 dim)</option>
                    <option value="text-embedding-3-large">text-embedding-3-large (3072 dim)</option>
                    <option value="text-embedding-ada-002">text-embedding-ada-002 (1536 dim)</option>
                  </select>
                  <span className="param-hint">OpenAI embedding model (auto-saves)</span>
                </div>
                <div className="param-item">
                  <label className="param-label">Vector Size</label>
                  <input
                    type="number"
                    value={appSettings.embedding?.vector_size || 1536}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        embedding: { ...prev.embedding, vector_size: parseInt(e.target.value) || 1536 },
                      }))
                    }
                    className="input"
                    min={128}
                    max={4096}
                  />
                  <span className="param-hint">Must match model output (3-small: 1536, 3-large: 3072)</span>
                </div>
              </div>
              <div className="vector-actions" style={{ marginTop: "1rem" }}>
                <button
                  className="btn btn-secondary"
                  onClick={handleTestEmbeddingConnection}
                  disabled={testingEmbedding || !appSettings.embedding?.openai_api_key || !appSettings.embedding?.model}
                >
                  {testingEmbedding ? "Testing..." : "🔌 Test Embedding"}
                </button>
              </div>
              {embeddingTestResult && (
                <div className={`test-result ${embeddingTestResult.success ? "success" : "error"}`}>
                  <span>{embeddingTestResult.success ? "✅" : "❌"}</span>
                  <span>{embeddingTestResult.message}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="settings-section">
              <label className="settings-label">Embedding Server</label>
              <div className="address-row">
                <input
                  type="text"
                  value={appSettings.embedding?.address || "localhost"}
                  onChange={(e) => {
                    const sanitized = e.target.value
                      .replace(/^https?:\/\//, "")
                      .replace(/\/+$/, "")
                      .replace(/:\d+$/, "");
                    setAppSettings((prev) => ({
                      ...prev,
                      embedding: { ...prev.embedding, address: sanitized },
                    }));
                    setEmbeddingModels([]);
                    setEmbeddingTestResult(null);
                  }}
                  placeholder="localhost"
                  className="input address-input"
                />
                <span className="address-separator">:</span>
                <input
                  type="number"
                  value={appSettings.embedding?.port || 1234}
                  onChange={(e) => {
                    setAppSettings((prev) => ({
                      ...prev,
                      embedding: { ...prev.embedding, port: parseInt(e.target.value) || 1234 },
                    }));
                    setEmbeddingModels([]);
                    setEmbeddingTestResult(null);
                  }}
                  placeholder="Port"
                  className="input port-input"
                />
                <button
                  onClick={() => loadEmbeddingModels(
                    appSettings.embedding?.server_type || "lm_studio",
                    appSettings.embedding?.address || "localhost",
                    appSettings.embedding?.port || 1234
                  )}
                  disabled={fetchingEmbeddingModels}
                  className="btn btn-secondary"
                >
                  {fetchingEmbeddingModels ? "Loading..." : "Fetch Models"}
                </button>
              </div>
              <div className="params-grid" style={{ marginTop: "1rem" }}>
                <div className="param-item">
                  <label className="param-label">
                    Model
                    {fetchingEmbeddingModels && <span className="loading-text"> (loading...)</span>}
                  </label>
                  <select
                    value={appSettings.embedding?.model || ""}
                    onChange={(e) => handleEmbeddingModelChange(e.target.value)}
                    className="input model-select"
                  >
                    <option value="">
                      {embeddingModels.length === 0 ? "Fetch models from server..." : "Select an embedding model..."}
                    </option>
                    {embeddingModels.filter(m => m.is_embedding).length > 0 && (
                      <optgroup label="Embedding Models">
                        {embeddingModels.filter(m => m.is_embedding).map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {embeddingModels.filter(m => !m.is_embedding).length > 0 && (
                      <optgroup label="Other Models">
                        {embeddingModels.filter(m => !m.is_embedding).map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  {embeddingModels.length > 0 && (
                    <span className="param-hint">
                      {embeddingModels.filter(m => m.is_embedding).length} embedding model(s), {embeddingModels.filter(m => !m.is_embedding).length} other
                    </span>
                  )}
                </div>
                <div className="param-item">
                  <label className="param-label">Vector Size</label>
                  <input
                    type="number"
                    value={appSettings.embedding?.vector_size || 384}
                    onChange={(e) =>
                      setAppSettings((prev) => ({
                        ...prev,
                        embedding: { ...prev.embedding, vector_size: parseInt(e.target.value) || 384 },
                      }))
                    }
                    className="input"
                    min={128}
                    max={4096}
                  />
                  <span className="param-hint">Auto-detected when you test the connection</span>
                </div>
              </div>
              <div className="vector-actions" style={{ marginTop: "1rem" }}>
                <button
                  className="btn btn-secondary"
                  onClick={handleTestEmbeddingConnection}
                  disabled={testingEmbedding || !appSettings.embedding?.model}
                >
                  {testingEmbedding ? "Testing..." : "🔌 Test Embedding"}
                </button>
              </div>
              {embeddingTestResult && (
                <div className={`test-result ${embeddingTestResult.success ? "success" : "error"}`}>
                  <span>{embeddingTestResult.success ? "✅" : "❌"}</span>
                  <span>{embeddingTestResult.message}</span>
                </div>
              )}
            </div>
          )}

          <div className="settings-section">
            <div className="prompts-header">
              <label className="settings-label">Collections</label>
              <button
                className="btn btn-ghost btn-xs"
                onClick={loadCollections}
                disabled={loadingCollections}
              >
                {loadingCollections ? "Loading..." : "🔄 Refresh"}
              </button>
            </div>
            {collections.length > 0 ? (
              <div className="collections-list">
                {collections.map((col) => (
                  <div key={col.name} className="collection-item">
                    <div className="collection-info">
                      <span className="collection-name">{col.name}</span>
                      <span className="collection-stats">
                        {col.vectors_count} vectors | {col.status}
                      </span>
                    </div>
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => handleClearCollection(col.name)}
                    >
                      🗑️ Clear
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <span className="param-hint">
                {loadingCollections ? "Loading collections..." : "No collections found. Save settings to create them."}
              </span>
            )}
          </div>
        </>
      )}
    </>
  );

  return (
    <div className="settings-page">
      <div className="settings-container">
        <div className="settings-sidebar">
          <h2>⚙️ Settings</h2>
          <nav className="settings-nav">
            <button
              data-tour="settings-nav-llm"
              className={`settings-nav-btn ${activeTab === "llm" ? "active" : ""}`}
              onClick={() => setActiveTab("llm")}
            >
              🖥️ LLM Server
            </button>
            <button
              data-tour="settings-nav-search"
              className={`settings-nav-btn ${activeTab === "search" ? "active" : ""}`}
              onClick={() => setActiveTab("search")}
            >
              🔍 Web Search
            </button>
            <button
              data-tour="settings-nav-behavior"
              className={`settings-nav-btn ${activeTab === "behavior" ? "active" : ""}`}
              onClick={() => setActiveTab("behavior")}
            >
              🧠 Behavior
            </button>
            <button
              data-tour="settings-nav-prompts"
              className={`settings-nav-btn ${activeTab === "prompts" ? "active" : ""}`}
              onClick={() => setActiveTab("prompts")}
            >
              ⚡ Quick Prompts
            </button>
            <button
              data-tour="settings-nav-agents"
              className={`settings-nav-btn ${activeTab === "agents" ? "active" : ""}`}
              onClick={() => setActiveTab("agents")}
            >
              🤖 AI Agents
            </button>
            <button
              data-tour="settings-nav-vectors"
              className={`settings-nav-btn ${activeTab === "vectors" ? "active" : ""}`}
              onClick={() => {
                setActiveTab("vectors");
                if (appSettings.qdrant?.enabled) loadCollections();
              }}
            >
              🧮 Vectors
            </button>
          </nav>
        </div>

        <div className="settings-main">
          <div className="settings-header">
            <h3>
              {activeTab === "llm" && "🖥️ LLM Server Configuration"}
              {activeTab === "search" && "🔍 Web Search Settings"}
              {activeTab === "behavior" && "🧠 Behavior Settings"}
              {activeTab === "prompts" && "⚡ Quick Prompts"}
              {activeTab === "agents" && "🤖 AI Agents Configuration"}
              {activeTab === "vectors" && "🧮 Vector Storage Settings"}
            </h3>
            <button
              onClick={handleSave}
              disabled={loading || (activeTab === "llm" && !settings.model)}
              className="btn btn-primary"
            >
              {saved ? "✓ Saved!" : loading ? "Saving..." : "Save Settings"}
            </button>
          </div>

          <div className="settings-body">
            {loading && !fetchingModels && (
              <div className="settings-loading">
                <div className="spinner" />
                <p>Loading settings...</p>
              </div>
            )}

            {error && (
              <div className="settings-error">
                <span>⚠️</span>
                <span>{error}</span>
                <button onClick={() => setError(null)} className="btn btn-ghost btn-xs">
                  ✕
                </button>
              </div>
            )}

            {activeTab === "llm" && renderLLMSettings()}
            {activeTab === "search" && renderSearchSettings()}
            {activeTab === "behavior" && renderBehaviorSettings()}
            {activeTab === "prompts" && renderPromptsSettings()}
            {activeTab === "agents" && (
              <AgentsSettingsTab
                onError={(msg) => setError(msg)}
                onSaved={() => setSaved(true)}
              />
            )}
            {activeTab === "vectors" && renderVectorSettings()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(SettingsPanel);