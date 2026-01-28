import re
import logging
from dataclasses import dataclass

from app.models.agents import AGENT_INFO

logger = logging.getLogger(__name__)

AGENT_ALIASES = {
    "pm": ["pm", "project manager", "manager"],
    "identity": ["identity", "namer", "the namer"],
    "definition": ["definition", "architect", "the architect", "def"],
    "resources": ["resources", "pragmatist", "the pragmatist", "res"],
    "execution": ["execution", "planner", "the planner", "exec"],
}

MENTION_PATTERN = re.compile(r"@(\w+)", re.IGNORECASE)


@dataclass
class MentionInfo:
    agent_id: str
    original_text: str
    start_pos: int
    end_pos: int


def normalize_agent_id(text: str) -> str | None:
    text_lower = text.lower().strip()
    for agent_id, aliases in AGENT_ALIASES.items():
        if text_lower in aliases:
            return agent_id
    return None


def extract_mentions(message: str) -> list[MentionInfo]:
    mentions = []
    for match in MENTION_PATTERN.finditer(message):
        raw_mention = match.group(1)
        agent_id = normalize_agent_id(raw_mention)
        if agent_id:
            mentions.append(
                MentionInfo(
                    agent_id=agent_id,
                    original_text=match.group(0),
                    start_pos=match.start(),
                    end_pos=match.end(),
                )
            )
    return mentions


def get_mentioned_agents(message: str) -> list[str]:
    mentions = extract_mentions(message)
    seen = set()
    result = []
    for mention in mentions:
        if mention.agent_id not in seen:
            seen.add(mention.agent_id)
            result.append(mention.agent_id)
    return result


def strip_mentions(message: str) -> str:
    mentions = extract_mentions(message)
    result = message
    for mention in sorted(mentions, key=lambda m: m.start_pos, reverse=True):
        result = result[: mention.start_pos] + result[mention.end_pos :]
    return result.strip()


def format_agent_mention(agent_id: str) -> str:
    info = AGENT_INFO.get(agent_id)
    if info:
        return f"@{info['name']}"
    return f"@{agent_id}"


def format_agent_display(agent_id: str) -> str:
    info = AGENT_INFO.get(agent_id)
    if info:
        return f"{info['emoji']} {info['name']} ({info['nickname']})"
    return agent_id


def is_user_mention(message: str) -> bool:
    return bool(MENTION_PATTERN.search(message))


def should_invoke_agent(
    agent_id: str, message: str, pm_decision: str | None = None
) -> bool:
    user_mentions = get_mentioned_agents(message)
    if agent_id in user_mentions:
        return True
    if pm_decision:
        pm_mentions = get_mentioned_agents(pm_decision)
        if agent_id in pm_mentions:
            return True
    return False


def create_mention_summary(message: str) -> dict:
    mentions = extract_mentions(message)
    return {
        "has_mentions": len(mentions) > 0,
        "agents": get_mentioned_agents(message),
        "mentions": [
            {
                "agent_id": m.agent_id,
                "text": m.original_text,
                "display": format_agent_display(m.agent_id),
            }
            for m in mentions
        ],
        "stripped_message": strip_mentions(message),
    }


def suggest_agents_for_message(message: str) -> list[str]:
    message_lower = message.lower()
    suggestions = []

    identity_keywords = ["name", "what is", "define", "essence", "title", "called"]
    if any(kw in message_lower for kw in identity_keywords):
        suggestions.append("identity")

    definition_keywords = [
        "scope",
        "features",
        "requirements",
        "constraints",
        "goals",
        "objective",
    ]
    if any(kw in message_lower for kw in definition_keywords):
        suggestions.append("definition")

    resource_keywords = [
        "need",
        "tools",
        "budget",
        "cost",
        "time",
        "materials",
        "stack",
        "technology",
    ]
    if any(kw in message_lower for kw in resource_keywords):
        suggestions.append("resources")

    execution_keywords = [
        "plan",
        "steps",
        "roadmap",
        "timeline",
        "milestones",
        "phase",
        "how to",
    ]
    if any(kw in message_lower for kw in execution_keywords):
        suggestions.append("execution")

    return suggestions
