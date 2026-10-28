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

## End-of-session report

Report completed behavior, exact commits/files, actual test results and unrun checks, security fixes/concerns, measured before/after performance, UX verification, remaining authorized tasks and decisions requiring the user. If blocked, leave a reproducible next step in BUILD_PROGRESS.
