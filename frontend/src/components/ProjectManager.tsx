import { useState, useCallback, useRef, useEffect } from "react";
import Chat from "./Chat";
import CanvasPanel from "./CanvasPanel";
import FullContextView from "./FullContextView";
import ErrorBoundary from "./ErrorBoundary";
import PromptInspector from "./PromptInspector";
import { getAppSettings, updateAppSettings, getPMGreeting, API_URL } from "../services/api";
import { getProjectManagerPromptInfo } from "../services/api/prompts";
import { wsService } from "../services/websocket";
import { WebSocketMessage, CanvasUpdate, ChatMessage, RAGResult, PipelineAgent } from "../types";
import { CanvasSectionId } from "../types/agents";

type ViewMode = "canvas" | "fullContext";

interface AgentChatMessage extends ChatMessage {
  agent_id?: string;
  agent_name?: string;
  message_type?: "task" | "acknowledgment" | "info";
}

interface ResearchData {
  queries: string[];
  sources: Array<{ title: string; url: string; snippet: string }>;
  indexed_to_rag: boolean;
  rag_collection: string | null;
}

interface LocalCanvas {
  researcher: { id: string; title: string; content: string | ResearchData; agent_id: string; last_updated: string | null };
  identity: { id: string; title: string; content: string; agent_id: string; last_updated: string | null };
  definition: { id: string; title: string; content: string; agent_id: string; last_updated: string | null };
  resources: { id: string; title: string; content: string; agent_id: string; last_updated: string | null };
  execution: { id: string; title: string; content: string; agent_id: string; last_updated: string | null };
}

const INITIAL_CANVAS: LocalCanvas = {
  researcher: { id: "researcher", title: "Research", content: "", agent_id: "researcher", last_updated: null },
  identity: { id: "identity", title: "Identity", content: "", agent_id: "identity", last_updated: null },
  definition: { id: "definition", title: "Definition", content: "", agent_id: "definition", last_updated: null },
  resources: { id: "resources", title: "Resources", content: "", agent_id: "resources", last_updated: null },
  execution: { id: "execution", title: "Execution", content: "", agent_id: "execution", last_updated: null },
};

function createInitialMessage(greeting: string): ChatMessage {
  return {
    role: "assistant",
    content: greeting,
    timestamp: new Date().toISOString(),
  };
}

