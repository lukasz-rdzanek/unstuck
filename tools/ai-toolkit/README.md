# @lukasz-rdzanek/unstuck-ai-toolkit (M5L4)

Unstuck's team AI artifacts — distributed the way we distribute code: a **versioned
package on GitHub Packages** (the registry we already have). This is the M5L4
"Shared AI Registry", **Model 1 (GitHub Packages)** — see
[`context/foundation/ai-distribution.md`](../../context/foundation/ai-distribution.md)
for why this model fits Unstuck.

## What's inside

```
tools/ai-toolkit/
├── package.json                 # name, publishConfig → GitHub Packages
├── install.js                   # postinstall: copy skills + inject rules + write manifest
├── uninstall.js                 # manifest-driven clean removal
├── skills/code-review/SKILL.md  # the portable FS-2 code-review skill
└── rules/CLAUDE.md              # team conventions (injected between sentinel markers)
```

## Consume it (in another repo)

1. Commit a one-line `.npmrc` (no secret) — maps our scope to GitHub Packages:
   ```
   @lukasz-rdzanek:registry=https://npm.pkg.github.com
   ```
   (see `consumer.npmrc.example`)
2. Authenticate once (private package): `npm login --scope=@lukasz-rdzanek --registry=https://npm.pkg.github.com`
   (in CI, set `NODE_AUTH_TOKEN`/`GH_PKG_TOKEN` from a token with `read:packages`).
3. Install: `npm i @lukasz-rdzanek/unstuck-ai-toolkit`
   → `postinstall` copies the `code-review` skill into `.claude/skills/`, injects the
   team rules into `CLAUDE.md` between `<!-- BEGIN/END @lukasz-rdzanek/unstuck-ai-toolkit -->`,
   and writes `.claude/.unstuck-ai-toolkit-manifest.json`.
4. Update: bump the version, `npm i` again — the rules block is replaced in place;
   your own edits outside the markers survive.
5. Remove: `node node_modules/@lukasz-rdzanek/unstuck-ai-toolkit/uninstall.js` — removes
   exactly what the manifest lists.

## Publish (source of truth)

CI publishes on merge to `master` when `tools/ai-toolkit/**` changes
([`.github/workflows/publish-ai-toolkit.yml`](../../.github/workflows/publish-ai-toolkit.yml)),
using the ephemeral `GITHUB_TOKEN` (`packages: write`) — no long-lived secret. Bump
`version` in `package.json` (and `PACKAGE_VERSION` in `install.js`) per change;
the workflow skips publishing if that version already exists (avoids the 409).

## Cross-model invariants (per the lesson)

- **Sentinel markers** for rules → idempotent in-place updates, user edits preserved.
- **Manifest** (`.claude/.unstuck-ai-toolkit-manifest.json`) → reliable uninstall,
  independent of `node_modules`.
- **`SKILL.md` is portable** — the same file installs to `.claude/skills`,
  `.cursor/skills`, or `.agents/skills`; only the target dir differs.

> A real multi-team setup would host this as its **own** source-of-truth repo. Here it
> lives in-repo (solo project) and publishes from the unstuck repo.
