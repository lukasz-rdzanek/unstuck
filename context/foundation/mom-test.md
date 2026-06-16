# Mom-Test validation — PR Risk Triage helper (M5L1, optional task)

> The lesson's optional `/10x-mom-test` step, run **manually** (the lesson-pack
> skill isn't installed in this repo). Per Rob Fitzpatrick's _The Mom Test_: don't
> ask people whether they'd use your idea or whether they like it — those measure
> politeness and aspiration. Ask about **facts**, **past behaviour**, and
> **current workarounds**. The job of this note is to _attack the assumptions_
> behind the FS-2 helper, not to sell it.
>
> Validates the chosen helper in [`opportunity-map.md`](./opportunity-map.md) ·
> 2026-06-15.

---

## 1. Assumption critique (where this idea could be wrong)

| #   | Hidden assumption behind FS-2                                               | Why it might be false                                                                                                                                               | How to cheaply test it                                                                                                                                                         |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | "PR review actually blocks/slows things."                                   | On a **solo** repo there's no waiting-on-a-reviewer queue — the human and the agent are the same loop. The friction may be _forgetting a tripwire_, not _blocking_. | Look at the last 10 PRs/merges: did any stall, or did any **ship with a tripwire missed**? If neither, the helper solves a non-problem.                                        |
| A2  | "A risk pre-filter saves the cost of `/code-review ultra`."                 | `/code-review ultra` is already cheap to _decide_ to run; maybe I just always run it. The pre-filter saves nothing if I never skip the deep review.                 | Count: over the last N PRs, how often did I _skip_ a deep review and later regret it? Zero → no value.                                                                         |
| A3  | "The repo's tripwires are missed often enough to matter."                   | The tripwires are already in `AGENTS.md`/`lessons.md` and agents read them. Maybe they're rarely violated.                                                          | Grep history for tripwire violations that reached `master` (e.g. a `CREATE TABLE` without RLS, a `"use client"`, a `SRS_CARD_COLUMNS` `.join()`). Frequency = the real signal. |
| A4  | "This generalises beyond me (a future contributor / team)."                 | Today there is no team. Building for a hypothetical team is the exact over-build the lesson warns against.                                                          | Don't validate this now. Re-open only when a 2nd contributor or 2nd repo actually exists.                                                                                      |
| A5  | "An automated/agentic comment is better than the existing CI + human gate." | CI already catches the typed gotchas (`astro check` catches the `SRS_CARD_COLUMNS` collapse). The helper may duplicate what CI already enforces.                    | List which tripwires CI **already** fails on vs which are silent. The helper should only cover the _silent_ ones, else it's redundant.                                         |

**Verdict from the critique:** the helper is only justified if **A3 or A5** holds —
i.e. there exist tripwires that (a) reach `master` and (b) CI does _not_ catch.
That is the single fact to confirm before building. (Good news: the documented
RLS / answer-key / `prerender=false` rules are exactly "silent at CI time, caught
only by review" — which is why they live in `lessons.md` as load-bearing rules.)

---

## 2. Questions for a 1:1 (if/when there's a teammate)

Phrased about the **past and the concrete**, never about the idea:

1. "Walk me through the **last** PR you reviewed here — what did you actually
   check, and in what order?" _(reveals the real, tacit criteria)_
2. "When was the last time something **broke in `master`** that a review should
   have caught? What was it?" _(finds the silent tripwire class — tests A3/A5)_
3. "What do you currently open **before** you trust a PR is safe to merge?"
   _(maps the real source set; tests the FS-5 manual-migration gap)_
4. "Have you ever **skipped** the deep `/code-review ultra` pass? What made you
   decide it wasn't worth it?" _(tests A2 — does a pre-filter save anything?)_
5. "Last time you merged something with a migration — what manual steps did you
   run, and did you ever forget one?" _(tests FS-5 directly, by past fact)_
6. "Show me where you look up this repo's rules. How often do you actually open
   `AGENTS.md`/`lessons.md` mid-review?" _(tests whether rules-at-hand is the gap)_

**Anti-questions (do NOT ask):** "Would you use a PR risk bot?" · "Do you think
automated review is a good idea?" · "Would a risk label be helpful?" — all
measure politeness, not behaviour.

---

## 3. Short validation survey (async, behaviour-anchored)

For a future team; 6 questions, all about the last 30 days, no opinion items.

1. In the last 30 days, how many times did a change reach `master` with a
   convention/security rule missed? **(0 / 1–2 / 3–5 / 6+)**
2. Of those, how many were caught by **CI** vs only by a **human/later**?
   **(free number split)**
3. When reviewing, where do you look up repo-specific rules?
   **(memory / AGENTS.md / lessons.md / I don't / other)**
4. In the last 30 days, how many migration-bearing merges happened, and on how
   many was a manual pre-merge step forgotten? **(two numbers)**
5. How many PRs did you merge **without** running the deep AI review? **(number)**
6. Paste the URL of the **most recent** PR you were unsure was safe to merge.
   **(link — gives a real artifact to replay the helper against)**

**Kill / build rule:** build only if Q1 ≥ "1–2" **and** Q2 shows a non-trivial
share caught _only by humans/later_ (i.e. CI didn't). Otherwise the friction is
either non-existent or already covered — **don't build**.

---

## 4. Solo-project substitute for "talk to the team first"

Unstuck has no team, so the lesson's "cheapest step — consult your manager/team"
becomes a **replay test**:

1. Take the last 5–8 real PRs/merges from `git log` + `context/archive/`.
2. Run the FS-2 helper's logic by hand against each diff.
3. Check: would it have surfaced a **real** issue that was otherwise caught late
   (or missed)? Concretely — the `ai-answer-matching` impl-review F1 (a SECURITY
   DEFINER fn without `has_course_access`, accepted-as-risk) and the
   `SRS_CARD_COLUMNS` literal gotcha are exactly the kind of finding to look for.
4. If yes on ≥1 real case → build it in M5L2/L3. If no → the rules-in-`lessons.md`
   - CI already suffice; **don't build**, and record that decision.

This is the Mom-Test move applied to a solo project: judge the idea on **past
facts from the repo's own history**, not on how good the idea sounds.
