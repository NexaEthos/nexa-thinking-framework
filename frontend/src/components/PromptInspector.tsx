import { useState, useEffect } from "react";
import { PromptInfo, PromptSection } from "../services/api/prompts";
import "./PromptInspector.css";

interface PromptInspectorProps {
  isOpen: boolean;
  onClose: () => void;
  fetchPromptInfo: () => Promise<PromptInfo>;
  workspaceName: string;
}

function TokenBadge({ tokens }: { tokens: number }) {
  const getColor = (t: number) => {
    if (t < 500) return "token-low";
    if (t < 2000) return "token-medium";
    return "token-high";
  };
  
  return (
    <span className={`token-badge ${getColor(tokens)}`}>
      ~{tokens.toLocaleString()} tokens
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const getIcon = (s: string) => {
    if (s.includes("settings")) return "⚙️";
    if (s.includes("questions")) return "❓";
    if (s === "Dynamic") return "🔄";
    if (s === "System") return "🔧";
    return "📄";
  };
  
  return (
    <span className="source-badge">
      {getIcon(source)} {source}
    </span>
  );
}

function PromptSectionCard({ section, expanded, onToggle }: { 
  section: PromptSection; 
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`prompt-section-card ${expanded ? "expanded" : ""}`}>
      <div className="prompt-section-header" onClick={onToggle}>
        <span className="prompt-section-label">{section.label}</span>
        <div className="prompt-section-meta">
          <TokenBadge tokens={section.token_estimate} />
          <SourceBadge source={section.source} />
          <span className="expand-icon">{expanded ? "▼" : "▶"}</span>
        </div>
      </div>
      {expanded && (
        <div className="prompt-section-content">
          <pre>{section.content}</pre>
        </div>
      )}
    </div>
  );
}

export default function PromptInspector({ 
  isOpen, 
  onClose, 
  fetchPromptInfo,
  workspaceName 
}: PromptInspectorProps) {
  const [promptInfo, setPromptInfo] = useState<PromptInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set([0]));

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(null);
      fetchPromptInfo()
        .then(setPromptInfo)
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }
  }, [isOpen, fetchPromptInfo]);

  const toggleSection = (index: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const expandAll = () => {
    if (!promptInfo) return;
    const allIndices = new Set<number>();
    allIndices.add(-1);
    promptInfo.context_sections.forEach((_, i) => allIndices.add(i));
    setExpandedSections(allIndices);
  };

  const collapseAll = () => {
    setExpandedSections(new Set());
  };

  if (!isOpen) return null;

  return (
    <div className="prompt-inspector-overlay" onClick={onClose}>
      <div className="prompt-inspector-modal" onClick={(e) => e.stopPropagation()}>
        <div className="prompt-inspector-header">
          <div className="header-title">
            <span className="header-icon">🔍</span>
            <h2>Prompt Inspector</h2>
            <span className="workspace-badge">{workspaceName}</span>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        {loading && (
          <div className="prompt-inspector-loading">
            <span className="spinner">⚙️</span> Loading prompt information...
          </div>
        )}

        {error && (
          <div className="prompt-inspector-error">
            <span>⚠️</span> {error}
          </div>
        )}

        {promptInfo && !loading && (
          <>
            <div className="prompt-inspector-summary">
              <div className="summary-stats">
                <div className="stat">
                  <span className="stat-value">{promptInfo.total_token_estimate.toLocaleString()}</span>
                  <span className="stat-label">Est. Total Tokens</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{promptInfo.context_sections.length + 1}</span>
                  <span className="stat-label">Prompt Sections</span>
                </div>
                <div className="stat features">
                  <span className="stat-label">Active Features</span>
                  <div className="feature-tags">
                    {promptInfo.active_features.map((f, i) => (
                      <span key={i} className="feature-tag">{f}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="summary-toggles">
                <span className={`toggle-indicator ${promptInfo.rag_enabled ? "on" : "off"}`}>
                  🧬 RAG {promptInfo.rag_enabled ? "ON" : "OFF"}
                </span>
                <span className={`toggle-indicator ${promptInfo.web_search_enabled ? "on" : "off"}`}>
                  🔍 Web Search {promptInfo.web_search_enabled ? "ON" : "OFF"}
                </span>
              </div>
            </div>

            <div className="prompt-inspector-actions">
              <button className="action-btn" onClick={expandAll}>Expand All</button>
              <button className="action-btn" onClick={collapseAll}>Collapse All</button>
            </div>

            <div className="prompt-inspector-content">
              <div className="prompt-category">
                <h3>📋 System Prompt</h3>
                <PromptSectionCard 
                  section={promptInfo.system_prompt}
                  expanded={expandedSections.has(-1)}
                  onToggle={() => toggleSection(-1)}
                />
              </div>

              <div className="prompt-category">
                <h3>📦 Context & Configuration ({promptInfo.context_sections.length} sections)</h3>
                {promptInfo.context_sections.map((section, index) => (
                  <PromptSectionCard 
                    key={index}
                    section={section}
                    expanded={expandedSections.has(index)}
                    onToggle={() => toggleSection(index)}
                  />
                ))}
              </div>

              {promptInfo.user_message && (
                <div className="prompt-category">
                  <h3>💬 User Message</h3>
                  <PromptSectionCard 
                    section={promptInfo.user_message}
                    expanded={expandedSections.has(999)}
                    onToggle={() => toggleSection(999)}
                  />
                </div>
              )}
            </div>

            <div className="prompt-inspector-footer">
              <div className="footer-info">
                <span className="info-text">
                  💡 Token estimates are approximate (~4 chars/token). Actual usage may vary by model.
                </span>
              </div>
              <button className="btn-primary" onClick={onClose}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
