import { useState, useEffect, useCallback } from "react";
import "./OnboardingTour.css";

type TourPageType = "reasoning" | "project" | "researcher" | "settings" | "logs";

interface TourStep {
  target: string;
  title: string;
  content: string;
  position: "top" | "bottom" | "left" | "right" | "center";
  highlight?: boolean;
  navigateToPage?: TourPageType;
  settingsTab?: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    target: "body",
    title: "Welcome to the AI Architect Playground! 🎉",
    content:
      "This platform helps you learn prompt engineering, RAG systems, and AI orchestration through hands-on experimentation. Let's take a quick tour!",
    position: "center",
  },
  {
    target: ".workspace-tabs",
    title: "Three Learning Workspaces",
    content:
      "The platform has three main workspaces: Chain of Thought for prompt engineering, Research Lab for web-augmented research, and Project Manager for complex AI orchestration.",
    position: "bottom",
    highlight: true,
  },
  {
    target: '[data-tab="chain-of-thought"]',
    title: "Chain of Thought Workspace",
    content:
      "Learn how breaking down problems into steps improves AI responses. Toggle thinking on/off to see the difference. Experiment with temperature to control creativity vs precision.",
    position: "bottom",
    highlight: true,
  },
  {
    target: '[data-tab="researcher"]',
    title: "Research Lab",
    content:
      "See how web search and RAG (Retrieval-Augmented Generation) enriches AI responses with real-time information. Compare outputs with and without these tools.",
    position: "bottom",
    highlight: true,
  },
  {
    target: '[data-tab="project-manager"]',
    title: "Project Manager",
    content:
      "Watch an AI orchestrator coordinate multiple specialist agents. Great for understanding how to build complex AI workflows.",
    position: "bottom",
    highlight: true,
  },
  {
    target: ".status-indicators",
    title: "Connection Status",
    content:
      "These indicators show your LLM and Qdrant (vector database) connection status. Green means connected, red means disconnected.",
    position: "bottom",
    highlight: true,
  },
  {
    target: ".control-btn-compare",
    title: "A/B Comparison Mode",
    content:
      "Compare different configurations side-by-side. Test RAG on vs off, different temperatures, or CoT vs direct mode. See metrics like token usage and latency for each run.",
    position: "bottom",
    highlight: true,
  },
  {
    target: ".preset-selector",
    title: "Experiment Presets",
    content:
      "Use presets to quickly load pre-configured experiments. Great for learning what different settings do without manual configuration.",
    position: "right",
    highlight: true,
  },
  {
    target: ".btn-quick-prompt",
    title: "Quick Prompts",
    content:
      "Start with sample prompts to see the system in action. Click the quick prompt button to begin experimenting immediately with a pre-written prompt.",
    position: "left",
    highlight: true,
  },
  {
    target: "body",
    title: "Settings Overview",
    content:
      "Next we'll walk through the Settings panel, where you configure the LLM server, web search, behavior, quick prompts, AI agents, and vector storage. The app will switch to Settings for the next steps.",
    position: "center",
    navigateToPage: "settings",
  },
  {
    target: ".settings-container",
    title: "Settings Layout",
    content:
      "Use the sidebar on the left to switch between categories. The main area shows the options for the selected category. Click \"Save Settings\" to apply changes for the current section.",
    position: "right",
    highlight: true,
  },
  {
    target: '[data-tour="settings-nav-llm"]',
    title: "LLM Server Configuration",
    content:
      "Connect to your language model: choose the server type (LM Studio, Ollama, or vLLM), set address and port, then pick a model from the dropdown. Use \"Test\" to verify the connection. Adjust temperature (0 = deterministic, 2 = creative), max tokens, and request timeout. These settings apply to all workspaces.",
    position: "right",
    highlight: true,
    settingsTab: "llm",
  },
  {
    target: '[data-tour="settings-nav-search"]',
    title: "Web Search Settings",
    content:
      "Enable or disable web search for the Research Lab and canvas. Set max results for general research and for chain-of-thought questions. Choose a search region (e.g. Worldwide, United States) to tailor results. When enabled, the AI can fetch real-time information from the web.",
    position: "right",
    highlight: true,
    settingsTab: "search",
  },
  {
    target: '[data-tour="settings-nav-behavior"]',
    title: "Behavior Settings",
    content:
      "Prompt classification: set the moderate word threshold; shorter prompts may use a faster single-pass path. Chain of Thought: set max reasoning steps per request, enable or disable the verification step, and choose whether to stream tokens in real time. These options control how the reasoning workspace behaves.",
    position: "right",
    highlight: true,
    settingsTab: "behavior",
  },
  {
    target: '[data-tour="settings-nav-prompts"]',
    title: "Quick Prompts",
    content:
      "Edit the default prompts used when you click the quick-prompt button in each workspace. Separate quick prompts for Chain of Thought and Project Manager let you tailor the starting examples. Use \"Reset to Defaults\" to restore the original text. Changes are used as soon as you save.",
    position: "right",
    highlight: true,
    settingsTab: "prompts",
  },
  {
    target: '[data-tour="settings-nav-agents"]',
    title: "AI Agents Configuration",
    content:
      "Configure the Project Manager orchestrator and its specialists (Identity, Definition, Resources, Execution), plus the Research Lab coordinator and agents (Researcher, Fact Checker). For each agent you can set the LLM (server, model), system prompts, and for specialists the trigger keywords that route tasks. Save per section or per agent.",
    position: "right",
    highlight: true,
    settingsTab: "agents",
  },
  {
    target: '[data-tour="settings-nav-vectors"]',
    title: "Vector Storage (Qdrant)",
    content:
      "Enable Qdrant to use semantic memory: research, reasoning, and canvas content can be stored and retrieved by similarity. Set deployment (local or Qdrant Cloud), URL, and API key if needed. Choose an embedding provider (LM Studio, Ollama, vLLM, or OpenAI) and model; test the connection and initialize collections. Collections are used for research documents, conversation memory, and canvas content.",
    position: "right",
    highlight: true,
    settingsTab: "vectors",
  },
  {
    target: "body",
    title: "You're Ready to Explore! 🚀",
    content:
      "Start by selecting a workspace tab, choosing a preset, and clicking a quick prompt. Use Settings to adjust the LLM, search, behavior, prompts, agents, and vectors. Watch the thinking process unfold and experiment with different settings. Happy learning!",
    position: "center",
  },
];

