import { useState, useRef, useEffect, ReactNode } from "react";
import "./EducationalTooltip.css";

interface TooltipContent {
  term: string;
  definition: string;
  whyUseful?: string;
  learnMore?: string;
}

export const GLOSSARY: Record<string, TooltipContent> = {
  rag: {
    term: "RAG (Retrieval-Augmented Generation)",
    definition:
      "A technique that enhances AI responses by retrieving relevant information from a knowledge base before generating an answer. The AI combines retrieved context with its training to produce more accurate, up-to-date responses.",
    whyUseful:
      "RAG helps AI provide factual, domain-specific answers without retraining. It reduces hallucinations by grounding responses in real data.",
    learnMore:
      "RAG works in 3 steps: 1) Convert query to embedding vector, 2) Find similar documents in vector database, 3) Include retrieved context in the prompt.",
  },
  cot: {
    term: "Chain of Thought (CoT)",
    definition:
      "A prompting technique where the AI breaks down complex problems into smaller reasoning steps before providing a final answer. Each step builds on previous ones.",
    whyUseful:
      "CoT improves accuracy on complex tasks like math, logic, and multi-step reasoning. It makes AI thinking transparent and easier to debug.",
    learnMore:
      "Studies show CoT can improve accuracy by 20-50% on reasoning tasks. It works by mimicking human problem-solving processes.",
  },
  temperature: {
    term: "Temperature",
    definition:
      "A parameter (0-2) that controls randomness in AI responses. Lower values (0.1-0.3) produce focused, deterministic outputs. Higher values (0.7-1.0) increase creativity and variety.",
    whyUseful:
      "Adjust temperature based on your task: low for factual Q&A, code, or data extraction; high for creative writing, brainstorming, or diverse outputs.",
    learnMore:
      "Temperature scales the probability distribution of next-token predictions. At 0, the model always picks the most likely token. At higher values, less likely tokens have a better chance.",
  },
  top_p: {
    term: "Top-P (Nucleus Sampling)",
    definition:
      "A sampling parameter that limits token selection to the smallest set whose cumulative probability exceeds P. For example, top_p=0.9 considers only tokens in the top 90% probability mass.",
    whyUseful:
      "Top-P provides more consistent control over output diversity than temperature alone. Use 0.9-0.95 for most tasks, lower for more focused outputs.",
    learnMore:
      "Unlike temperature which scales all probabilities, top-P dynamically adjusts the candidate pool size based on the probability distribution.",
  },
  top_k: {
    term: "Top-K Sampling",
    definition:
      "A sampling parameter that limits token selection to the K most likely tokens. For example, top_k=40 means only the 40 highest-probability tokens are considered.",
    whyUseful:
      "Top-K prevents the model from selecting extremely unlikely tokens while still allowing variety. Useful when you want predictable diversity.",
    learnMore:
      "Top-K is simpler than top-P but can be too restrictive or too permissive depending on the probability distribution.",
  },
  embedding: {
    term: "Embedding",
    definition:
      "A numerical vector representation of text that captures semantic meaning. Similar texts have similar embeddings, enabling semantic search and comparison.",
    whyUseful:
      "Embeddings power RAG by enabling semantic similarity search. They let us find relevant documents even when exact keywords don't match.",
    learnMore:
      "Modern embedding models produce vectors with 384-1536 dimensions. The closer two vectors are in this space, the more semantically similar the texts.",
  },
  qdrant: {
    term: "Qdrant",
    definition:
      "A vector database optimized for storing and searching embeddings. It enables fast similarity searches across millions of vectors.",
    whyUseful:
      "Qdrant is the memory layer for RAG. It stores document embeddings and quickly finds the most relevant ones for any query.",
    learnMore:
      "Qdrant uses HNSW (Hierarchical Navigable Small World) graphs for efficient approximate nearest neighbor search.",
  },
  tokens: {
    term: "Tokens",
    definition:
      "The basic units that language models process. A token is roughly 4 characters or 0.75 words. Models have limits on how many tokens they can process at once.",
    whyUseful:
      "Understanding tokens helps you optimize prompts. Fewer tokens = faster responses and lower costs. More context tokens = better informed answers.",
    learnMore:
      "Tokenizers split text into subwords. Common words are single tokens, while rare words may be split into multiple tokens.",
  },
  context_window: {
    term: "Context Window",
    definition:
      "The maximum number of tokens a model can process in a single request. This includes both input (prompt + context) and output (response).",
    whyUseful:
      "Knowing your context window helps you balance prompt detail with response length. Larger windows allow more context but may be slower.",
    learnMore:
      "Models range from 4K to 128K+ tokens. Longer contexts enable more complex tasks but may reduce accuracy on distant information.",
  },
  orchestrator: {
    term: "Orchestrator",
    definition:
      "An AI agent that coordinates multiple specialized agents to complete complex tasks. It breaks down goals, assigns subtasks, and synthesizes results.",
    whyUseful:
      "Orchestrators enable complex workflows that single agents can't handle. They're key to building production AI systems.",
    learnMore:
      "The Project Manager uses an orchestrator pattern: PM coordinates Identity, Definition, Goals, and Technical agents.",
  },
};

