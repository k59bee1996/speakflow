# Speakflow: instructions for AI agents

Keep this file short (max 60 lines). Put area-specific rules in the AGENTS.md of that folder, not here.

# Software Engineering Standards

## Core Principles
- Follow SOLID, DRY, KISS, and YAGNI.
- Prefer simple, readable, maintainable solutions.
- Avoid premature abstractions and overengineering.
- Respect existing architectural boundaries.

## Design Patterns
- Apply design patterns only when justified.
- Prefer composition over inheritance when appropriate.
- Evaluate trade-offs before introducing abstractions.
- Do not introduce patterns solely for compliance.

## Quality
- Write testable code.
- Handle errors explicitly.
- Maintain backward compatibility where required.
- Follow established project conventions.

## Repository layout

- `frontend/` — Next.js frontend
- `backend/` — ASP.NET Core (.NET 10) API with SQL Server
- `content/lessons/` — lesson JSON files
- `docs/` — product, design and archived docs

## Read the rules for every area you touch (mandatory)

Sessions always start at the repo root, so area rules are not loaded automatically.
Before you plan or edit anything:

1. List which areas the task touches (`frontend/`, `backend/`, `content/lessons/`).
2. Read the rule file of EVERY area in that list. A full-stack ticket means reading both
   `frontend/AGENTS.md` and `backend/AGENTS.md`.
3. State in your plan which rule files you read.

If you later need to edit a file in an area you did not list, read that area's rule file first.

| You change files in | Read first                                                 |
| ------------------- | ---------------------------------------------------------- |
| `frontend/`         | `frontend/AGENTS.md` (includes the mandatory design rules) |
| `backend/`          | `backend/AGENTS.md`                                        |
| `content/lessons/`  | `content/lessons/README.md`                                |

## Shared rules

- One branch per GitHub issue; reference the issue in the PR (`Closes #<number>`).
- Never commit secrets: connection strings, API keys, passwords.
- Keep changes inside the scope of the issue; list anything else you notice instead of fixing it.

## Commit and pull request conventions

- Use short Conventional Commit subjects such as `chore: update agent rules`.
- Keep pull requests focused; include a summary, issue link when available, validation, and screenshots for UI changes.
- Note database migrations and environment-variable changes in the pull request.
