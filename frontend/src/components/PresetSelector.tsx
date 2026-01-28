import { useState, useEffect, useCallback } from "react";
import { Preset, getPresetsByWorkspace } from "../services/api/presets";
import "./PresetSelector.css";

interface PresetSelectorProps {
  workspace: "chain_of_thought" | "project_manager" | "research_lab";
  onApplyPreset: (preset: Preset) => void;
}

export default function PresetSelector({ workspace, onApplyPreset }: PresetSelectorProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadPresets = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getPresetsByWorkspace(workspace);
      setPresets(data);
    } catch {
      setPresets([]);
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  const handleSelectPreset = (preset: Preset) => {
    onApplyPreset(preset);
    setIsOpen(false);
  };

  if (loading || presets.length === 0) return null;

  return (
    <div className="preset-selector">
      <button
        className="preset-trigger"
        onClick={() => setIsOpen(!isOpen)}
        title="Apply experiment preset"
      >
        🧪 Presets
      </button>
      
      {isOpen && (
        <>
          <div className="preset-overlay" onClick={() => setIsOpen(false)} />
          <div className="preset-dropdown">
            <div className="preset-header">
              <span className="preset-title">Experiment Presets</span>
              <button className="preset-close" onClick={() => setIsOpen(false)}>✕</button>
            </div>
            <div className="preset-list">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  className="preset-item"
                  onClick={() => handleSelectPreset(preset)}
                >
                  <span className="preset-icon">{preset.icon}</span>
                  <div className="preset-info">
                    <span className="preset-name">{preset.name}</span>
                    <span className="preset-description">{preset.description}</span>
                  </div>
                  <div className="preset-badges">
                    {preset.settings.use_thinking && (
                      <span className="preset-badge thinking">CoT</span>
                    )}
                    {preset.settings.rag_enabled && (
                      <span className="preset-badge rag">RAG</span>
                    )}
                    {preset.settings.web_search_enabled && (
                      <span className="preset-badge web">Web</span>
                    )}
                    <span className="preset-badge temp">T:{preset.settings.temperature}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
