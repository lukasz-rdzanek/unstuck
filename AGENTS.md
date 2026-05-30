# Repository Guidelines

Guidance for AI Agents working in this repository. Project-specific conventions, tripwires, and pointers to canonical files. Skim once per session.

## Key conventions (read first)

- **Always enable RLS on new Supabase tables.** Granular per-operation, per-role policies. Load-bearing security rule — no exceptions.
- **No Next.js directives.** Do not add `"use client"`, `"use server"`, or similar — this is **Astro**, not Next. Many React-centric agents default to Next.js patterns; this project does not use them.
- **API routes must export `const prerender = false`.** Use uppercase `GET`, `POST`, `PUT`, `DELETE` exports. Validate request input with zod.
- **Astro vs React components**: use a React component when it holds state, attaches event listeners, or re-renders in response to user input (form state, live chat, drag-and-drop, real-time updates). Use an Astro component for layout, navigation, content blocks, and any markup that renders once and never updates client-side. The bright line is "is there state or an event handler?" — checkable in a diff.
- **Tailwind class merging**: use `cn()` from `@/lib/utils` (clsx + tailwind-merge). Never concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/` (using the "new-york" style variant). Install new ones with `npx shadcn@latest add [name]`.
- **React hooks**: extract to `src/components/hooks/`.
- **Services and helpers**: `src/lib/` (with `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs): `src/types.ts`.
- **Supabase migrations**: live in `supabase/migrations/`, named `YYYYMMDDHHmmss_short_description.sql`.

## Architecture

**Astro 6 SSR app** with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui. Deployed to Cloudflare Workers. See `@README.md` for the full tech stack and version pins.

### Rendering mode

Full server-side rendering (`output: "server"` in `astro.config.mjs`). All pages are server-rendered by default.

### Auth flow

- `src/lib/supabase.ts` — Supabase SSR client (`@supabase/ssr`) using cookie-based sessions. Reads `SUPABASE_URL` / `SUPABASE_KEY` from `astro:env/client` (the vars are declared with `context: "client", access: "public"` in `astro.config.mjs` `env.schema` so they are accessible from BOTH `astro:env/client` and `astro:env/server`).
- `src/lib/supabase-browser.ts` — Supabase **browser** client (`@supabase/ssr`'s `createBrowserClient`) used by React islands for Realtime subscriptions. Bridges the same cookie session as the SSR client, so the WebSocket handshake carries the auth JWT and RLS-gated postgres_changes deliveries reach the subscriber.
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`. Extend this array to gate new routes.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`

#### Client env exposure

`SUPABASE_URL` and `SUPABASE_KEY` (the anon key) are intentionally exposed to the **client bundle** via `astro:env/client` — necessary for the browser-side Supabase client that powers Realtime subscriptions in React islands (e.g. the lesson-scoped chat panel). The anon key is gated by Row Level Security; exposing it to the browser is the documented Supabase pattern. The only sensitive credential is the `service_role` key, which is **never** in the app environment — it lives in Supabase Studio for operator seeding (see `docs/operator/seeding.md`).

## Project navigation

- **Path alias** `@/*` → `./src/*`: configured in `@tsconfig.json`.
- **Scripts** (`npm run dev/build/preview/lint/lint:fix/format`): see `@package.json`.
- **Pre-commit hooks**: husky + lint-staged auto-run `eslint --fix` and `prettier --write` on staged files. See `@.husky/` and `@package.json` (`lint-staged` block).
- **Setup, env vars, local Supabase (Docker), Cloudflare local dev, deploy**: see `@README.md`.
- **CI** (lint + build on every push and PR to `master`): see `@.github/workflows/ci.yml`. Requires `SUPABASE_URL` and `SUPABASE_KEY` repository secrets.
