import { Step, Verification, Question } from "../types";
import { useState } from "react";

interface ChainOfThoughtViewerProps {
  request?: string;
  status: string;
  steps: Step[];
  finalAnswer: string | null;
  verification: Verification | null;
  questions: Question[];
}

export default function ChainOfThoughtViewer({
  request,
  status,
  steps,
  finalAnswer,
  verification,
  questions,
}: ChainOfThoughtViewerProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const isProcessing = status === "processing" || status === "analyzing";
  const isCompleted = status === "completed";

  const toggleStep = (stepNumber: number) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepNumber)) {
        next.delete(stepNumber);
      } else {
        next.add(stepNumber);
      }
      return next;
    });
  };

  const getStepTypeIcon = (type: string) => {
    switch (type) {
      case "analysis":
        return "🔍";
      case "question":
        return "❓";
      case "synthesis":
        return "🔄";
      case "verification":
        return "✅";
      case "final_answer":
        return "✨";
      case "error":
        return "❌";
      default:
        return "📝";
    }
  };

  const totalQuestions = questions.length || 5;
  const answeredQuestions = steps.filter((s) => s.type === "question").length;
  const progressPercent = isCompleted
    ? 100
    : Math.min((answeredQuestions / totalQuestions) * 80, 80);

  return (
    <div className="viewer-container">
      {request && (
        <div className="request-summary">
          <div className="request-label">Analyzing Prompt</div>
          <div className="request-text">{request}</div>
        </div>
      )}

      <div className="progress-section">
        <div className="progress-header">
          <span className="progress-label">
            {isProcessing ? "Processing questions..." : isCompleted ? "Complete" : "Waiting"}
          </span>
          <span className="progress-count">
            {answeredQuestions}/{totalQuestions} questions
          </span>
        </div>
        <div className="progress-bar">
          <div
            className={`progress-bar-fill ${isProcessing ? "animated" : ""}`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="phase-indicator">
        <div className={`phase ${steps.some((s) => s.type === "analysis") ? "active" : ""}`}>
          <span className="phase-icon">🔍</span>
          <span className="phase-label">Analyze</span>
        </div>
        <div className="phase-connector" />
        <div className={`phase ${answeredQuestions > 0 ? "active" : ""}`}>
          <span className="phase-icon">❓</span>
          <span className="phase-label">Questions</span>
        </div>
        <div className="phase-connector" />
        <div className={`phase ${steps.some((s) => s.type === "synthesis") ? "active" : ""}`}>
          <span className="phase-icon">🔄</span>
          <span className="phase-label">Synthesize</span>
        </div>
        <div className="phase-connector" />
        <div className={`phase ${verification ? "active" : ""}`}>
          <span className="phase-icon">✅</span>
          <span className="phase-label">Verify</span>
        </div>
        <div className="phase-connector" />
        <div className={`phase ${finalAnswer ? "active completed" : ""}`}>
          <span className="phase-icon">✨</span>
          <span className="phase-label">Answer</span>
        </div>
      </div>

      {steps.length === 0 ? (
        <div className="empty-state" style={{ padding: "2rem" }}>
          <div className="empty-state-icon">{isProcessing ? "⏳" : "💭"}</div>
          <p className="empty-state-text">
            {isProcessing ? "Starting chain-of-thought analysis..." : "No steps yet"}
          </p>
        </div>
      ) : (
        <div className="steps-list">
          {steps.map((step, index) => {
            const isExpanded = expandedSteps.has(step.step_number);
            const hasContent = step.content || step.question || step.llm_response;

            return (
              <div key={`${step.step_number}-${index}`} className={`step-card ${step.type}`}>
                <div
                  className="step-header"
                  onClick={() => hasContent && toggleStep(step.step_number)}
                  style={{ cursor: hasContent ? "pointer" : "default" }}
                >
                  <div className="step-icon">{getStepTypeIcon(step.type)}</div>
                  <div className="step-info">
                    <span className="step-title">
                      {step.type === "question" && step.question
                        ? step.question.slice(0, 60) + (step.question.length > 60 ? "..." : "")
                        : `Step ${step.step_number}: ${step.type.replace(/_/g, " ")}`}
                    </span>
                    <span className="step-type">{step.type.replace(/_/g, " ")}</span>
                  </div>
                  {hasContent && (
                    <button className="btn btn-icon btn-ghost step-toggle">
                      {isExpanded ? "▲" : "▼"}
                    </button>
                  )}
                </div>

                {isExpanded && hasContent && (
                  <div className="step-details">
                    {step.question && (
                      <div className="step-field">
                        <div className="step-field-label">Question</div>
                        <div className="step-content">{step.question}</div>
                      </div>
                    )}
                    {step.content && (
                      <div className="step-field">
                        <div className="step-field-label">Reasoning</div>
                        <div className="step-content">{step.content}</div>
                      </div>
                    )}
                    {step.llm_response && (
                      <div className="step-field">
                        <div className="step-field-label">Response</div>
                        <div className="step-content">{step.llm_response}</div>
                      </div>
                    )}
                    {step.sources && step.sources.length > 0 && (
                      <div className="step-field step-sources">
                        <div className="step-field-label">🔗 Web Sources</div>
                        <div className="sources-list">
                          {step.sources.map((source, idx) => (
                            <div key={idx} className="source-item">
                              <a
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="source-link"
                              >
                                {source.title || source.url}
                              </a>
                              {source.snippet && (
                                <div className="source-snippet">{source.snippet}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {finalAnswer && (
        <div className="final-answer-section">
          <div className="final-answer-header">
            <span>✨</span> Final Answer
          </div>
          <div className="final-answer-content">{finalAnswer}</div>
        </div>
      )}

      {verification && (
        <div className={`verification-section ${verification.passed ? "valid" : "invalid"}`}>
          <div className="verification-header">
            <span>{verification.passed ? "✅" : "⚠️"}</span>
            Verification: {verification.passed ? "Valid" : "Needs Review"}
          </div>
          {verification.notes && <div className="verification-notes">{verification.notes}</div>}
        </div>
      )}

      <style>{`
        .viewer-container {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .request-summary {
          padding: 1rem;
          background: var(--primary-light);
          border-radius: var(--radius-md);
          border-left: 4px solid var(--primary);
        }
        .request-label {
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--primary);
          margin-bottom: 0.5rem;
        }
        .request-text {
          font-size: 0.9375rem;
          color: var(--gray-800);
          line-height: 1.5;
        }
        .progress-section {
          padding: 0.75rem 0;
        }
        .progress-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }
        .progress-label {
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--gray-600);
        }
        .progress-count {
          font-size: 0.8125rem;
          color: var(--gray-500);
        }
        .progress-bar-fill.animated {
          animation: pulse 2s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        .phase-indicator {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 0;
          gap: 0.25rem;
        }
        .phase {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.25rem;
          opacity: 0.4;
          transition: all 0.2s ease;
        }
        .phase.active {
          opacity: 1;
        }
        .phase.completed .phase-icon {
          background: var(--success);
        }
        .phase-icon {
          width: 2rem;
          height: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--gray-200);
          border-radius: var(--radius-full);
          font-size: 0.875rem;
        }
        .phase.active .phase-icon {
          background: var(--primary-light);
        }
        .phase-label {
          font-size: 0.6875rem;
          color: var(--gray-500);
        }
        .phase-connector {
          flex: 1;
          height: 2px;
          background: var(--gray-200);
          max-width: 2rem;
        }
        .steps-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          max-height: 300px;
          overflow-y: auto;
        }
        .step-card {
          background: var(--gray-50);
          border-radius: var(--radius-md);
          border: 1px solid var(--gray-100);
          transition: all 0.15s ease;
        }
        .step-card:hover {
          border-color: var(--gray-200);
        }
        .step-card.error {
          border-color: var(--error);
          background: var(--error-light);
        }
        .step-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.75rem;
        }
        .step-icon {
          flex-shrink: 0;
          width: 1.75rem;
          height: 1.75rem;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--gray-100);
          border-radius: var(--radius-sm);
          font-size: 0.875rem;
        }
        .step-info {
          flex: 1;
          min-width: 0;
        }
        .step-title {
          display: block;
          font-size: 0.8125rem;
          font-weight: 500;
          color: var(--gray-800);
          line-height: 1.3;
        }
        .step-type {
          font-size: 0.6875rem;
          color: var(--gray-500);
          text-transform: capitalize;
        }
        .step-toggle {
          font-size: 0.625rem;
          padding: 0.25rem;
        }
        .step-details {
          padding: 0 0.75rem 0.75rem 3rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .step-field {
          font-size: 0.8125rem;
        }
        .step-field-label {
          font-size: 0.6875rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--gray-500);
          margin-bottom: 0.25rem;
        }
        .step-content {
          color: var(--gray-700);
          line-height: 1.5;
          white-space: pre-wrap;
        }
        .final-answer-section {
          background: var(--success-light);
          border: 1px solid var(--success);
          border-radius: var(--radius-md);
          padding: 1rem;
        }
        .final-answer-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 600;
          color: var(--success);
          margin-bottom: 0.75rem;
        }
        .final-answer-content {
          color: var(--gray-800);
          line-height: 1.6;
          white-space: pre-wrap;
        }
        .verification-section {
          border-radius: var(--radius-md);
          padding: 0.75rem 1rem;
        }
        .verification-section.valid {
          background: var(--success-light);
          border: 1px solid var(--success);
        }
        .verification-section.invalid {
          background: var(--warning-light);
          border: 1px solid var(--warning);
        }
        .verification-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-weight: 500;
          font-size: 0.875rem;
        }
        .verification-notes {
          margin-top: 0.5rem;
          font-size: 0.8125rem;
          color: var(--gray-600);
        }
      `}</style>
    </div>
  );
}
