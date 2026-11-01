# Speakflow web: rules for AI agents

## Design is mandatory for every UI change

Before you create a screen, change a layout, or touch any style:

1. Read `../docs/design/DESIGN.md` in full. It is the design law of this project and overrides your own design preferences.
2. Use only the CSS variables in `src/styles/tokens.css`. Never write a raw color (hex, rgb, hsl),
   a font family, or a spacing value outside the `--space-*` scale.
3. Build screens only from components in `src/components/ui/`. If a pattern you need does not
   exist, add it there AND document it in the component table of `DESIGN.md` in the same change.
   Do not create one-off styled elements inside a screen.
4. Follow the screen templates in `DESIGN.md` section 4: in-session screens always start with
   `SessionHeader`; one primary button per screen; loading, empty, error and normal states.
5. UI text is Vietnamese. English practice sentences use `--font-display` and `lang="en"`.
6. Never edit `tokens.css` or `DESIGN.md` unless Hoàng explicitly asks for a design change.
   If you think the design system is wrong or missing something, stop and propose the change instead.

## Existing frontend conventions

- Routes and layouts live in `src/app/`; screen components in `src/components/`; shared logic and Supabase clients in `src/lib/`; database migrations in `supabase/migrations/`.
- Keep local secrets in `.env.local` and use `.env.example` as the shareable template. There is no dedicated frontend test directory, test script, or test framework.- TypeScript strict mode is enabled. Use two-space indentation, semicolons, and double quotes. Use the `@/*` alias for imports from `src/`, PascalCase for React components, camelCase for functions and variables, and lowercase route folders.
- Keep server-only credentials and API calls on the server. Preserve Row Level Security for existing Supabase data access; use the backend helper for new API calls.
- The project uses Next.js App Router. Before changing Next.js code, consult the installed documentation in `node_modules/next/dist/docs/` and heed deprecation notices.
- Keep this generated Next.js guidance with the frontend rules:

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

- Run `npm install`, `npm run dev`, `npm run build`, `npm run start`, and `npm run typecheck` from `frontend/` for the corresponding setup, development, production, and TypeScript checks.
- Configure Supabase and Anthropic variables from `.env.example` before running locally. There is no frontend test directory, test script, test framework, or coverage threshold; manually check affected routes and auth/data flows. If adding tests, prioritize `src/lib/srs.ts` and `src/lib/queue.ts`.

## Data access

- Talk to the backend only through `src/lib/backend/`. Never call `fetch` to the API from a component.

## Before you say a task is done

- Run `npm run lint`, `npm run lint:styles` and `npm run build`, and fix every error.
- For UI changes, check the screen at 390 × 844 in light and dark mode against the wireframe
  https://claude.ai/artifact/DBJxog1GcvzqXdEiZBUcaw and list any difference with the reason.
