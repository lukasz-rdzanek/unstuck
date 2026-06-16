# Async & Remote Agents — delegation exercise (M5L5)

> M5L5 is an _Innovate_ lesson (not a 10xChampion path — that's M5L2/L3 or M5L4, both
> already done). This is the practical exercise: prepare one bounded async/remote task,
> run what the environment allows, dry-run the rest, and review. The lesson's model:
> **control doesn't disappear, it moves** — configure before, monitor selectively,
> review after.

## Task 1 — a task with clear boundaries

**Delegated task:** _audit the M5 additions for leaked secrets, placeholder leftovers,
and sensitive data; produce a findings report._ Read-only, single concern, no product
decisions, no production access, no secrets needed — a textbook safe delegation (and it
backs the "no sensitive data" guarantee of [`badge-evidence.md`](./badge-evidence.md)).

## Task 2 — control moment (which of the 3 modes)

| Mode                                                                             | Fit here                           | Status in this environment                                                                           |
| -------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Tryb 1 — remote control of a local agent** (Remote Control / SSH+tmux / Happy) | good for mobile babysitting        | **blocked by access**: Remote Control needs a Pro/Max plan + device pairing; no phone to pair here   |
| **Tryb 2 — cloud sandbox** (Claude Code Web / Codex Cloud)                       | good for "run it, come back later" | **blocked by access**: those products aren't reachable from this CLI sandbox                         |
| **Tryb 3 — loops / routines**                                                    | good for recurring checks          | available as a pattern (`/loop`), but a scheduled routine needs standing infra                       |
| **Headless `claude -p`** (executable form of "delegate & leave")                 | the closest runnable analogue      | `claude` binary not on PATH in this sandbox → **executed locally as a read-only delegation instead** |

**Chosen:** the executable "configure before, review after" model — the task was run as a
**read-only, tool-restricted delegation** (boundary = the granted tools), then reviewed.
The remote modes are dry-run below because they need access this environment lacks.

## Task 3 — boundaries set BEFORE start (the contract)

```text
/goal Done when: a findings report lists any leaked secrets / API keys / placeholder
leftovers across the M5 additions, with file:line for each hit (or "none").
Scope: read-only over tools/**, .github/**, context/**, .claude/** (+ a repo-wide
secret-pattern scan). Do NOT modify any file. Do NOT open network connections.
Setup: none (uses git + grep already present).
Network: none required.
MCP: none.
Secrets: NONE granted — the task must not need any; flag if it asks for one.
Stop: after the report is written (≤ a few minutes), or on the first sign of scope creep.
Review (a clean run is NOT success): the report must actually enumerate the patterns it
checked, cite file:line for hits, and explicitly state "no real secrets" only if true.
```

The boundary here is enforced by **granting only read tools** (`Read`/`Glob`/`Grep` —
equivalently `git grep`): the agent _cannot_ write or reach the network, so "walking away"
is safe regardless of what it decides.

## Task 4 — execution (what actually ran)

Run as a read-only audit (`git grep` over tracked files). Patterns checked:
`sk-ant-…`, `AKIA…` (AWS), `-----BEGIN … PRIVATE KEY-----`, `_authToken=<value>`,
`service_role`, the rotated Anthropic key fragment, and `@twoj-zespol` placeholders.

**Findings (clean):**

- No Anthropic/AWS keys, no private keys, no real auth tokens committed. The only
  `_authToken` references are `${GH_PKG_TOKEN}` **placeholders** (injected at install
  time, never committed) — by design (see `tools/ai-toolkit/`).
- The rotated Anthropic API key (shared once in chat) is **absent** from the repo — it
  only ever lived in the GitHub Actions secret store, never in code.
- No `@twoj-zespol` placeholder leftovers — all replaced with the real scope `@lukasz-rdzanek`.
- Every `service_role` hit is **documentation prose** about RLS design (e.g. migration
  comments), not a credential.

**Operational dry-run for the remote modes** (blocked by access — per the lesson's fallback):

| Step             | Tryb 1 Remote Control                                                    | Tryb 2 cloud sandbox                                                                     | Tryb 3 routine/loop                                              |
| ---------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Configure before | `claude remote-control` (or `/remote-control`); HTTPS-out only, no ports | repo `.mcp.json`, setup script (`npm ci`), network allowlist, scoped short-lived secrets | trigger (cron/event), stop condition, cost cap, success criteria |
| Run              | **blocked-by-access** (needs Pro/Max + paired device)                    | **blocked-by-access** (needs Claude Code Web / Codex Cloud)                              | **to-check** (`/loop` exists; a real schedule needs infra)       |
| Monitor          | phone = control panel (setup OK? scope creep? stuck?)                    | check status; stop if stuck on setup/network/secret                                      | never judge success by green status alone                        |
| Review           | diff + logs at the desk                                                  | diff + logs + tests vs the pre-set criteria                                              | did the run deliver real value, at acceptable cost?              |

**Executable code-plan path (ready to run when there's an on-phase planned change):**

```bash
claude -p "/goal Use the 10x-goal-implement skill to implement all phases of \
context/changes/<change-id>/plan.md. Done when every #### Automated Progress row is \
checked, each phase has its own Conventional-Commits commit, and pending #### Manual \
rows are listed. Do not weaken tests or touch files outside the plan. Stop after 20 turns." \
  --allowedTools "Read,Glob,Grep,Write,Edit,Bash,Task,TaskCreate,TaskUpdate,TaskList,TaskGet" \
  --permission-mode acceptEdits
```

Not run here: the project is in the Testing stage (no new feature work queued), so there's
no on-phase code plan to delegate — fabricating one to "show the gates" would be theatre.
The `/10x-goal-implement` skill is installed and the contract above is ready for the next
real planned change.

## Task 5 — monitoring (only when it makes sense)

For the read-only audit, no live monitoring was needed (it can't escape its tool grant and
finishes in seconds). For the remote modes, the phone/console is a **control panel**, not a
reading device: did setup pass, did a network/secret block stall it, is the agent widening
scope — stop or refine, don't watch every step.

## Task 6 — review + the one decision

**Review vs the contract:** report enumerates the patterns, cites file:line, and states
"no real secrets" truthfully → success (a green run alone would not have been).

**One decision — what would make each mode safe for the team:**

- **Tryb 1:** prefer first-party Remote Control over a third-party relay (Happy) so no
  extra party enters the control path; if Happy, vet its encryption/pairing first.
- **Tryb 2:** before delegating, commit the tool context to the repo (`.mcp.json`), keep
  the network allowlist tight, and grant only short-lived, write-limited secrets — never a
  production credential.
- **Tryb 3:** never trust a green run; every routine needs an explicit stop condition,
  cost cap, and a human review of whether it delivered real value.

The through-line: **the less you watch in real time, the more the environment must enforce
scope** — isolation is the precondition for autonomy, not a brake on it.
