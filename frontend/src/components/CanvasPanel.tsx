import { useState, useEffect, useCallback, ReactNode, memo } from "react";
import ReactMarkdown, { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CanvasSectionId } from "../types/agents";
import { RAGResult } from "../types";
import { getCanvas } from "../services/api";
import "./CanvasPanel.css";

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

const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

function tryParseJSON(content: string): unknown | null {
  if (!content) return null;
  let cleaned = content.trim();
  
  // Remove markdown code blocks
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();
  
  // Try direct parse first
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object from the content
    const jsonStart = cleaned.indexOf("{");
    if (jsonStart >= 0) {
      // Find matching closing brace by counting
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = jsonStart; i < cleaned.length; i++) {
        const char = cleaned[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === "\\") {
          escape = true;
          continue;
        }
        if (char === '"' && !escape) {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === "{") depth++;
          else if (char === "}") {
            depth--;
            if (depth === 0) {
              // Found complete JSON object
              const jsonStr = cleaned.slice(jsonStart, i + 1);
              try {
                return JSON.parse(jsonStr);
              } catch {
                break;
              }
            }
          }
        }
      }
    }
    
    // Try to find JSON array
    const arrayStart = cleaned.indexOf("[");
    if (arrayStart >= 0) {
      let depth = 0;
      let inString = false;
      let escape = false;
      for (let i = arrayStart; i < cleaned.length; i++) {
        const char = cleaned[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === "\\") {
          escape = true;
          continue;
        }
        if (char === '"' && !escape) {
          inString = !inString;
          continue;
        }
        if (!inString) {
          if (char === "[") depth++;
          else if (char === "]") {
            depth--;
            if (depth === 0) {
              const jsonStr = cleaned.slice(arrayStart, i + 1);
              try {
                return JSON.parse(jsonStr);
              } catch {
                break;
              }
            }
          }
        }
      }
    }
    return null;
  }
}

function renderIdentityContent(data: unknown): ReactNode {
  const obj = data as { name?: string; description?: string };
  return (
    <div className="formatted-identity">
      {obj.name && (
        <div className="identity-name">
          <span className="label">Project Name</span>
          <h4>{obj.name}</h4>
        </div>
      )}
      {obj.description && (
        <div className="identity-description">
          <span className="label">Vision</span>
          <p>{obj.description}</p>
        </div>
      )}
    </div>
  );
}

function renderFeatureItem(feature: unknown, index: number): ReactNode {
  if (typeof feature === "string") {
    const colonIndex = feature.indexOf(":");
    if (colonIndex > 0) {
      const name = feature.substring(0, colonIndex).trim();
      const description = feature.substring(colonIndex + 1).trim();
      return (
        <div key={index} className="feature-item">
          <strong>{name}</strong>
          <p>{description}</p>
        </div>
      );
    }
    return (
      <div key={index} className="feature-item">
        <p>{feature}</p>
      </div>
    );
  }
  const f = feature as { name?: string; description?: string };
  if (f.name || f.description) {
    return (
      <div key={index} className="feature-item">
        {f.name && <strong>{f.name}</strong>}
        {f.description && <p>{f.description}</p>}
      </div>
    );
  }
  return null;
}

