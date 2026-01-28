import { useState, useEffect, useCallback } from "react";
import "./PromptHistory.css";
import { API_BASE_URL as API_BASE } from "../services/api/config";

interface PromptSettings {
  temperature: number;
  use_thinking: boolean;
  web_search_enabled: boolean;
  rag_enabled: boolean;
  model: string;
}

interface PromptVersion {
  id: string;
  name: string;
  prompt: string;
  settings: PromptSettings;
  workspace: string;
  response_preview: string | null;
  tokens_used: number | null;
  latency_ms: number | null;
  created_at: string;
  parent_id: string | null;
  tags: string[];
}

interface PromptHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadPrompt?: (prompt: string, settings: PromptSettings) => void;
}

export default function PromptHistory({ isOpen, onClose, onLoadPrompt }: PromptHistoryProps) {
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("all");
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareVersions, setCompareVersions] = useState<[string | null, string | null]>([null, null]);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const loadVersions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const url = selectedWorkspace === "all" 
        ? `${API_BASE}/api/prompt-history`
        : `${API_BASE}/api/prompt-history?workspace=${selectedWorkspace}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to load history");
      const data = await res.json();
      setVersions(data.sort((a: PromptVersion, b: PromptVersion) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load history");
    } finally {
      setIsLoading(false);
    }
  }, [selectedWorkspace]);

  useEffect(() => {
    if (isOpen) {
      loadVersions();
    }
  }, [isOpen, loadVersions]);

  const handleFork = async (version: PromptVersion) => {
    const name = prompt("Enter name for the forked version:", `${version.name} (fork)`);
    if (!name) return;

    try {
      const res = await fetch(`${API_BASE}/api/prompt-history/${version.id}/fork?name=${encodeURIComponent(name)}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Fork failed");
      await loadVersions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fork failed");
    }
  };

  const handleDelete = async (versionId: string) => {
    if (!confirm("Delete this version?")) return;

    try {
      const res = await fetch(`${API_BASE}/api/prompt-history/${versionId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed");
      await loadVersions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleRename = async (versionId: string) => {
    if (!newName.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/api/prompt-history/${versionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) throw new Error("Rename failed");
      setEditingName(null);
      setNewName("");
      await loadVersions();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    }
  };

  const handleExport = async () => {
    try {
      const url = selectedWorkspace === "all"
        ? `${API_BASE}/api/prompt-history/export/json`
        : `${API_BASE}/api/prompt-history/export/json?workspace=${selectedWorkspace}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      
      const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: "application/json" });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `prompt-history-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  };

  const handleCompareSelect = (versionId: string) => {
    if (compareVersions[0] === null) {
      setCompareVersions([versionId, null]);
    } else if (compareVersions[1] === null && compareVersions[0] !== versionId) {
      setCompareVersions([compareVersions[0], versionId]);
    } else {
      setCompareVersions([versionId, null]);
    }
  };

  const getCompareVersions = (): [PromptVersion | null, PromptVersion | null] => {
    const v1 = versions.find(v => v.id === compareVersions[0]) || null;
    const v2 = versions.find(v => v.id === compareVersions[1]) || null;
    return [v1, v2];
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  const getWorkspaceIcon = (workspace: string) => {
    switch (workspace) {
      case "chain_of_thought": return "🔗";
      case "research_lab": return "🔬";
      case "project_manager": return "📋";
      default: return "📝";
    }
  };

  if (!isOpen) return null;

  const [compareA, compareB] = getCompareVersions();

  return (
    <div className="prompt-history-overlay" onClick={onClose}>
      <div className="prompt-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="prompt-history-header">
          <div className="header-title">
            <span className="header-icon">📜</span>
            <h2>Prompt History</h2>
          </div>
          <button className="close-btn" onClick={onClose} type="button">✕</button>
        </div>

        <div className="prompt-history-toolbar">
          <div className="toolbar-left">
            <select
              value={selectedWorkspace}
              onChange={(e) => setSelectedWorkspace(e.target.value)}
              className="workspace-select"
            >
              <option value="all">All Workspaces</option>
              <option value="chain_of_thought">🔗 Chain of Thought</option>
              <option value="research_lab">🔬 Research Lab</option>
              <option value="project_manager">📋 Project Manager</option>
            </select>

            <button
              className={`toolbar-btn ${compareMode ? "active" : ""}`}
              onClick={() => {
                setCompareMode(!compareMode);
                setCompareVersions([null, null]);
              }}
              type="button"
            >
              {compareMode ? "Exit Compare" : "⚖️ Compare"}
            </button>
          </div>

          <button className="toolbar-btn export-btn" onClick={handleExport} type="button">
            📥 Export JSON
          </button>
        </div>

        {error && (
          <div className="prompt-history-error">
            <span>⚠️</span> {error}
          </div>
        )}

        <div className="prompt-history-content">
          {compareMode && compareVersions[0] && compareVersions[1] && compareA && compareB ? (
            <div className="compare-view">
              <div className="compare-header">
                <h3>Comparing Versions</h3>
                <button 
                  className="clear-compare-btn"
                  onClick={() => setCompareVersions([null, null])}
                  type="button"
                >
                  Clear Selection
                </button>
              </div>
              <div className="compare-grid">
                <div className="compare-card">
                  <div className="compare-card-header">
                    <span className="version-name">{compareA.name}</span>
                    <span className="version-date">{formatDate(compareA.created_at)}</span>
                  </div>
                  <div className="compare-section">
                    <h4>Prompt</h4>
                    <pre className="compare-prompt">{compareA.prompt}</pre>
                  </div>
                  <div className="compare-section">
                    <h4>Settings</h4>
                    <div className="settings-badges">
                      <span className="badge">T: {compareA.settings.temperature}</span>
                      {compareA.settings.use_thinking && <span className="badge cot">🧠 CoT</span>}
                      {compareA.settings.web_search_enabled && <span className="badge web">🔍 Web</span>}
                      {compareA.settings.rag_enabled && <span className="badge rag">🧬 RAG</span>}
                    </div>
                  </div>
                  {compareA.tokens_used && (
                    <div className="compare-metrics">
                      <span>{compareA.tokens_used} tokens</span>
                      {compareA.latency_ms && <span>{(compareA.latency_ms / 1000).toFixed(1)}s</span>}
                    </div>
                  )}
                </div>

                <div className="compare-card">
                  <div className="compare-card-header">
                    <span className="version-name">{compareB.name}</span>
                    <span className="version-date">{formatDate(compareB.created_at)}</span>
                  </div>
                  <div className="compare-section">
                    <h4>Prompt</h4>
                    <pre className="compare-prompt">{compareB.prompt}</pre>
                  </div>
                  <div className="compare-section">
                    <h4>Settings</h4>
                    <div className="settings-badges">
                      <span className="badge">T: {compareB.settings.temperature}</span>
                      {compareB.settings.use_thinking && <span className="badge cot">🧠 CoT</span>}
                      {compareB.settings.web_search_enabled && <span className="badge web">🔍 Web</span>}
                      {compareB.settings.rag_enabled && <span className="badge rag">🧬 RAG</span>}
                    </div>
                  </div>
                  {compareB.tokens_used && (
                    <div className="compare-metrics">
                      <span>{compareB.tokens_used} tokens</span>
                      {compareB.latency_ms && <span>{(compareB.latency_ms / 1000).toFixed(1)}s</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : isLoading ? (
            <div className="loading-state">Loading history...</div>
          ) : versions.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">📜</span>
              <p>No saved prompt versions yet.</p>
              <p className="empty-hint">
                Save prompts from any workspace to track iterations and compare results.
              </p>
            </div>
          ) : (
            <div className="versions-list">
              {compareMode && (
                <div className="compare-instructions">
                  Select two versions to compare. 
                  {compareVersions[0] && !compareVersions[1] && " Select one more version."}
                </div>
              )}
              
              {versions.map((version) => (
                <div
                  key={version.id}
                  className={`version-card ${expandedVersion === version.id ? "expanded" : ""} ${
                    compareMode && (compareVersions[0] === version.id || compareVersions[1] === version.id) ? "selected" : ""
                  }`}
                  onClick={compareMode ? () => handleCompareSelect(version.id) : undefined}
                >
                  <div 
                    className="version-header"
                    onClick={!compareMode ? () => setExpandedVersion(expandedVersion === version.id ? null : version.id) : undefined}
                  >
                    <div className="version-info">
                      <span className="workspace-icon">{getWorkspaceIcon(version.workspace)}</span>
                      {editingName === version.id ? (
                        <input
                          type="text"
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          onBlur={() => handleRename(version.id)}
                          onKeyDown={(e) => e.key === "Enter" && handleRename(version.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="name-input"
                          autoFocus
                        />
                      ) : (
                        <span className="version-name">{version.name}</span>
                      )}
                      {version.parent_id && <span className="forked-badge">🔀 forked</span>}
                    </div>
                    <div className="version-meta">
                      <span className="version-date">{formatDate(version.created_at)}</span>
                      {!compareMode && <span className="expand-icon">{expandedVersion === version.id ? "▼" : "▶"}</span>}
                    </div>
                  </div>

                  <div className="version-preview">
                    {version.prompt.slice(0, 150)}...
                  </div>

                  <div className="version-badges">
                    <span className="badge temp">T: {version.settings.temperature}</span>
                    {version.settings.use_thinking && <span className="badge cot">🧠 CoT</span>}
                    {version.settings.web_search_enabled && <span className="badge web">🔍 Web</span>}
                    {version.settings.rag_enabled && <span className="badge rag">🧬 RAG</span>}
                    {version.tokens_used && <span className="badge tokens">{version.tokens_used} tokens</span>}
                  </div>

                  {expandedVersion === version.id && !compareMode && (
                    <div className="version-details">
                      <div className="detail-section">
                        <h4>Full Prompt</h4>
                        <pre className="full-prompt">{version.prompt}</pre>
                      </div>

                      {version.response_preview && (
                        <div className="detail-section">
                          <h4>Response Preview</h4>
                          <p className="response-preview">{version.response_preview}</p>
                        </div>
                      )}

                      <div className="version-actions">
                        {onLoadPrompt && (
                          <button
                            className="action-btn load"
                            onClick={(e) => {
                              e.stopPropagation();
                              onLoadPrompt(version.prompt, version.settings);
                              onClose();
                            }}
                            type="button"
                          >
                            📤 Load
                          </button>
                        )}
                        <button
                          className="action-btn fork"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFork(version);
                          }}
                          type="button"
                        >
                          🔀 Fork
                        </button>
                        <button
                          className="action-btn rename"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingName(version.id);
                            setNewName(version.name);
                          }}
                          type="button"
                        >
                          ✏️ Rename
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(version.id);
                          }}
                          type="button"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export async function savePromptVersion(
  name: string,
  prompt: string,
  settings: PromptSettings,
  workspace: string,
  responsePreview?: string,
  tokensUsed?: number,
  latencyMs?: number,
  parentId?: string
): Promise<PromptVersion> {
  const res = await fetch(`${API_BASE}/api/prompt-history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      prompt,
      settings,
      workspace,
      response_preview: responsePreview,
      tokens_used: tokensUsed,
      latency_ms: latencyMs,
      parent_id: parentId,
      tags: [],
    }),
  });
  
  if (!res.ok) throw new Error("Failed to save prompt version");
  return res.json();
}
