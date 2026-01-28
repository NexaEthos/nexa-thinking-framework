import { useState, useEffect, FormEvent, useCallback, memo } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Step, Verification, Question, MemorySource } from "../types";
import { createQuestion, getQuestions, deleteQuestion, updateQuestion, toggleQuestion, getAppSettings, updateAppSettings, getLLMSettings } from "../services/api";
import { getChainOfThoughtPromptInfo } from "../services/api/prompts";
import { Preset } from "../services/api/presets";
import PromptInspector from "./PromptInspector";
import ComparisonPanel from "./ComparisonPanel";
import PresetSelector from "./PresetSelector";
import ExportReport, { useExportReport } from "./ExportReport";
import { savePromptVersion } from "./PromptHistory";
import "./ThinkingPanel.css";

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

interface ThinkingPanelProps {
  questions: Question[];
  onQuestionsChange: (questions: Question[]) => void;
  request: string | null;
  status: string;
  steps: Step[];
  finalAnswer: string | null;
  verification: Verification | null;
  isLoading: boolean;
  directMode: boolean;
  onDirectModeChange: (enabled: boolean) => void;
}

type PhaseType =
  | "idle"
  | "classifying"
  | "analyzing"
  | "processing"
  | "generating"
  | "verifying"
  | "completed"
  | "error";

