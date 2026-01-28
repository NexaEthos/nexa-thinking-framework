import { useState, useEffect, useCallback } from "react";
import { AgentId } from "../types/agents";
import {
  getTelemetrySession,
  exportTelemetrySession,
  resetTelemetrySession,
  type TelemetrySessionSummary,
} from "../services/api";
import { wsService } from "../services/websocket";

type ExtendedAgentId = AgentId | "cot";

const AGENT_INFO: Record<ExtendedAgentId, { emoji: string; name: string }> = {
  pm: { emoji: "👔", name: "Project Manager" },
  identity: { emoji: "🎯", name: "Identity" },
  definition: { emoji: "📐", name: "Definition" },
  resources: { emoji: "🧰", name: "Resources" },
  execution: { emoji: "📋", name: "Execution" },
  cot: { emoji: "🔗", name: "Chain of Thought" },
};

interface TelemetryPanelProps {
  visible?: boolean;
  onClose?: () => void;
}

export function TelemetryBadge() {
  const [summary, setSummary] = useState<TelemetrySessionSummary | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const loadSummary = useCallback(async () => {
    try {
      const data = await getTelemetrySession();
      setSummary(data);
    } catch (error) {
      console.error("Failed to load telemetry summary:", error);
    }
  }, []);

  useEffect(() => {
    loadSummary();

    const unsubscribe = wsService.subscribe((message) => {
      if (message.type === "metrics_update") {
        loadSummary();
      }
    });

    const interval = setInterval(loadSummary, 10000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [loadSummary]);

  const totalTokens = (summary?.total_input_tokens ?? 0) + (summary?.total_output_tokens ?? 0);
  const totalCalls = summary?.total_calls ?? 0;
  const costDisplay = summary?.estimated_cost !== null && summary?.estimated_cost !== undefined
    ? `$${summary.estimated_cost.toFixed(4)}`
    : null;

  return (
    <>
      <button
        className={`telemetry-badge ${totalCalls === 0 ? "empty" : ""}`}
        onClick={() => setIsExpanded(!isExpanded)}
        title="Session telemetry"
      >
        <span className="badge-icon">📊</span>
        <span className="badge-tokens">{totalTokens.toLocaleString()} tok</span>
        {costDisplay && <span className="badge-cost">{costDisplay}</span>}
      </button>

      {isExpanded && (
        <TelemetryPanel
          visible={isExpanded}
          onClose={() => setIsExpanded(false)}
        />
      )}

      <style>{`
        .telemetry-badge {
          position: fixed;
          top: 1rem;
          right: 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: var(--card-bg);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-full);
          box-shadow: var(--shadow-md);
          cursor: pointer;
          z-index: 100;
          transition: all 0.15s ease;
        }
        .telemetry-badge:hover {
          border-color: var(--primary);
          background: var(--primary-light);
        }
        .telemetry-badge.empty {
          opacity: 0.6;
        }
        .telemetry-badge.empty:hover {
          opacity: 1;
        }
        .badge-icon {
          font-size: 1rem;
        }
        .badge-tokens {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .badge-cost {
          font-size: 0.6875rem;
          color: var(--text-muted);
          padding-left: 0.5rem;
          border-left: 1px solid var(--border-color);
        }
      `}</style>
    </>
  );
}

export function TelemetryPanel({ visible, onClose }: TelemetryPanelProps) {
  const [summary, setSummary] = useState<TelemetrySessionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTelemetrySession();
      setSummary(data);
    } catch (error) {
      console.error("Failed to load telemetry summary:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      loadSummary();
    }
  }, [visible, loadSummary]);

  async function handleExport() {
    setExporting(true);
    try {
      const data = await exportTelemetrySession();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `session-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  }

  async function handleClear() {
    if (!confirm("Clear all telemetry data for this session?")) return;
    try {
      await resetTelemetrySession();
      await loadSummary();
    } catch (err) {
      console.error("Clear failed:", err);
    }
  }

  if (!visible) return null;

  const totalTokens = (summary?.total_input_tokens ?? 0) + (summary?.total_output_tokens ?? 0);
  const durationMinutes = ((summary?.session_duration ?? 0) / 60000).toFixed(1);

  return (
    <div className="telemetry-overlay" onClick={onClose}>
      <div className="telemetry-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <h3>📊 Session Telemetry</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div className="panel-loading">
            <div className="spinner" />
            <p>Loading telemetry...</p>
          </div>
        ) : summary ? (
          <div className="panel-content">
            <div className="summary-grid">
              <div className="summary-card">
                <span className="summary-label">Total Calls</span>
                <span className="summary-value">{summary.total_calls}</span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Input Tokens</span>
                <span className="summary-value">{summary.total_input_tokens.toLocaleString()}</span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Output Tokens</span>
                <span className="summary-value">{summary.total_output_tokens.toLocaleString()}</span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Total Tokens</span>
                <span className="summary-value highlight">{totalTokens.toLocaleString()}</span>
              </div>
              <div className="summary-card">
                <span className="summary-label">Session Duration</span>
                <span className="summary-value">{durationMinutes} min</span>
              </div>
              {summary.estimated_cost !== null && (
                <div className="summary-card">
                  <span className="summary-label">Estimated Cost</span>
                  <span className="summary-value cost">${summary.estimated_cost.toFixed(4)}</span>
                </div>
              )}
            </div>

            <div className="agents-breakdown">
              <h4>Per-Agent Breakdown</h4>
              <table className="breakdown-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Calls</th>
                    <th>Input</th>
                    <th>Output</th>
                    <th>Avg Latency</th>
                    <th>Avg tok/s</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.agents).map(([id, stats]) => {
                    const agentInfo = AGENT_INFO[id as ExtendedAgentId];
                    if (!stats.calls) return null;
                    return (
                      <tr key={id}>
                        <td>
                          <span className="agent-cell">
                            <span className="agent-emoji">{agentInfo?.emoji || "🤖"}</span>
                            <span>{agentInfo?.name ?? id}</span>
                          </span>
                        </td>
                        <td>{stats.calls}</td>
                        <td>{stats.input_tokens.toLocaleString()}</td>
                        <td>{stats.output_tokens.toLocaleString()}</td>
                        <td>{stats.avg_latency_ms.toFixed(0)}ms</td>
                        <td>{stats.avg_tokens_per_sec.toFixed(1)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="panel-actions">
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting ? "Exporting..." : "📥 Export JSON"}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={handleClear}>
                🗑️ Clear
              </button>
              <button className="btn btn-ghost btn-sm" onClick={loadSummary}>
                🔄 Refresh
              </button>
            </div>
          </div>
        ) : (
          <div className="panel-empty">
            <p>No telemetry data yet. Start chatting to generate metrics.</p>
          </div>
        )}
      </div>

      <style>{`
        .telemetry-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
        }
        .telemetry-panel {
          background: var(--card-bg);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          box-shadow: var(--shadow-lg);
          width: 90%;
          max-width: 700px;
          max-height: 80vh;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .telemetry-panel .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid var(--border-color);
        }
        .telemetry-panel .panel-header h3 {
          margin: 0;
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .panel-loading, .panel-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 3rem;
          color: var(--text-muted);
        }
        .panel-content {
          padding: 1.25rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
          gap: 0.75rem;
        }
        .summary-card {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding: 0.75rem;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-sm);
        }
        .summary-label {
          font-size: 0.6875rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }
        .summary-value {
          font-size: 1.125rem;
          font-weight: 600;
          color: var(--text-primary);
        }
        .summary-value.highlight {
          color: var(--primary);
        }
        .summary-value.cost {
          color: var(--success);
        }
        .agents-breakdown h4 {
          margin: 0 0 0.75rem 0;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text-secondary);
        }
        .breakdown-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.8125rem;
        }
        .breakdown-table th,
        .breakdown-table td {
          padding: 0.5rem 0.75rem;
          text-align: left;
          border-bottom: 1px solid var(--border-color);
          color: var(--text-secondary);
        }
        .breakdown-table th {
          background: var(--bg-tertiary);
          font-weight: 600;
          font-size: 0.6875rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--text-muted);
        }
        .agent-cell {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .agent-emoji {
          font-size: 1rem;
        }
        .panel-actions {
          display: flex;
          gap: 0.5rem;
          padding-top: 0.5rem;
          border-top: 1px solid var(--border-color);
        }
      `}</style>
    </div>
  );
}

export default TelemetryBadge;