function renderDefinitionContent(data: unknown): ReactNode {
  const obj = data as {
    features?: unknown[];
    constraints?: string[];
    success_criteria?: string[];
    out_of_scope?: string[];
  };
  const renderedFeatures = Array.isArray(obj.features) ? obj.features.map((f, i) => renderFeatureItem(f, i)).filter(Boolean) : [];
  return (
    <div className="formatted-definition">
      {renderedFeatures.length > 0 && (
        <div className="def-section">
          <span className="label">✨ Features</span>
          <div className="feature-list">
            {renderedFeatures}
          </div>
        </div>
      )}
      {obj.constraints && Array.isArray(obj.constraints) && obj.constraints.length > 0 && (
        <div className="def-section">
          <span className="label">⚠️ Constraints</span>
          <ul>{obj.constraints.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}
      {obj.success_criteria && Array.isArray(obj.success_criteria) && obj.success_criteria.length > 0 && (
        <div className="def-section">
          <span className="label">🎯 Success Criteria</span>
          <ul>{obj.success_criteria.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}
      {obj.out_of_scope && Array.isArray(obj.out_of_scope) && obj.out_of_scope.length > 0 && (
        <div className="def-section">
          <span className="label">🚫 Out of Scope</span>
          <ul>{obj.out_of_scope.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function renderResourcesContent(data: unknown): ReactNode {
  const obj = data as {
    materials?: string[];
    tools?: string[];
    skills_people?: string[];
    skills?: string[];
    budget?: { estimated_range?: string; breakdown?: Record<string, string>; notes?: string };
    timeline?: Record<string, unknown>;
    dependencies?: string[];
  };
  const skills = obj.skills_people || obj.skills || [];
  const hasMaterials = obj.materials && Array.isArray(obj.materials) && obj.materials.length > 0;
  const hasTools = obj.tools && Array.isArray(obj.tools) && obj.tools.length > 0;
  const hasSkills = Array.isArray(skills) && skills.length > 0;
  const hasBudget = obj.budget && (obj.budget.estimated_range || obj.budget.breakdown || obj.budget.notes);
  const hasTimeline = obj.timeline;
  const hasDependencies = obj.dependencies && Array.isArray(obj.dependencies) && obj.dependencies.length > 0;
  const hasKnownFields = hasMaterials || hasTools || hasSkills || hasBudget || hasTimeline || hasDependencies;
  if (!hasKnownFields) {
    return (
      <div className="formatted-resources">
        <pre className="json-fallback">{JSON.stringify(data, null, 2)}</pre>
      </div>
    );
  }
  return (
    <div className="formatted-resources">
      {hasMaterials && (
        <div className="res-section">
          <span className="label">📦 Materials</span>
          <ul>{obj.materials!.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
      {hasTools && (
        <div className="res-section">
          <span className="label">🛠️ Tools</span>
          <ul>{obj.tools!.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
      {hasSkills && (
        <div className="res-section">
          <span className="label">👥 Skills & People</span>
          <ul>{skills.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      {hasBudget && (
        <div className="res-section">
          <span className="label">💰 Budget</span>
          <div className="budget-info">
            {obj.budget!.estimated_range && <p><strong>Estimate:</strong> {obj.budget!.estimated_range}</p>}
            {obj.budget!.breakdown && (
              <div className="budget-breakdown">
                {Object.entries(obj.budget!.breakdown).map(([key, val]) => (
                  <div key={key} className="budget-item">
                    <span>{key.replace(/_/g, " ")}</span>
                    <span>{val}</span>
                  </div>
                ))}
              </div>
            )}
            {obj.budget!.notes && <p className="budget-notes">{obj.budget!.notes}</p>}
          </div>
        </div>
      )}
      {obj.timeline && typeof obj.timeline === "object" && !Array.isArray(obj.timeline) && (
        <div className="res-section">
          <span className="label">📅 Timeline</span>
          <div className="timeline-info">
            {Object.entries(obj.timeline).map(([key, val]) => (
              <div key={key} className="timeline-item">
                <strong>{key.replace(/_/g, " ")}:</strong>{" "}
                {typeof val === "object" && val !== null
                  ? JSON.stringify(val)
                  : Array.isArray(val)
                    ? val.join(", ")
                    : String(val)}
              </div>
            ))}
          </div>
        </div>
      )}
      {obj.timeline && typeof obj.timeline === "string" && (
        <div className="res-section">
          <span className="label">📅 Timeline</span>
          <p>{obj.timeline}</p>
        </div>
      )}
      {hasDependencies && (
        <div className="res-section">
          <span className="label">🔗 Dependencies</span>
          <ul>{obj.dependencies!.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function renderExecutionContent(data: unknown): ReactNode {
  const obj = data as {
    phases?: Array<{
      name: string;
      steps?: Array<{ step: string; dependency?: string; checkpoint?: string } | string>;
      checkpoints?: string[] | string;
      checkpoint?: string;
      dependencies?: string[];
    }>;
    dependencies?: string[];
    checkpoints?: string[];
  };

  const getCheckpointsList = (checkpoints: string[] | string | undefined, checkpoint: string | { checkpoint?: string } | undefined): string[] => {
    if (Array.isArray(checkpoints)) {
      return checkpoints.filter((c): c is string => typeof c === "string");
    }
    if (typeof checkpoints === "string") return [checkpoints];
    if (typeof checkpoint === "string") return [checkpoint];
    if (checkpoint && typeof checkpoint === "object" && typeof checkpoint.checkpoint === "string") {
      return [checkpoint.checkpoint];
    }
    return [];
  };

  return (
    <div className="formatted-execution">
      {obj.phases && Array.isArray(obj.phases) && obj.phases.length > 0 && (
        <div className="phases-list">
          {obj.phases.map((phase, pIdx) => {
            const checkpointList = getCheckpointsList(phase.checkpoints, phase.checkpoint);
            return (
              <div key={pIdx} className="phase-item">
                <div className="phase-header">
                  <span className="phase-number">{pIdx + 1}</span>
                  <span className="phase-name">{phase.name}</span>
                </div>
                {phase.steps && phase.steps.length > 0 && (
                  <div className="phase-steps">
                    {phase.steps.map((step, sIdx) => {
                      let stepText = "";
                      let dep: string | null = null;
                      if (typeof step === "string") {
                        stepText = step;
                      } else if (step && typeof step === "object") {
                        stepText = typeof step.step === "string" ? step.step : JSON.stringify(step.step);
                        dep = typeof step.dependency === "string" ? step.dependency : null;
                      }
                      return (
                        <div key={sIdx} className="step-item">
                          <span className="step-number">{sIdx + 1}</span>
                          <div className="step-content">
                            <p>{stepText}</p>
                            {dep && <span className="step-dependency">↳ {dep}</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {checkpointList.length > 0 && (
                  <div className="phase-checkpoints">
                    <strong>✓ Checkpoints:</strong>
                    <ul>
                      {checkpointList.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {obj.dependencies && Array.isArray(obj.dependencies) && obj.dependencies.length > 0 && (
        <div className="exec-section">
          <span className="label">🔗 Overall Dependencies</span>
          <ul>{obj.dependencies.map((d, i) => <li key={i}>{typeof d === "string" ? d : JSON.stringify(d)}</li>)}</ul>
        </div>
      )}
      {obj.checkpoints && Array.isArray(obj.checkpoints) && obj.checkpoints.length > 0 && (
        <div className="exec-section">
          <span className="label">✓ Overall Checkpoints</span>
          <ul>{obj.checkpoints.map((c, i) => <li key={i}>{typeof c === "string" ? c : JSON.stringify(c)}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function renderResearchContent(data: ResearchData): ReactNode {
  const hasQueries = data.queries && data.queries.length > 0;
  const hasSources = data.sources && data.sources.length > 0;
  
  return (
    <div className="formatted-research">
      {data.indexed_to_rag && (
        <div className="rag-status indexed">
          <span className="rag-icon">🧬</span>
          <span className="rag-text">
            Indexed to RAG
            {data.rag_collection && <span className="rag-collection"> ({data.rag_collection})</span>}
          </span>
        </div>
      )}
      
      {hasQueries && (
        <div className="research-section">
          <span className="label">🔍 Search Queries</span>
          <div className="query-list">
            {data.queries.map((q, i) => (
              <div key={i} className="query-item">
                <span className="query-number">{i + 1}</span>
                <span className="query-text">{q}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {hasSources && (
        <div className="research-section">
          <span className="label">📚 Sources Found ({data.sources.length})</span>
          <div className="sources-list">
            {data.sources.map((source, i) => (
              <div key={i} className="source-item">
                <div className="source-header">
                  <span className="source-number">[{i + 1}]</span>
                  <a 
                    href={source.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="source-title"
                  >
                    {source.title || "Untitled"}
                  </a>
                </div>
                {source.snippet && (
                  <p className="source-snippet">{source.snippet}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {!hasQueries && !hasSources && (
        <div className="research-empty">
          <p>No research data available yet.</p>
        </div>
      )}
    </div>
  );
}

function formatContent(content: string, sectionId: CanvasSectionId): ReactNode {
  const parsed = tryParseJSON(content);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    );
  }
  switch (sectionId) {
    case "identity":
      return renderIdentityContent(parsed);
    case "definition":
      return renderDefinitionContent(parsed);
    case "resources":
      return renderResourcesContent(parsed);
    case "execution":
      return renderExecutionContent(parsed);
    default:
      return (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {content}
        </ReactMarkdown>
      );
  }
}

const SECTION_INFO: Record<CanvasSectionId | "researcher", { emoji: string; title: string; agent: string; description: string }> = {
  researcher: {
    emoji: "🔬",
    title: "Research",
    agent: "Researcher",
    description: "Web research and context gathering for the project",
  },
  identity: {
    emoji: "🎯",
    title: "Identity",
    agent: "The Visionary",
    description: "Purpose, vision, and core identity of the project",
  },
  definition: {
    emoji: "📐",
    title: "Definition",
    agent: "The Architect",
    description: "Structure, boundaries, and technical architecture",
  },
  resources: {
    emoji: "🧰",
    title: "Resources",
    agent: "The Resource Manager",
    description: "People, tools, budget, and time requirements",
  },
  execution: {
    emoji: "📋",
    title: "Execution",
    agent: "The Strategist",
    description: "Phases, milestones, and action plan",
  },
};

const SECTION_ORDER: (CanvasSectionId | "researcher")[] = ["researcher", "identity", "definition", "resources", "execution"];

interface CanvasPanelProps {
  canvas: LocalCanvas | null;
  loadingSection: CanvasSectionId | null;
  onRefresh?: () => void;
  onFullView?: () => void;
  ragResults?: RAGResult[];
  toolsUsed?: { web: boolean; memory: boolean };
}

function CanvasPanel({ canvas, loadingSection, onRefresh, onFullView, ragResults, toolsUsed }: CanvasPanelProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [localCanvas, setLocalCanvas] = useState<LocalCanvas | null>(canvas);
  const [showRagDetails, setShowRagDetails] = useState(false);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  useEffect(() => {
    if (canvas) {
      setLocalCanvas(canvas);
      const sectionsWithContent = new Set<string>();
      for (const sectionId of SECTION_ORDER) {
        const section = canvas[sectionId as keyof typeof canvas];
        if (section && section.content) {
          if (sectionId === "researcher") {
            const researchData = section.content as unknown as ResearchData;
            if (researchData?.sources?.length > 0) {
              sectionsWithContent.add(sectionId);
            }
          } else if (typeof section.content === "string" && section.content.trim()) {
            sectionsWithContent.add(sectionId);
          }
        }
      }
      if (sectionsWithContent.size > 0) {
        setExpandedSections(sectionsWithContent);
      }
    }
  }, [canvas]);

  const loadCanvas = useCallback(async () => {
    try {
      const data = await getCanvas();
      setLocalCanvas(data.canvas);
    } catch (error) {
      console.error("Failed to load canvas:", error);
    }
  }, []);

  useEffect(() => {
    if (!canvas) {
      loadCanvas();
    }
  }, [canvas, loadCanvas]);

  const getProgress = () => {
    if (!localCanvas) return { completed: 0, total: 5, percent: 0 };
    let completed = 0;
    for (const id of SECTION_ORDER) {
      const section = localCanvas[id as keyof LocalCanvas];
      if (id === "researcher") {
        const researchContent = section?.content as ResearchData | string;
        if (typeof researchContent === "object" && researchContent?.sources?.length > 0) {
          completed++;
        }
      } else if (section?.content && typeof section.content === "string" && section.content.trim()) {
        completed++;
      }
    }
    return { completed, total: 5, percent: Math.round((completed / 5) * 100) };
  };

  const progress = getProgress();

  const renderSection = (sectionId: CanvasSectionId | "researcher") => {
    const info = SECTION_INFO[sectionId];
    const section = localCanvas?.[sectionId as keyof LocalCanvas];
    const isLoading = loadingSection === sectionId;
    const isExpanded = expandedSections.has(sectionId);
    
    let hasContent = false;
    const isResearchSection = sectionId === "researcher";
    let researchData: ResearchData | null = null;
    
    if (isResearchSection) {
      const content = section?.content;
      if (typeof content === "object" && content !== null) {
        researchData = content as ResearchData;
        hasContent = researchData.sources?.length > 0 || researchData.queries?.length > 0;
      }
    } else {
      hasContent = !!(section?.content && typeof section.content === "string" && section.content.trim());
    }

    return (
      <div
        key={sectionId}
        className={`canvas-section ${isExpanded ? "expanded" : ""} ${hasContent ? "has-content" : ""} ${isLoading ? "loading" : ""} ${isResearchSection ? "research-section-type" : ""}`}
      >
        <div
          className="section-header"
          onClick={() => toggleSection(sectionId)}
        >
          <div className="section-identity">
            <span className="section-emoji">{info.emoji}</span>
            <div className="section-titles">
              <span className="section-title">{info.title}</span>
              <span className="section-agent">{info.agent}</span>
            </div>
          </div>
          <div className="section-indicators">
            {isLoading && (
              <span className="section-loading">
                <span className="pulse-dot" />
                Analyzing...
              </span>
            )}
            {isResearchSection && researchData?.indexed_to_rag && (
              <span className="rag-badge">🧬 RAG</span>
            )}
            <span className="section-status">
              {hasContent ? "✅" : "○"}
            </span>
            <span className="section-expand">{isExpanded ? "▼" : "▶"}</span>
          </div>
        </div>

        {isExpanded && (
          <div className="section-content">
            {hasContent ? (
              <div className="section-value formatted-content">
                {isResearchSection && researchData ? (
                  renderResearchContent(researchData)
                ) : (
                  formatContent((section?.content as string) || "", sectionId as CanvasSectionId)
                )}
                {section?.last_updated && (
                  <div className="section-timestamp">
                    Last updated: {new Date(section.last_updated).toLocaleString()}
                  </div>
                )}
              </div>
            ) : (
              <div className="section-placeholder">
                <p>{info.description}</p>
                {!isResearchSection && (
                  <span className="placeholder-hint">
                    Mention <code>@{sectionId}</code> in chat to invoke this agent
                  </span>
                )}
                {isResearchSection && (
                  <span className="placeholder-hint">
                    Enable Web Search to gather research context
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="panel-header">
        <h3>
          <span>🖼️</span> Project Canvas
        </h3>
        <div className="canvas-header-actions">
          {onFullView && (
            <button
              className="btn btn-ghost btn-xs"
              onClick={onFullView}
              title="Open Full Context View"
            >
              📄 Full View
            </button>
          )}
          <div className="progress-indicator">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
            </div>
            <span className="progress-text">{progress.completed}/4</span>
          </div>
          {onRefresh && (
            <button className="btn btn-ghost btn-xs" onClick={onRefresh} title="Refresh canvas">
              🔄
            </button>
          )}
        </div>
      </div>

      <div className="panel-body canvas-panel">
        {(toolsUsed?.memory || toolsUsed?.web || (ragResults && ragResults.length > 0)) && (
          <div className="canvas-tools-panel">
            <div className="tools-header" onClick={() => setShowRagDetails(!showRagDetails)}>
              <span className="tools-title">🛠️ Tools Used</span>
              <div className="tools-badges">
                {toolsUsed?.memory && (
                  <span className="tool-badge memory">
                    🧬 Memory ({ragResults?.length || 0})
                  </span>
                )}
                {toolsUsed?.web && (
                  <span className="tool-badge web">🔍 Web Search</span>
                )}
              </div>
              <span className="tools-expand">{showRagDetails ? "▼" : "▶"}</span>
            </div>
            {showRagDetails && ragResults && ragResults.length > 0 && (
              <div className="rag-results-list">
                {ragResults.map((result) => (
                  <div key={result.id} className="rag-result-item">
                    <div className="rag-result-header">
                      <span className="rag-score">
                        Score: {(result.score * 100).toFixed(0)}%
                      </span>
                      <span className="rag-collection">{result.collection}</span>
                    </div>
                    <div className="rag-result-content">{result.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {SECTION_ORDER.map((id) => renderSection(id))}

        <div className="canvas-actions">
          <button className="btn btn-secondary btn-sm">📥 Export Canvas</button>
          <button className="btn btn-ghost btn-sm">🔄 Reset All</button>
        </div>
      </div>
    </>
  );
}

export default memo(CanvasPanel);