import { useState, useEffect, useCallback } from "react";
import "./AgentsSettingsTab.css";
import ModelConfigSection from "./ModelConfigSection";
import {
  getAgentSettings,
  getPMSettings,
  getAllSpecialists,
  reloadAgentSettings,
  updatePMModelConfig,
  updateSpecialistModelConfig,
  updatePMPrompts,
  updateSpecialistPrompts,
  updateSpecialistKeywords,
  fetchModels,
  testLLMConnection,
  getLLMSettings,
  getResearchSettings,
  updateResearchOrchestratorPrompts,
  updateResearchOrchestratorModel,
  updateResearchAgentPrompts,
  updateResearchAgentModel,
  type AgentSettings,
  type PMSettings,
  type SpecialistSettings,
  type AgentModelConfig,
  type ModelInfo,
  type ServerType,
  type ResearchSettingsResponse,
} from "../services/api";

interface AgentsSettingsTabProps {
  onError: (error: string) => void;
  onSaved: () => void;
}

type AgentSection = "pm" | "identity" | "definition" | "resources" | "execution" | "research-orchestrator" | "research-researcher" | "research-fact_checker";

type AgentGroup = {
  label: string;
  emoji: string;
  tabs: { id: AgentSection; label: string; emoji: string }[];
};

const AGENT_GROUPS: AgentGroup[] = [
  {
    label: "Project Manager",
    emoji: "📋",
    tabs: [
      { id: "pm", label: "Orchestrator", emoji: "👔" },
      { id: "identity", label: "Identity", emoji: "🎯" },
      { id: "definition", label: "Definition", emoji: "📐" },
      { id: "resources", label: "Resources", emoji: "🧰" },
      { id: "execution", label: "Execution", emoji: "📋" },
    ],
  },
  {
    label: "Research Lab",
    emoji: "🔬",
    tabs: [
      { id: "research-orchestrator", label: "Coordinator", emoji: "🔬" },
      { id: "research-researcher", label: "Researcher", emoji: "🔍" },
      { id: "research-fact_checker", label: "Fact Checker", emoji: "✅" },
    ],
  },
];

const ALL_TABS = AGENT_GROUPS.flatMap(g => g.tabs);


