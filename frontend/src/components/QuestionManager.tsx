import { useState, useEffect, FormEvent, useCallback } from "react";
import { Question } from "../types";
import { createQuestion, getQuestions, deleteQuestion, toggleQuestion } from "../services/api";

interface QuestionManagerProps {
  questions: Question[];
  onQuestionsChange: (questions: Question[]) => void;
}

export default function QuestionManager({ questions, onQuestionsChange }: QuestionManagerProps) {
  const [newQuestionText, setNewQuestionText] = useState("");
  const [newQuestionCategory, setNewQuestionCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const loadQuestions = useCallback(async () => {
    try {
      const loadedQuestions = await getQuestions();
      onQuestionsChange(loadedQuestions);
    } catch (error) {
      console.error("Failed to load questions:", error);
    }
  }, [onQuestionsChange]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  async function handleCreateQuestion(e: FormEvent) {
    e.preventDefault();
    const trimmed = newQuestionText.trim();
    if (!trimmed) return;

    setLoading(true);
    try {
      const created = await createQuestion(trimmed, newQuestionCategory.trim() || undefined);
      onQuestionsChange([...questions, created]);
      setNewQuestionText("");
      setNewQuestionCategory("");
    } catch (error) {
      console.error("Failed to create question:", error);
    } finally {
      setLoading(false);
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

  async function handleToggleQuestion(questionId: number) {
    try {
      const updated = await toggleQuestion(questionId);
      onQuestionsChange(questions.map((q) => (q.id === questionId ? updated : q)));
    } catch (error) {
      console.error("Failed to toggle question:", error);
    }
  }

  const categories = [...new Set(questions.map((q) => q.category).filter(Boolean))] as string[];
  const filteredQuestions = activeCategory
    ? questions.filter((q) => q.category === activeCategory)
    : questions;
  const enabledCount = questions.filter((q) => q.enabled).length;

  return (
    <>
      <div className="panel-header">
        <h3>
          <span>📚</span> Analysis Questions
        </h3>
        <span className="badge badge-info" title={`${enabledCount} enabled / ${questions.length} total`}>
          {enabledCount}/{questions.length}
        </span>
      </div>
      <div className="panel-body">
        <div className="questions-info">
          <p>
            These questions guide the chain-of-thought analysis. Toggle questions ON/OFF to
            experiment with different combinations and see how they affect reasoning quality.
            Only enabled questions are used during analysis.
          </p>
        </div>

        <form onSubmit={handleCreateQuestion} className="question-form">
          <input
            type="text"
            value={newQuestionText}
            onChange={(e) => setNewQuestionText(e.target.value)}
            placeholder="Add a new analysis question..."
            disabled={loading}
            className="input"
          />
          <input
            type="text"
            value={newQuestionCategory}
            onChange={(e) => setNewQuestionCategory(e.target.value)}
            placeholder="Category"
            disabled={loading}
            className="input input-sm"
            style={{ maxWidth: "120px" }}
          />
          <button
            type="submit"
            disabled={loading || !newQuestionText.trim()}
            className="btn btn-primary"
          >
            {loading ? "..." : "Add"}
          </button>
        </form>

        {categories.length > 0 && (
          <div className="category-tabs">
            <button
              className={`category-tab ${activeCategory === null ? "active" : ""}`}
              onClick={() => setActiveCategory(null)}
            >
              All
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                className={`category-tab ${activeCategory === cat ? "active" : ""}`}
                onClick={() => setActiveCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        <div className="questions-list">
          {filteredQuestions.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">💡</div>
              <p className="empty-state-text">No questions yet. Add analysis questions above!</p>
            </div>
          ) : (
            filteredQuestions.map((question, index) => (
              <div key={question.id} className={`question-item ${!question.enabled ? "disabled" : ""}`}>
                <div className={`question-number ${!question.enabled ? "disabled" : ""}`}>{index + 1}</div>
                <div className="question-content">
                  <div className={`question-text ${!question.enabled ? "disabled" : ""}`}>{question.text}</div>
                  {question.category && <span className="badge badge-sm">{question.category}</span>}
                </div>
                <div className="question-actions">
                  <button
                    onClick={() => handleToggleQuestion(question.id)}
                    className={`toggle-btn ${question.enabled ? "enabled" : ""}`}
                    title={question.enabled ? "Disable question" : "Enable question"}
                  >
                    {question.enabled ? "ON" : "OFF"}
                  </button>
                  <button
                    onClick={() => handleDeleteQuestion(question.id)}
                    className="btn btn-sm btn-icon btn-ghost"
                    title="Delete question"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <style>{`
        .questions-info {
          background: var(--gray-50);
          border-radius: var(--radius-md);
          padding: 0.75rem 1rem;
          margin-bottom: 1rem;
          font-size: 0.8125rem;
          color: var(--gray-600);
          line-height: 1.5;
        }
        .questions-info p {
          margin: 0;
        }
        .question-form {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        .question-form .input:first-of-type {
          flex: 1;
        }
        .category-tabs {
          display: flex;
          gap: 0.375rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }
        .category-tab {
          padding: 0.375rem 0.75rem;
          border: 1px solid var(--gray-200);
          background: var(--gray-50);
          border-radius: var(--radius-full);
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .category-tab:hover {
          background: var(--gray-100);
        }
        .category-tab.active {
          background: var(--primary);
          color: white;
          border-color: var(--primary);
        }
        .questions-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .question-item {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 0.75rem;
          background: var(--gray-50);
          border-radius: var(--radius-md);
          transition: background 0.15s ease;
        }
        .question-item:hover {
          background: var(--gray-100);
        }
        .question-number {
          flex-shrink: 0;
          width: 1.5rem;
          height: 1.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--primary);
          color: white;
          border-radius: var(--radius-full);
          font-size: 0.75rem;
          font-weight: 600;
        }
        .question-content {
          flex: 1;
          min-width: 0;
        }
        .question-text {
          font-size: 0.875rem;
          color: var(--gray-800);
          line-height: 1.4;
          margin-bottom: 0.25rem;
        }
        .badge-sm {
          font-size: 0.625rem;
          padding: 0.125rem 0.375rem;
        }
        .question-item.disabled {
          opacity: 0.6;
          background: var(--gray-100);
        }
        .question-number.disabled {
          background: var(--gray-400);
        }
        .question-text.disabled {
          text-decoration: line-through;
          color: var(--gray-500);
        }
        .question-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
        }
        .toggle-btn {
          padding: 0.25rem 0.5rem;
          border: 1px solid var(--gray-300);
          background: var(--gray-200);
          border-radius: var(--radius-sm);
          font-size: 0.625rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
          color: var(--gray-600);
          min-width: 2.5rem;
        }
        .toggle-btn:hover {
          background: var(--gray-300);
        }
        .toggle-btn.enabled {
          background: var(--primary);
          border-color: var(--primary);
          color: white;
        }
        .toggle-btn.enabled:hover {
          background: var(--primary-dark);
        }
      `}</style>
    </>
  );
}
