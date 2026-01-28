import json
import logging
import aiofiles
from dataclasses import dataclass, field, asdict
from pathlib import Path

logger = logging.getLogger(__name__)

SETTINGS_FILE = Path(__file__).parent.parent.parent / "app_settings.json"


DEFAULT_CANVAS_AGENT_PROMPT = """You are a Project Canvas Agent. Your job is to listen to a conversation between a user and an assistant about a project idea, and extract RICH, DETAILED information to build a comprehensive project canvas.

Your canvas should be MORE informative than the chat - it's the definitive reference document for the project.

CANVAS SECTIONS (use these exact 4 IDs):
- "identity": Project name and essence - what IS this thing? (1-2 sentences capturing the core vision)
- "definition": Scope and boundaries - what does it DO? (features, constraints, goals, success criteria)
- "resources": Inputs needed - what do we NEED? (tech stack, tools, materials, budget, time, skills)
- "execution": Action plan - HOW do we build it? (steps, phases, milestones, timeline)

CRITICAL INSTRUCTIONS:
1. Read the ENTIRE conversation carefully - extract ALL details
2. Be VERBOSE and COMPREHENSIVE - include every relevant detail mentioned
3. For features/tech/resources: Use bullet points with FULL explanations, not just keywords
4. Include specific recommendations, product names, tips, and advice from the assistant
5. Synthesize information across multiple messages into coherent sections
6. The canvas should be a RICH REFERENCE DOCUMENT, not a summary
7. If the assistant gave specific recommendations (like product names), include them!

CONSISTENCY IS PARAMOUNT:
8. DETECT REQUIREMENT CHANGES: Look for phrases like "instead of", "switch to", "change to", "use X not Y", "prefer", "actually I want"
9. When a requirement CHANGES, you MUST update ALL sections that referenced the old requirement
10. Example: If user says "use Bevy instead of Godot", then resources, execution, and any other section mentioning Godot MUST be updated to Bevy
11. The canvas must ALWAYS reflect the user's CURRENT, LATEST decisions - never show outdated choices
12. If unsure whether something changed, re-read the latest user messages to confirm their current preference

Think through everything discussed, identify any changed requirements, then compile rich, detailed updates that are 100% consistent with the user's latest decisions."""

DEFAULT_SIMPLE_ASSISTANT_PROMPT = "You are a helpful assistant. Be clear and concise."

DEFAULT_QUESTION_ANSWER_PROMPT = """You are a helpful assistant. Answer the question thoughtfully using your knowledge.

The user is asking about: {context}

Provide a clear, informative answer. Be concise but complete."""

DEFAULT_FINAL_ANSWER_PROMPT = """You are a helpful assistant creating a comprehensive final answer.

IMPORTANT INSTRUCTIONS:
1. You MUST include ALL the key information from the analysis below
2. Do NOT summarize briefly - provide a COMPLETE, DETAILED response
3. Include specific details, steps, examples, and explanations from the analysis
4. Structure the answer with clear headings and sections
5. The final answer should be as long as needed to cover everything thoroughly

ANALYSIS TO INCLUDE:
{context}

Now write a comprehensive answer that incorporates ALL the above insights."""


@dataclass
class WebSearchSettings:
    enabled: bool = True
    max_results: int = 5
    max_results_for_questions: int = 3
    region: str = "wt-wt"
    research_triggers: list[str] = field(
        default_factory=lambda: [
            "what are the best",
            "recommend",
            "comparison",
            "how much",
            "price",
            "cost",
            "current",
            "latest",
            "popular",
            "market",
            "which",
            "where can",
            "tools",
            "equipment",
            "products",
            "statistics",
            "data",
            "trends",
            "examples of",
            "web search",
            "search for",
            "look up",
            "find out",
            "version",
            "features of",
        ]
    )


@dataclass
class ClassifierSettings:
    moderate_word_threshold: int = 4
    complex_indicators: list[str] = field(
        default_factory=lambda: [
            "analyze",
            "compare",
            "contrast",
            "evaluate",
            "explain",
            "describe",
            "how does",
            "how do",
            "what is",
            "what are",
            "why is",
            "why are",
            "why does",
            "why do",
            "how would you",
            "what are the implications",
            "provide a detailed",
            "step by step",
            "in depth",
            "comprehensive",
            "elaborate",
            "pros and cons",
            "advantages and disadvantages",
            "trade-offs",
            "design",
            "implement",
            "architect",
            "strategy",
            "plan",
            "debug",
            "fix",
            "solve",
            "optimize",
            "refactor",
            "create a",
            "build a",
            "write a",
            "develop",
            "tell me about",
            "teach me",
            "help me understand",
            "difference between",
            "overview of",
            "introduction to",
        ]
    )


@dataclass
class ChainOfThoughtSettings:
    max_steps: int = 10
    enable_verification: bool = True
    stream_tokens: bool = True


