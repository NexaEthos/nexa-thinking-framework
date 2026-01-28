import { useState, useCallback, useRef, useEffect } from "react";
import ThinkingPanel from "./components/ThinkingPanel";
import Chat from "./components/Chat";
import ErrorBoundary from "./components/ErrorBoundary";
import SettingsPanel from "./components/SettingsPanel";
import ProjectManager from "./components/ProjectManager";
import ResearcherPanel from "./components/ResearcherPanel";
import TelemetryBadge from "./components/TelemetryPanel";
import LoggingPanel from "./components/LoggingPanel";
import StatusIndicators from "./components/StatusIndicators";
import OnboardingTour, { useTourState } from "./components/OnboardingTour";
import { GlossaryPanel } from "./components/EducationalTooltip";
import RAGChunkViewer from "./components/RAGChunkViewer";
import PromptHistory from "./components/PromptHistory";
import { wsService } from "./services/websocket";
import { Step, Verification, Question, WebSocketMessage, ChatMessage } from "./types";
import { submitChainOfThoughtRequest, getAppSettings, globalSystemReset, API_URL, waitForBackend, IS_TAURI } from "./services/api";

type PageType = "reasoning" | "project" | "researcher" | "settings" | "logs";

interface ChainOfThoughtState {
  request: string;
  status: string;
  steps: Step[];
  finalAnswer: string | null;
  verification: Verification | null;
}