const TOUR_STORAGE_KEY = "nexa-onboarding-completed";
const SETTINGS_TAB_EVENT = "nexa-tour-settings-tab";

interface OnboardingTourProps {
  onComplete: () => void;
  onNavigateToPage?: (page: TourPageType) => void;
}

export default function OnboardingTour({ onComplete, onNavigateToPage }: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  const step = TOUR_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  useEffect(() => {
    if (step.navigateToPage && onNavigateToPage) {
      onNavigateToPage(step.navigateToPage);
    }
    if (step.settingsTab) {
      window.dispatchEvent(
        new CustomEvent(SETTINGS_TAB_EVENT, { detail: { tab: step.settingsTab } })
      );
    }
  }, [currentStep, step.navigateToPage, step.settingsTab, onNavigateToPage]);

  const updateTargetPosition = useCallback(() => {
    if (step.position === "center") {
      setTargetRect(null);
      return;
    }

    const target = document.querySelector(step.target);
    if (target) {
      const rect = target.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [step]);

  useEffect(() => {
    updateTargetPosition();
    const t = setTimeout(updateTargetPosition, 100);
    window.addEventListener("resize", updateTargetPosition);
    window.addEventListener("scroll", updateTargetPosition);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", updateTargetPosition);
      window.removeEventListener("scroll", updateTargetPosition);
    };
  }, [updateTargetPosition, currentStep]);

  const handleNext = () => {
    if (isLastStep) {
      handleComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    localStorage.setItem(TOUR_STORAGE_KEY, "true");
    setIsVisible(false);
    onComplete();
  };

  if (!isVisible) return null;

  const getTooltipPosition = (): React.CSSProperties => {
    if (step.position === "center" || !targetRect) {
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
    }

    const padding = 16;
    const tooltipWidth = 570;
    const tooltipHeight = 280;
    const maxLeft = window.innerWidth - tooltipWidth - padding;
    const maxTop = window.innerHeight - tooltipHeight - padding;

    const clampLeft = (left: number) => Math.max(padding, Math.min(left, maxLeft));
    const clampTop = (top: number) => Math.max(padding, Math.min(top, maxTop));

    switch (step.position) {
      case "bottom": {
        const top = clampTop(targetRect.bottom + padding);
        const left = clampLeft(targetRect.left + targetRect.width / 2 - tooltipWidth / 2);
        return { top, left };
      }
      case "top": {
        const top = clampTop(targetRect.top - tooltipHeight - padding);
        const left = clampLeft(targetRect.left + targetRect.width / 2 - tooltipWidth / 2);
        return { top, left };
      }
      case "left": {
        const top = clampTop(targetRect.top + targetRect.height / 2 - tooltipHeight / 2);
        const left = clampLeft(targetRect.left - tooltipWidth - padding);
        return { top, left };
      }
      case "right": {
        const top = clampTop(targetRect.top + targetRect.height / 2 - tooltipHeight / 2);
        const left = clampLeft(targetRect.right + padding);
        return { top, left };
      }
      default:
        return {};
    }
  };

  return (
    <div className="onboarding-overlay">
      {step.highlight && targetRect && (
        <div
          className="highlight-box"
          style={{
            top: targetRect.top - 4,
            left: targetRect.left - 4,
            width: targetRect.width + 8,
            height: targetRect.height + 8,
          }}
        />
      )}

      <div className="tour-tooltip" style={getTooltipPosition()}>
        <div className="tooltip-header">
          <span className="step-indicator">
            {currentStep + 1} / {TOUR_STEPS.length}
          </span>
          <button className="skip-btn" onClick={handleSkip} type="button">
            Skip Tour
          </button>
        </div>

        <h3 className="tooltip-title">{step.title}</h3>
        <p className="tooltip-content">{step.content}</p>

        <div className="tooltip-actions">
          {!isFirstStep && (
            <button className="tour-btn secondary" onClick={handlePrev} type="button">
              ← Previous
            </button>
          )}
          <button className="tour-btn primary" onClick={handleNext} type="button">
            {isLastStep ? "Get Started!" : "Next →"}
          </button>
        </div>

        <div className="step-dots">
          {TOUR_STEPS.map((_, idx) => (
            <span
              key={idx}
              className={`dot ${idx === currentStep ? "active" : ""} ${idx < currentStep ? "completed" : ""}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function useTourState() {
  const [showTour, setShowTour] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!completed) {
      setShowTour(true);
    }
    setHasChecked(true);
  }, []);

  const resetTour = () => {
    localStorage.removeItem(TOUR_STORAGE_KEY);
    setShowTour(true);
  };

  const completeTour = () => {
    setShowTour(false);
  };

  return { showTour, hasChecked, resetTour, completeTour };
}
