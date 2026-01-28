import logging
import re
import httpx
from typing import Optional, Any
import certifi
from ddgs import DDGS
from app.services.app_settings import get_app_settings

logger = logging.getLogger(__name__)


class WebSearchService:
    """Web search service for research and fact-checking."""

    def __init__(self):
        self.ddgs = DDGS(verify=certifi.where())

    def _get_settings(self):
        return get_app_settings().web_search

    def _extract_github_repo(self, query: str) -> str | None:
        """Extract potential GitHub repo from query (e.g., 'bevy' -> 'bevyengine/bevy')."""
        repo_mappings = {
            "bevy": "bevyengine/bevy",
            "rust": "rust-lang/rust",
            "react": "facebook/react",
            "vue": "vuejs/vue",
            "next": "vercel/next.js",
            "nextjs": "vercel/next.js",
            "svelte": "sveltejs/svelte",
            "deno": "denoland/deno",
            "bun": "oven-sh/bun",
            "tailwind": "tailwindlabs/tailwindcss",
            "typescript": "microsoft/TypeScript",
        }
        query_lower = query.lower()
        for keyword, repo in repo_mappings.items():
            if keyword in query_lower:
                return repo
        return None

    async def get_github_releases(self, repo: str, max_results: int = 5) -> list[dict]:
        """Fetch latest releases from GitHub API."""
        try:
            async with httpx.AsyncClient() as client:
                resp = await client.get(
                    f"https://api.github.com/repos/{repo}/releases",
                    params={"per_page": max_results},
                    headers={"Accept": "application/vnd.github.v3+json"},
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    releases = resp.json()
                    return [
                        {
                            "title": f"{r['name'] or r['tag_name']} (GitHub Release)",
                            "url": r["html_url"],
                            "snippet": f"Version: {r['tag_name']}. Published: {r['published_at'][:10]}. {(r.get('body') or '')[:200]}",
                        }
                        for r in releases
                        if not r.get("prerelease")
                    ][:max_results]
        except Exception as e:
            logger.warning(f"GitHub API error for {repo}: {e}")
        return []

    async def search(
        self, query: str, max_results: int | None = None, region: str | None = None
    ) -> list[dict]:
        """
        Search the web for information.

        Args:
            query: Search query
            max_results: Maximum number of results (uses settings default if not provided)
            region: Region for search (uses settings default if not provided)

        Returns:
            List of search results with title, url, and snippet
        """
        settings = self._get_settings()
        if not settings.enabled:
            logger.info("Web search disabled in settings")
            return []

        max_results = max_results or settings.max_results
        region = region or settings.region
        all_results = []
        github_repo = self._extract_github_repo(query)
        if github_repo and re.search(r"version|latest|release|update", query, re.I):
            logger.info(f"Fetching GitHub releases for {github_repo}")
            github_results = await self.get_github_releases(github_repo, max_results=3)
            if github_results:
                all_results.extend(github_results)
                logger.info(f"Got {len(github_results)} GitHub releases")
        try:
            logger.info(f"Web search: '{query}' (max {max_results} results)")
            results = list(
                self.ddgs.text(query, max_results=max_results, region=region)
            )

            for r in results:
                all_results.append(
                    {
                        "title": r.get("title", ""),
                        "url": r.get("href", r.get("link", "")),
                        "snippet": r.get("body", r.get("snippet", "")),
                    }
                )

            logger.info(f"Web search returned {len(results)} results")
        except Exception as e:
            logger.error(f"Web search error: {e}")

        logger.info(f"Total search results: {len(all_results)}")
        return all_results

    async def research(
        self,
        topic: str,
        aspects: Optional[list[str]] = None,
        max_results_per_aspect: int = 3,
    ) -> dict:
        """
        Perform comprehensive research on a topic.

        Args:
            topic: Main topic to research
            aspects: Specific aspects to research (optional)
            max_results_per_aspect: Results per aspect

        Returns:
            Dictionary with research findings organized by aspect
        """
        findings: dict[str, Any] = {"topic": topic, "aspects": {}}

        if not aspects:
            results = await self.search(topic, max_results=max_results_per_aspect * 2)
            findings["general"] = results
        else:
            for aspect in aspects:
                query = f"{topic} {aspect}"
                results = await self.search(query, max_results=max_results_per_aspect)
                findings["aspects"][aspect] = results

        return findings

    async def fact_check(self, claim: str, context: Optional[str] = None) -> dict:
        """
        Fact-check a claim by searching for supporting/contradicting evidence.

        Args:
            claim: The claim to verify
            context: Additional context for the search

        Returns:
            Dictionary with search results for verification
        """
        search_query = claim
        if context:
            search_query = f"{claim} {context}"

        verification_results = await self.search(search_query, max_results=5)

        counter_query = f"{claim} false OR myth OR debunked OR incorrect"
        counter_results = await self.search(counter_query, max_results=3)

        return {
            "claim": claim,
            "supporting_evidence": verification_results,
            "potential_contradictions": counter_results,
        }

    def format_results_as_context(self, results: list[dict]) -> str:
        """Format search results as context for LLM consumption."""
        if not results:
            return "No search results found."

        formatted = []
        for i, r in enumerate(results, 1):
            formatted.append(
                f"[{i}] **{r['title']}**\n{r['snippet']}\nSource: {r['url']}"
            )

        context = "\n\n".join(formatted)
        logger.debug(f"Formatted web search context:\n{context}")
        return context


web_search = WebSearchService()
