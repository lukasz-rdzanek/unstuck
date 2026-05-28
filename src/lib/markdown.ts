/**
 * Server-side Markdown renderer for lesson content.
 *
 * Returns trusted HTML suitable for Astro's `set:html` directive. Trust
 * comes from the operator-only RLS posture on `lessons` (INSERT/UPDATE
 * reserved to service_role). Chat messages (S-02) are plain text per
 * the `messages.body` check constraint and do not pass through this
 * function.
 *
 * If non-operator-authored markdown is ever introduced, a sanitizer
 * (e.g. `sanitize-html`) must be wired into this function — see the
 * security guidance in AGENTS.md.
 */

import { marked } from "marked";

export function renderMarkdown(content: string): string {
  return marked.parse(content, { gfm: true, breaks: false, async: false });
}