interface EducationalTooltipProps {
  term: keyof typeof GLOSSARY;
  children: ReactNode;
}

export default function EducationalTooltip({ term, children }: EducationalTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showLearnMore, setShowLearnMore] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const content = GLOSSARY[term];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowLearnMore(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  if (!content) return <>{children}</>;

  return (
    <span className="educational-tooltip-wrapper" ref={tooltipRef}>
      <button
        className="tooltip-trigger"
        onClick={() => setIsOpen(!isOpen)}
        type="button"
        aria-expanded={isOpen ? "true" : "false"}
        aria-label={`Learn about ${content.term}`}
      >
        {children}
        <span className="tooltip-icon">ⓘ</span>
      </button>

      {isOpen && (
        <div className="educational-tooltip">
          <div className="tooltip-header">
            <h4>{content.term}</h4>
            <button
              className="tooltip-close"
              onClick={() => {
                setIsOpen(false);
                setShowLearnMore(false);
              }}
              type="button"
              aria-label="Close tooltip"
            >
              ✕
            </button>
          </div>

          <p className="tooltip-definition">{content.definition}</p>

          {content.whyUseful && (
            <div className="tooltip-section why-useful">
              <h5>💡 Why is this useful?</h5>
              <p>{content.whyUseful}</p>
            </div>
          )}

          {content.learnMore && (
            <div className="tooltip-section learn-more">
              <button
                className="learn-more-toggle"
                onClick={() => setShowLearnMore(!showLearnMore)}
                type="button"
              >
                📚 {showLearnMore ? "Hide details" : "Learn more"}
              </button>
              {showLearnMore && <p className="learn-more-content">{content.learnMore}</p>}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

interface GlossaryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlossaryPanel({ isOpen, onClose }: GlossaryPanelProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedTerms, setExpandedTerms] = useState<Set<string>>(new Set());

  const filteredTerms = Object.entries(GLOSSARY).filter(
    ([key, content]) =>
      key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      content.term.toLowerCase().includes(searchTerm.toLowerCase()) ||
      content.definition.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleTerm = (key: string) => {
    setExpandedTerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="glossary-overlay" onClick={onClose}>
      <div className="glossary-panel" onClick={(e) => e.stopPropagation()}>
        <div className="glossary-header">
          <h2>📖 AI Concepts Glossary</h2>
          <button className="glossary-close" onClick={onClose} type="button">
            ✕
          </button>
        </div>

        <div className="glossary-search">
          <input
            type="text"
            placeholder="Search terms..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="glossary-content">
          {filteredTerms.map(([key, content]) => (
            <div
              key={key}
              className={`glossary-item ${expandedTerms.has(key) ? "expanded" : ""}`}
            >
              <button
                className="glossary-item-header"
                onClick={() => toggleTerm(key)}
                type="button"
              >
                <span className="glossary-term">{content.term}</span>
                <span className="expand-icon">{expandedTerms.has(key) ? "−" : "+"}</span>
              </button>

              {expandedTerms.has(key) && (
                <div className="glossary-item-content">
                  <p className="definition">{content.definition}</p>
                  {content.whyUseful && (
                    <div className="why-section">
                      <strong>💡 Why useful:</strong> {content.whyUseful}
                    </div>
                  )}
                  {content.learnMore && (
                    <div className="learn-section">
                      <strong>📚 Details:</strong> {content.learnMore}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {filteredTerms.length === 0 && (
            <p className="no-results">No terms found matching "{searchTerm}"</p>
          )}
        </div>
      </div>
    </div>
  );
}
