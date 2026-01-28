import { useState, useEffect } from "react";
import "./StatusIndicators.css";
import { API_BASE_URL as API_BASE } from "../services/api/config";

interface LLMStatus {
  connected: boolean;
  model: string;
  server_type: string;
}

interface QdrantStatus {
  enabled: boolean;
  connected: boolean;
  collections: number;
}

export default function StatusIndicators() {
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null);
  const [qdrantStatus, setQdrantStatus] = useState<QdrantStatus | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const llmRes = await fetch(`${API_BASE}/api/settings/llm/status`);
        if (llmRes.ok) {
          const data = await llmRes.json();
          setLlmStatus({
            connected: data.connected === true,
            model: data.model || "Unknown",
            server_type: data.server_type || "Unknown",
          });
        } else {
          setLlmStatus({ connected: false, model: "", server_type: "" });
        }
      } catch {
        setLlmStatus({ connected: false, model: "", server_type: "" });
      }

      try {
        const qdrantRes = await fetch(`${API_BASE}/api/vectors/status`);
        if (qdrantRes.ok) {
          const data = await qdrantRes.json();
          setQdrantStatus({
            enabled: data.enabled,
            connected: data.enabled && !data.error,
            collections: data.collections?.length || 0,
          });
        } else {
          setQdrantStatus({ enabled: false, connected: false, collections: 0 });
        }
      } catch {
        setQdrantStatus({ enabled: false, connected: false, collections: 0 });
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const llmColor = llmStatus?.connected ? "status-green" : "status-red";
  const qdrantColor = qdrantStatus?.connected
    ? "status-green"
    : qdrantStatus?.enabled
      ? "status-yellow"
      : "status-gray";

  return (
    <div className="status-indicators">
      <button
        className="status-pill"
        onClick={() => setShowDetails(!showDetails)}
        title="Click to see connection details"
      >
        <span className="status-item">
          <span className={`status-dot ${llmColor}`} />
          <span className="status-label">LLM</span>
        </span>
        <span className="status-divider" />
        <span className="status-item">
          <span className={`status-dot ${qdrantColor}`} />
          <span className="status-label">Qdrant</span>
        </span>
      </button>

      {showDetails && (
        <>
          <div className="status-overlay" onClick={() => setShowDetails(false)} />
          <div className="status-dropdown">
            <div className="status-section">
              <h4>
                <span className={`status-dot ${llmColor}`} />
                LLM Server
              </h4>
              {llmStatus?.connected ? (
                <div className="status-details">
                  <div className="status-row">
                    <span className="status-key">Model</span>
                    <span className="status-value">{llmStatus.model}</span>
                  </div>
                  <div className="status-row">
                    <span className="status-key">Type</span>
                    <span className="status-value">{llmStatus.server_type}</span>
                  </div>
                  <div className="status-row">
                    <span className="status-key">Status</span>
                    <span className="status-value connected">Connected</span>
                  </div>
                </div>
              ) : (
                <div className="status-error">
                  <span>⚠️</span> Not connected
                </div>
              )}
            </div>

            <div className="status-section">
              <h4>
                <span className={`status-dot ${qdrantColor}`} />
                Qdrant (RAG)
              </h4>
              {qdrantStatus?.enabled ? (
                qdrantStatus.connected ? (
                  <div className="status-details">
                    <div className="status-row">
                      <span className="status-key">Collections</span>
                      <span className="status-value">{qdrantStatus.collections}</span>
                    </div>
                    <div className="status-row">
                      <span className="status-key">Status</span>
                      <span className="status-value connected">Connected</span>
                    </div>
                  </div>
                ) : (
                  <div className="status-error">
                    <span>⚠️</span> Enabled but not connected
                  </div>
                )
              ) : (
                <div className="status-disabled">
                  <span>○</span> Disabled
                </div>
              )}
            </div>

            <div className="status-footer">
              <span className="privacy-badge">🔒 Local Only</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
