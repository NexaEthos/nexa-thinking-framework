import { useState, useEffect, useRef, useCallback, memo, FormEvent } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "../types";

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

interface AgentChatMessage extends ChatMessage {
  agent_id?: string;
  agent_name?: string;
  message_type?: "task" | "acknowledgment" | "info";
}

const AGENT_ICONS: Record<string, string> = {
  pm: "👔",
  researcher: "🔬",
  identity: "🎯",
  definition: "📐",
  resources: "🛠️",
  execution: "📋",
};

const AGENT_COLORS: Record<string, string> = {
  pm: "#6366f1",
  researcher: "#8b5cf6",
  identity: "#ec4899",
  definition: "#14b8a6",
  resources: "#f59e0b",
  execution: "#10b981",
};

interface ChatProps {
  messages: AgentChatMessage[];
  onSubmit: (prompt: string) => void;
  isLoading: boolean;
  placeholder?: string;
  quickPrompt?: string;
}

function Chat({ messages, onSubmit, isLoading, placeholder, quickPrompt }: ChatProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSubmit = useCallback((e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    onSubmit(trimmed);
    setInput("");
  }, [input, isLoading, onSubmit]);

  const handleQuickPrompt = useCallback(() => {
    if (quickPrompt && !isLoading) {
      onSubmit(quickPrompt);
    }
  }, [quickPrompt, isLoading, onSubmit]);

  return (
    <>
      <div className="panel-header" role="banner">
        <h3>
          <span aria-hidden="true">💬</span> Chat
        </h3>
        {isLoading && (
          <div className="chat-status" role="status" aria-live="polite">
            <span className="status-dot processing" aria-hidden="true" />
            <span>Analyzing...</span>
          </div>
        )}
      </div>

      <div className="chat-messages" role="log" aria-label="Chat messages" aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty-state" role="status">
            <div className="empty-state-icon" aria-hidden="true">💬</div>
            <p className="empty-state-text">
              Enter a prompt below to start reasoning. The system will analyze your request using
              the predefined questions and provide a structured answer.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const isAgent = !!message.agent_id;
            const agentIcon = isAgent ? AGENT_ICONS[message.agent_id || ""] || "🤖" : (message.role === "user" ? "👤" : "🤖");
            const agentColor = isAgent ? AGENT_COLORS[message.agent_id || ""] : undefined;
            const displayName = isAgent ? message.agent_name || message.agent_id : (message.role === "user" ? "You" : "Assistant");
            
            return (
              <div 
                key={`${message.timestamp}-${message.role}-${message.agent_id || ""}`} 
                className={`chat-message ${message.role} ${isAgent ? "agent-message" : ""} ${message.message_type || ""}`}
                role="article"
                aria-label={`${displayName} message`}
              >
                <div 
                  className="message-avatar" 
                  aria-hidden="true"
                  style={agentColor ? { background: agentColor } : undefined}
                >
                  {agentIcon}
                </div>
                <div className="message-bubble">
                  <div className="message-header">
                    <span className="message-role" style={agentColor ? { color: agentColor } : undefined}>
                      {displayName}
                    </span>
                    {message.message_type && (
                      <span className={`message-type-badge ${message.message_type}`}>
                        {message.message_type === "task" && "📤 Task"}
                        {message.message_type === "acknowledgment" && "✓ Done"}
                        {message.message_type === "info" && "💬 Info"}
                      </span>
                    )}
                    <span className="message-time">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="message-content markdown-content">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{message.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            );
          })
        )}
        {isLoading && messages.length > 0 && (
          <div className="chat-message assistant" role="status" aria-label="Assistant is typing">
            <div className="message-avatar" aria-hidden="true">🤖</div>
            <div className="message-bubble typing">
              <div className="typing-indicator" aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="chat-input-container" role="search" aria-label="Send a message">
        {quickPrompt && (
          <button
            type="button"
            onClick={handleQuickPrompt}
            disabled={isLoading}
            className="btn btn-quick-prompt"
            title={quickPrompt}
            aria-label="Use quick prompt"
          >
            <span aria-hidden="true">⚡</span>
          </button>
        )}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isLoading ? "Waiting for response..." : placeholder || "Enter your prompt..."
          }
          className="input"
          disabled={isLoading}
          aria-label="Message input"
        />
        <button 
          type="submit" 
          disabled={!input.trim() || isLoading} 
          className="btn btn-primary"
          aria-label={isLoading ? "Sending message" : "Send message"}
        >
          {isLoading ? "..." : "Send"}
        </button>
      </form>

      <style>{`
        .btn-quick-prompt {
          padding: 0.5rem 0.75rem;
          background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
          color: white;
          border: none;
          border-radius: var(--radius-sm);
          font-size: 1rem;
          cursor: pointer;
          transition: all 0.2s ease;
          flex-shrink: 0;
        }
        .btn-quick-prompt:hover:not(:disabled) {
          transform: scale(1.05);
          box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);
        }
        .btn-quick-prompt:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .chat-status {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.75rem;
          color: var(--gray-500);
        }
        .message-avatar {
          flex-shrink: 0;
          width: 2rem;
          height: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1rem;
          background: var(--gray-100);
          border-radius: var(--radius-full);
        }
        .chat-message.user .message-avatar {
          background: var(--primary);
        }
        .chat-message.assistant .message-avatar {
          background: var(--gray-100);
        }
        .chat-message.agent-message .message-avatar {
          color: white;
          font-size: 0.875rem;
        }
        .chat-message.agent-message.task .message-bubble {
          border-left: 3px solid var(--primary);
        }
        .chat-message.agent-message.acknowledgment .message-bubble {
          border-left: 3px solid #10b981;
        }
        .message-type-badge {
          font-size: 0.625rem;
          padding: 0.125rem 0.375rem;
          border-radius: var(--radius-sm);
          font-weight: 600;
          margin-left: 0.5rem;
        }
        .message-type-badge.task {
          background: rgba(99, 102, 241, 0.1);
          color: var(--primary);
        }
        .message-type-badge.acknowledgment {
          background: rgba(16, 185, 129, 0.1);
          color: #10b981;
        }
        .message-type-badge.info {
          background: rgba(107, 114, 128, 0.1);
          color: var(--gray-600);
        }
        .message-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.375rem;
        }
        .message-role {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .chat-message.user .message-role {
          color: rgba(255,255,255,0.8);
        }
        .chat-message.assistant .message-role {
          color: var(--gray-500);
        }
        .message-time {
          font-size: 0.6875rem;
          opacity: 0.6;
        }
        .message-content {
          line-height: 1.4;
        }
        .markdown-content {
          font-size: 0.875rem;
        }
        .markdown-content p {
          margin: 0 0 0.2rem 0;
        }
        .markdown-content p:last-child {
          margin-bottom: 0;
        }
        .markdown-content h1,
        .markdown-content h2,
        .markdown-content h3,
        .markdown-content h4 {
          margin: 0.35rem 0 0.15rem 0;
          font-weight: 600;
          line-height: 1.2;
        }
        .markdown-content h1:first-child,
        .markdown-content h2:first-child,
        .markdown-content h3:first-child {
          margin-top: 0;
        }
        .markdown-content h1 { font-size: 1.2rem; }
        .markdown-content h2 { font-size: 1.05rem; }
        .markdown-content h3 { font-size: 0.95rem; }
        .markdown-content h4 { font-size: 0.875rem; }
        .markdown-content code {
          font-family: 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
          font-size: 0.85em;
          padding: 0.05rem 0.25rem;
          border-radius: 3px;
        }
        .chat-message.user .markdown-content code {
          background: rgba(255,255,255,0.2);
          color: white;
        }
        .chat-message.assistant .markdown-content code {
          background: var(--gray-100);
          color: var(--primary);
        }
        .markdown-content pre {
          margin: 0.2rem 0;
          padding: 0.5rem 0.75rem;
          border-radius: var(--radius);
          overflow-x: auto;
          font-size: 0.8rem;
          line-height: 1.35;
        }
        .chat-message.user .markdown-content pre {
          background: rgba(0,0,0,0.2);
        }
        .chat-message.assistant .markdown-content pre {
          background: var(--gray-900);
          color: var(--gray-100);
        }
        .markdown-content pre code {
          padding: 0;
          background: transparent;
          color: inherit;
        }
        .markdown-content ul,
        .markdown-content ol {
          margin: 0.15rem 0;
          padding-left: 1.1rem;
        }
        .markdown-content li {
          margin: 0.05rem 0;
        }
        .markdown-content li::marker {
          color: var(--primary);
        }
        .chat-message.user .markdown-content li::marker {
          color: rgba(255,255,255,0.7);
        }
        .markdown-content blockquote {
          margin: 0.2rem 0;
          padding: 0.25rem 0.5rem;
          border-left: 2px solid var(--primary);
          font-style: italic;
        }
        .chat-message.user .markdown-content blockquote {
          border-left-color: rgba(255,255,255,0.5);
          background: rgba(255,255,255,0.1);
        }
        .chat-message.assistant .markdown-content blockquote {
          background: var(--gray-50);
          color: var(--gray-600);
        }
        .markdown-content table {
          width: 100%;
          margin: 0.2rem 0;
          border-collapse: collapse;
          font-size: 0.8rem;
        }
        .markdown-content th,
        .markdown-content td {
          padding: 0.25rem 0.5rem;
          text-align: left;
          border: 1px solid var(--gray-200);
        }
        .chat-message.user .markdown-content th,
        .chat-message.user .markdown-content td {
          border-color: rgba(255,255,255,0.2);
        }
        .markdown-content th {
          font-weight: 600;
        }
        .chat-message.user .markdown-content th {
          background: rgba(255,255,255,0.15);
        }
        .chat-message.assistant .markdown-content th {
          background: var(--gray-50);
        }
        .markdown-content hr {
          margin: 0.3rem 0;
          border: none;
          border-top: 1px solid var(--gray-200);
        }
        .chat-message.user .markdown-content hr {
          border-color: rgba(255,255,255,0.2);
        }
        .markdown-content a {
          color: var(--primary);
          text-decoration: underline;
        }
        .chat-message.user .markdown-content a {
          color: white;
        }
        .markdown-content strong {
          font-weight: 600;
        }
        .markdown-content em {
          font-style: italic;
        }
        .message-bubble.typing {
          padding: 1rem;
        }
        .typing-indicator {
          display: flex;
          gap: 0.25rem;
        }
        .typing-indicator span {
          width: 0.5rem;
          height: 0.5rem;
          background: var(--gray-400);
          border-radius: 50%;
          animation: typing 1.4s ease-in-out infinite;
        }
        .typing-indicator span:nth-child(2) {
          animation-delay: 0.2s;
        }
        .typing-indicator span:nth-child(3) {
          animation-delay: 0.4s;
        }
        @keyframes typing {
          0%, 60%, 100% {
            transform: translateY(0);
            opacity: 0.4;
          }
          30% {
            transform: translateY(-0.25rem);
            opacity: 1;
          }
        }
        .message-content.streaming {
          border-left: 3px solid var(--primary);
          padding-left: 0.75rem;
          margin-left: -0.75rem;
        }
        .streaming-cursor {
          color: var(--primary);
          animation: blink-cursor 0.8s step-end infinite;
          font-weight: bold;
        }
        @keyframes blink-cursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </>
  );
}

export default memo(Chat);