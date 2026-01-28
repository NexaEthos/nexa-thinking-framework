import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ErrorBoundary from "./ErrorBoundary";
import PromptInspector from "./PromptInspector";
import "./ResearcherPanel.css";
import {
  getResearcherGreeting,
  resetResearcher,
  ResearchAgentInvocation,
  getRAGStatus,
  toggleRAG,
  API_BASE_URL as API_BASE,
} from "../services/api";
import { getResearchLabPromptInfo } from "../services/api/prompts";
import { ResearchPipelineAgent, ResearchAgentMessageData, WebSocketMessage, RAGContentData } from "../types";
import { useWebSocket } from "../services/websocket";

interface Footnote {
  id: number;
  claim: string;
  status: "verified" | "check";
  source?: string;
}

interface A4Page {
  content: string;
  pageNumber: number;
  footnotes: Footnote[];
}

interface WalkthroughStep {
  label: string;
  prompt: string;
}

interface Walkthrough {
  topic: string;
  steps: WalkthroughStep[];
}

const WALKTHROUGHS: Walkthrough[] = [
  {
    topic: "Collapse of the wave function",
    steps: [
      { label: "1. Introduction", prompt: "Create a comprehensive research document about the Collapse of the Wave Function in quantum mechanics. Include detailed explanations of measurement problem, observer effect, and historical development." },
      { label: "2. Expand: Interpretations", prompt: "Significantly expand the document with detailed sections about major interpretations: Copenhagen interpretation, Many-Worlds interpretation, Decoherence theory, and Pilot Wave theory. Include key physicists and their contributions." },
      { label: "3. Expand: Experiments", prompt: "Add extensive content about landmark experiments: double-slit experiment variations, quantum eraser, delayed choice experiments, and recent experimental tests. Include specific dates, researchers, and results." },
    ],
  },
  {
    topic: "CRISPR gene editing",
    steps: [
      { label: "1. Introduction", prompt: "Create a comprehensive research document about CRISPR-Cas9 gene editing technology. Cover its discovery, the scientists involved (Doudna, Charpentier), and fundamental principles of how it works." },
      { label: "2. Expand: Mechanism", prompt: "Significantly expand with detailed molecular biology: Cas9 protein structure and function, guide RNA design, PAM sequences, DNA repair pathways (NHEJ, HDR), and delivery methods. Include technical details." },
      { label: "3. Expand: Applications", prompt: "Add extensive sections on applications: therapeutic uses (sickle cell, cancer), agricultural applications, disease research, and detailed coverage of ethical debates, regulatory frameworks, and future possibilities." },
    ],
  },
  {
    topic: "Climate change economics",
    steps: [
      { label: "1. Introduction", prompt: "Create a comprehensive research document about the economics of climate change. Cover the Stern Review, social cost of carbon, and the intersection of environmental science and economics." },
      { label: "2. Expand: Costs", prompt: "Significantly expand with detailed analysis of economic costs: GDP impact projections, sector-specific damages (agriculture, infrastructure, health), regional disparities, and historical economic impacts from climate events." },
      { label: "3. Expand: Solutions", prompt: "Add extensive content on economic solutions: carbon pricing mechanisms (taxes vs cap-and-trade), green bond markets, renewable energy economics, just transition policies, and international agreements like Paris Accord economics." },
    ],
  },
  {
    topic: "Quantum computing fundamentals",
    steps: [
      { label: "1. Introduction", prompt: "Create a comprehensive research document about quantum computing fundamentals. Cover the history from Feynman to today, basic principles distinguishing quantum from classical computing, and current state of the field." },
      { label: "2. Expand: Qubits", prompt: "Significantly expand with detailed physics of qubits: superposition mathematics, entanglement mechanics, different physical implementations (superconducting, trapped ion, photonic, topological), coherence times, and error rates." },
      { label: "3. Expand: Algorithms", prompt: "Add extensive content on quantum algorithms: Shor's algorithm for factoring, Grover's search algorithm, quantum simulation applications, QAOA, VQE, and analysis of quantum advantage claims and limitations." },
    ],
  },
];