@dataclass
class EmbeddingSettings:
    provider: str = "llm"
    server_type: str = "lm_studio"
    address: str = "localhost"
    port: int = 1234
    model: str = ""
    openai_api_key: str | None = None
    vector_size: int = 384


@dataclass
class QdrantSettings:
    enabled: bool = False
    use_memory_search: bool = True
    deployment: str = "local"
    url: str = "http://localhost:6333"
    api_key: str | None = None
    collection_research: str = "research_documents"
    collection_memory: str = "conversation_memory"
    collection_canvas: str = "canvas_content"


DEFAULT_COT_QUICK_PROMPT = "Explain the key differences between supervised and unsupervised machine learning, and when to use each approach"
DEFAULT_PROJECT_QUICK_PROMPT = "I want to open a small coffee shop in my neighborhood. Help me plan everything from concept to opening day."


@dataclass
class PromptSettings:
    canvas_agent_system: str = field(
        default_factory=lambda: DEFAULT_CANVAS_AGENT_PROMPT
    )
    simple_assistant: str = field(
        default_factory=lambda: DEFAULT_SIMPLE_ASSISTANT_PROMPT
    )
    question_answer: str = field(default_factory=lambda: DEFAULT_QUESTION_ANSWER_PROMPT)
    final_answer: str = field(default_factory=lambda: DEFAULT_FINAL_ANSWER_PROMPT)
    cot_quick_prompt: str = field(default_factory=lambda: DEFAULT_COT_QUICK_PROMPT)
    quick_prompt: str = field(default_factory=lambda: DEFAULT_PROJECT_QUICK_PROMPT)


@dataclass
class AppSettings:
    web_search: WebSearchSettings = field(default_factory=WebSearchSettings)
    classifier: ClassifierSettings = field(default_factory=ClassifierSettings)
    chain_of_thought: ChainOfThoughtSettings = field(
        default_factory=ChainOfThoughtSettings
    )
    prompts: PromptSettings = field(default_factory=PromptSettings)
    embedding: EmbeddingSettings = field(default_factory=EmbeddingSettings)
    qdrant: QdrantSettings = field(default_factory=QdrantSettings)

    def to_dict(self) -> dict:
        return {
            "web_search": asdict(self.web_search),
            "classifier": asdict(self.classifier),
            "chain_of_thought": asdict(self.chain_of_thought),
            "prompts": asdict(self.prompts),
            "embedding": asdict(self.embedding),
            "qdrant": asdict(self.qdrant),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "AppSettings":
        return cls(
            web_search=WebSearchSettings(**data.get("web_search", {})),
            classifier=ClassifierSettings(**data.get("classifier", {})),
            chain_of_thought=ChainOfThoughtSettings(**data.get("chain_of_thought", {})),
            prompts=PromptSettings(**data.get("prompts", {})),
            embedding=EmbeddingSettings(**data.get("embedding", {})),
            qdrant=QdrantSettings(**data.get("qdrant", {})),
        )


def load_app_settings() -> AppSettings:
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, encoding="utf-8") as f:
                data = json.load(f)
                return AppSettings.from_dict(data)
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning(f"Failed to load app_settings.json, using defaults: {e}")
    return AppSettings()


async def load_app_settings_async() -> AppSettings:
    if SETTINGS_FILE.exists():
        try:
            async with aiofiles.open(SETTINGS_FILE, mode="r", encoding="utf-8") as f:
                content = await f.read()
                data = json.loads(content)
                return AppSettings.from_dict(data)
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning(f"Failed to load app_settings.json async, using defaults: {e}")
    return AppSettings()


def save_app_settings(settings: AppSettings) -> None:
    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(settings.to_dict(), f, indent=2)


async def save_app_settings_async(settings: AppSettings) -> None:
    async with aiofiles.open(SETTINGS_FILE, mode="w", encoding="utf-8") as f:
        await f.write(json.dumps(settings.to_dict(), indent=2))


_current_app_settings: AppSettings | None = None


def get_app_settings() -> AppSettings:
    global _current_app_settings
    if _current_app_settings is None:
        _current_app_settings = load_app_settings()
    return _current_app_settings


def update_app_settings(settings: AppSettings) -> None:
    global _current_app_settings
    _current_app_settings = settings
    save_app_settings(settings)


def update_web_search_settings(web_search: WebSearchSettings) -> AppSettings:
    settings = get_app_settings()
    settings.web_search = web_search
    update_app_settings(settings)
    return settings


def update_classifier_settings(classifier: ClassifierSettings) -> AppSettings:
    settings = get_app_settings()
    settings.classifier = classifier
    update_app_settings(settings)
    return settings


def update_chain_of_thought_settings(cot: ChainOfThoughtSettings) -> AppSettings:
    settings = get_app_settings()
    settings.chain_of_thought = cot
    update_app_settings(settings)
    return settings


def update_prompt_settings(prompts: PromptSettings) -> AppSettings:
    settings = get_app_settings()
    settings.prompts = prompts
    update_app_settings(settings)
    return settings