function App() {
  const [chainOfThought, setChainOfThought] = useState<ChainOfThoughtState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [quickPrompt, setQuickPrompt] = useState<string>("");
  const [directMode, setDirectMode] = useState(false);
  const [backendReady, setBackendReady] = useState(!IS_TAURI);

  const [currentPage, setCurrentPage] = useState<PageType>("reasoning");
  const [isResetting, setIsResetting] = useState(false);
  const answerAddedRef = useRef<boolean>(false);
  const currentPromptRef = useRef<string>("");

  const { showTour, hasChecked, resetTour, completeTour } = useTourState();
  const [showGlossary, setShowGlossary] = useState(false);
  const [showRAGViewer, setShowRAGViewer] = useState(false);
  const [showPromptHistory, setShowPromptHistory] = useState(false);

  useEffect(() => {
    if (IS_TAURI) {
      waitForBackend().then(() => setBackendReady(true));
    }
  }, []);

  // WebSocket message handler
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case "chain_progress": {
        setChainOfThought({
          request: message.data.request || currentPromptRef.current,
          status: message.data.status || "processing",
          steps: message.data.steps || [],
          finalAnswer: message.data.final_answer || null,
          verification: message.data.verification || null,
        });
        break;
      }
      case "token_stream": {
        setChainOfThought((prev) => {
          if (!prev) return prev;
          const updatedSteps = [...prev.steps];
          const stepIndex = updatedSteps.findIndex(
            (s) => s.step_number === message.data.step_number
          );
          if (stepIndex >= 0) {
            updatedSteps[stepIndex] = {
              ...updatedSteps[stepIndex],
              llm_response: (updatedSteps[stepIndex].llm_response || "") + message.data.token,
              streaming: true,
            };
          }
          return { ...prev, steps: updatedSteps };
        });
        break;
      }
      case "stream_complete": {
        setChainOfThought((prev) => {
          if (!prev) return prev;
          const updatedSteps = [...prev.steps];
          const stepIndex = updatedSteps.findIndex(
            (s) => s.step_number === message.data.step_number
          );
          if (stepIndex >= 0) {
            updatedSteps[stepIndex] = {
              ...updatedSteps[stepIndex],
              llm_response: message.data.full_response,
              streaming: false,
            };
          }
          return { ...prev, steps: updatedSteps };
        });
        break;
      }
      case "step_update": {
        setChainOfThought((prev) => {
          if (!prev) return prev;
          const updatedSteps = [...prev.steps];
          const stepIndex = updatedSteps.findIndex((s) => s.step_number === message.data.step_number);
          if (stepIndex >= 0) {
            updatedSteps[stepIndex] = message.data;
          } else {
            updatedSteps.push(message.data);
          }
          return { ...prev, steps: updatedSteps };
        });
        break;
      }
      case "chain_complete": {
        setIsLoading(false);
        const answer = message.data.final_answer || message.data.finalAnswer || "";
        const completedSteps = message.data.steps || [];
        setChainOfThought((prev) =>
          prev
            ? {
                ...prev,
                status: "completed",
                steps: completedSteps.length > 0 ? completedSteps : prev.steps,
                finalAnswer: answer,
                verification: message.data.verification || null,
              }
            : null
        );
        if (answer && !answerAddedRef.current) {
          answerAddedRef.current = true;
          const allSources: { title: string; url: string }[] = [];
          const seenUrls = new Set<string>();
          for (const step of completedSteps) {
            if (step.sources) {
              for (const src of step.sources) {
                if (!seenUrls.has(src.url)) {
                  seenUrls.add(src.url);
                  allSources.push({ title: src.title, url: src.url });
                }
              }
            }
          }
          let messageContent = answer;
          if (allSources.length > 0) {
            messageContent += "\n\n---\n\n**🔗 Sources:**\n";
            allSources.slice(0, 5).forEach((src) => {
              messageContent += `- [${src.title || src.url}](${src.url})\n`;
            });
          }
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: messageContent, timestamp: new Date().toISOString() },
          ]);
        }
        break;
      }
      case "chain_error":
        setIsLoading(false);
        setError(message.data);
        break;
    }
  }, []);

  useEffect(() => {
    const unsubscribe = wsService.subscribe(handleWebSocketMessage);
    return unsubscribe;
  }, [handleWebSocketMessage]);

  useEffect(() => {
    if (!backendReady) return;
    getAppSettings()
      .then((settings) => {
        if (settings.prompts?.cot_quick_prompt) {
          setQuickPrompt(settings.prompts.cot_quick_prompt);
        }
      })
      .catch((error) => {
        console.error("Failed to load app settings:", error);
      });
  }, [currentPage, backendReady]);

  const handleSubmitPrompt = useCallback(async (userPrompt: string) => {
    setIsLoading(true);
    setError(null);
    setChainOfThought(null);
    answerAddedRef.current = false;
    currentPromptRef.current = userPrompt;

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: userPrompt,
        timestamp: new Date().toISOString(),
      },
    ]);

    try {
      if (directMode) {
        // Direct mode: call LLM directly via simple endpoint
        const response = await fetch(`${API_URL}/chat/direct`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: userPrompt }),
        });
        if (!response.ok) throw new Error("Direct chat failed");
        const data = await response.json();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.response, timestamp: new Date().toISOString() },
        ]);
        setIsLoading(false);
      } else {
        // Chain of thought mode
        await submitChainOfThoughtRequest(userPrompt);
      }
    } catch (err) {
      setIsLoading(false);
      setError(err instanceof Error ? err.message : "An error occurred");
    }
  }, [directMode]);

  const handleDismissError = () => setError(null);

  const handleGlobalReset = useCallback(async () => {
    if (!confirm("This will clear all telemetry, logs, and Qdrant data. Continue?")) {
      return;
    }
    setIsResetting(true);
    try {
      const result = await globalSystemReset();
      const failures = Object.entries(result.results)
        .filter(([key]) => key.endsWith("_error"))
        .map(([key, val]) => `${key}: ${val}`);
      if (failures.length > 0) {
        setError(`Reset completed with errors: ${failures.join(", ")}`);
      } else {
        alert("System reset completed successfully!");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setIsResetting(false);
    }
  }, []);

  if (!backendReady) {
    return (
      <div className="app-container" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div style={{ textAlign: "center", color: "var(--gray-600)" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🧠</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>Nexa Thinking Framework</div>
          <div style={{ fontSize: "0.875rem" }}>Starting backend server...</div>
          <div style={{ marginTop: "1rem", width: "200px", height: "4px", background: "var(--gray-200)", borderRadius: "2px", overflow: "hidden" }}>
            <div style={{ width: "30%", height: "100%", background: "var(--primary)", animation: "loading 1s ease-in-out infinite" }} />
          </div>
          <style>{`
            @keyframes loading {
              0% { transform: translateX(-100%); }
              50% { transform: translateX(250%); }
              100% { transform: translateX(-100%); }
            }
          `}</style>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary onRetry={() => setError(null)}>
      <div className="app-container">
        <header className="app-header">
          <div className="header-content">
            <div className="header-title">
              <img src="/favicon.png" alt="" className="header-logo" aria-hidden="true" />
              <div>
                <h1>Nexa Thinking Framework</h1>
                <p>
                Playground for prompt engineering,
                <br />
                RAG and multi-agent orchestration
              </p>
              </div>
            </div>
            <nav className="header-nav workspace-tabs" role="navigation" aria-label="Main navigation">
              <button
                className={`nav-tab ${currentPage === "reasoning" ? "active" : ""}`}
                onClick={() => setCurrentPage("reasoning")}
                aria-current={currentPage === "reasoning" ? "page" : undefined}
                aria-label="Chain of Thought reasoning"
                data-tab="chain-of-thought"
              >
                <span aria-hidden="true">🔗</span> Chain of Thought
              </button>
              <button
                className={`nav-tab ${currentPage === "project" ? "active" : ""}`}
                onClick={() => setCurrentPage("project")}
                aria-current={currentPage === "project" ? "page" : undefined}
                aria-label="Project Manager"
                data-tab="project-manager"
              >
                <span aria-hidden="true">📋</span> Project Manager
              </button>
              <button
                className={`nav-tab ${currentPage === "researcher" ? "active" : ""}`}
                onClick={() => setCurrentPage("researcher")}
                aria-current={currentPage === "researcher" ? "page" : undefined}
                aria-label="Research Lab"
                data-tab="researcher"
              >
                <span aria-hidden="true">🔬</span> Research Lab
              </button>
              <button
                className={`nav-tab ${currentPage === "settings" ? "active" : ""}`}
                onClick={() => setCurrentPage("settings")}
                aria-current={currentPage === "settings" ? "page" : undefined}
                aria-label="Settings"
              >
                <span aria-hidden="true">⚙️</span> Settings
              </button>
              <button
                className={`nav-tab ${currentPage === "logs" ? "active" : ""}`}
                onClick={() => setCurrentPage("logs")}
                aria-current={currentPage === "logs" ? "page" : undefined}
                aria-label="Application logs"
              >
                <span aria-hidden="true">📋</span> Logs
              </button>
              <button
                className="nav-tab nav-tab-reset"
                onClick={handleGlobalReset}
                disabled={isResetting}
                aria-label="Reset all data"
                title="Clear telemetry, logs, and Qdrant collections"
              >
                <span aria-hidden="true">🗑️</span> {isResetting ? "..." : "Reset"}
              </button>
              <button
                className="nav-tab nav-tab-history"
                onClick={() => setShowPromptHistory(true)}
                aria-label="Open Prompt History"
                title="View and manage prompt history"
              >
                <span aria-hidden="true">📜</span> History
              </button>
              <button
                className="nav-tab nav-tab-rag"
                onClick={() => setShowRAGViewer(true)}
                aria-label="Open RAG Chunk Viewer"
                title="View and search RAG chunks"
              >
                <span aria-hidden="true">🧬</span> RAG
              </button>
              <button
                className="nav-tab nav-tab-glossary"
                onClick={() => setShowGlossary(true)}
                aria-label="Open glossary"
                title="AI concepts glossary"
              >
                <span aria-hidden="true">📖</span> Glossary
              </button>
              <button
                className="nav-tab nav-tab-tour"
                onClick={resetTour}
                aria-label="Show guided tour"
                title="Take a guided tour of the platform"
              >
                <span aria-hidden="true">🎓</span> Tour
              </button>
            </nav>
            <StatusIndicators />
            {error && (
              <div className="error-banner" role="alert" aria-live="assertive">
                <span aria-hidden="true">⚠️</span>
                <span>{error}</span>
                <button 
                  className="btn btn-sm btn-ghost" 
                  onClick={handleDismissError}
                  aria-label="Dismiss error"
                >
                  <span aria-hidden="true">✕</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {currentPage === "reasoning" && (
          <main className="main-content two-column" role="main" aria-label="Chain of Thought reasoning">
            <div className="panel thinking-panel-container">
              <ErrorBoundary>
                <ThinkingPanel
                  questions={questions}
                  onQuestionsChange={setQuestions}
                  request={chainOfThought?.request || null}
                  status={chainOfThought?.status || ""}
                  steps={chainOfThought?.steps || []}
                  finalAnswer={chainOfThought?.finalAnswer || null}
                  verification={chainOfThought?.verification || null}
                  isLoading={isLoading}
                  directMode={directMode}
                  onDirectModeChange={setDirectMode}
                />
              </ErrorBoundary>
            </div>

            <div className="panel chat-panel-container">
              <ErrorBoundary>
                <Chat messages={messages} onSubmit={handleSubmitPrompt} isLoading={isLoading} quickPrompt={quickPrompt} />
              </ErrorBoundary>
            </div>
          </main>
        )}
        {currentPage === "project" && (
          <ErrorBoundary>
            <ProjectManager />
          </ErrorBoundary>
        )}
        {currentPage === "researcher" && (
          <ErrorBoundary>
            <ResearcherPanel />
          </ErrorBoundary>
        )}
        {currentPage === "settings" && (
          <main className="main-content" role="main" aria-label="Settings">
            <ErrorBoundary>
              <SettingsPanel />
            </ErrorBoundary>
          </main>
        )}
        {currentPage === "logs" && (
          <main className="main-content" role="main" aria-label="Application Logs">
            <ErrorBoundary>
              <LoggingPanel />
            </ErrorBoundary>
          </main>
        )}
        
        {(currentPage === "project" || currentPage === "reasoning" || currentPage === "researcher") && <TelemetryBadge />}
        
        {hasChecked && showTour && (
            <OnboardingTour
              onComplete={completeTour}
              onNavigateToPage={setCurrentPage}
            />
          )}
        
        <GlossaryPanel isOpen={showGlossary} onClose={() => setShowGlossary(false)} />
        <RAGChunkViewer isOpen={showRAGViewer} onClose={() => setShowRAGViewer(false)} />
        <PromptHistory isOpen={showPromptHistory} onClose={() => setShowPromptHistory(false)} />
      </div>
    </ErrorBoundary>
  );
}

export default App;
