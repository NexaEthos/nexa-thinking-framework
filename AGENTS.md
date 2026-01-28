# Agents.md

<!-- markdownlint-configure-file {
  "MD013": false,
  "MD033": {
    "allowed_elements": [
      "agents","purpose","generalPrinciples","principle","guidelines",
      "rust","rule","command","file","subrule","python","typescript",
      "multiRepoCoordination","agentCollaboration","prohibited","note","code"
    ]
  }
} -->

<agents>

    <purpose> Purpose: This document defines rules, conventions, and responsibilities for agents working within the workspace that may be a multi-language workspace (Rust, Python, TypeScript). It ensures consistency, quality, and collaboration across repositories.</purpose>

    <generalPrinciples>
        <principle>No mock code, placeholders, stubs or silent fallbacks — always provide a useful error or debugging message.</principle>
        <principle>There is no "legacy" and no "future implementations" all the code must have a clear, real and actual purpose, or it will be considered in violation of this file</principle>
        <principle>Plan before coding — align with the User, Architect, and Orchestrator agents before implementing.</principle>
        <principle>Keep code lean, clean, and functional — no dead code, unnecessary abstractions, or unapproved tests.</principle>
        <principle>Dependencies are explicit and tracked — always use proper commands/tools instead of manual edits.</principle>
        <principle>Never guess versions — fetch actual versions via context7 or tools (e.g., MCP, cargo add, npm info, pip index).</principle>
        <principle>Consistency across repos — follow per-language conventions listed below.</principle>
        <principle>Use deterministic allocation for enterprise-scale data structures (FPGA HBM2 allocation for single 4GiB state frame) — maintains high performance while enabling massive scale.</principle>
        <principle>Avoid commenting the source code unless extremely necessary</principle>
    </generalPrinciples>

    <guidelines>
        <rust> Rust Guidelines
            <rule>Add dependencies with <command>cargo add</command>, never edit <file>Cargo.toml</file> manually unless explicitly authorized.</rule>
            <rule>Always run <command>cargo check</command> and <command>cargo clippy -- -W clippy::pedantic</command> to ensure zero warnings.</rule>
            <rule>Dioxus:
                <subrule>Use <command>dx build</command> (not <command>cargo build</command>).</subrule>
                <subrule>Avoid manual feature flags — Dioxus handles platform targets.</subrule>
                <subrule>Keep modules modular and avoid unnecessary abstractions.</subrule>
            </rule>
        </rust>

        <python> Python Guidelines
            <rule>Always use the <file>.venv</file> environment in VSCode (user-managed).</rule>
            <rule>Code must be ruff or similar linters (don’t suppress type errors or warnings).</rule>
            <rule>Dependencies installed with <command>pip install</command> or pip-tools lockfiles — no direct <file>requirements.txt</file> editing without sync.</rule>
            <rule>Prefer async-first design where appropriate.</rule>
            <rule>Keep dependencies minimal and updated.</rule>
        </python>

        <typescript> TypeScript / Node Guidelines
            <rule>Dependencies added via <command>pnpm add</command> (preferred) or <command>npm install</command>, never direct edits to <file>package.json</file>.</rule>
            <rule>Always try to use the best combination to ensure the latest version possible.</rule>
            <rule>Code must pass <command>eslint</command> + <command>prettier</command> checks.</rule>
            <rule>Use <command>tsc --noEmit</command> to ensure type correctness.</rule>
            <rule>Avoid polyfills unless necessary; prefer modern ECMAScript features.</rule>
            <rule>Keep builds fast, modular, and tree-shakeable.</rule>
        </typescript>
    </guidelines>

    <prohibited> Prohibited
        <rule>No Docker unless explicitly required; if present follow the structure already in place.</rule>
        <rule>No dead code, unused abstractions, or test scaffolding unless approved.</rule>
        <rule>No suppressing errors or warnings (Rust <code>#[allow]</code>, Python <code># type: ignore</code>, TS <code>// @ts-ignore</code>)</rule>
        <rule>No editing of files in the root of this project; consider them READ ONLY (with the exception of the TODO.md, API.md and ROADMAP.md) and the source of truth.</rule>
        <rule>No building/testing/collaboration details on the files README.md in this workspace unless asked to create it.</rule>
        <rule>No incomplete or partial implementations, if a feature is started it must be fully complete by our strict standards.</rule>
    </prohibited>

    <note>Please read <file>ARCHITECTURE.md</file> to understand the actual state of the project.</note>
    <note>All tests must be designed to be executed exclusively in-cluster</note>
    <note>This is an internal project, no need for auth/security (if not requested on a particular module)</note>
    <note>When designing or coding, try to stay below 1000 LOC (per file) for a better maintainability, 500 LOC should be the target, 1000 LOC upper limit, >1000 LOC only with approval (the nexa-mcp is excluded from this rule)</note>
    <note>When working on a TODO completion, do your best to progress without the user support and try to carry on all the points sequentially, ask the user guidance only if something unplanned is blocking you</note>
</agents>
