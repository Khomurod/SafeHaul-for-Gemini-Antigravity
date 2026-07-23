<!-- context7 -->
Use the `ctx7` CLI to fetch current documentation whenever the user asks about a library, framework, SDK, API, CLI tool, or cloud service — even well-known ones like React, Next.js, Prisma, Express, Tailwind, Django, or Spring Boot. This includes API syntax, configuration, version migration, library-specific debugging, setup instructions, and CLI tool usage. Use even when you think you know the answer — your training data may not reflect recent changes. Prefer this over web search for library docs.

Do not use for: refactoring, writing scripts from scratch, debugging business logic, code review, or general programming concepts.

## Steps

1. Resolve library: `npx ctx7@latest library <name> "<user's question>"` — use the official library name with proper punctuation (e.g., "Next.js" not "nextjs", "Customer.io" not "customerio", "Three.js" not "threejs")
2. Pick the best match (ID format: `/org/project`) by: exact name match, description relevance, code snippet count, source reputation (High/Medium preferred), and benchmark score (higher is better). If results don't look right, try alternate names or queries (e.g., "next.js" not "nextjs", or rephrase the question)
3. Fetch docs: `npx ctx7@latest docs <libraryId> "<user's question>"` — run a separate `docs` command per distinct concept if the question spans multiple topics, unless it's about how they interact
4. Answer using the fetched documentation

You MUST call `library` first to get a valid ID unless the user provides one directly in `/org/project` format. Use the user's full question as the query — specific and detailed queries return better results than vague single words, but keep each query to a single concept unless the question is about how concepts interact; combined multi-topic queries dilute ranking and return shallow results for each topic. Do not run more than 3 commands per question. Do not include sensitive information (API keys, passwords, credentials) in queries.

For version-specific docs, use `/org/project/version` from the `library` output (e.g., `/vercel/next.js/v14.3.0`).

If a command fails with a quota error, inform the user and suggest `npx ctx7@latest login` or setting `CONTEXT7_API_KEY` env var for higher limits. Do not silently fall back to training data.
Run Context7 CLI requests outside Codex's default sandbox. If a Context7 CLI command fails with DNS or network errors such as ENOTFOUND, host resolution failures, or fetch failed, rerun it outside the sandbox instead of retrying inside the sandbox.
<!-- context7 -->

<!-- tool-responsibilities -->
## MCP tool responsibilities

This repo is wired to three complementary assistants plus native tooling. Use each for what it is best at; do not fan the same question out to all of them.

- **Superpowers** — owns the *working process*: clarify requirements, plan, debug systematically, write a regression/failing test first, review, and verify before claiming done. It does not navigate code and does not replace Serena or codebase-memory.
- **codebase-memory-mcp** (server `codebase-memory-mcp`) — broad *orientation & impact*: architecture, cross-module relationships, call-path tracing, dependency/impact analysis, persistent project knowledge, and how a change ripples to distant code. Reach for `search_graph` / `trace_path` / `get_architecture` / `search_code` first when exploring or getting oriented.
- **Serena** (server `serena`) — precise *symbol-level* work: exact definitions and references, inspecting a specific function/component, cross-file renames, focused refactors, symbol-level edits, and re-validating references after moving or renaming code.
- **Native tools** (Read/Grep/Glob, git, the test runner) — exact text searches, config files, running tests, build/lint/typecheck, reviewing the final diff, and git status/commit inspection.

Guidance: use codebase-memory to understand *where and why*, Serena to act on *exact symbols*, native tools to read and verify. Query both codebase-memory and Serena for the same thing only when a second independent check is genuinely worth it. Keep durable project memory in one system, not duplicated across tools.
<!-- /tool-responsibilities -->

<!-- safehaul-design-system -->
## SafeHaul UI and design-system work

Before any UI, UX, styling, responsive, accessibility, or visual-component
change:

1. Read `docs/SAFEHAUL_DESIGN_SYSTEM_ROADMAP.md`.
2. Read `docs/SAFEHAUL_UI_DESIGN_STANDARD.md` when that file exists.
3. Read `src/design-system/README.md` and the relevant component/pattern docs.

The central design system owns reusable visual appearance and interaction.
Feature folders own feature content, available actions, domain vocabulary, and
domain-to-visual mapping. Hooks and services own data, state, integrations, and
business logic. Keep feature screens in their features.

Reuse approved design-system components and semantic `--ds-*` tokens. Do not
create a local button, modal, form control, table, status treatment, arbitrary
color, unsupported font size, or competing visual primitive unless the
roadmap records the missing capability and the code documents the temporary
exception. Do not add 9px or 10px body text.

When completing or changing migration work, update the roadmap immediately.
Never mark an item complete without recorded implementation, behavior-preserving
tests, applicable desktop/mobile visual review, accessibility/keyboard review,
documentation, and final diff inspection. State honestly when a check could not
run and leave the item open or blocked.

UI standardization must not change Firebase rules, database structures,
backend behavior, integrations, permissions, routes, feature flags, or
business workflows unless the task separately justifies and approves that
change.
<!-- /safehaul-design-system -->
