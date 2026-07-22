# Claude Code — project instructions

Shared agent instructions for this repo live in `AGENTS.md`. Import them so the
Context7 usage guidance and the MCP tool-responsibility policy apply here too:

@AGENTS.md

Quick reference for the MCP servers wired to this machine:

- **Superpowers** — process control: clarify → plan → debug → test-first → review → verify.
- **codebase-memory-mcp** — broad orientation, architecture, call-path tracing, impact analysis (`search_graph`, `trace_path`, `get_architecture`, `search_code`).
- **serena** — symbol-level navigation and edits: definitions, references, renames, focused refactors.
- **Native tools** (Read/Grep/Glob, git, tests) — exact text, configs, running tests, reviewing the diff.

See `AGENTS.md` → "MCP tool responsibilities" for the full policy.