export default function ProjectManager() {
  const [messages, setMessages] = useState<AgentChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [thinkingStatus, setThinkingStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [canvas, setCanvas] = useState<LocalCanvas>(INITIAL_CANVAS);
  const [loadingSection, _setLoadingSection] = useState<CanvasSectionId | null>(null);
  const [quickPrompt, setQuickPrompt] = useState<string>("");
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("canvas");
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [memorySearchEnabled, setMemorySearchEnabled] = useState(true);
  const [ragResults, setRagResults] = useState<RAGResult[]>([]);
  const [toolsUsed, setToolsUsed] = useState<{ web: boolean; memory: boolean }>({ web: false, memory: false });
  const [pipelineAgents, setPipelineAgents] = useState<PipelineAgent[]>([]);
  const [, setCurrentAgent] = useState<string | null>(null);
  const [showPromptInspector, setShowPromptInspector] = useState(false);
  const conversationRef = useRef<AgentChatMessage[]>([]);
  const canvasRef = useRef<LocalCanvas>(INITIAL_CANVAS);
  void _setLoadingSection;

  useEffect(() => {
    canvasRef.current = canvas;
  }, [canvas]);

  useEffect(() => {
    const initializeSettings = async () => {
      try {
        const [appSettings, greetingResponse] = await Promise.all([
          getAppSettings(),
          getPMGreeting(),
        ]);
        
        if (appSettings.prompts?.quick_prompt) {
          setQuickPrompt(appSettings.prompts.quick_prompt);
        }
        setWebSearchEnabled(appSettings.web_search?.enabled ?? true);
        setMemorySearchEnabled(appSettings.qdrant?.use_memory_search ?? true);
        
        const initialMessage = createInitialMessage(greetingResponse.greeting);
        setMessages([initialMessage]);
        conversationRef.current = [initialMessage];
      } catch (err) {
        console.error("Failed to load settings:", err);
        setError("Failed to load agent settings. Check backend connection.");
      } finally {
        setIsInitializing(false);
      }
    };
    
    initializeSettings();
  }, []);

  useEffect(() => {
    const handleWebSocketMessage = (message: WebSocketMessage) => {
      switch (message.type) {
        case "project_thinking":
          setThinkingStatus(message.data.thinking);
          break;

        case "project_token":
          setStreamingContent((prev) => prev + message.data.token);
          break;

        case "project_response": {
          const finalResponse = message.data.response;
          setMessages((prev) => {
            const filtered = prev.filter((m) => !m.streaming);
            return [
              ...filtered,
              {
                role: "assistant",
                content: finalResponse,
                timestamp: new Date().toISOString(),
              },
            ];
          });
          conversationRef.current = [
            ...conversationRef.current.filter((m) => !m.streaming),
            {
              role: "assistant",
              content: finalResponse,
              timestamp: new Date().toISOString(),
            },
          ];
          setStreamingContent("");
          break;
        }

        case "project_canvas":
          applyCanvasUpdates(message.data.canvas_updates);
          break;

        case "project_tools":
          setToolsUsed({
            web: message.data.web_search_used,
            memory: message.data.memory_search_used,
          });
          if (message.data.rag_results?.length > 0) {
            setRagResults(message.data.rag_results);
          }
          break;

        case "pipeline_progress":
          setPipelineAgents(message.data.agents);
          setCurrentAgent(message.data.current_agent);
          break;

        case "agent_message": {
          const agentMsg: AgentChatMessage = {
            role: "assistant",
            content: message.data.message,
            timestamp: message.data.timestamp,
            agent_id: message.data.agent_id,
            agent_name: message.data.agent_name,
            message_type: message.data.message_type,
          };
          setMessages((prev) => [...prev.filter((m) => !m.streaming), agentMsg]);
          conversationRef.current = [...conversationRef.current.filter((m) => !m.streaming), agentMsg];
          break;
        }

        case "project_complete": {
          const finalContent = message.data.response;
          setMessages((prev) => {
            const nonStreaming = prev.filter((m) => !m.streaming);
            const lastMessage = nonStreaming[nonStreaming.length - 1];
            if (lastMessage?.role === "assistant" && lastMessage.content === finalContent) {
              return nonStreaming;
            }
            return [
              ...nonStreaming,
              {
                role: "assistant",
                content: finalContent,
                timestamp: new Date().toISOString(),
              },
            ];
          });
          conversationRef.current = conversationRef.current.filter((m) => !m.streaming);
          const lastRef = conversationRef.current[conversationRef.current.length - 1];
          if (!(lastRef?.role === "assistant" && lastRef.content === finalContent)) {
            conversationRef.current.push({
              role: "assistant",
              content: finalContent,
              timestamp: new Date().toISOString(),
            });
          }
          setIsLoading(false);
          setThinkingStatus("");
          setStreamingContent("");
          break;
        }

        case "project_error":
          setError(message.data.error);
          setIsLoading(false);
          setThinkingStatus("");
          setStreamingContent("");
          break;
      }
    };

    const unsubscribe = wsService.subscribe(handleWebSocketMessage);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (streamingContent && isLoading) {
      setMessages((prev) => {
        const filtered = prev.filter((m) => !m.streaming);
        return [
          ...filtered,
          {
            role: "assistant",
            content: streamingContent,
            timestamp: new Date().toISOString(),
            streaming: true,
          },
        ];
      });
    }
  }, [streamingContent, isLoading]);

  const applyCanvasUpdates = (updates: CanvasUpdate[]) => {
    setCanvas((prev) => {
      const updated = { ...prev };
      for (const update of updates) {
        const sectionId = update.id as CanvasSectionId | "researcher";
        if (sectionId in updated) {
          if (sectionId === "researcher") {
            updated.researcher = {
              id: "researcher",
              title: update.title,
              content: update.content as unknown as ResearchData,
              agent_id: "researcher",
              last_updated: new Date().toISOString(),
            };
          } else {
            updated[sectionId] = {
              id: sectionId,
              title: update.title,
              content: update.content,
              agent_id: sectionId,
              last_updated: new Date().toISOString(),
            };
          }
        }
      }
      return updated;
    });
  };

  const handleToggleWebSearch = async () => {
    try {
      const settings = await getAppSettings();
      const newEnabled = !webSearchEnabled;
      await updateAppSettings({
        ...settings,
        web_search: { ...settings.web_search, enabled: newEnabled },
      });
      setWebSearchEnabled(newEnabled);
    } catch (err) {
      console.error("Failed to toggle web search:", err);
    }
  };

  const handleToggleMemorySearch = async () => {
    try {
      const settings = await getAppSettings();
      const newEnabled = !memorySearchEnabled;
      await updateAppSettings({
        ...settings,
        qdrant: { ...settings.qdrant, use_memory_search: newEnabled },
      });
      setMemorySearchEnabled(newEnabled);
    } catch (err) {
      console.error("Failed to toggle memory search:", err);
    }
  };

  const handleSubmitPrompt = useCallback(
    async (userPrompt: string) => {
      setIsLoading(true);
      setThinkingStatus("Sending...");
      setError(null);
      setStreamingContent("");
      setRagResults([]);
      setToolsUsed({ web: false, memory: false });
      setPipelineAgents([]);
      setCurrentAgent(null);

      const userMessage: AgentChatMessage = {
        role: "user",
        content: userPrompt,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMessage]);
      conversationRef.current = [...conversationRef.current, userMessage];

      try {
        const conversationHistory = conversationRef.current
          .filter((m) => !m.streaming)
          .map((m) => ({
            role: m.role,
            content: m.content,
          }));

        const response = await fetch(`${API_URL}/project/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: conversationHistory,
            current_canvas: Object.values(canvasRef.current).map((c) => ({
              id: c.id,
              title: c.title,
              content: c.content,
            })),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `API error: ${response.status}`);
        }
      } catch (err) {
        console.error("Project chat error:", err);
        setError(err instanceof Error ? err.message : "Failed to get response from LLM");
        setIsLoading(false);
        setThinkingStatus("");
      }
    },
    []
  );

  const handleDismissError = () => setError(null);

  const handleCanvasRefresh = useCallback(async () => {
    try {
      const { getCanvas } = await import("../services/api");
      const data = await getCanvas();
      setCanvas(data.canvas as LocalCanvas);
    } catch (err) {
      console.error("Failed to refresh canvas:", err);
    }
  }, []);

  return (
    <ErrorBoundary>
      {viewMode === "fullContext" ? (
        <main className="main-content full-width">
          <div className="panel full-context-panel">
            <FullContextView
              canvas={canvas}
              conversation={messages.filter((m) => !m.streaming)}
              onClose={() => setViewMode("canvas")}
            />
          </div>
        </main>
      ) : (
        <main className="main-content two-column">
          <div className="panel project-canvas">
            <CanvasPanel
              canvas={canvas}
              loadingSection={loadingSection}
              onRefresh={handleCanvasRefresh}
              onFullView={() => setViewMode("fullContext")}
              ragResults={ragResults}
              toolsUsed={toolsUsed}
            />
          </div>

          <div className="panel chat-panel-container">
            <div className="pm-tools-controls">
              <div className="pm-control-group">
                <label className="pm-control-label">
                  <span className="pm-control-icon">🔍</span>
                  <span>Web Search</span>
                </label>
                <button
                  className={`pm-control-toggle ${webSearchEnabled ? "on" : "off"}`}
                  onClick={handleToggleWebSearch}
                  disabled={isLoading}
                  title={webSearchEnabled ? "Disable web search" : "Enable web search"}
                >
                  {webSearchEnabled ? "ON" : "OFF"}
                </button>
              </div>
              <div className="pm-control-group">
                <label className="pm-control-label">
                  <span className="pm-control-icon">🧬</span>
                  <span>Memory</span>
                </label>
                <button
                  className={`pm-control-toggle ${memorySearchEnabled ? "on" : "off"}`}
                  onClick={handleToggleMemorySearch}
                  disabled={isLoading}
                  title={memorySearchEnabled ? "Disable memory search (Qdrant)" : "Enable memory search (Qdrant)"}
                >
                  {memorySearchEnabled ? "ON" : "OFF"}
                </button>
              </div>
              <div className="pm-control-group">
                <button
                  className="pm-control-btn-inspect"
                  onClick={() => setShowPromptInspector(true)}
                  title="View prompts being sent to the LLM"
                >
                  🔍 View Prompts
                </button>
              </div>
            </div>
            {error && (
              <div className="chat-error-banner">
                <span>⚠️ {error}</span>
                <button className="btn btn-sm btn-ghost" onClick={handleDismissError}>
                  ✕
                </button>
              </div>
            )}
            {isInitializing && (
              <div className="reasoning-indicator">
                <span className="reasoning-icon">⚙️</span>
                <span>Loading agent settings...</span>
              </div>
            )}
            {isLoading && thinkingStatus && !pipelineAgents.length && (
              <div className="reasoning-indicator">
                <span className="reasoning-icon">🧠</span>
                <span>{thinkingStatus}</span>
              </div>
            )}
            {pipelineAgents.length > 0 && (
              <div className="pipeline-visual">
                <div className="pipeline-header">
                  <span className="pipeline-icon">⚡</span>
                  <span className="pipeline-title">Agent Pipeline</span>
                </div>
                <div className="pipeline-steps">
                  {pipelineAgents.map((agent, index) => (
                    <div key={agent.id} className={`pipeline-step ${agent.status}`}>
                      <div className="step-indicator">
                        {agent.status === "complete" && "✓"}
                        {agent.status === "active" && "●"}
                        {agent.status === "pending" && "○"}
                        {agent.status === "skipped" && "–"}
                      </div>
                      <div className="step-info">
                        <span className="step-name">{agent.name}</span>
                        {agent.result_summary && (
                          <span className="step-result">{agent.result_summary}</span>
                        )}
                      </div>
                      {index < pipelineAgents.length - 1 && (
                        <div className={`step-connector ${agent.status === "complete" ? "done" : ""}`} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Chat
              messages={messages}
              onSubmit={handleSubmitPrompt}
              isLoading={isLoading || isInitializing}
              placeholder="Tell me about your project idea..."
              quickPrompt={quickPrompt}
            />
          </div>
        </main>
      )}

      <style>{`
        .project-canvas {
          position: relative;
        }
        .full-width {
          display: flex;
          flex: 1;
          padding: 1rem;
        }
        .full-context-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .pm-tools-controls {
          display: flex;
          gap: 1rem;
          padding: 0.5rem 0.75rem;
          background: var(--gray-100);
          border-radius: var(--radius-md);
          margin-bottom: 0.5rem;
        }
        .pm-control-group {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .pm-control-label {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.6875rem;
          font-weight: 600;
          color: var(--gray-600);
        }
        .pm-control-icon {
          font-size: 0.75rem;
        }
        .pm-control-toggle {
          padding: 0.25rem 0.5rem;
          border: 1px solid var(--gray-300);
          border-radius: var(--radius-sm);
          font-size: 0.625rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .pm-control-toggle.on {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }
        .pm-control-toggle.off {
          background: var(--gray-200);
          color: var(--gray-500);
        }
        .pm-control-toggle:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        /* Pipeline Visual Styles */
        .pipeline-visual {
          background: linear-gradient(135deg, var(--gray-50), var(--gray-100));
          border: 1px solid var(--gray-200);
          border-radius: var(--radius-lg);
          padding: 0.75rem;
          margin-bottom: 0.75rem;
        }
        .pipeline-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid var(--gray-200);
        }
        .pipeline-icon {
          font-size: 0.875rem;
        }
        .pipeline-title {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--gray-700);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .pipeline-steps {
          display: flex;
          align-items: flex-start;
          gap: 0.25rem;
          overflow-x: auto;
          padding-bottom: 0.25rem;
        }
        .pipeline-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 70px;
          position: relative;
        }
        .step-indicator {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.75rem;
          font-weight: 700;
          margin-bottom: 0.25rem;
          transition: all 0.3s ease;
        }
        .pipeline-step.pending .step-indicator {
          background: var(--gray-200);
          color: var(--gray-500);
          border: 2px solid var(--gray-300);
        }
        .pipeline-step.active .step-indicator {
          background: var(--primary);
          color: white;
          border: 2px solid var(--primary);
          animation: pulse 1.5s infinite;
        }
        .pipeline-step.complete .step-indicator {
          background: var(--success, #10b981);
          color: white;
          border: 2px solid var(--success, #10b981);
        }
        .pipeline-step.skipped .step-indicator {
          background: var(--gray-100);
          color: var(--gray-400);
          border: 2px dashed var(--gray-300);
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(99, 102, 241, 0.4); }
          50% { transform: scale(1.05); box-shadow: 0 0 0 6px rgba(99, 102, 241, 0); }
        }
        .step-info {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .step-name {
          font-size: 0.625rem;
          font-weight: 600;
          color: var(--gray-700);
          white-space: nowrap;
          max-width: 65px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pipeline-step.pending .step-name {
          color: var(--gray-500);
        }
        .pipeline-step.active .step-name {
          color: var(--primary);
        }
        .step-result {
          font-size: 0.5625rem;
          color: var(--gray-500);
          white-space: nowrap;
          max-width: 65px;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .step-connector {
          position: absolute;
          top: 12px;
          left: calc(50% + 12px);
          width: calc(100% - 24px);
          height: 2px;
          background: var(--gray-300);
        }
        .step-connector.done {
          background: var(--success, #10b981);
        }
        .pm-control-btn-inspect {
          padding: 0.25rem 0.5rem;
          border: 1px solid var(--primary);
          border-radius: var(--radius-sm);
          font-size: 0.6rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          background: transparent;
          color: var(--primary);
          white-space: nowrap;
        }
        .pm-control-btn-inspect:hover {
          background: var(--primary);
          color: white;
        }
      `}</style>
      <PromptInspector
        isOpen={showPromptInspector}
        onClose={() => setShowPromptInspector(false)}
        fetchPromptInfo={getProjectManagerPromptInfo}
        workspaceName="Project Manager"
      />
    </ErrorBoundary>
  );
}
