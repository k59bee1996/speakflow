# Repository Guidelines

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project Structure

The application lives in `frontend/` and uses Next.js App Router with TypeScript. Routes and layouts are in `frontend/src/app/`; reusable screens are in `frontend/src/components/`; shared logic and Supabase clients are in `frontend/src/lib/`. Database migrations are in `frontend/supabase/migrations/`. Use `frontend/.env.example` as the template for local secrets in `frontend/.env.local`. There is no separate test directory.

## Development Commands

Run these from the repository root:

- `npm --prefix frontend install` installs dependencies.
- `npm --prefix frontend run dev` starts the local server.
- `npm --prefix frontend run build` creates a production build.
- `npm --prefix frontend run start` serves the build.
- `npm --prefix frontend run typecheck` checks TypeScript without emitting files.

Set the Supabase and Anthropic variables listed in `frontend/.env.example` before starting the app. No test or lint script is configured.

## Style and Architecture

TypeScript strict mode is enabled. Follow existing style: two-space indentation, semicolons, and double quotes. Use the `@/*` alias for `frontend/src` imports, PascalCase for React components (such as `TodayView.tsx`), camelCase for functions and variables, and lowercase route folders. Keep credentials and API calls on the server. Preserve the Supabase Row Level Security model when changing data access.

**Next.js version guidance:** This project’s Next.js version may differ from conventions you know. Before changing Next.js code, consult the installed documentation under `frontend/node_modules/next/dist/docs/` and follow its deprecation guidance.

## Validation

No test framework or coverage threshold is configured. Run `npm --prefix frontend run typecheck`; run the production build when practical. Manually check affected routes and auth/data flows. If adding tests, prioritize scheduling logic in `frontend/src/lib/srs.ts` and `frontend/src/lib/queue.ts`.

## Commits and Pull Requests

Recent commits use short Conventional Commit-style subjects, such as `refactor: migrate project to monorepo structure`. Use `<type>: <imperative summary>` (for example, `feat: add speaking checkpoint`). Keep PRs focused and include a summary, linked issue when relevant, validation performed, and screenshots for UI changes. Note any migration or environment-variable requirements.

## Integration Notes

The design-kit rules below are retained verbatim. Their `web/` paths map to this repository's `frontend/` application. The shared UI component directory described by the kit does not exist yet; create and document shared components there before building UI screens. Stylelint is configured in `frontend/`; the earlier statement above that no lint script exists describes the prior setup. There is no test script.

## Design is mandatory for every UI change

Before you create a screen, change a layout, or touch any style:

1. Read `docs/design/DESIGN.md` in full. It is the design law of this project and overrides your own design preferences.
2. Use only the CSS variables in `web/src/styles/tokens.css`. Never write a raw color (hex, rgb, hsl),
   a font family, or a spacing value outside the `--space-*` scale.
3. Build screens only from components in `web/src/components/ui/`. If a pattern you need does not
   exist, add it there AND document it in the component table of `DESIGN.md` in the same change.
   Do not create one-off styled elements inside a screen.
4. Follow the screen templates in `DESIGN.md` section 4: in-session screens always start with
   `SessionHeader`; one primary button per screen; loading, empty, error and normal states.
5. UI text is Vietnamese. English practice sentences use `--font-display` and `lang="en"`.
6. Never edit `tokens.css` or `DESIGN.md` unless Hoàng explicitly asks for a design change.
   If you think the design system is wrong or missing something, stop and propose the change instead.

## Before you say a UI task is done

- Run `npm run lint` and `npm run lint:styles` in `web/` and fix every error.
- Check the screen at 390 × 844 in light and dark mode against the wireframe:
  https://claude.ai/artifact/DBJxog1GcvzqXdEiZBUcaw
- List any difference from the wireframe and the reason for it.
