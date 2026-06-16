import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Loads the repo's OWN load-bearing rules (AGENTS.md conventions + lessons.md)
 * and folds them into the reviewer prompt. This is the FS-2 "PR Risk Triage"
 * differentiator (context/foundation/opportunity-map.md): a generic reviewer
 * cannot know Unstuck's tripwires — RLS on every new table, no Next.js
 * directives in an Astro repo, `prerender = false` on API routes, the
 * SRS_CARD_COLUMNS string-literal gotcha, answer-key protection. We read the
 * source-of-truth files at runtime so the rules never drift from the repo.
 *
 * The repo root is two levels up from this file (tools/code-review-agent/common).
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..");

function safeRead(relPath: string): string | null {
  try {
    return readFileSync(resolve(repoRoot, relPath), "utf8");
  } catch {
    return null;
  }
}

export function loadRepoRules(): string {
  const agents = safeRead("AGENTS.md");
  const lessons = safeRead("context/foundation/lessons.md");
  const parts: string[] = [];
  if (agents) parts.push(`# AGENTS.md (konwencje repo — tripwire'y)\n\n${agents}`);
  if (lessons) parts.push(`# context/foundation/lessons.md (reguły wyniesione z review)\n\n${lessons}`);
  if (parts.length === 0) {
    return "(Nie znaleziono plików reguł repo — review działa wyłącznie na ogólnych kryteriach.)";
  }
  return parts.join("\n\n---\n\n");
}

/** Augments the base system prompt with the repo's specific tripwires. */
export function buildSystemPrompt(base: string): string {
  return `${base}

Poniżej znajdują się WIĄŻĄCE konwencje i tripwire'y TEGO repozytorium. Traktuj ich
naruszenie jako sygnał obniżający ocenę (zwłaszcza bezpieczeństwa i idiomatyczności),
a najpoważniejsze (np. nowa tabela bez RLS, dyrektywa "use client"/"use server"
w projekcie Astro, brak \`prerender = false\` w route API, zamiana SRS_CARD_COLUMNS
na \`.join()\`, osłabienie ochrony klucza odpowiedzi) jako kandydatów na werdykt "fail".
W podsumowaniu wskaż konkretną regułę, której dotyczy uwaga.

${loadRepoRules()}`;
}