function ThinkingPanel({
  questions,
  onQuestionsChange,
  request,
  status,
  steps,
  finalAnswer,
  verification,
  isLoading,
  directMode,
  onDirectModeChange,
}: ThinkingPanelProps) {
  const [newQuestionText, setNewQuestionText] = useState("");
  const [addingQuestion, setAddingQuestion] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [memorySearchEnabled, setMemorySearchEnabled] = useState(true);
  const [currentTemperature, setCurrentTemperature] = useState(0.7);
  const [currentModel, setCurrentModel] = useState("");
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [showPromptInspector, setShowPromptInspector] = useState(false);
  const [showComparisonPanel, setShowComparisonPanel] = useState(false);
  const [isSavingToHistory, setIsSavingToHistory] = useState(false);
  const { isOpen: showExportReport, exportData, openExport, closeExport } = useExportReport();

  const handleExport = () => {
    if (!request || !finalAnswer) return;
    
    const totalTokens = steps.reduce((sum, s) => sum + (s.tokens_used || 0), 0);
    const totalLatency = steps.reduce((sum, s) => sum + (s.duration_ms || 0), 0);
    const allSources: { title: string; url: string }[] = [];
    steps.forEach(s => {
      if (s.sources) {
        s.sources.forEach(src => {
          if (!allSources.find(x => x.url === src.url)) {
            allSources.push({ title: src.title, url: src.url });
          }
        });
      }
    });

    openExport({
      workspace: "chain_of_thought",
      prompt: request,
      response: finalAnswer,
      settings: {
        temperature: currentTemperature,
        use_thinking: !directMode,
        web_search_enabled: webSearchEnabled,
        rag_enabled: memorySearchEnabled,
        model: currentModel,
      },
      steps: steps.map(s => ({
        step_number: s.step_number,
        type: s.type,
        question: s.question,
        llm_response: s.llm_response,
        tokens_used: s.tokens_used,
        duration_ms: s.duration_ms,
      })),
      tokens_used: totalTokens,
      latency_ms: totalLatency,
      sources: allSources,
      timestamp: new Date().toISOString(),
    });
  };

  const handleSaveToHistory = async () => {
    if (!request || !finalAnswer || isSavingToHistory) return;
    
    const name = prompt("Enter a name for this prompt version:", `Prompt - ${new Date().toLocaleString()}`);
    if (!name) return;
    
    setIsSavingToHistory(true);
    try {
      const totalTokens = steps.reduce((sum, s) => sum + (s.tokens_used || 0), 0);
      const totalLatency = steps.reduce((sum, s) => sum + (s.duration_ms || 0), 0);
      
      await savePromptVersion(
        name,
        request,
        {
          temperature: currentTemperature,
          use_thinking: !directMode,
          web_search_enabled: webSearchEnabled,
          rag_enabled: memorySearchEnabled,
          model: currentModel,
        },
        "chain_of_thought",
        finalAnswer.slice(0, 500),
        totalTokens,
        totalLatency
      );
      alert("Prompt saved to history!");
    } catch (error) {
      console.error("Failed to save to history:", error);
      alert("Failed to save prompt to history");
    } finally {
      setIsSavingToHistory(false);
    }
  };

  const loadQuestions = useCallback(async () => {
    try {
      const loadedQuestions = await getQuestions();
      onQuestionsChange(loadedQuestions);
    } catch (error) {
      console.error("Failed to load questions:", error);
    }
  }, [onQuestionsChange]);

  const loadSettings = useCallback(async () => {
    try {
      const [appSettings, llmSettings] = await Promise.all([
        getAppSettings(),
        getLLMSettings(),
      ]);
      setWebSearchEnabled(appSettings.web_search?.enabled ?? true);
      setMemorySearchEnabled(appSettings.qdrant?.use_memory_search ?? true);
      setCurrentTemperature(llmSettings.temperature ?? 0.7);
      setCurrentModel(llmSettings.model ?? "");
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  }, []);

  useEffect(() => {
    loadQuestions();
    loadSettings();
  }, [loadQuestions, loadSettings]);

  async function handleToggleWebSearch() {
    setLoadingSettings(true);
    try {
      const settings = await getAppSettings();
      const newEnabled = !webSearchEnabled;
      await updateAppSettings({
        ...settings,
        web_search: { ...settings.web_search, enabled: newEnabled },
      });
      setWebSearchEnabled(newEnabled);
    } catch (error) {
      console.error("Failed to toggle web search:", error);
    } finally {
      setLoadingSettings(false);
    }
  }

  async function handleToggleMemorySearch() {
    setLoadingSettings(true);
    try {
      const settings = await getAppSettings();
      const newEnabled = !memorySearchEnabled;
      await updateAppSettings({
        ...settings,
        qdrant: { ...settings.qdrant, use_memory_search: newEnabled },
      });
      setMemorySearchEnabled(newEnabled);
    } catch (error) {
      console.error("Failed to toggle memory search:", error);
    } finally {
      setLoadingSettings(false);
    }
  }

  async function handleApplyPreset(preset: Preset) {
    setLoadingSettings(true);
    try {
      const settings = await getAppSettings();
      await updateAppSettings({
        ...settings,
        web_search: { ...settings.web_search, enabled: preset.settings.web_search_enabled },
        qdrant: { ...settings.qdrant, use_memory_search: preset.settings.rag_enabled },
      });
      setWebSearchEnabled(preset.settings.web_search_enabled);
      setMemorySearchEnabled(preset.settings.rag_enabled);
      onDirectModeChange(!preset.settings.use_thinking);
    } catch (error) {
      console.error("Failed to apply preset:", error);
    } finally {
      setLoadingSettings(false);
    }
  }

  async function handleCreateQuestion(e: FormEvent) {
    e.preventDefault();
    const trimmed = newQuestionText.trim();
    if (!trimmed) return;

    setAddingQuestion(true);
    try {
      const created = await createQuestion(trimmed);
      onQuestionsChange([...questions, created]);
      setNewQuestionText("");
      setShowAddForm(false);
    } catch (error) {
      console.error("Failed to create question:", error);
    } finally {
      setAddingQuestion(false);
    }
  }

  async function handleDeleteQuestion(questionId: number) {
    try {
      await deleteQuestion(questionId);
      onQuestionsChange(questions.filter((q) => q.id !== questionId));
    } catch (error) {
      console.error("Failed to delete question:", error);
    }
  }

  function startEditing(question: Question) {
    setEditingId(question.id);
    setEditText(question.text);
  }

  async function handleSaveEdit() {
    if (!editingId || !editText.trim()) return;

    try {
      const updated = await updateQuestion(editingId, editText.trim());
      onQuestionsChange(questions.map((q) => (q.id === editingId ? updated : q)));
      setEditingId(null);
      setEditText("");
    } catch (error) {
      console.error("Failed to update question:", error);
    }
  }

  function cancelEdit() {
    setEditingId(null);
    setEditText("");
  }

  async function handleToggleQuestion(questionId: number) {
    try {
      const updated = await toggleQuestion(questionId);
      onQuestionsChange(questions.map((q) => (q.id === questionId ? updated : q)));
    } catch (error) {
      console.error("Failed to toggle question:", error);
    }
  }

  const enabledQuestions = questions.filter((q) => q.enabled);
  const currentPhase = (status || "idle") as PhaseType;
  const isProcessing = isLoading || (currentPhase !== "idle" && currentPhase !== "completed" && currentPhase !== "error");

  const getStepForQuestion = (questionText: string): Step | undefined => {
    return steps.find(
      (s) =>
        s.type === "question" &&
        s.question?.toLowerCase().includes(questionText.toLowerCase().slice(0, 30))
    );
  };

  const classificationStep = steps.find((s) => s.type === "classification");

  const getStepStatus = (stepType: string, questionText?: string): "idle" | "active" | "done" => {
    if (!request && !isLoading) return "idle";
    
    if (stepType === "classification") {
      if (classificationStep?.llm_response || classificationStep?.decision) return "done";
      if (currentPhase === "classifying") return "active";
      return request ? "done" : "idle";
    }
    
    if (stepType === "question" && questionText) {
      const step = getStepForQuestion(questionText);
      if (step?.llm_response) return "done";
      if (step?.streaming) return "active";
      if (currentPhase === "processing" || currentPhase === "analyzing") {
        const questionSteps = steps.filter(s => s.type === "question");
        const thisQuestionIndex = enabledQuestions.findIndex(q => q.text === questionText);
        if (questionSteps.length > thisQuestionIndex) return "done";
        if (questionSteps.length === thisQuestionIndex) return "active";
      }
      return "idle";
    }
    
    if (stepType === "synthesis") {
      if (finalAnswer) return "done";
      if (currentPhase === "generating") return "active";
      return "idle";
    }
    
    if (stepType === "verification") {
      if (verification) return "done";
      if (currentPhase === "verifying") return "active";
      return "idle";
    }
    
    return "idle";
  };

  return (
    <>
      <div className="panel-header">
        <h3>
          <span>🧠</span> Thinking Process
        </h3>
        <div className="header-actions">
          <button
            className="btn btn-sm btn-ghost"
            onClick={() => setShowAddForm(!showAddForm)}
            title="Add question"
            disabled={isProcessing || directMode}
          >
            {showAddForm ? "✕" : "+"}
          </button>
        </div>
      </div>

      <div className="panel-body thinking-panel">
        {/* Controls Bar */}
        <div className="thinking-controls">
          <div className="control-group">
            <label className="control-label">
              <span className="control-icon">🧠</span>
              <span>Thinking</span>
            </label>
            <button
              className={`control-toggle ${!directMode ? "on" : "off"}`}
              onClick={() => onDirectModeChange(!directMode)}
              disabled={isProcessing}
              title={directMode ? "Enable thinking process" : "Disable thinking process (direct LLM)"}
            >
              {directMode ? "OFF" : "ON"}
            </button>
          </div>
          <div className="control-group">
            <label className="control-label">
              <span className="control-icon">🔍</span>
              <span>Web Search</span>
            </label>
            <button
              className={`control-toggle ${webSearchEnabled ? "on" : "off"}`}
              onClick={handleToggleWebSearch}
              disabled={isProcessing || loadingSettings}
              title={webSearchEnabled ? "Disable web search" : "Enable web search"}
            >
              {loadingSettings ? "..." : webSearchEnabled ? "ON" : "OFF"}
            </button>
          </div>
          <div className="control-group">
            <label className="control-label">
              <span className="control-icon">🧬</span>
              <span>Memory</span>
            </label>
            <button
              className={`control-toggle ${memorySearchEnabled ? "on" : "off"}`}
              onClick={handleToggleMemorySearch}
              disabled={isProcessing || loadingSettings}
              title={memorySearchEnabled ? "Disable memory search (Qdrant)" : "Enable memory search (Qdrant)"}
            >
              {loadingSettings ? "..." : memorySearchEnabled ? "ON" : "OFF"}
            </button>
          </div>
          <div className="control-group">
            <button
              className="control-btn-inspect"
              onClick={() => setShowPromptInspector(true)}
              title="View prompts being sent to the LLM"
            >
              🔍 View Prompts
            </button>
          </div>
          <div className="control-group">
            <button
              className="control-btn-compare"
              onClick={() => setShowComparisonPanel(true)}
              title="Compare different configurations side-by-side"
            >
              ⚖️ A/B Compare
            </button>
            <button
              className="control-btn-export"
              onClick={handleExport}
              disabled={!finalAnswer}
              title="Export experiment report"
            >
              📊 Export
            </button>
            <button
              className="control-btn-save"
              onClick={handleSaveToHistory}
              disabled={!finalAnswer || isSavingToHistory}
              title="Save prompt to history"
            >
              {isSavingToHistory ? "⏳" : "💾"} Save
            </button>
          </div>
          <div className="control-group">
            <PresetSelector
              workspace="chain_of_thought"
              onApplyPreset={handleApplyPreset}
            />
          </div>
        </div>
        {showAddForm && !isProcessing && !directMode && (
          <form onSubmit={handleCreateQuestion} className="add-question-form">
            <input
              type="text"
              value={newQuestionText}
              onChange={(e) => setNewQuestionText(e.target.value)}
              placeholder="Add a new analysis question..."
              disabled={addingQuestion}
              className="input"
              autoFocus
            />
            <button
              type="submit"
              disabled={addingQuestion || !newQuestionText.trim()}
              className="btn btn-primary btn-sm"
            >
              {addingQuestion ? "..." : "Add"}
            </button>
          </form>
        )}

        {/* Direct Mode Message */}
        {directMode && (
          <div className="direct-mode-notice">
            <div className="direct-mode-icon">⚡</div>
            <div className="direct-mode-text">
              <strong>Direct Mode</strong>
              <p>Thinking process disabled. Prompts go directly to the LLM without chain-of-thought analysis.</p>
            </div>
          </div>
        )}

        {/* Full Pipeline View */}
        {!directMode && (
        <div className="pipeline">
          {/* Step 1: Classification */}
          <PipelineStep
            number={1}
            icon="🎯"
            title="Prompt Classification"
            description="Analyze prompt complexity and determine processing path"
            status={getStepStatus("classification")}
            content={classificationStep?.decision}
            reasoning={classificationStep?.reasoning}
            metrics={classificationStep}
            memorySources={classificationStep?.memory_sources}
          />

          {/* Step 2: Questions Analysis */}
          <div className="pipeline-questions">
            <div className="pipeline-questions-header">
              <span className="pipeline-step-number">2</span>
              <span className="pipeline-questions-title">❓ Question Analysis</span>
              <span className="pipeline-questions-count">{enabledQuestions.length}/{questions.length} active</span>
            </div>
            
            <div className="pipeline-questions-list">
              {questions.map((question, idx) => {
                const questionStep = getStepForQuestion(question.text);
                const questionStatus = question.enabled ? getStepStatus("question", question.text) : "idle";
                
                return (
                  <div 
                    key={question.id} 
                    className={`pipeline-question ${!question.enabled ? "disabled" : ""} ${questionStatus}`}
                  >
                    <div className="pipeline-question-header">
                      {editingId === question.id ? (
                        <div className="pipeline-question-edit">
                          <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="input input-xs"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                          />
                          <button onClick={handleSaveEdit} className="btn btn-xs btn-primary">✓</button>
                          <button onClick={cancelEdit} className="btn btn-xs btn-ghost">✕</button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => handleToggleQuestion(question.id)}
                            className={`pipeline-toggle ${question.enabled ? "on" : "off"}`}
                            disabled={isProcessing}
                            title={question.enabled ? "Click to disable" : "Click to enable"}
                          />
                          <span className="pipeline-question-number">Q{idx + 1}</span>
                          <span className={`pipeline-question-text ${!question.enabled ? "disabled" : ""}`}>
                            {question.text}
                          </span>
                          <div className="pipeline-question-status">
                            {questionStatus === "done" && <span className="status-done">✓</span>}
                            {questionStatus === "active" && <span className="status-active">⟳</span>}
                            {questionStatus === "idle" && question.enabled && <span className="status-idle">○</span>}
                          </div>
                          {!isProcessing && (
                            <div className="pipeline-question-actions">
                              <button onClick={() => startEditing(question)} className="action-btn" title="Edit">✎</button>
                              <button onClick={() => handleDeleteQuestion(question.id)} className="action-btn" title="Delete">×</button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    
                    {/* Question Response */}
                    {question.enabled && questionStep && (questionStep.llm_response || questionStep.streaming) && (
                      <div className={`pipeline-question-response ${questionStep.streaming ? "streaming" : ""}`}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                          {questionStep.llm_response || ""}
                        </ReactMarkdown>
                        {questionStep.streaming && <span className="streaming-cursor">▌</span>}
                        {questionStep.sources && questionStep.sources.length > 0 && (
                          <div className="response-sources">
                            <span className="sources-label">🔗 Sources:</span>
                            {questionStep.sources.map((source) => (
                              <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="source-link">
                                {source.title || source.url}
                              </a>
                            ))}
                          </div>
                        )}
                        {(questionStep.tokens_used || questionStep.duration_ms) && (
                          <div className="response-metrics">
                            {questionStep.duration_ms && <span>⏱️ {(questionStep.duration_ms / 1000).toFixed(1)}s</span>}
                            {questionStep.tokens_used && <span>📊 {questionStep.tokens_used} tok</span>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 3: Synthesis */}
          <PipelineStep
            number={3}
            icon="✨"
            title="Answer Synthesis"
            description="Combine insights from all questions into a comprehensive response"
            status={getStepStatus("synthesis")}
            content={finalAnswer}
            isMarkdown
          />

          {/* Step 4: Verification */}
          <PipelineStep
            number={4}
            icon={verification?.passed ? "✅" : "🔍"}
            title="Verification"
            description="Validate the answer for accuracy and completeness"
            status={getStepStatus("verification")}
            content={verification ? (verification.passed ? "Answer verified" : "Needs review") : undefined}
            subContent={verification?.notes}
            variant={verification ? (verification.passed ? "success" : "warning") : undefined}
          />
        </div>
        )}
      </div>
      <PromptInspector
        isOpen={showPromptInspector}
        onClose={() => setShowPromptInspector(false)}
        fetchPromptInfo={getChainOfThoughtPromptInfo}
        workspaceName="Chain of Thought"
      />
      <ComparisonPanel
        isOpen={showComparisonPanel}
        onClose={() => setShowComparisonPanel(false)}
      />
      <ExportReport
        isOpen={showExportReport}
        onClose={closeExport}
        data={exportData}
      />
    </>
  );
}

interface PipelineStepProps {
  number: number;
  icon: string;
  title: string;
  description: string;
  status: "idle" | "active" | "done";
  content?: string | null;
  subContent?: string | null;
  reasoning?: string;
  metrics?: Step;
  isMarkdown?: boolean;
  variant?: "success" | "warning";
  memorySources?: MemorySource[];
}

function PipelineStep({ 
  number, 
  icon, 
  title, 
  description, 
  status, 
  content, 
  subContent,
  reasoning,
  metrics,
  isMarkdown,
  variant,
  memorySources
}: PipelineStepProps) {
  return (
    <div className={`pipeline-step ${status} ${variant || ""}`}>
      <div className="pipeline-step-header">
        <span className="pipeline-step-number">{number}</span>
        <span className="pipeline-step-icon">{icon}</span>
        <div className="pipeline-step-info">
          <span className="pipeline-step-title">{title}</span>
          <span className="pipeline-step-desc">{description}</span>
        </div>
        <div className="pipeline-step-status">
          {status === "done" && <span className="status-badge done">✓ Done</span>}
          {status === "active" && <span className="status-badge active">⟳ Processing</span>}
          {status === "idle" && <span className="status-badge idle">○ Pending</span>}
        </div>
      </div>
      
      {(content || reasoning || memorySources) && (
        <div className="pipeline-step-content">
          {reasoning && (
            <div className="pipeline-step-reasoning">
              <span className="reasoning-icon">💡</span>
              {reasoning}
            </div>
          )}
          {content && (
            <div className="pipeline-step-result">
              {isMarkdown ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {content}
                </ReactMarkdown>
              ) : (
                content
              )}
            </div>
          )}
          {memorySources && memorySources.length > 0 && (
            <div className="pipeline-memory-sources">
              <div className="memory-sources-header">
                <span className="memory-icon">🧬</span>
                <span>Memory Retrieved ({memorySources.length})</span>
              </div>
              <div className="memory-sources-list">
                {memorySources.map((source) => (
                  <div key={source.id} className="memory-source-item">
                    <div className="memory-source-score">
                      <span className="score-label">Score:</span>
                      <span className="score-value">{(source.score * 100).toFixed(0)}%</span>
                    </div>
                    <div className="memory-source-content">{source.content}</div>
                    <div className="memory-source-collection">{source.collection}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {subContent && (
            <div className="pipeline-step-subcontent">{subContent}</div>
          )}
          {metrics && (metrics.tokens_used || metrics.duration_ms) && (
            <div className="pipeline-step-metrics">
              {metrics.duration_ms && <span>⏱️ {(metrics.duration_ms / 1000).toFixed(1)}s</span>}
              {metrics.tokens_used && <span>📊 {metrics.tokens_used} tok</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default memo(ThinkingPanel);
