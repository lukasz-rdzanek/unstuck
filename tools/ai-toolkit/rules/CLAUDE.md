## Unstuck team AI rules

Load-bearing conventions every agent in this org must follow. Injected into a
consumer's `CLAUDE.md` between sentinel markers; edit them in the toolkit source of
truth, not in each repo.

- **Always enable RLS on new Supabase tables.** Granular per-operation, per-role
  policies. No exceptions — this is the load-bearing security rule.
- **No Next.js directives.** Never add `"use client"` / `"use server"` — this is
  **Astro**, not Next.
- **API routes must export `const prerender = false`** and validate input with **zod**.
- **Derive user identity from the session, never from request input** (no IDOR).
- **Tailwind class merging via `cn()`** from `@/lib/utils` — never concatenate class
  strings by hand.
- **Protect the answer key**: enable-not-force RLS + SECURITY DEFINER functions; never
  expose correct-answer columns to the client.
- **Keep `SRS_CARD_COLUMNS` a string literal** (not `.join()`) — `.join()` collapses
  Supabase `.select()` row-type inference (caught by `astro check`, not `astro build`).
- **Review every PR against these tripwires** (see the `code-review` skill).
