import { useState, useCallback, useEffect } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CanvasSectionId } from "../types/agents";
import { ChatMessage } from "../types";
import { exportTelemetrySession, importTelemetrySession, getTelemetryCallLog, TelemetryCallMetrics } from "../services/api";

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

const SECTION_INFO: Record<CanvasSectionId, { emoji: string; title: string }> = {
  identity: { emoji: "🎯", title: "Identity" },
  definition: { emoji: "📐", title: "Definition" },
  resources: { emoji: "🧰", title: "Resources" },
  execution: { emoji: "📋", title: "Execution" },
};

const SECTION_ORDER: CanvasSectionId[] = ["identity", "definition", "resources", "execution"];

interface LocalCanvas {
  identity: { id: string; title: string; content: string; agent_id: string; last_updated: string | null };
  definition: { id: string; title: string; content: string; agent_id: string; last_updated: string | null };
  resources: { id: string; title: string; content: string; agent_id: string; last_updated: string | null };
  execution: { id: string; title: string; content: string; agent_id: string; last_updated: string | null };
}

interface FullContextViewProps {
  canvas: LocalCanvas | null;
  conversation: ChatMessage[];
  onClose: () => void;
}

type ViewTab = "context" | "trace";

export default function FullContextView({ canvas, conversation, onClose }: FullContextViewProps) {
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exportFormat, setExportFormat] = useState<"json" | "markdown">("markdown");
  const [activeTab, setActiveTab] = useState<ViewTab>("context");
  const [callLog, setCallLog] = useState<TelemetryCallMetrics[]>([]);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [expandedCalls, setExpandedCalls] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (activeTab === "trace") {
      setLoadingTrace(true);
      getTelemetryCallLog()
        .then(setCallLog)
        .catch(console.error)
        .finally(() => setLoadingTrace(false));
    }
  }, [activeTab]);

  const toggleCallExpanded = (index: number) => {
    setExpandedCalls((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    const time = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const ms = date.getMilliseconds().toString().padStart(3, "0");
    return `${time}.${ms}`;
  };

  const generateMarkdown = useCallback(() => {
    let md = "# Project Context\n\n";
    md += `_Generated: ${new Date().toLocaleString()}_\n\n`;
    md += "---\n\n";

    md += "## Canvas\n\n";
    if (canvas) {
      for (const sectionId of SECTION_ORDER) {
        const section = canvas[sectionId];
        const info = SECTION_INFO[sectionId];
        md += `### ${info.emoji} ${info.title}\n\n`;
        if (section.content.trim()) {
          md += section.content + "\n\n";
        } else {
          md += "_No content yet_\n\n";
        }
      }
    } else {
      md += "_No canvas data_\n\n";
    }

    md += "---\n\n";
    md += "## Conversation\n\n";

    if (conversation.length > 0) {
      for (const msg of conversation) {
        const role = msg.role === "user" ? "**User**" : "**Assistant**";
        const time = new Date(msg.timestamp).toLocaleTimeString();
        md += `${role} _(${time})_:\n\n`;
        md += msg.content + "\n\n";
        md += "---\n\n";
      }
    } else {
      md += "_No conversation yet_\n\n";
    }

    return md;
  }, [canvas, conversation]);

  async function handleExport() {
    setExporting(true);
    try {
      if (exportFormat === "json") {
        const data = await exportTelemetrySession();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `project-${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const markdown = generateMarkdown();
        const blob = new Blob([markdown], { type: "text/markdown" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `project-${new Date().toISOString().split("T")[0]}.md`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  }

  async function handleImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      setImporting(true);
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await importTelemetrySession(data);
        window.location.reload();
      } catch (err) {
        console.error("Import failed:", err);
        alert("Failed to import session. Make sure the file is a valid JSON export.");
      } finally {
        setImporting(false);
      }
    };
    input.click();
  }

  const markdown = generateMarkdown();

  return (
    <div className="full-context-view">
      <div className="view-header">
        <h3>📄 Full Context View</h3>
        <div className="header-actions">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as "json" | "markdown")}
            className="format-select"
          >
            <option value="markdown">Markdown (.md)</option>
            <option value="json">JSON (.json)</option>
          </select>
          <button
            className="btn btn-secondary btn-sm"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? "Exporting..." : "📥 Export"}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleImport}
            disabled={importing}
          >
            {importing ? "Importing..." : "📤 Import JSON"}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕ Close
          </button>
        </div>
      </div>

      <div className="view-tabs">
        <button
          className={`tab-btn ${activeTab === "context" ? "active" : ""}`}
          onClick={() => setActiveTab("context")}
        >
          📝 Context
        </button>
        <button
          className={`tab-btn ${activeTab === "trace" ? "active" : ""}`}
          onClick={() => setActiveTab("trace")}
        >
          🔍 Trace Report
        </button>
      </div>

      <div className="view-content">
        {activeTab === "context" ? (
          <div className="markdown-preview">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {markdown}
            </ReactMarkdown>
          </div>
        ) : (
          <div className="trace-report">
            <div className="trace-header">
              <h4>API Call Trace</h4>
              <span className="trace-count">{callLog.length} calls</span>
            </div>
            {loadingTrace ? (
              <div className="trace-loading">Loading trace data...</div>
            ) : callLog.length === 0 ? (
              <div className="trace-empty">No API calls recorded yet.</div>
            ) : (
              <div className="trace-list">
                {callLog.map((call, idx) => (
                  <div key={idx} className={`trace-call ${call.success ? "success" : "error"}`}>
                    <div className="trace-call-header" onClick={() => toggleCallExpanded(idx)}>
                      <span className="trace-expand">{expandedCalls.has(idx) ? "▼" : "▶"}</span>
                      <span className="trace-time">{formatTimestamp(call.timestamp)}</span>
                      <span className={`trace-status ${call.success ? "ok" : "err"}`}>
                        {call.success ? "✓" : "✗"}
                      </span>
                      <span className="trace-agent">{call.agent_id}</span>
                      <span className="trace-model">{call.model}</span>
                      <span className="trace-tokens">
                        {call.input_tokens}→{call.output_tokens} tok
                      </span>
                      <span className="trace-latency">{call.latency_ms}ms</span>
                    </div>
                    {expandedCalls.has(idx) && (
                      <div className="trace-call-details">
                        <div className="trace-detail-row">
                          <strong>Endpoint:</strong> {call.endpoint || "N/A"}
                        </div>
                        <div className="trace-detail-row">
                          <strong>Duration:</strong> {call.duration_ms}ms |{" "}
                          <strong>Tokens/sec:</strong>{" "}
                          {call.duration_ms > 0
                            ? ((call.output_tokens / call.duration_ms) * 1000).toFixed(1)
                            : "N/A"}
                        </div>
                        {call.error && (
                          <div className="trace-error">
                            <strong>Error:</strong> {call.error}
                          </div>
                        )}
                        <div className="trace-section">
                          <strong>Request Messages:</strong>
                          {call.request_messages ? (
                            <div className="trace-messages">
                              {call.request_messages.map((msg, mIdx) => {
                                const displayRole = msg.role === "user" ? "PROMPT" : msg.role.toUpperCase();
                                return (
                                  <div key={mIdx} className={`trace-message ${msg.role}`}>
                                    <span className="msg-role">{displayRole}</span>
                                    <pre className="msg-content">{msg.content}</pre>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="trace-na">Not captured</span>
                          )}
                        </div>
                        <div className="trace-section">
                          <strong>Response:</strong>
                          {call.response_content ? (
                            <pre className="trace-response">{call.response_content}</pre>
                          ) : (
                            <span className="trace-na">Not captured</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .full-context-view {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: white;
          border-radius: var(--radius-lg);
          overflow: hidden;
        }
        .view-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1rem 1.25rem;
          border-bottom: 1px solid var(--gray-200);
          background: var(--gray-50);
        }
        .view-header h3 {
          margin: 0;
          font-size: 1rem;
          font-weight: 600;
        }
        .header-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .format-select {
          padding: 0.375rem 0.75rem;
          border: 1px solid var(--gray-300);
          border-radius: var(--radius-sm);
          font-size: 0.8125rem;
          background: white;
        }
        .view-content {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
        }
        .markdown-preview {
          max-width: 800px;
          margin: 0 auto;
          font-size: 0.9375rem;
          line-height: 1.7;
          color: var(--gray-700);
        }
        .markdown-preview h1 {
          font-size: 1.5rem;
          margin: 0 0 1rem 0;
          color: var(--gray-800);
          border-bottom: 2px solid var(--gray-200);
          padding-bottom: 0.5rem;
        }
        .markdown-preview h2 {
          font-size: 1.25rem;
          margin: 1.5rem 0 1rem 0;
          color: var(--gray-800);
        }
        .markdown-preview h3 {
          font-size: 1.0625rem;
          margin: 1rem 0 0.5rem 0;
          color: var(--gray-700);
        }
        .markdown-preview p {
          margin: 0 0 1rem 0;
        }
        .markdown-preview em {
          color: var(--gray-500);
        }
        .markdown-preview strong {
          color: var(--gray-800);
        }
        .markdown-preview hr {
          border: none;
          border-top: 1px solid var(--gray-200);
          margin: 1.5rem 0;
        }
        .markdown-preview ul,
        .markdown-preview ol {
          margin: 0 0 1rem 0;
          padding-left: 1.5rem;
        }
        .markdown-preview li {
          margin: 0.25rem 0;
        }
        .markdown-preview code {
          background: var(--gray-100);
          padding: 0.125rem 0.375rem;
          border-radius: 3px;
          font-size: 0.875rem;
        }
        .markdown-preview pre {
          background: var(--gray-100);
          padding: 1rem;
          border-radius: var(--radius-sm);
          overflow-x: auto;
          margin: 0 0 1rem 0;
        }
        .markdown-preview pre code {
          padding: 0;
          background: none;
        }
        .markdown-preview blockquote {
          margin: 0 0 1rem 0;
          padding-left: 1rem;
          border-left: 3px solid var(--gray-300);
          color: var(--gray-600);
          font-style: italic;
        }
        .markdown-preview table {
          width: 100%;
          border-collapse: collapse;
          margin: 0 0 1rem 0;
          font-size: 0.875rem;
        }
        .markdown-preview th,
        .markdown-preview td {
          padding: 0.5rem 0.75rem;
          border: 1px solid var(--gray-200);
          text-align: left;
        }
        .markdown-preview th {
          background: var(--gray-50);
          font-weight: 600;
        }

        /* Tab styles */
        .view-tabs {
          display: flex;
          gap: 0;
          border-bottom: 1px solid var(--gray-200);
          background: var(--gray-50);
          padding: 0 1rem;
        }
        .tab-btn {
          padding: 0.75rem 1.25rem;
          border: none;
          background: none;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--gray-600);
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: all 0.15s;
        }
        .tab-btn:hover {
          color: var(--gray-800);
          background: var(--gray-100);
        }
        .tab-btn.active {
          color: var(--primary-600);
          border-bottom-color: var(--primary-600);
        }

        /* Trace Report styles */
        .trace-report {
          max-width: 1200px;
          margin: 0 auto;
        }
        .trace-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1rem;
        }
        .trace-header h4 {
          margin: 0;
          font-size: 1.125rem;
          font-weight: 600;
        }
        .trace-count {
          font-size: 0.8125rem;
          color: var(--gray-500);
          background: var(--gray-100);
          padding: 0.25rem 0.625rem;
          border-radius: 1rem;
        }
        .trace-loading, .trace-empty {
          text-align: center;
          color: var(--gray-500);
          padding: 2rem;
        }
        .trace-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .trace-call {
          border: 1px solid var(--gray-200);
          border-radius: var(--radius-sm);
          background: white;
          overflow: hidden;
        }
        .trace-call.error {
          border-color: var(--error-300);
        }
        .trace-call-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.625rem 0.875rem;
          cursor: pointer;
          background: var(--gray-50);
          font-size: 0.8125rem;
          font-family: monospace;
        }
        .trace-call-header:hover {
          background: var(--gray-100);
        }
        .trace-expand {
          font-size: 0.625rem;
          color: var(--gray-400);
          width: 1rem;
        }
        .trace-time {
          color: var(--gray-600);
          min-width: 100px;
        }
        .trace-status.ok {
          color: var(--success-600);
        }
        .trace-status.err {
          color: var(--error-600);
        }
        .trace-agent {
          font-weight: 600;
          color: var(--primary-700);
          min-width: 80px;
        }
        .trace-model {
          color: var(--gray-500);
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .trace-tokens {
          color: var(--gray-600);
          min-width: 90px;
          text-align: right;
        }
        .trace-latency {
          color: var(--gray-500);
          min-width: 60px;
          text-align: right;
        }
        .trace-call-details {
          padding: 1rem;
          border-top: 1px solid var(--gray-200);
          font-size: 0.8125rem;
          background: white;
        }
        .trace-detail-row {
          margin-bottom: 0.5rem;
          color: var(--gray-700);
        }
        .trace-detail-row strong {
          color: var(--gray-500);
          font-weight: 500;
        }
        .trace-error {
          background: var(--error-50);
          color: var(--error-700);
          padding: 0.5rem 0.75rem;
          border-radius: var(--radius-sm);
          margin-bottom: 0.75rem;
        }
        .trace-section {
          margin-top: 0.75rem;
        }
        .trace-section strong {
          display: block;
          color: var(--gray-500);
          font-weight: 500;
          margin-bottom: 0.375rem;
        }
        .trace-messages {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .trace-message {
          border: 1px solid var(--gray-200);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }
        .trace-message.system {
          border-color: var(--info-200);
        }
        .trace-message.user {
          border-color: var(--primary-200);
        }
        .trace-message.assistant {
          border-color: var(--success-200);
        }
        .msg-role {
          display: block;
          font-size: 0.6875rem;
          font-weight: 600;
          text-transform: uppercase;
          padding: 0.25rem 0.5rem;
          background: var(--gray-100);
        }
        .trace-message.system .msg-role {
          background: var(--info-100);
          color: var(--info-700);
        }
        .trace-message.user .msg-role {
          background: var(--primary-100);
          color: var(--primary-700);
        }
        .trace-message.assistant .msg-role {
          background: var(--success-100);
          color: var(--success-700);
        }
        .msg-content {
          margin: 0;
          padding: 0.5rem;
          font-size: 0.75rem;
          line-height: 1.5;
          max-height: 200px;
          overflow-y: auto;
          background: white;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .trace-response {
          margin: 0;
          padding: 0.75rem;
          font-size: 0.75rem;
          line-height: 1.5;
          max-height: 300px;
          overflow-y: auto;
          background: var(--gray-50);
          border: 1px solid var(--gray-200);
          border-radius: var(--radius-sm);
          white-space: pre-wrap;
          word-break: break-word;
        }
        .trace-na {
          color: var(--gray-400);
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
