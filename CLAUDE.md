# OurPawmily Autonomous Engineering Rules

## Purpose and authority

Work in the DietApp repository on OurPawmily. These instructions govern HOW to work; they do not authorize every documented feature.

- `docs/OURPAWMILY_2_0.md`: approved product direction and architecture.
- `docs/BUILD_PROGRESS.md`: evidence-based implementation state and remaining work.
- `docs/FUTURE_FEATURES.md`: DESIGN ONLY / NOT AUTHORIZED ideas.
- The user's current development-session instructions define which tasks/phases are authorized now. Respect explicit stop/review gates. Do not treat example authorization prompts from earlier conversations as live authorization.

For this initial documentation package, no implementation, commit, push or deployment is authorized merely by placing these files in the repository. Show the documentation diff before committing it, as requested in the source conversation.

## Autonomous work loop

During an authorized development session, inspect → implement → test → review → checkpoint → update progress → continue to the next authorized task. Do not stop merely because one task or commit is finished. Do not invent features to remain busy.

1. Inspect existing code, dependencies, working changes and recent history before editing.
2. Implement the smallest correct change within the authorized scope.
3. Add or update meaningful tests for changed behavior, authorization, failures and backward compatibility.
4. Run relevant tests, fix legitimate failures, and check regressions. Never weaken valid tests to obtain a pass.
5. Verify actual flows where tools permit; inspect mobile layout, tap targets, keyboard/accessibility, loading, empty and error states.
6. Review privacy boundaries and measure relevant performance using comparable conditions.
7. Review the diff for accidental changes and unnecessary complexity.
8. Make coherent Git checkpoints when authorized; maintain BUILD_PROGRESS with evidence, then continue.

Stop when the authorized backlog is complete, a required product/architecture decision is unresolved, a destructive migration needs approval, deployment requires approval, a security issue makes continuation unsafe, or work is genuinely blocked. Continue independent, low-risk verification/documentation within scope while a decision is pending; do not cross an explicit phase stop gate.

## Persistent state and resuming

Before continuing after compaction or in a new session: read these documents; inspect Git status and recent commits; verify the claimed implementation against code; run the core relevant suite; resume the first incomplete authorized item. Never assume a progress-file claim proves completion.

Maintain current phase/task, completed work, remaining authorized work, known issues, decisions needed, tests, security findings, performance measurements and last verified safe commit. Record commands, dates, commit IDs and measurement conditions. Mark unknown or unrun checks explicitly. Distinguish reported history from repository-verified evidence.

## Git and deployment

Use small, coherent commits. Preserve unrelated work. Do not force push, delete branches, rewrite published history, delete user data or perform irreversible migrations without explicit approval.

Do not deploy without explicit approval. Verify whether a merge or push triggers deployment; the conversation reported that merging to main puts changes on the live site. A deployment-triggering merge needs deployment authorization too.

## Frozen security boundaries

Do not change family encryption keys, key generation/distribution/delivery/recovery, Google authentication, invite-token security or E2EE cryptography without separate explicit approval. Permission records and invitation area selection are approved product scope, but implementation still requires session authorization.

Enforce permissions on every relevant server route, including resource/file access. UI hiding is insufficient. Test cross-family and in-family denials, owner access, area exclusions, and Fitness-only versus Diet-only sharing.

Ask for each changed feature: what is plaintext/encrypted; who can obtain ciphertext; who holds keys; what reaches AI or third parties; and what decrypted data persists locally? Family keys must never reach AI/media providers. Do not claim server permission checks provide cryptographic separation among holders of the same family key.

## Product and performance gates

Keep the five-tab architecture and one Family membership/permission model. Prefer fewer concepts, clear defaults, progressive disclosure and one obvious action. Keep server URLs, storage identifiers, household codes and developer setup instructions out of ordinary household UX. Do not present unsupported device integrations as connected.

Preserve the reported Phase A baseline, first verifying it in the repository. Track startup requests/duplicates, useful content, first/largest paint, layout shift, long tasks, tab-switch requests and startup JavaScript. Initialize secondary features lazily. Do not accept material regressions simply because a feature works.

Preserve historical feed data and migration sources. Remove only code proven unreachable within an approved retirement; preserve shared photo, encryption, export and Thread infrastructure. Never implement FUTURE_FEATURES merely because it contains detailed designs.

## Keeping the docs in step (every change, automatically)

Docs are part of the change, not a follow-up. In the same commit (or the commit right after, before the session ends), update whichever of these the change affects:

| File | Update when |
| --- | --- |
| `README.md` | anything a household member can see or do changes (screens, buttons, where things are, privacy, setup) |
| `server/helpGuide.js` | the same — it's what the ❓ help chat knows; change only its text, keep entries, ids and exports |
| `server/helpAgent.js` | the help chat's one-line description of the app or its refusal message no longer matches |
| `family/tour.js` | a screen or area changes; give `WHATS_NEW` a new `id` when existing members should hear about it |
| `family/privacy.html` | what's stored, encrypted, shared, sent to AI or third parties, or deleted changes (keep the accepted version number; update "Last updated") |
| `docs/ARCHITECTURE.md` | routes, storage keys, providers, security items, CI or performance tooling change |
| `server/README.md` | secrets, settings (`[vars]`), scheduled jobs or deploy steps change |
| `docs/BUILD_PROGRESS.md` | at every checkpoint: what's done with evidence, tests, measurements, open gaps, last safe commit |
| `docs/OURPAWMILY_2_0.md` | only when the user changes the approved direction |

The `/update-readme` command (`.claude/commands/update-readme.md`) does a full pass over README, help guide and tour; run it at the end of each phase. Before a phase's review report, check all of the above against the code.

Doc rules: no secrets, keys, tokens, household codes, invite or device links, account IDs, model identifiers, or real people's or family names in README, policy pages, `family/*` or help text — use Sam and Pat in examples. Describe only what's in the code; mark hidden, retired or planned things as such. `npm test` must pass (`tests/help.test.js`, `tests/tour.test.js`, `tests/dependencies.test.js` read these files).

## Repository facts (verified 2026-10-28)

- Pushing or merging to `main` deploys the front end (GitHub Pages). Work on a branch (e.g. `v2/phase-…`); merge to `main` only with deployment approval. The Worker deploys only when the user runs `pawdeploy` (deploy the app first, then the Worker, unless a change needs the reverse).
- Before each commit that changes app files: `node scripts/bump-version.mjs` (trackers' file versions and the offline cache) and bump `app.js?v=` / `style.css?v=` in `family/index.html` by hand; then `npm test`.
- Commit messages end with the session's Co-Authored-By and Claude-Session lines; no model identifiers in commits, PRs or code.
- The Check (`.github/workflows/check.yml`) runs tests, the link check and the performance budget on every push; green on the latest commit means it's safe to `pawdeploy`.
- Performance budget: `scripts/perf/` (`pages.mjs` serves the repo like Pages on :8098; `wrangler dev` on :8787 with `--var DEMO:1 --var APP_ORIGIN:http://localhost:8098/DietApp/`; `seed.mjs` makes a synthetic family; `budget.mjs` measures cold and warm start against `budget.json`). Compare before/after on the same machine (serve the old commit from a worktree on :8098 in turn).
- Remaining household-code uses are pinned by `tests/dependencies.test.js`; update that list only when a dependency is really removed.

## End-of-session report

Report completed behavior, exact commits/files, actual test results and unrun checks, security fixes/concerns, measured before/after performance, UX verification, remaining authorized tasks and decisions requiring the user. If blocked, leave a reproducible next step in BUILD_PROGRESS.
