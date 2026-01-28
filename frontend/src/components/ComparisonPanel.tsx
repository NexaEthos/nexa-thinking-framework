import { useState, useCallback, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  runComparison,
  ComparisonConfig,
  ComparisonResponse,
  ComparisonResult,
  WebSource,
} from "../services/api/comparison";
import { Preset, getPresetsByWorkspace } from "../services/api/presets";
import "./ComparisonPanel.css";

interface ComparisonPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function WebSourcesSection({ sources }: { sources: WebSource[] }) {
  const [expanded, setExpanded] = useState(false);

  if (sources.length === 0) return null;

  return (
    <div className="web-sources-section">
      <button
        className="web-sources-toggle"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <span>🔍 {sources.length} Web Source{sources.length !== 1 ? "s" : ""}</span>
        <span className="toggle-arrow">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="web-sources-list">
          {sources.map((source, idx) => (
            <div key={idx} className="web-source-item">
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="source-title">
                {source.title}
              </a>
              <p className="source-snippet">{source.snippet}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultCard({ result }: { result: ComparisonResult }) {
  return (
    <div className={`comparison-result-card ${result.error ? "error" : ""}`}>
      <div className="result-header">
        <span className="result-label">{result.label}</span>
      </div>

      {result.error ? (
        <div className="result-error">
          <span>⚠️</span> {result.error}
        </div>
      ) : (
        <>
          <div className="result-metrics">
            <div className="metric">
              <span className="metric-value">{result.tokens_used.toLocaleString()}</span>
              <span className="metric-label">tokens</span>
            </div>
            <div className="metric">
              <span className="metric-value">{(result.latency_ms / 1000).toFixed(1)}s</span>
              <span className="metric-label">latency</span>
            </div>
            {result.steps_count > 0 && (
              <div className="metric">
                <span className="metric-value">{result.steps_count}</span>
                <span className="metric-label">steps</span>
              </div>
            )}
            {result.web_sources.length > 0 && (
              <div className="metric">
                <span className="metric-value">{result.web_sources.length}</span>
                <span className="metric-label">sources</span>
              </div>
            )}
          </div>

          <WebSourcesSection sources={result.web_sources} />

          <div className="result-response">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.response}</ReactMarkdown>
          </div>
        </>
      )}
    </div>
  );
}

function ConfigurationBox({
  presets,
  selectedPreset,
  onSelect,
  label,
  temperature,
  onTemperatureChange,
}: {
  presets: Preset[];
  selectedPreset: Preset | null;
  onSelect: (preset: Preset) => void;
  label: string;
  temperature: number;
  onTemperatureChange: (value: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="preset-dropdown-container">
      <label className="preset-dropdown-label">{label}</label>
      <button
        className="preset-dropdown-trigger"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        {selectedPreset ? (
          <>
            <span className="preset-selected-icon">{selectedPreset.icon}</span>
            <span className="preset-selected-name">{selectedPreset.name}</span>
          </>
        ) : (
          <span className="preset-placeholder">Select a preset...</span>
        )}
        <span className="preset-dropdown-arrow">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <>
          <div className="preset-dropdown-overlay" onClick={() => setIsOpen(false)} />
          <div className="preset-dropdown-menu">
            {presets.map((preset) => (
              <button
                key={preset.id}
                className={`preset-dropdown-item ${selectedPreset?.id === preset.id ? "selected" : ""}`}
                onClick={() => {
                  onSelect(preset);
                  setIsOpen(false);
                }}
              >
                <span className="preset-item-icon">{preset.icon}</span>
                <div className="preset-item-info">
                  <span className="preset-item-name">{preset.name}</span>
                  <span className="preset-item-desc">{preset.description}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {selectedPreset && (
        <>
          <div className="preset-selected-badges">
            {selectedPreset.settings.use_thinking && (
              <span className="config-badge cot">🧠 CoT</span>
            )}
            {selectedPreset.settings.web_search_enabled && (
              <span className="config-badge web">🔍 Web</span>
            )}
            {selectedPreset.settings.rag_enabled && (
              <span className="config-badge rag">🧬 RAG</span>
            )}
          </div>

          <div className="temperature-control">
            <div className="temperature-header">
              <label htmlFor={`temp-${label.replace(/\s/g, "-")}`}>Temperature</label>
              <span className="temperature-value">{temperature.toFixed(2)}</span>
            </div>
            <input
              id={`temp-${label.replace(/\s/g, "-")}`}
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={temperature}
              onChange={(e) => onTemperatureChange(parseFloat(e.target.value))}
              className="temperature-slider"
              aria-label={`${label} temperature`}
            />
            <div className="temperature-labels">
              <span>Precise</span>
              <span>Creative</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function ComparisonPanel({ isOpen, onClose }: ComparisonPanelProps) {
  const [query, setQuery] = useState("");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetA, setPresetA] = useState<Preset | null>(null);
  const [presetB, setPresetB] = useState<Preset | null>(null);
  const [temperatureA, setTemperatureA] = useState(0.7);
  const [temperatureB, setTemperatureB] = useState(0.7);
  const [results, setResults] = useState<ComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configCollapsed, setConfigCollapsed] = useState(false);

  useEffect(() => {
    const loadPresets = async () => {
      try {
        const data = await getPresetsByWorkspace("chain_of_thought");
        setPresets(data);
        const thinking = data.find((p) => p.settings.use_thinking);
        const direct = data.find((p) => !p.settings.use_thinking);
        if (thinking) {
          setPresetA(thinking);
          setTemperatureA(thinking.settings.temperature);
        }
        if (direct) {
          setPresetB(direct);
          setTemperatureB(direct.settings.temperature);
        }
      } catch {
        setPresets([]);
      }
    };
    if (isOpen) loadPresets();
  }, [isOpen]);

  const handleSelectPresetA = (preset: Preset) => {
    setPresetA(preset);
    setTemperatureA(preset.settings.temperature);
  };

  const handleSelectPresetB = (preset: Preset) => {
    setPresetB(preset);
    setTemperatureB(preset.settings.temperature);
  };

  const configFromPreset = (preset: Preset, temperature: number): ComparisonConfig => ({
    label: preset.name,
    temperature,
    use_thinking: preset.settings.use_thinking,
    web_search_enabled: preset.settings.web_search_enabled,
    rag_enabled: preset.settings.rag_enabled,
  });

  const handleRunComparison = useCallback(async () => {
    if (!query.trim() || !presetA || !presetB) return;

    setIsLoading(true);
    setError(null);
    setResults(null);

    try {
      const response = await runComparison(
        query,
        configFromPreset(presetA, temperatureA),
        configFromPreset(presetB, temperatureB)
      );
      setResults(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Comparison failed");
    } finally {
      setIsLoading(false);
    }
  }, [query, presetA, presetB, temperatureA, temperatureB]);

  if (!isOpen) return null;

  return (
    <div className="comparison-panel-overlay" onClick={onClose}>
      <div className="comparison-panel-modal" onClick={(e) => e.stopPropagation()}>
        <div className="comparison-header">
          <div className="header-title">
            <span className="header-icon">⚖️</span>
            <h2>A/B Comparison Mode</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={`comparison-config-section ${configCollapsed ? "collapsed" : ""}`}>
          <button
            className="config-collapse-toggle"
            onClick={() => setConfigCollapsed(!configCollapsed)}
            type="button"
          >
            <span className="collapse-icon">{configCollapsed ? "▼" : "▲"}</span>
            <span>{configCollapsed ? "Show Configuration" : "Hide Configuration"}</span>
          </button>

          {!configCollapsed && (
            <>
              <div className="config-input">
                <label>Test Prompt</label>
                <textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Enter a prompt to compare different configurations..."
                  rows={3}
                />
                <button
                  className="quick-prompt-btn"
                  onClick={() => setQuery("What are the key differences between REST and GraphQL APIs? Provide a brief comparison.")}
                  type="button"
                >
                  📝 Use Quick Prompt
                </button>
              </div>

              <div className="config-grid">
                <ConfigurationBox
                  presets={presets}
                  selectedPreset={presetA}
                  onSelect={handleSelectPresetA}
                  label="Configuration A"
                  temperature={temperatureA}
                  onTemperatureChange={setTemperatureA}
                />
                <ConfigurationBox
                  presets={presets}
                  selectedPreset={presetB}
                  onSelect={handleSelectPresetB}
                  label="Configuration B"
                  temperature={temperatureB}
                  onTemperatureChange={setTemperatureB}
                />
              </div>

              <button
                className="run-comparison-btn"
                onClick={handleRunComparison}
                disabled={isLoading || !query.trim() || !presetA || !presetB}
              >
                {isLoading ? (
                  <>
                    <span className="spinner">⏳</span> Running comparison...
                  </>
                ) : (
                  <>🚀 Run Comparison</>
                )}
              </button>
            </>
          )}
        </div>

        {error && (
          <div className="comparison-error">
            <span>⚠️</span> {error}
          </div>
        )}

        {results && (
          <div className="comparison-results">
            <h3>Results</h3>
            <div className="results-grid">
              <ResultCard result={results.result_a} />
              <ResultCard result={results.result_b} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
