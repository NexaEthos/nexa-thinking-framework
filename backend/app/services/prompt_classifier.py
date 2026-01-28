import re
from enum import Enum


from dataclasses import dataclass
from app.services.app_settings import get_app_settings


class PromptComplexity(Enum):
    SIMPLE = "simple"
    MODERATE = "moderate"
    COMPLEX = "complex"


@dataclass
class ClassificationResult:
    complexity: PromptComplexity
    reasoning: str
    indicators: list[str]
    word_count: int
    confidence: float


GREETING_PATTERNS = [
    r"^(hi|hello|hey|howdy|greetings|yo|sup|hiya|morning|afternoon|evening)[\s!.,?]*$",
    r"^good\s+(morning|afternoon|evening|day|night)[\s!.,?]*$",
    r"^what'?s?\s+up[\s!?.,]*$",
    r"^how\s+(are\s+you|do\s+you\s+do)[\s!?.,]*$",
]

CONVERSATIONAL_PATTERNS = [
    r"^(yes|no|ok|okay|sure|thanks|thank\s+you|bye|goodbye|see\s+ya)[\s!.,?]*$",
    r"^(help|test|ping)[\s!.,?]*$",
    r"^(who|what)\s+(are|is)\s+(you|this)[\s!?.,]*$",
]


def classify_prompt(prompt: str) -> ClassificationResult:
    app_settings = get_app_settings()
    classifier_settings = app_settings.classifier

    normalized = prompt.strip().lower()
    word_count = len(normalized.split()) if normalized else 0
    found_indicators: list[str] = []

    if len(normalized) == 0:
        return ClassificationResult(
            complexity=PromptComplexity.SIMPLE,
            reasoning="Empty prompt detected",
            indicators=[],
            word_count=0,
            confidence=1.0,
        )

    for indicator in classifier_settings.complex_indicators:
        if indicator in normalized:
            found_indicators.append(indicator)

    if found_indicators:
        return ClassificationResult(
            complexity=PromptComplexity.COMPLEX,
            reasoning=f"Complex indicators found: {', '.join(found_indicators[:3])}. Engaging full chain-of-thought analysis.",
            indicators=found_indicators,
            word_count=word_count,
            confidence=0.9 if len(found_indicators) > 1 else 0.75,
        )

    if word_count <= classifier_settings.moderate_word_threshold:
        return ClassificationResult(
            complexity=PromptComplexity.MODERATE,
            reasoning=f"Very short prompt ({word_count} words). Using streamlined single-pass processing.",
            indicators=[],
            word_count=word_count,
            confidence=0.8,
        )

    return ClassificationResult(
        complexity=PromptComplexity.COMPLEX,
        reasoning=f"Longer prompt ({word_count} words) suggests nuanced request. Engaging full chain-of-thought analysis.",
        indicators=[],
        word_count=word_count,
        confidence=0.7,
    )


def get_simple_response(prompt: str) -> str:
    normalized = prompt.strip().lower()

    for pattern in GREETING_PATTERNS:
        if re.match(pattern, normalized, re.IGNORECASE):
            return "Hello! How can I help you today? Feel free to ask me a question that requires thoughtful analysis."

    if re.match(r"^(thanks|thank\s+you)[\s!.,?]*$", normalized, re.IGNORECASE):
        return "You're welcome! Let me know if you need anything else."

    if re.match(r"^(bye|goodbye|see\s+ya)[\s!.,?]*$", normalized, re.IGNORECASE):
        return "Goodbye! Feel free to come back anytime."

    if re.match(r"^(help|test|ping)[\s!.,?]*$", normalized, re.IGNORECASE):
        return "I'm here to help! I'm a chain-of-thought reasoning system. Ask me a complex question and I'll break it down step by step, analyzing it from multiple angles before providing a comprehensive answer."

    if re.match(
        r"^(who|what)\s+(are|is)\s+(you|this)[\s!?.,]*$", normalized, re.IGNORECASE
    ):
        return "I'm a Chain of Thought reasoning assistant. I help analyze complex questions by breaking them down into structured steps, evaluating them against predefined analytical questions, and synthesizing a verified answer."

    if re.match(r"^(yes|no|ok|okay|sure)[\s!.,?]*$", normalized, re.IGNORECASE):
        return "Got it! What would you like me to help you analyze?"

    return "I understand. Could you provide more details or ask a specific question that I can analyze for you?"
