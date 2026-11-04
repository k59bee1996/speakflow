---
name: ticket
description: Run the canonical cross-agent ticket workflow from intake through the PR gate.
---

# Claude Code adapter

This skill creates the `/ticket` command. Read and follow `.agents/skills/ticket/SKILL.md` as the canonical source of truth. Pass the user's arguments untouched, including mode, skips, start stage, expectations and document links. Do not duplicate or override canonical rules.

Use Claude Code's available tools/UI equivalents for questions, repository operations and subagents. Ask the user in chat and wait when no question tool exists. If a requested operation or capability is unsupported, say so and follow the canonical fallback; never imply universal slash-command, delegation, GitHub MCP or controller support. Keep the canonical artifact paths, gates, evidence and handoff format.

For every delegated stage, pass the canonical stage table's Claude Code `model` alias and `effort` directly to the Agent invocation when supported. If invocation effort is unavailable, use a stage-specific subagent definition with both fields; disclose an inherited or substituted model instead of claiming routing occurred. Keep approval and repository mutation with the parent as the canonical workflow requires.