interface ChatMessage {
  role: "user" | "assistant" | "agent";
  content: string;
  timestamp: string;
  agentInvocations?: ResearchAgentInvocation[];
  agentId?: string;
  agentName?: string;
  messageType?: "task" | "acknowledgment" | "info";
}

const AGENT_COLORS: Record<string, string> = {
  orchestrator: "#6366f1",
  web_researcher: "#f59e0b",
  rag_indexer: "#10b981",
  document_writer: "#3b82f6",
  fact_checker: "#8b5cf6",
};

const AGENT_EMOJIS: Record<string, string> = {
  orchestrator: "🎯",
  web_researcher: "🔍",
  rag_indexer: "📚",
  document_writer: "📝",
  fact_checker: "✅",
};

export default function ResearcherPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [researchData, setResearchData] = useState("");
  const [footnotes, setFootnotes] = useState<Footnote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeWalkthrough, setActiveWalkthrough] = useState<Walkthrough | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const [pipelineAgents, setPipelineAgents] = useState<ResearchPipelineAgent[]>([]);
  const [, setCurrentPipelineAgent] = useState<string | null>(null);
  const [ragEnabled, setRagEnabled] = useState(true);
  const [ragConfigured, setRagConfigured] = useState(false);
  const [ragCollectionSize, setRagCollectionSize] = useState(0);
  const [ragPopupVisible, setRagPopupVisible] = useState(false);
  const [ragPopupContent, setRagPopupContent] = useState<RAGContentData | null>(null);
  const [showPromptInspector, setShowPromptInspector] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const documentRef = useRef<HTMLDivElement>(null);

  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    if (message.type === "research_pipeline") {
      setPipelineAgents(message.data.agents);
      setCurrentPipelineAgent(message.data.current_agent);
    } else if (message.type === "research_agent_message") {
      const agentMsg = message.data as ResearchAgentMessageData;
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          content: agentMsg.message,
          timestamp: agentMsg.timestamp,
          agentId: agentMsg.agent_id,
          agentName: agentMsg.agent_name,
          messageType: agentMsg.message_type,
        },
      ]);
      if (agentMsg.agent_id === "rag_indexer" && agentMsg.message_type === "acknowledgment") {
        getRAGStatus().then(status => {
          setRagCollectionSize(status.collection_size || 0);
        }).catch(() => {});
      }
    } else if (message.type === "rag_content") {
      const ragData = message.data as RAGContentData;
      setRagPopupContent(ragData);
      setRagPopupVisible(true);
    }
  }, []);

  useWebSocket(handleWebSocketMessage);

  const parseFootnotesFromFactChecker = useCallback((content: string): Footnote[] => {
    const footnotesList: Footnote[] = [];
    const lines = content.split('\n');
    let id = 1;
    
    for (const line of lines) {
      // Match "✅ **Verified**: claim" or just "✅ claim text"
      const verifiedMatch = line.match(/✅\s*(?:\*\*Verified\*\*:?\s*)?(.+?)(?:\s*[-–—]\s*(.+))?$/);
      if (verifiedMatch && verifiedMatch[1].trim().length > 5) {
        footnotesList.push({
          id: id++,
          claim: verifiedMatch[1].trim().replace(/\*\*/g, ''),
          status: "verified",
          source: verifiedMatch[2]?.trim(),
        });
        continue;
      }
      
      // Match "⚠️ **Check**: claim" or just "⚠️ claim text"
      const checkMatch = line.match(/⚠️\s*(?:\*\*(?:Check|Unverified)\*\*:?\s*)?(.+?)(?:\s*[-–—]\s*(.+))?$/);
      if (checkMatch && checkMatch[1].trim().length > 5) {
        footnotesList.push({
          id: id++,
          claim: checkMatch[1].trim().replace(/\*\*/g, ''),
          status: "check",
          source: checkMatch[2]?.trim(),
        });
      }
    }
    
    return footnotesList;
  }, []);

  const paginateContent = useMemo(() => {
    if (!researchData) return [];
    
    // Split by markdown headers (h1, h2, h3) - lookahead to keep the header with the content
    const sections = researchData.split(/(?=^#{1,3}\s)/m).filter(s => s.trim());
    const pages: A4Page[] = [];
    let currentPageContent = "";
    let currentPageNumber = 1;
    const CHARS_PER_PAGE = 3200;
    
    for (const section of sections) {
      if (currentPageContent.length + section.length > CHARS_PER_PAGE && currentPageContent.length > 0) {
        pages.push({
          content: currentPageContent.trim(),
          pageNumber: currentPageNumber,
          footnotes: [],
        });
        currentPageNumber++;
        currentPageContent = section;
      } else {
        currentPageContent += section;
      }
    }
    
    if (currentPageContent.trim()) {
      pages.push({
        content: currentPageContent.trim(),
        pageNumber: currentPageNumber,
        footnotes: [],
      });
    }
    
    return pages;
  }, [researchData]);

  useEffect(() => {
    const initialize = async () => {
      try {
        const [greeting, ragStatus] = await Promise.all([
          getResearcherGreeting(),
          getRAGStatus(),
        ]);
        setMessages([
          {
            role: "assistant",
            content: greeting,
            timestamp: new Date().toISOString(),
          },
        ]);
        setRagEnabled(ragStatus.rag_enabled);
        setRagConfigured(ragStatus.qdrant_configured);
        setRagCollectionSize(ragStatus.collection_size || 0);
      } catch (err) {
        console.error("Failed to load researcher greeting:", err);
        setError("Failed to initialize researcher. Check backend connection.");
      } finally {
        setIsInitializing(false);
      }
    };
    initialize();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const submitQuery = useCallback(
    async (query: string, stepIndex?: number) => {
      if (!query.trim() || isLoading) return;

      setInputValue("");
      setIsLoading(true);
      setIsStreaming(true);
      setError(null);

      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: query,
          timestamp: new Date().toISOString(),
        },
      ]);

      abortControllerRef.current = new AbortController();
      let streamedContent = "";

      try {
        const response = await fetch(`${API_BASE}/api/researcher/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: query, research_data: researchData }),
          signal: abortControllerRef.current.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          throw new Error("No response body");
        }

        let factCheckResult: { content: string; success: boolean } | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "token") {
                  streamedContent += data.content;
                  const displayContent = streamedContent
                    .replace(/^===+\s*[A-Z][A-Z\s]*[=\s]+$/gim, '');
                  setResearchData(displayContent);
                } else if (data.type === "fact_check") {
                  factCheckResult = { content: data.content, success: data.success };
                  const parsedFootnotes = parseFootnotesFromFactChecker(data.content);
                  // Accumulate footnotes across expansion steps, re-numbering sequentially
                  setFootnotes((prev) => {
                    const combined = [...prev, ...parsedFootnotes];
                    return combined.map((fn, idx) => ({ ...fn, id: idx + 1 }));
                  });
                } else if (data.type === "done") {
                  // Strip ALL === ... === markers (LLM outputs various section markers)
                  // Handles: ===EXPANSION===, === EXPANSION ===, ===EXPANSION== =, etc.
                  const cleanedData = (data.research_data || '')
                    .replace(/^===+\s*[A-Z][A-Z\s]*[=\s]+$/gim, '');
                  setResearchData(cleanedData);
                }
              } catch {
                // Skip malformed JSON
              }
            }
          }
        }

        const assistantContent = factCheckResult 
          ? `## ✅ Fact Verification Report\n\n${factCheckResult.content}`
          : "Research updated in the document panel.";

        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: assistantContent,
            timestamp: new Date().toISOString(),
          },
        ]);

        // Mark walkthrough step as completed
        const stepToComplete = stepIndex ?? currentStep;
        if (stepToComplete !== null && stepToComplete !== undefined) {
          setCompletedSteps((prev) => new Set([...prev, stepToComplete]));
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        console.error("Researcher streaming error:", err);
        setError(err instanceof Error ? err.message : "Failed to get response");
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    },
    [isLoading, researchData, currentStep, parseFootnotesFromFactChecker]
  );

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (inputValue.trim()) {
        submitQuery(inputValue.trim());
      }
    },
    [inputValue, submitQuery]
  );

  const handleQuickPrompt = useCallback(
    (topic: string) => {
      const walkthrough = WALKTHROUGHS.find((w) => w.topic === topic);
      if (walkthrough) {
        setActiveWalkthrough(walkthrough);
        setCompletedSteps(new Set());
        setCurrentStep(0);
        submitQuery(walkthrough.steps[0].prompt, 0);
      }
    },
    [submitQuery]
  );

  const handleWalkthroughStep = useCallback(
    (stepIndex: number) => {
      if (!activeWalkthrough || stepIndex >= activeWalkthrough.steps.length) return;
      setCurrentStep(stepIndex);
      submitQuery(activeWalkthrough.steps[stepIndex].prompt, stepIndex);
    },
    [activeWalkthrough, submitQuery]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleReset = async () => {
    try {
      await resetResearcher();
      setMessages([]);
      setResearchData("");
      setFootnotes([]);
      setActiveWalkthrough(null);
      setCompletedSteps(new Set());
      setCurrentStep(null);
      setPipelineAgents([]);
      setCurrentPipelineAgent(null);
      const greeting = await getResearcherGreeting();
      setMessages([
        {
          role: "assistant",
          content: greeting,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error("Failed to reset researcher:", err);
      setError("Failed to reset researcher session");
    }
  };

  const handleExport = useCallback(() => {
    if (!researchData) return;
    
    const blob = new Blob([researchData], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `research-${new Date().toISOString().split("T")[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [researchData]);

  const handleToggleRAG = useCallback(async () => {
    try {
      const result = await toggleRAG(!ragEnabled);
      setRagEnabled(result.rag_enabled);
      const status = await getRAGStatus();
      setRagCollectionSize(status.collection_size || 0);
    } catch (err) {
      console.error("Failed to toggle RAG:", err);
      setError("Failed to toggle RAG");
    }
  }, [ragEnabled]);

  const renderInvocations = (invocations: ResearchAgentInvocation[]) => {
    return (
      <div className="agent-invocations">
        {invocations.map((inv, idx) => (
          <details key={idx} className={`invocation ${inv.success ? "success" : "error"}`}>
            <summary>
              {inv.success ? "✅" : "❌"} {inv.agent_id === "researcher" ? "🔍 Researcher" : "✅ Fact Checker"}
            </summary>
            <div className="invocation-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{inv.content || inv.error || "No output"}</ReactMarkdown>
            </div>
          </details>
        ))}
      </div>
    );
  };

  return (
    <ErrorBoundary>
      <main className="main-content two-column">
        <div className="panel research-document-panel">
          <div className="panel-header">
            <h3>📄 Research Document</h3>
            <div className="header-actions">
              {ragConfigured && (
                <button
                  className={`btn btn-sm ${ragEnabled ? "btn-rag-on" : "btn-rag-off"}`}
                  onClick={handleToggleRAG}
                  disabled={isLoading}
                  title={ragEnabled 
                    ? `RAG enabled - ${ragCollectionSize} documents in knowledge base. Click to disable.` 
                    : "RAG disabled - click to enable knowledge retrieval & indexing"}
                >
                  🧬 RAG {ragEnabled ? `ON (${ragCollectionSize})` : "OFF"}
                </button>
              )}
              {researchData && (
                <button className="btn btn-sm btn-ghost" onClick={handleExport} title="Export to file">
                  💾 Export
                </button>
              )}
              <button className="btn btn-sm btn-ghost" onClick={handleReset} title="Reset session">
                🔄 Reset
              </button>
              <button 
                className="btn btn-sm btn-prompt-inspect" 
                onClick={() => setShowPromptInspector(true)} 
                title="View prompts being sent to the LLM"
              >
                🔍 Prompts
              </button>
            </div>
          </div>
          {activeWalkthrough && (
            <div className="walkthrough-stepper">
              <div className="walkthrough-title">
                📍 Walkthrough: <strong>{activeWalkthrough.topic}</strong>
                <button 
                  className="walkthrough-close" 
                  onClick={() => setActiveWalkthrough(null)}
                  title="Close walkthrough"
                >
                  ✕
                </button>
              </div>
              <div className="walkthrough-steps">
                {activeWalkthrough.steps.map((step, idx) => (
                  <button
                    key={idx}
                    className={`walkthrough-step ${idx === currentStep ? "active" : ""} ${completedSteps.has(idx) ? "completed" : ""}`}
                    onClick={() => handleWalkthroughStep(idx)}
                    disabled={isLoading}
                  >
                    <span className="step-indicator">
                      {completedSteps.has(idx) ? "✓" : idx + 1}
                    </span>
                    <span className="step-label">{step.label.replace(/^\d+\.\s*/, "")}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="research-document-view" ref={documentRef}>
            {researchData ? (
              <div className="a4-pages-container">
                {paginateContent.map((page) => (
                  <article key={page.pageNumber} className="a4-page">
                    <div className="a4-page-content">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer">
                              {children}
                            </a>
                          ),
                        }}
                      >{page.content}</ReactMarkdown>
                    </div>
                    
                    <div className="a4-page-number">
                      Page {page.pageNumber} of {paginateContent.length}
                    </div>
                  </article>
                ))}
                
                {/* Verification Notes Section - appears after all pages */}
                {footnotes.length > 0 && (
                  <article className="a4-page verification-notes-page">
                    <h2 className="verification-notes-title">📋 Verification Notes</h2>
                    <p className="verification-notes-intro">
                      The following claims from this document have been fact-checked:
                    </p>
                    <div className="verification-notes-list">
                      {footnotes.map((note, idx) => (
                        <div key={idx} className={`verification-note ${note.status}`}>
                          <span className="note-number">{idx + 1}.</span>
                          <span className="note-status">
                            {note.status === "verified" ? "✅" : "⚠️"}
                          </span>
                          <span className="note-claim">{note.claim}</span>
                          {note.source && (
                            <span className="note-source"> — {note.source}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </article>
                )}
              </div>
            ) : (
              <div className="empty-research-state">
                <div className="empty-icon">📚</div>
                <p>Ask a research question in the chat to generate a comprehensive document.</p>
              </div>
            )}
          </div>
        </div>

        <div className="panel chat-panel-container">
          {error && (
            <div className="chat-error-banner">
              <span>⚠️ {error}</span>
              <button className="btn btn-sm btn-ghost" onClick={() => setError(null)}>
                ✕
              </button>
            </div>
          )}

          {isInitializing && (
            <div className="reasoning-indicator">
              <span className="reasoning-icon">⚙️</span>
              <span>Initializing Research Lab...</span>
            </div>
          )}

          {pipelineAgents.length > 0 && (
            <div className="research-pipeline-visual">
              <h4>🔬 RESEARCH PIPELINE</h4>
              <div className="pipeline-agents">
                {pipelineAgents.map((agent) => (
                  <div
                    key={agent.id}
                    className={`pipeline-agent ${agent.status}`}
                  >
                    <div className="agent-icon">
                      {agent.status === "complete" ? "✓" : agent.emoji}
                    </div>
                    <div className="agent-info">
                      <span className="agent-name">{agent.name}</span>
                      <span className="agent-status-text">
                        {agent.status === "active" ? "Working..." : 
                         agent.status === "complete" ? "Done" : 
                         agent.status === "skipped" ? "Skipped" : "Pending"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="chat-messages">
            {messages.map((msg, idx) => {
              const isAgent = msg.role === "agent";
              const agentColor = isAgent ? AGENT_COLORS[msg.agentId || ""] || "#6b7280" : undefined;
              const agentEmoji = isAgent ? AGENT_EMOJIS[msg.agentId || ""] || "🤖" : undefined;

              return (
                <div key={idx} className={`chat-message ${msg.role} ${isAgent ? `agent-${msg.messageType}` : ""}`}>
                  {isAgent && (
                    <div className="agent-avatar" style={{ backgroundColor: agentColor }}>
                      {agentEmoji}
                    </div>
                  )}
                  <div className="message-content">
                    {isAgent && (
                      <div className="agent-header">
                        <span className="agent-name" style={{ color: agentColor }}>{msg.agentName}</span>
                        {msg.messageType && (
                          <span className={`message-type-badge ${msg.messageType}`}>
                            {msg.messageType === "task" ? "📤 Task" :
                             msg.messageType === "acknowledgment" ? "✓ Done" : "ℹ️ Info"}
                          </span>
                        )}
                        <span className="message-time">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    )}
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        em: ({ children }) => {
                          const text = String(children);
                          const isQuickPrompt = [
                            "Collapse of the wave function",
                            "CRISPR gene editing",
                            "Climate change economics",
                            "Quantum computing fundamentals",
                          ].includes(text);
                          if (isQuickPrompt) {
                            return (
                              <button
                                className="quick-prompt-btn"
                                onClick={() => handleQuickPrompt(text)}
                                disabled={isLoading}
                              >
                                {text}
                              </button>
                            );
                          }
                          return <em>{children}</em>;
                        },
                      }}
                    >{msg.content}</ReactMarkdown>
                  </div>
                  {msg.agentInvocations && msg.agentInvocations.length > 0 && renderInvocations(msg.agentInvocations)}
                </div>
              );
            })}
            {isLoading && (
              <div className="chat-message assistant loading">
                <div className="message-content">
                  <span className="typing-indicator">
                    {isStreaming ? "✍️ Writing..." : "🔬 Researching..."}
                  </span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="chat-input-form" onSubmit={handleSubmit}>
            <textarea
              ref={textareaRef}
              className="chat-input"
              placeholder="Ask to research, enrich, or verify data..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading || isInitializing}
              rows={2}
            />
            <button type="submit" className="btn btn-primary send-btn" disabled={isLoading || isInitializing || !inputValue.trim()}>
              {isLoading ? "..." : "Send"}
            </button>
          </form>
        </div>
      </main>

      {ragPopupVisible && ragPopupContent && (
        <div className="rag-popup-overlay" onClick={() => setRagPopupVisible(false)}>
          <div className="rag-popup" onClick={(e) => e.stopPropagation()}>
            <div className="rag-popup-header">
              <h3>
                {ragPopupContent.action === "retrieved" ? (
                  <>🎯 Retrieved Content from Knowledge Base</>
                ) : (
                  <>📦 Content Indexed to Knowledge Base</>
                )}
              </h3>
              <button className="rag-popup-close" onClick={() => setRagPopupVisible(false)}>
                ✕
              </button>
            </div>
            <div className="rag-popup-meta">
              {ragPopupContent.action === "retrieved" ? (
                <>
                  <span className="meta-badge">📚 {ragPopupContent.metadata.count} document(s)</span>
                  <span className="meta-badge">📊 Avg relevance: {((ragPopupContent.metadata.avg_score || 0) * 100).toFixed(0)}%</span>
                </>
              ) : (
                <>
                  <span className="meta-badge">📝 {(ragPopupContent.metadata.chars || 0).toLocaleString()} chars</span>
                  <span className="meta-badge">📊 Total: {ragPopupContent.metadata.collection_size} docs</span>
                  {ragPopupContent.metadata.topics && ragPopupContent.metadata.topics.length > 0 && (
                    <span className="meta-badge">📑 Topics: {ragPopupContent.metadata.topics.slice(0, 3).join(", ")}</span>
                  )}
                </>
              )}
            </div>
            <div className="rag-popup-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {ragPopupContent.content || "_No content available_"}
              </ReactMarkdown>
            </div>
            <div className="rag-popup-footer">
              <span className="timestamp">
                {new Date(ragPopupContent.timestamp).toLocaleString()}
              </span>
              <button className="btn btn-sm btn-primary" onClick={() => setRagPopupVisible(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <PromptInspector
        isOpen={showPromptInspector}
        onClose={() => setShowPromptInspector(false)}
        fetchPromptInfo={getResearchLabPromptInfo}
        workspaceName="Research Lab"
      />
    </ErrorBoundary>
  );
}