export default function AgentsSettingsTab({ onError, onSaved }: AgentsSettingsTabProps) {
  const [activeAgent, setActiveAgent] = useState<AgentSection>("pm");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(null);
  const [pmSettings, setPMSettings] = useState<PMSettings | null>(null);
  const [specialists, setSpecialists] = useState<Record<string, SpecialistSettings>>({});
  const [researchSettings, setResearchSettings] = useState<ResearchSettingsResponse | null>(null);
  const [workspaceEndpoint, setWorkspaceEndpoint] = useState<{ baseUrl: string; model: string; serverType: string }>({
    baseUrl: "",
    model: "",
    serverType: "lm_studio",
  });
  const [customModels, setCustomModels] = useState<Record<string, ModelInfo[]>>({});
  const [testingEndpoint, setTestingEndpoint] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; message: string }>>({});
  const [editedPMPrompts, setEditedPMPrompts] = useState<{
    system: string;
    greeting: string;
    synthesis: string;
    conflict_resolution: string;
  } | null>(null);
  const [editedSpecialistPrompts, setEditedSpecialistPrompts] = useState<
    Record<string, { system: string; extraction: string }>
  >({});
  const [editedSpecialistKeywords, setEditedSpecialistKeywords] = useState<
    Record<string, string[]>
  >({});
  const [editedResearchOrchestratorPrompts, setEditedResearchOrchestratorPrompts] = useState<{
    system: string;
    greeting: string;
    synthesis: string;
  } | null>(null);
  const [editedResearchAgentPrompts, setEditedResearchAgentPrompts] = useState<
    Record<string, { system: string; extraction: string; search_query_generation: string }>
  >({});
  const [savingPrompts, setSavingPrompts] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [settings, pm, specs, llmSettings, research] = await Promise.all([
        getAgentSettings(),
        getPMSettings(),
        getAllSpecialists(),
        getLLMSettings(),
        getResearchSettings(),
      ]);
      setAgentSettings(settings);
      setPMSettings(pm);
      setSpecialists(specs);
      setResearchSettings(research);
      setWorkspaceEndpoint({
        baseUrl: `http://${llmSettings.address}:${llmSettings.port}`,
        model: llmSettings.model,
        serverType: llmSettings.server_type,
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to load agent settings");
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  async function handleReload() {
    setLoading(true);
    try {
      await reloadAgentSettings();
      await loadSettings();
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to reload settings");
    } finally {
      setLoading(false);
    }
  }

  async function handleTestEndpoint(agentId: string, serverType: string, address: string, port: number) {
    setTestingEndpoint(agentId);
    setTestResult((prev) => ({ ...prev, [agentId]: { success: false, message: "" } }));
    try {
      const result = await testLLMConnection(serverType as ServerType, address, port);
      setTestResult((prev) => ({ ...prev, [agentId]: result }));
      if (result.success) {
        const models = await fetchModels(serverType as ServerType, address, port);
        setCustomModels((prev) => ({ ...prev, [agentId]: models }));
      }
    } catch (e) {
      setTestResult((prev) => ({
        ...prev,
        [agentId]: { success: false, message: e instanceof Error ? e.message : "Connection failed" },
      }));
    } finally {
      setTestingEndpoint(null);
    }
  }

  async function handleSaveModelConfig(agentId: string, config: AgentModelConfig) {
    setSaving(true);
    try {
      if (agentId === "pm") {
        await updatePMModelConfig(config);
        setPMSettings((prev) => prev ? { ...prev, model: config } : prev);
      } else {
        await updateSpecialistModelConfig(agentId, config);
        setSpecialists((prev) => ({
          ...prev,
          [agentId]: { ...prev[agentId], model: config },
        }));
      }
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to save model config");
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePMPrompts() {
    if (!editedPMPrompts) return;
    setSavingPrompts("pm");
    try {
      await updatePMPrompts(editedPMPrompts);
      setPMSettings((prev) =>
        prev ? { ...prev, prompts: editedPMPrompts } : prev
      );
      setEditedPMPrompts(null);
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to save PM prompts");
    } finally {
      setSavingPrompts(null);
    }
  }

  async function handleSaveSpecialistPrompts(agentId: string) {
    const prompts = editedSpecialistPrompts[agentId];
    if (!prompts) return;
    setSavingPrompts(agentId);
    try {
      await updateSpecialistPrompts(agentId, prompts);
      setSpecialists((prev) => ({
        ...prev,
        [agentId]: { ...prev[agentId], prompts },
      }));
      setEditedSpecialistPrompts((prev) => {
        const updated = { ...prev };
        delete updated[agentId];
        return updated;
      });
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to save specialist prompts");
    } finally {
      setSavingPrompts(null);
    }
  }

  async function handleSaveSpecialistKeywords(agentId: string) {
    const keywords = editedSpecialistKeywords[agentId];
    if (!keywords) return;
    setSavingPrompts(`${agentId}-keywords`);
    try {
      await updateSpecialistKeywords(agentId, { trigger_keywords: keywords });
      setSpecialists((prev) => ({
        ...prev,
        [agentId]: { ...prev[agentId], trigger_keywords: keywords },
      }));
      setEditedSpecialistKeywords((prev) => {
        const updated = { ...prev };
        delete updated[agentId];
        return updated;
      });
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to save specialist keywords");
    } finally {
      setSavingPrompts(null);
    }
  }

  async function handleSaveResearchOrchestratorPrompts() {
    if (!editedResearchOrchestratorPrompts) return;
    setSavingPrompts("research-orchestrator");
    try {
      await updateResearchOrchestratorPrompts(editedResearchOrchestratorPrompts);
      setResearchSettings((prev) => prev && prev.orchestrator ? {
        ...prev,
        orchestrator: { ...prev.orchestrator, prompts: editedResearchOrchestratorPrompts },
      } : prev);
      setEditedResearchOrchestratorPrompts(null);
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to save research orchestrator prompts");
    } finally {
      setSavingPrompts(null);
    }
  }

  async function handleSaveResearchOrchestratorModel(config: AgentModelConfig) {
    setSaving(true);
    try {
      await updateResearchOrchestratorModel(config);
      setResearchSettings((prev) => prev && prev.orchestrator ? {
        ...prev,
        orchestrator: { ...prev.orchestrator, model: config },
      } : prev);
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to save research orchestrator model");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveResearchAgentPrompts(agentId: string) {
    const prompts = editedResearchAgentPrompts[agentId];
    if (!prompts) return;
    setSavingPrompts(`research-${agentId}`);
    try {
      await updateResearchAgentPrompts(agentId, prompts);
      setResearchSettings((prev) => prev && prev.agents && prev.agents[agentId] ? {
        ...prev,
        agents: {
          ...prev.agents,
          [agentId]: { ...prev.agents[agentId], prompts },
        },
      } : prev);
      setEditedResearchAgentPrompts((prev) => {
        const updated = { ...prev };
        delete updated[agentId];
        return updated;
      });
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to save research agent prompts");
    } finally {
      setSavingPrompts(null);
    }
  }

  async function handleSaveResearchAgentModel(agentId: string, config: AgentModelConfig) {
    setSaving(true);
    try {
      await updateResearchAgentModel(agentId, config);
      setResearchSettings((prev) => prev && prev.agents && prev.agents[agentId] ? {
        ...prev,
        agents: {
          ...prev.agents,
          [agentId]: { ...prev.agents[agentId], model: config },
        },
      } : prev);
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to save research agent model");
    } finally {
      setSaving(false);
    }
  }

  const renderModelConfig = (agentId: string, model: AgentModelConfig, onSave: (config: AgentModelConfig) => void, compact = false) => (
    <ModelConfigSection
      agentId={agentId}
      model={model}
      workspaceEndpoint={workspaceEndpoint}
      customModels={customModels[agentId] || []}
      testResult={testResult[agentId]}
      isTesting={testingEndpoint === agentId}
      saving={saving}
      onSave={onSave}
      onTest={(serverType, address, port) => handleTestEndpoint(agentId, serverType, address, port)}
      compact={compact}
    />
  );

  if (loading) {
    return (
      <div className="agents-loading">
        <div className="spinner" />
        <p>Loading agent settings...</p>
      </div>
    );
  }

  const renderPMSettings = () => {
    if (!pmSettings) return null;
    const currentPrompts = editedPMPrompts || pmSettings.prompts;
    const hasChanges = editedPMPrompts !== null;

    const updatePrompt = (field: keyof typeof currentPrompts, value: string) => {
      setEditedPMPrompts({
        ...currentPrompts,
        [field]: value,
      });
    };

    return (
      <div className="agent-config">
        <div className="agent-header">
          <h4>👔 Project Manager - "The Orchestrator"</h4>
          <span className="agent-badge enabled">Enabled</span>
        </div>
        
        <div className="config-section">
          <div className="config-section-title">System Prompt</div>
          <div className="prompt-info">
            Defines the PM's personality and behavior. This is the most important setting for prompt engineering.
          </div>
          <textarea
            className="prompt-textarea large"
            value={currentPrompts.system}
            onChange={(e) => updatePrompt("system", e.target.value)}
            rows={8}
            disabled={savingPrompts === "pm"}
          />
        </div>

        <div className="config-section">
          <div className="config-section-title">Greeting Message</div>
          <div className="prompt-info">
            First message shown to users when starting a new session.
          </div>
          <textarea
            className="prompt-textarea"
            value={currentPrompts.greeting}
            onChange={(e) => updatePrompt("greeting", e.target.value)}
            rows={4}
            disabled={savingPrompts === "pm"}
          />
        </div>

        <div className="config-section">
          <div className="config-section-title">Synthesis Prompt</div>
          <div className="prompt-info">
            How the PM combines agent outputs into a coherent response.
          </div>
          <textarea
            className="prompt-textarea"
            value={currentPrompts.synthesis}
            onChange={(e) => updatePrompt("synthesis", e.target.value)}
            rows={6}
            disabled={savingPrompts === "pm"}
          />
        </div>

        {hasChanges && (
          <div className="prompt-actions">
            <button
              className="btn btn-primary"
              onClick={handleSavePMPrompts}
              disabled={savingPrompts === "pm"}
            >
              {savingPrompts === "pm" ? "Saving..." : "💾 Save Prompts"}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setEditedPMPrompts(null)}
              disabled={savingPrompts === "pm"}
            >
              Cancel
            </button>
          </div>
        )}

        {renderModelConfig("pm", pmSettings.model, (config) => handleSaveModelConfig("pm", config))}
      </div>
    );
  };

  const renderSpecialistSettings = (agentId: string) => {
    const specialist = specialists[agentId];
    if (!specialist) return <p>Specialist not found</p>;

    const info = ALL_TABS.find((t) => t.id === agentId);
    const currentPrompts = editedSpecialistPrompts[agentId] || specialist.prompts;
    const currentKeywords = editedSpecialistKeywords[agentId] || specialist.trigger_keywords;
    const hasPromptChanges = Boolean(editedSpecialistPrompts[agentId]);
    const hasKeywordChanges = Boolean(editedSpecialistKeywords[agentId]);
    const isSavingPrompts = savingPrompts === agentId;
    const isSavingKeywords = savingPrompts === `${agentId}-keywords`;

    const updatePrompt = (field: "system" | "extraction", value: string) => {
      setEditedSpecialistPrompts((prev) => ({
        ...prev,
        [agentId]: {
          ...currentPrompts,
          [field]: value,
        },
      }));
    };

    const updateKeywords = (value: string) => {
      const keywords = value.split(",").map((k) => k.trim()).filter(Boolean);
      setEditedSpecialistKeywords((prev) => ({
        ...prev,
        [agentId]: keywords,
      }));
    };

    return (
      <div className="agent-config">
        <div className="agent-header">
          <h4>{info?.emoji} {specialist.name} - "{specialist.nickname}"</h4>
          <span className={`agent-badge ${specialist.enabled ? "enabled" : "disabled"}`}>
            {specialist.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        <div className="config-section">
          <div className="config-section-title">System Prompt</div>
          <div className="prompt-info">
            Defines this agent's role, personality, and output format.
          </div>
          <textarea
            className="prompt-textarea large"
            value={currentPrompts.system}
            onChange={(e) => updatePrompt("system", e.target.value)}
            rows={10}
            disabled={isSavingPrompts}
          />
        </div>

        <div className="config-section">
          <div className="config-section-title">Extraction Prompt</div>
          <div className="prompt-info">
            Template for extracting information from conversations. Uses placeholders like {"{conversation}"}, {"{canvas_state}"}.
          </div>
          <textarea
            className="prompt-textarea"
            value={currentPrompts.extraction}
            onChange={(e) => updatePrompt("extraction", e.target.value)}
            rows={6}
            disabled={isSavingPrompts}
          />
        </div>

        {hasPromptChanges && (
          <div className="prompt-actions">
            <button
              className="btn btn-primary"
              onClick={() => handleSaveSpecialistPrompts(agentId)}
              disabled={isSavingPrompts}
            >
              {isSavingPrompts ? "Saving..." : "💾 Save Prompts"}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setEditedSpecialistPrompts((prev) => {
                  const updated = { ...prev };
                  delete updated[agentId];
                  return updated;
                });
              }}
              disabled={isSavingPrompts}
            >
              Cancel
            </button>
          </div>
        )}

        <div className="config-section">
          <div className="config-section-title">Trigger Keywords</div>
          <div className="prompt-info">
            Keywords that suggest this agent should be invoked. Edit as comma-separated values.
          </div>
          <textarea
            className="prompt-textarea keywords-input"
            value={currentKeywords.join(", ")}
            onChange={(e) => updateKeywords(e.target.value)}
            rows={2}
            disabled={isSavingKeywords}
            placeholder="Enter keywords separated by commas"
          />
        </div>

        {hasKeywordChanges && (
          <div className="prompt-actions">
            <button
              className="btn btn-primary"
              onClick={() => handleSaveSpecialistKeywords(agentId)}
              disabled={isSavingKeywords}
            >
              {isSavingKeywords ? "Saving..." : "💾 Save Keywords"}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setEditedSpecialistKeywords((prev) => {
                  const updated = { ...prev };
                  delete updated[agentId];
                  return updated;
                });
              }}
              disabled={isSavingKeywords}
            >
              Cancel
            </button>
          </div>
        )}

        {renderModelConfig(agentId, specialist.model, (config) => handleSaveModelConfig(agentId, config))}
      </div>
    );
  };

  const renderResearchOrchestratorSettings = () => {
    if (!researchSettings?.orchestrator) {
      return <p className="no-research">Research Orchestrator not configured.</p>;
    }

    const orchestrator = researchSettings.orchestrator;

    return (
      <div className="agent-config">
        <div className="agent-header">
          <h4>{orchestrator.emoji} {orchestrator.name} - "{orchestrator.nickname}"</h4>
          <span className={`agent-badge ${orchestrator.enabled ? "enabled" : "disabled"}`}>
            {orchestrator.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        <div className="config-section">
          <div className="config-section-title">System Prompt</div>
          <div className="prompt-info">
            Defines how the orchestrator coordinates research agents.
          </div>
          <textarea
            className="prompt-textarea large"
            value={editedResearchOrchestratorPrompts?.system ?? orchestrator.prompts.system}
            onChange={(e) => setEditedResearchOrchestratorPrompts((prev) => ({
              system: e.target.value,
              greeting: prev?.greeting ?? orchestrator.prompts.greeting,
              synthesis: prev?.synthesis ?? orchestrator.prompts.synthesis,
            }))}
            rows={8}
            disabled={savingPrompts === "research-orchestrator"}
          />
        </div>

        <div className="config-section">
          <div className="config-section-title">Greeting Message</div>
          <div className="prompt-info">
            Initial message shown to users in the Research Lab.
          </div>
          <textarea
            className="prompt-textarea"
            value={editedResearchOrchestratorPrompts?.greeting ?? orchestrator.prompts.greeting}
            onChange={(e) => setEditedResearchOrchestratorPrompts((prev) => ({
              system: prev?.system ?? orchestrator.prompts.system,
              greeting: e.target.value,
              synthesis: prev?.synthesis ?? orchestrator.prompts.synthesis,
            }))}
            rows={4}
            disabled={savingPrompts === "research-orchestrator"}
          />
        </div>

        {editedResearchOrchestratorPrompts && (
          <div className="prompt-actions">
            <button
              className="btn btn-primary"
              onClick={handleSaveResearchOrchestratorPrompts}
              disabled={savingPrompts === "research-orchestrator"}
            >
              {savingPrompts === "research-orchestrator" ? "Saving..." : "💾 Save Prompts"}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setEditedResearchOrchestratorPrompts(null)}
              disabled={savingPrompts === "research-orchestrator"}
            >
              Cancel
            </button>
          </div>
        )}

        {renderModelConfig("research-orchestrator", orchestrator.model, handleSaveResearchOrchestratorModel, true)}
      </div>
    );
  };

  const renderResearchAgentSettings = (agentId: string) => {
    if (!researchSettings?.agents?.[agentId]) {
      return <p className="no-research">Research agent not found.</p>;
    }

    const agent = researchSettings.agents[agentId];
    const currentPrompts = editedResearchAgentPrompts[agentId] || agent.prompts;
    const hasChanges = Boolean(editedResearchAgentPrompts[agentId]);
    const isSaving = savingPrompts === `research-${agentId}`;

    return (
      <div className="agent-config">
        <div className="agent-header">
          <h4>{agent.emoji} {agent.name} - "{agent.nickname}"</h4>
          <span className={`agent-badge ${agent.enabled ? "enabled" : "disabled"}`}>
            {agent.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        <div className="config-section">
          <div className="config-section-title">System Prompt</div>
          <div className="prompt-info">
            Defines this agent's role and output format.
          </div>
          <textarea
            className="prompt-textarea large"
            value={currentPrompts.system}
            onChange={(e) => setEditedResearchAgentPrompts((prev) => ({
              ...prev,
              [agentId]: {
                ...currentPrompts,
                system: e.target.value,
              },
            }))}
            rows={8}
            disabled={isSaving}
          />
        </div>

        <div className="config-section">
          <div className="config-section-title">Extraction Prompt</div>
          <div className="prompt-info">
            Template for generating research content. Uses {"{user_message}"}, {"{web_research}"}, {"{research_data}"}.
          </div>
          <textarea
            className="prompt-textarea"
            value={currentPrompts.extraction}
            onChange={(e) => setEditedResearchAgentPrompts((prev) => ({
              ...prev,
              [agentId]: {
                ...currentPrompts,
                extraction: e.target.value,
              },
            }))}
            rows={6}
            disabled={isSaving}
          />
        </div>

        <div className="config-section">
          <div className="config-section-title">Search Query Generation</div>
          <div className="prompt-info">
            Prompt template for generating web search queries. Uses {"{query}"}.
          </div>
          <textarea
            className="prompt-textarea"
            value={currentPrompts.search_query_generation}
            onChange={(e) => setEditedResearchAgentPrompts((prev) => ({
              ...prev,
              [agentId]: {
                ...currentPrompts,
                search_query_generation: e.target.value,
              },
            }))}
            rows={4}
            disabled={isSaving}
          />
        </div>

        {hasChanges && (
          <div className="prompt-actions">
            <button
              className="btn btn-primary"
              onClick={() => handleSaveResearchAgentPrompts(agentId)}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "💾 Save Prompts"}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setEditedResearchAgentPrompts((prev) => {
                  const updated = { ...prev };
                  delete updated[agentId];
                  return updated;
                });
              }}
              disabled={isSaving}
            >
              Cancel
            </button>
          </div>
        )}

        {renderModelConfig(`research-${agentId}`, agent.model, (config) => handleSaveResearchAgentModel(agentId, config), true)}
      </div>
    );
  };

  return (
    <div className="agents-settings">
      <div className="agents-info-banner">
        <span className="info-icon">ℹ️</span>
        <div>
          <strong>Agent Configuration</strong>
          <p>
            Each agent has its own personality, system prompt, and model settings.
            Edit prompts directly below, or use Reload to restore from <code>agent_settings.json</code>.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleReload}>
          🔄 Reload Settings
        </button>
      </div>

      <div className="agents-groups">
        {AGENT_GROUPS.map((group) => (
          <div key={group.label} className="agent-group">
            <div className="agent-group-header">
              <span className="group-emoji">{group.emoji}</span>
              <span className="group-label">{group.label}</span>
            </div>
            <div className="agent-group-tabs">
              {group.tabs.map((tab) => (
                <button
                  key={tab.id}
                  className={`agent-tab ${activeAgent === tab.id ? "active" : ""}`}
                  onClick={() => setActiveAgent(tab.id)}
                >
                  <span className="tab-emoji">{tab.emoji}</span>
                  <span className="tab-label">{tab.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="agent-content">
        {activeAgent === "pm" && renderPMSettings()}
        {activeAgent === "research-orchestrator" && renderResearchOrchestratorSettings()}
        {activeAgent.startsWith("research-") && activeAgent !== "research-orchestrator" && renderResearchAgentSettings(activeAgent.replace("research-", ""))}
        {!activeAgent.startsWith("research-") && activeAgent !== "pm" && renderSpecialistSettings(activeAgent)}
      </div>

      {agentSettings && (
        <div className="telemetry-config">
          <div className="config-section-title">Telemetry Settings</div>
          <div className="config-grid">
            <div className="config-item">
              <label>Enabled</label>
              <span className="config-value">{agentSettings.telemetry.enabled ? "Yes" : "No"}</span>
            </div>
            <div className="config-item">
              <label>Show in Canvas</label>
              <span className="config-value">{agentSettings.telemetry.show_in_canvas ? "Yes" : "No"}</span>
            </div>
            <div className="config-item">
              <label>Export Format</label>
              <span className="config-value">{agentSettings.telemetry.export_format}</span>
            </div>
            <div className="config-item">
              <label>Cost Estimation</label>
              <span className="config-value">
                {agentSettings.telemetry.cost_estimation.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
