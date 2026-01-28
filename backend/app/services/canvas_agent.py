import json
import re
import logging
import asyncio
from typing import Any, Callable, Optional
from .llm_proxy import LLMProxy
from .llm_settings import get_settings
from .web_search import web_search
from .app_settings import get_app_settings
from .agent_settings import get_agent_settings

logger = logging.getLogger(__name__)


def get_canvas_extraction_format() -> str:
    return get_agent_settings().analysis.canvas_extraction_prompt


class CanvasAgent:
    def __init__(self):
        settings = get_settings()
        self.llm = LLMProxy(base_url=settings.get_base_url(), model=settings.model)
        self.web_search = web_search

    def _get_canvas_system_prompt(self) -> str:
        return get_app_settings().prompts.canvas_agent_system

    async def _collect_response(self, messages: list) -> str:
        chunks = []
        async for chunk in self.llm.chat_completion(messages):
            chunks.append(chunk)
        return "".join(chunks)

    async def analyze_conversation(
        self,
        conversation: list[dict],
        current_canvas: list[dict],
        enable_research: bool = True,
        on_section_complete: Optional[Callable[[dict], Any]] = None,
    ) -> list[dict]:
        """
        Analyze the full conversation and extract canvas updates using parallel processing.

        Args:
            conversation: List of {role, content} message dicts
            current_canvas: Current canvas sections [{id, title, content}]
            enable_research: Whether to perform web research if needed
            on_section_complete: Optional callback called with each section as it completes

        Returns:
            List of canvas updates [{id, title, content}]
        """
        app_settings = get_app_settings()
        enable_research = enable_research and app_settings.web_search.enabled

        if not conversation:
            return []

        # Log conversation summary for debugging
        user_msgs = [m for m in conversation if m.get("role") == "user"]
        assistant_msgs = [m for m in conversation if m.get("role") == "assistant"]
        logger.info(
            f"Canvas Agent: Analyzing {len(conversation)} messages "
            f"({len(user_msgs)} user, {len(assistant_msgs)} assistant)"
        )

        # Phase 1: Parallel research on multiple aspects
        research_contexts = {}
        if enable_research:
            research_contexts = await self._parallel_research(conversation)
            if research_contexts:
                logger.info(
                    f"Canvas Agent: Completed research on {len(research_contexts)} topics"
                )

        conversation_text = "\n\n".join(
            [f"**{msg['role'].upper()}**: {msg['content']}" for msg in conversation]
        )

        canvas_text = "Empty - no sections yet"
        if current_canvas:
            canvas_text = "\n".join(
                [
                    f"- **{s.get('title', s.get('id'))}**: {s.get('content', '')[:200]}..."
                    for s in current_canvas
                ]
            )

        # Phase 2: Parallel section analysis - analyze different aspects concurrently
        # Results from parallel analysis are used to inform section extraction
        _ = await self._parallel_section_analysis(
            conversation_text, canvas_text, research_contexts
        )

        # Phase 3: Initial extraction
        initial_updates = await self._extract_all_sections(
            conversation_text, canvas_text, research_contexts
        )

        if not initial_updates:
            logger.warning(
                "Canvas Agent: Initial extraction returned no updates, trying fallback"
            )
            initial_updates = await self._fallback_extraction(
                conversation_text, canvas_text
            )
            if not initial_updates:
                logger.warning(
                    "Canvas Agent: Fallback extraction also returned no updates"
                )
                # Even with no new extraction, check for replacements to apply to existing canvas
                replacements = self._detect_replacements(conversation_text)
                if replacements and current_canvas:
                    logger.info(
                        f"Canvas Agent: No new extractions, but found {len(replacements)} replacements to apply to existing canvas"
                    )
                    updated_existing = []
                    for existing_section in current_canvas:
                        updated_section = self._apply_replacements(
                            [existing_section], replacements
                        )[0]
                        updated_existing.append(updated_section)
                        logger.info(
                            f"Canvas Agent: Applied replacements to existing section '{existing_section.get('id')}'"
                        )
                    return updated_existing
                return []

        # Detect replacements to enforce consistency
        replacements = self._detect_replacements(conversation_text)
        if replacements:
            logger.info(f"Canvas Agent: Detected replacements: {replacements}")

        # Phase 4: Multi-turn refinement - enrich each section with more detail
        # Pass replacements so they can be applied immediately after enrichment
        enriched_updates = await self._parallel_enrichment(
            initial_updates,
            conversation_text,
            research_contexts,
            on_section_complete,
            replacements,
        )

        # Phase 5: Enforce replacements programmatically as safety net
        if replacements:
            enriched_updates = self._apply_replacements(enriched_updates, replacements)

            # Also apply replacements to existing canvas sections that weren't re-extracted
            # to ensure complete consistency
            extracted_ids = {u.get("id") for u in enriched_updates}
            for existing_section in current_canvas:
                if existing_section.get("id") not in extracted_ids:
                    updated_section = self._apply_replacements(
                        [existing_section], replacements
                    )[0]
                    enriched_updates.append(updated_section)
                    logger.info(
                        f"Canvas Agent: Applied replacements to existing section '{existing_section.get('id')}'"
                    )

            logger.info(
                f"Canvas Agent: Applied {len(replacements)} replacements to output"
            )

        logger.info(f"Canvas Agent parsed {len(enriched_updates)} enriched updates")
        return enriched_updates

    def _apply_replacements(
        self, updates: list[dict], replacements: list[tuple[str, str]]
    ) -> list[dict]:
        """Apply text replacements to enforce consistency."""
        result = []
        for section in updates:
            content = section.get("content", "")
            title = section.get("title", "")
            section_id = section.get("id", "unknown")
            replacements_made = 0
            for old, new in replacements:
                # Case-insensitive replacement for the old term, including possessive forms
                # Match "Unity", "Unity's", "Unity-based", etc.
                pattern = re.compile(rf"{re.escape(old)}('s)?", re.IGNORECASE)
                old_content = content
                # Replace preserving the possessive if present
                content = pattern.sub(lambda m: f"{new}{m.group(1) or ''}", content)
                title = pattern.sub(lambda m: f"{new}{m.group(1) or ''}", title)
                if content != old_content:
                    replacements_made += len(pattern.findall(old_content))
            if replacements_made > 0:
                logger.info(
                    f"Canvas Agent: Section '{section_id}' had {replacements_made} text replacements applied"
                )
            result.append({"id": section_id, "title": title, "content": content})
        return result

    async def _parallel_research(self, conversation: list[dict]) -> dict[str, str]:
        """Perform parallel web searches on multiple relevant topics."""
        recent_messages = conversation[-6:] if len(conversation) > 6 else conversation
        conversation_snippet = "\n".join(
            [f"{m['role']}: {m['content']}" for m in recent_messages]
        )

        # Ask LLM to identify multiple research queries
        query_messages = [
            {
                "role": "system",
                "content": """Identify 2-4 specific research queries based on the user's project.

IMPORTANT: Generate REAL search queries with ACTUAL product names from the conversation.
DO NOT use placeholder brackets like [component] or [product type] - fill in REAL values.

EXAMPLES OF GOOD QUERIES:
- User says "drone under $500" → "DIY drone kit under $500 buy 2024"
- User says "4K camera" → "4K drone camera module price Amazon"
- User says "coffee shop" → "commercial espresso machine price 2024"
- User says "gaming PC" → "RTX 4070 GPU price comparison 2024"

EXAMPLES OF BAD QUERIES (NEVER DO THIS):
- "[specific part] price buy 2024" ← WRONG: brackets are placeholders
- "[component] Amazon" ← WRONG: you must fill in the actual component name

Respond with JSON: {"queries": [{"topic": "short topic name", "query": "search query with ACTUAL product names"}]}""",
            },
            {
                "role": "user",
                "content": f"Conversation:\n{conversation_snippet}",
            },
        ]

        try:
            response = await self._collect_response(query_messages)
            match = re.search(r"\{[\s\S]*\}", response)
            if not match:
                return {}

            data = json.loads(match.group())
            queries = data.get("queries", [])

            if not queries:
                return {}

            # Run all searches in parallel
            async def search_topic(item: dict) -> tuple[str, str]:
                topic = item.get("topic", "general")
                query = item.get("query", "")
                if not query:
                    return topic, ""
                results = await self.web_search.search(query, max_results=3)
                if results:
                    return topic, self.web_search.format_results_as_context(results)
                return topic, ""

            search_results = await asyncio.gather(
                *[search_topic(q) for q in queries[:4]], return_exceptions=True
            )

            research_contexts = {}
            for result in search_results:
                if isinstance(result, tuple) and result[1]:
                    research_contexts[result[0]] = result[1]

            return research_contexts

        except Exception as e:
            logger.debug(f"Parallel research error: {e}")
            return {}

    async def _parallel_section_analysis(
        self, conversation_text: str, canvas_text: str, research_contexts: dict
    ) -> dict[str, str]:
        """Analyze different section categories in parallel."""
        # Updated to use new 4-section format
        section_groups = {
            "vision": ["identity", "definition"],
            "implementation": ["resources", "execution"],
        }

        async def analyze_group(
            group_name: str, sections: list[str]
        ) -> tuple[str, str]:
            relevant_research = (
                "\n\n".join([f"**{k}**:\n{v}" for k, v in research_contexts.items()])
                if research_contexts
                else ""
            )

            messages = [
                {
                    "role": "system",
                    "content": f"""Analyze the conversation focusing on {group_name} aspects: {', '.join(sections)}.
Extract detailed information for each relevant section. Be thorough and specific.""",
                },
                {
                    "role": "user",
                    "content": f"""CONVERSATION:\n{conversation_text}\n\nCURRENT CANVAS:\n{canvas_text}
{f"RESEARCH:{chr(10)}{relevant_research}" if relevant_research else ""}

Analyze and identify content for: {', '.join(sections)}""",
                },
            ]
            analysis = await self._collect_response(messages)
            return group_name, analysis

        results = await asyncio.gather(
            *[
                analyze_group(name, sections)
                for name, sections in section_groups.items()
            ],
            return_exceptions=True,
        )

        analyses = {}
        for result in results:
            if isinstance(result, tuple):
                analyses[result[0]] = result[1]

        return analyses

    def _detect_replacements(self, conversation_text: str) -> list[tuple[str, str]]:
        """Detect explicit replacement requests in the conversation."""
        replacements = []
        patterns = [
            r"(?:use|switch to|change to|prefer)\s+(\w+)\s+(?:instead of|over|rather than)\s+(\w+)",
            r"(?:replace|swap)\s+(\w+)\s+(?:with|for)\s+(\w+)",
            r"(\w+)\s+instead of\s+(\w+)",
        ]
        for pattern in patterns:
            matches = re.findall(pattern, conversation_text, re.IGNORECASE)
            for match in matches:
                if len(match) == 2:
                    new_choice, old_choice = match[0], match[1]
                    replacements.append((old_choice, new_choice))
        return replacements

    async def _extract_all_sections(
        self, conversation_text: str, canvas_text: str, research_contexts: dict
    ) -> list[dict]:
        """Extract all canvas sections in one comprehensive pass."""
        research_section = ""
        if research_contexts:
            research_section = "\n\nWEB RESEARCH RESULTS:\n" + "\n\n".join(
                [
                    f"**{topic}**:\n{context}"
                    for topic, context in research_contexts.items()
                ]
            )

        # Detect explicit replacements (e.g., "use Bevy instead of Unity")
        replacements = self._detect_replacements(conversation_text)

        replacement_instructions = ""
        if replacements:
            replacement_list = "\n".join(
                [
                    f"  - REPLACE all mentions of '{old}' with '{new}'"
                    for old, new in replacements
                ]
            )
            replacement_instructions = f"""
⚠️ MANDATORY REPLACEMENTS DETECTED ⚠️
The user explicitly requested these changes:
{replacement_list}

YOU MUST:
1. Remove ALL references to the OLD choice from EVERY section
2. Replace with the NEW choice throughout
3. Do NOT mention the old choice as an alternative
4. Do NOT keep any recommendations for the old choice
"""
            logger.info(f"Canvas Agent: Detected replacements: {replacements}")

        # Detect requirement changes in the conversation
        change_detection_prompt = f"""FIRST, check for any REQUIREMENT CHANGES in this conversation.
{replacement_instructions}

Look for patterns like:
- "instead of X, use Y"
- "switch from X to Y"
- "I'd prefer X over Y"
- "actually, let's use X"
- "can you update to use X"
- "replace X with Y"

If you find ANY requirement changes, the NEW choice is the ONLY valid choice.
PURGE all references to old/rejected choices from every section."""

        analysis_messages = [
            {"role": "system", "content": self._get_canvas_system_prompt()},
            {
                "role": "user",
                "content": f"""Analyze this conversation and extract ALL project information comprehensively:

CONVERSATION:
{conversation_text}

CURRENT CANVAS:
{canvas_text}
{research_section}

{change_detection_prompt}

Be THOROUGH. Extract every piece of relevant information. Create detailed, rich content for each section.

⚠️ CRITICAL CONSISTENCY REQUIREMENT ⚠️
If the user CHANGED any requirements (e.g., "use Bevy instead of Unity"):
- The OLD choice (Unity) must NOT appear anywhere in the canvas
- The NEW choice (Bevy) must be used in ALL relevant sections
- Go through EVERY section and verify no old references remain
- This applies to: technology, frameworks, tools, approaches, etc.

Include specific recommendations, technical details, and actionable insights for the CURRENT choices only.""",
            },
        ]

        logger.info("Canvas Agent: Starting comprehensive analysis...")
        analysis = await self._collect_response(analysis_messages)

        extraction_messages = [
            {
                "role": "system",
                "content": "You extract structured data from analysis. Respond with ONLY valid JSON.",
            },
            {
                "role": "user",
                "content": f"""Based on this analysis:

{analysis}

{get_canvas_extraction_format().format(current_canvas=canvas_text)}""",
            },
        ]

        extraction = await self._collect_response(extraction_messages)
        return self._parse_updates(extraction)

    async def _fallback_extraction(
        self, conversation_text: str, canvas_text: str
    ) -> list[dict]:
        """Simple fallback extraction with a more direct prompt."""
        fallback_messages = [
            {
                "role": "system",
                "content": """Extract project information into JSON format. 
Be concise and respond with ONLY valid JSON, no explanation.
Use this exact structure:
{"updates": [{"id": "identity", "title": "Identity", "content": "..."}, ...]}

Valid section IDs (use ONLY these 4):
- identity: Project name and one-liner description (what IS this?)
- definition: Features, scope, goals, constraints (what does it DO?)
- resources: Tech stack, tools, materials, budget, time (what do we NEED?)
- execution: Steps, phases, milestones, plan (HOW do we build it?)""",
            },
            {
                "role": "user",
                "content": f"""Extract key project sections from this conversation:

{conversation_text[:3000]}

Current canvas: {canvas_text}

Respond with JSON only.""",
            },
        ]

        try:
            response = await self._collect_response(fallback_messages)
            return self._parse_updates(response)
        except Exception as e:
            logger.error(f"Fallback extraction error: {e}")
            return []

    async def _parallel_enrichment(
        self,
        initial_updates: list[dict],
        conversation_text: str,
        research_contexts: dict,
        on_section_complete: Optional[Callable[[dict], Any]] = None,
        replacements: Optional[list[tuple[str, str]]] = None,
    ) -> list[dict]:
        """Enrich each section in parallel with more detailed content."""

        async def enrich_section(section: dict) -> dict:
            section_id = section.get("id", "")
            current_content = section.get("content", "")
            title = section.get("title", section_id.title())

            # Find relevant research for this section
            relevant_research = ""
            for topic, context in research_contexts.items():
                if any(kw in topic.lower() for kw in [section_id, title.lower()]):
                    relevant_research = context
                    break

            # Check if this is a JSON-structured section that shouldn't be enriched
            is_json_section = section_id in ("identity",)
            if is_json_section:
                # For identity, the JSON format should be preserved exactly
                # Just return the original section without enrichment
                return section

            enrich_messages = [
                {
                    "role": "system",
                    "content": f"""You are enriching the '{title}' section of a project canvas.
Your job is to expand and improve the content with:
- More specific details and examples
- Actionable recommendations
- Technical specifics where relevant
- Clear structure with markdown formatting

CRITICAL CONSTRAINTS:
1. Do NOT introduce or revert to old/outdated requirements.
2. If the content mentions a specific technology, tool, or approach - that is the CURRENT decision.
3. Do NOT add alternative suggestions or reintroduce previously rejected options.
4. Stay consistent with what's already in the content.
5. For RESOURCES section: Do NOT invent infrastructure, cloud services, databases, or enterprise tools not discussed. Only expand on what's explicitly listed.
6. For RESOURCES section: If budget/timeline says 'Not yet discussed', leave it as is.

Keep the same general meaning but make it more detailed and useful. Do NOT add invented services or technologies.""",
                },
                {
                    "role": "user",
                    "content": f"""Current {title} content:
{current_content}

Conversation context (for reference):
{conversation_text[:1500]}

{f"Relevant research:{chr(10)}{relevant_research}" if relevant_research else ""}

Provide an enriched, more detailed version of this section. Output ONLY the improved content, no JSON or explanations.""",
                },
            ]

            try:
                enriched_content = await self._collect_response(enrich_messages)
                # Clean up the response
                enriched_content = enriched_content.strip()
                if enriched_content.startswith('"') and enriched_content.endswith('"'):
                    enriched_content = enriched_content[1:-1]

                # Apply replacements to ensure consistency IMMEDIATELY after enrichment
                if replacements:
                    for old, new in replacements:
                        pattern = re.compile(rf"{re.escape(old)}('s)?", re.IGNORECASE)
                        enriched_content = pattern.sub(
                            lambda m: f"{new}{m.group(1) or ''}", enriched_content
                        )
                        title = pattern.sub(lambda m: f"{new}{m.group(1) or ''}", title)

                # Only use enriched content if it's actually longer/better
                if len(enriched_content) > len(current_content) * 1.2:
                    return {
                        "id": section_id,
                        "title": title,
                        "content": enriched_content,
                    }
            except Exception as e:
                logger.debug(f"Enrichment error for {section_id}: {e}")

            return section

        # Enrich all sections in parallel and stream as they complete
        tasks = [asyncio.create_task(enrich_section(s)) for s in initial_updates]
        enriched_updates = []

        for coro in asyncio.as_completed(tasks):
            try:
                result = await coro
                if isinstance(result, dict):
                    enriched_updates.append(result)
                    if on_section_complete:
                        await on_section_complete(result)
            except Exception as e:
                logger.debug(f"Enrichment task error: {e}")

        return enriched_updates

    def _parse_updates(self, response: str) -> list[dict]:
        # New 4-section format
        VALID_SECTIONS = {
            "identity",
            "definition",
            "resources",
            "execution",
        }
        SECTION_TITLES = {
            "identity": "Identity",
            "definition": "Definition",
            "resources": "Resources",
            "execution": "Execution",
        }
        # Map old section IDs to new ones for backwards compatibility
        SECTION_MAPPING = {
            "overview": "identity",
            "problem": "definition",
            "users": "definition",
            "features": "definition",
            "tech": "resources",
            "challenges": "execution",
            "scope": "execution",
            "success": "execution",
        }

        def format_value(val: Any) -> str:
            """Convert any value type to rich markdown text."""
            if isinstance(val, str):
                return val
            elif isinstance(val, list):
                formatted_items = []
                for item in val:
                    if isinstance(item, dict):
                        item_text = " - ".join(f"**{k}**: {v}" for k, v in item.items())
                        formatted_items.append(f"- {item_text}")
                    elif isinstance(item, str):
                        formatted_items.append(f"- {item}")
                    else:
                        formatted_items.append(f"- {str(item)}")
                return "\n".join(formatted_items)
            elif isinstance(val, dict):
                if "content" in val:
                    return format_value(val["content"])
                formatted_pairs = []
                for k, v in val.items():
                    key_title = k.replace("_", " ").title()
                    if isinstance(v, list):
                        v_text = ", ".join(str(i) for i in v)
                        formatted_pairs.append(f"**{key_title}**: {v_text}")
                    else:
                        formatted_pairs.append(f"**{key_title}**: {v}")
                return "\n".join(formatted_pairs)
            else:
                return str(val)

        try:
            cleaned = response.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            if cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

            json_match = re.search(r"\{[\s\S]*\}", cleaned)
            if not json_match:
                logger.warning("No JSON found in response")
                return []

            json_str = json_match.group()

            try:
                data = json.loads(json_str)
            except json.JSONDecodeError:
                # Try to fix truncated JSON by finding valid array items
                fixed_json = json_str.rstrip().rstrip(",")

                # Try to find complete update objects before the truncation
                updates_match = re.search(r'"updates"\s*:\s*\[([\s\S]*)', fixed_json)
                if updates_match:
                    items_str = updates_match.group(1)
                    logger.debug(f"Found updates array content: {items_str[:200]}...")
                    # Find all complete JSON objects in the array
                    complete_items = []
                    brace_count = 0
                    start_idx = None
                    for i, char in enumerate(items_str):
                        if char == "{":
                            if brace_count == 0:
                                start_idx = i
                            brace_count += 1
                        elif char == "}":
                            brace_count -= 1
                            if brace_count == 0 and start_idx is not None:
                                complete_items.append(items_str[start_idx : i + 1])
                                start_idx = None

                    logger.info(f"Found {len(complete_items)} complete JSON objects")
                    if complete_items:
                        reconstructed = (
                            '{"updates": [' + ", ".join(complete_items) + "]}"
                        )
                        logger.debug(f"Reconstructed JSON: {reconstructed[:300]}...")
                        try:
                            data = json.loads(reconstructed)
                            logger.info(
                                f"Recovered {len(complete_items)} complete items from truncated JSON"
                            )
                        except json.JSONDecodeError as e:
                            logger.error(f"Could not parse reconstructed JSON: {e}")
                            logger.error(f"Reconstructed: {reconstructed}")
                            return []
                    else:
                        logger.error(
                            "No complete update objects found in truncated JSON"
                        )
                        return []
                else:
                    # Fallback: try simple bracket balancing
                    open_braces = fixed_json.count("{") - fixed_json.count("}")
                    open_brackets = fixed_json.count("[") - fixed_json.count("]")
                    fixed_json += "]" * open_brackets + "}" * open_braces
                    try:
                        data = json.loads(fixed_json)
                        logger.info("Fixed truncated JSON successfully")
                    except json.JSONDecodeError as e:
                        logger.error(f"Could not fix JSON: {e}")
                        return []

            valid_updates = []

            data_lower = {k.lower(): v for k, v in data.items()}
            updates_data = (
                data_lower.get("updates")
                or data_lower.get("canvas_updates")
                or data_lower.get("project_canvas")
                or data_lower.get("updated_sections")
                or data
            )

            if isinstance(updates_data, list):
                for u in updates_data:
                    if not isinstance(u, dict):
                        continue
                    u_lower = {k.lower(): v for k, v in u.items()}
                    section_id = (
                        u_lower.get("id")
                        or u_lower.get("section_id")
                        or u_lower.get("section")
                        or ""
                    )
                    section_id = section_id.lower().replace(" ", "_")
                    # Map old section IDs to new 4-section format
                    if section_id in SECTION_MAPPING:
                        section_id = SECTION_MAPPING[section_id]
                    content = format_value(u_lower.get("content", ""))
                    title = u_lower.get(
                        "title", SECTION_TITLES.get(section_id, section_id.title())
                    )
                    if section_id in VALID_SECTIONS and content:
                        valid_updates.append(
                            {"id": section_id, "title": title, "content": content}
                        )

            elif isinstance(updates_data, dict):
                for key, value in updates_data.items():
                    section_id = key.lower().replace(" ", "_")
                    # Map old section IDs to new 4-section format
                    if section_id in SECTION_MAPPING:
                        section_id = SECTION_MAPPING[section_id]
                    if section_id not in VALID_SECTIONS:
                        continue
                    content = format_value(value)
                    if content:
                        valid_updates.append(
                            {
                                "id": section_id,
                                "title": SECTION_TITLES.get(
                                    section_id, section_id.title()
                                ),
                                "content": content,
                            }
                        )

            logger.info(
                f"Parsed {len(valid_updates)} valid updates: {[u['id'] for u in valid_updates]}"
            )
            return valid_updates
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(
                f"Canvas Agent JSON parse error: {e}, response: {response[:300]}"
            )
        return []


canvas_agent = CanvasAgent()
