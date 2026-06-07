/**
 * Vitest stub for the `cloudflare:workers` virtual module (testing-baseline).
 *
 * Modules like `src/lib/embeddings.ts` import `{ env }` from `cloudflare:workers`
 * at top level. That module only exists in the workerd runtime, so under node /
 * Vitest the import would fail. `vitest.config.ts` aliases `cloudflare:workers`
 * here so pure helpers (e.g. `toVectorLiteral`) can be unit-tested. Tests that
 * actually exercise a binding should mock `env` explicitly instead.
 */
export const env: Record<string, unknown> = {};
