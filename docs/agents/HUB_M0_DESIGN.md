# 🧭 Agent Integration Hub: M0 design review (DESIGN ONLY, not authorized to build)

Status: **M0 package, stopped for independent review.** Nothing is implemented:
- no endpoints, migrations, secrets or MCP servers;
- no Claude, ChatGPT or Muse configuration;
- no merge, no deploy.

This extends, and does **not** replace, `docs/muse/M0_DESIGN.md`: every Muse safeguard there stays
authoritative.

**Names:** Sam is the product owner (the human authority, and owner of the Muse integration); Pat is
an allowed household requester. That follows the repository's naming rule.

**Mockups:** `docs/mockups/agents/screens.html` (`#agents`, `#share`, `#return`).

---

## 0. Findings that shape the design (verified 2026-10-31)

| Platform | What's officially available | Implication |
| --- | --- | --- |
| **Claude (claude.ai, Desktop)** | **Custom connectors = remote MCP servers** on Pro/Max/Team/Enterprise (Settings › Connectors › Add custom connector), with authless or OAuth auth. Claude Code also takes MCP servers. ([Anthropic help](https://support.claude.com/en/articles/11503834-building-custom-connectors-via-remote-mcp-servers)) | Claude can *pull* a review result from the Hub with a tool call when Sam asks it to. |
| **ChatGPT** | **Developer Mode** adds custom remote MCP connectors (HTTPS only), with confirmation prompts before write actions. **Which plans may use write actions is reported inconsistently:** some sources say Plus/Pro are read/fetch-only, others say write actions are available. ([Boomi](https://help.boomi.com/docs/Atomsphere/Platform/Connect_chatgpt_setup), [InfoQ](https://www.infoq.com/news/2025/10/chat-gpt-mcp), [Obot](https://obot.ai/?p=3333)) | ChatGPT can *read* a review package via MCP. Whether it can *submit* a review by tool on Sam's plan must be checked. The fallback is that Sam pastes the review into the Hub's form. |
| **Meta Muse** | Custom connectors via **OpenAPI or MCP URL** set up in chat; scheduled tasks; no inbound API (see Muse M0 §3). | Muse polls the Hub over REST. |
| **Injecting into an existing personal chat (any provider)** | **Not supported anywhere.** An API model session is not your ChatGPT/Claude conversation. | Every handoff is **pull-based and human-started**: the Hub holds the package, and Sam tells the agent "check the review inbox". This also satisfies "human-mediated, no loops" by construction. |
| **Repo** | No MCP code exists (only a mention in `docs/FUTURE_FEATURES.md`). The Worker routes everything through `familyApi`; KV, R2, and a SQLite Durable Object (`ChatHub`) for atomic per-family state. | The Hub is a small module plus a Durable Object, not a framework. |

Primary vendor pages were partly unreachable from this session. The plan-tier question for ChatGPT
write actions and Muse's polling details are the main open checks (§19).

## 1. High-level architecture

**Two trust domains on one shared core.**

- **Household domain** (`AgentHub` Durable Object, one per family): Muse and future household
  executors. It touches household tasks and **never** source code.
- **Engineering domain** (`EngineeringHub` Durable Object, one per owner account, **not per family**):
  Claude and the ChatGPT review bridge. It holds review packages made from repo material and
  **never** family data.

Both use the same small core library (`js/agentCore.js` + `server/agentHub.js`):
- integration registry and capability check;
- task envelope, state machine helpers and validators;
- approval gates, credential handling and audit.

The domains are deliberately separate stores, so a leaked review-connector credential cannot reach
household tasks, and vice versa.

## 2. Component diagram

```
                          SAM (human authority)
                 approves shares · returns · spend · scopes
                                   │  (Pawmily session, Me › Connected agents)
                                   ▼
┌──────────────────────── Worker (connector) ─────────────────────────────┐
│  member routes /v2/agents/*         integration routes /v2/agents/int/* │
│        │                                       │            MCP adapter │
│        ▼                                       ▼               /v2/mcp  │
│  ┌──────────── Agent core (shared code, no state) ───────────────────┐  │
│  │ Registry · Capabilities · TaskService · Approvals · Router · Audit│  │
│  └──────┬───────────────────────────────────────────────┬───────────┘  │
│         ▼                                               ▼              │
│  AgentHub DO (per family)                      EngineeringHub DO (per owner)
│  • integrations (Muse…)                        • integrations (Claude, ChatGPT)
│  • tasks + ExternalActionExecution             • tasks + ReviewPackage/ReviewResult
│  • audit                                       • audit
└─────────┬──────────────────────────────────────────────┬───────────────┘
          │ REST/OpenAPI (Muse polls)                    │ MCP (Claude/ChatGPT pull when Sam asks)
          ▼                                              ▼
        Muse                                   Claude · ChatGPT
```

## 3. Data flow

**Engineering review: human-mediated, pull-based.**

```
Claude (this repo session) ──submit_for_review(package)──▶ EngineeringHub: awaiting_share_approval
Sam opens Me › Connected agents ──[Review and share]──▶ shared (visible to the ChatGPT integration only)
Sam in ChatGPT: "check the Pawmily review inbox" ──get_review_package──▶ ChatGPT reads it
ChatGPT ──submit_review(result)──▶ awaiting_return_approval
   (fallback if ChatGPT can't write: Sam pastes the review into the Hub's form)
Sam ──[Send to Claude]──▶ returned
Sam in Claude: "pick up the review" ──get_review_result──▶ Claude reads it → closed
```

**Household action** (unchanged from the Muse M0 design): Talk → minimum task → policy → `AgentHub`
→ Muse claims → executes → result, with approvals and reconciliation per Muse M0 §11–13.

Nothing moves between domains. Family data never enters a review package; source code never enters
a household task.

## 4. AgentIntegration model

```jsonc
{
  "id": "int_…", "domain": "household" | "engineering",
  "scopeOwner": { "familyId": "fam…" } | { "accountId": "g…" },     // where it lives
  "provider": "meta" | "anthropic" | "openai" | "direct_api" | "manual",
  "integrationType": "external_action_executor" | "engineering_builder" | "engineering_reviewer",
  "role": "external_action_executor" | "chief_engineer" | "deputy_engineer",   // product role, not provider
  "displayName": "Sam's Muse",
  "ownerMemberId": "m_sam",
  "allowedRequesterMemberIds": ["m_sam", "m_pat"],                 // household only
  "capabilities": ["external_actions.claim", "external_actions.update", "external_actions.complete", "external_actions.request_approval"],
  "transport": "rest" | "mcp" | "manual",
  "credential": { "kind": "bearer" | "oauth", "hash": "…", "hint": "…x9Qa", "expiresAt": "…" },
  "enabled": true, "health": { "lastContactAt": null, "lastSuccessAt": null },
  "createdAt": "…", "updatedAt": "…", "expiresAt": null, "revokedAt": null, "version": 1
}
```

The role is separate from the provider. Swapping who plays `deputy_engineer` is just a different
integration with the same role.

## 5. AgentTask model (the generic envelope)

```jsonc
{
  "id": "task_…", "schemaVersion": 1, "domain": "household" | "engineering",
  "taskType": "external_action" | "architecture_review" | "pr_review" | "implementation_request" | "research",
  "sourceIntegrationId": "int_claude" | null,       // null = a person (Talk) created it
  "targetIntegrationId": "int_chatgpt" | "int_muse",
  "requestedByMemberId": "m_sam", "affectedMemberIds": ["m_sam"],
  "payloadType": "ReviewPackage@1" | "ExternalAction@1",   // typed, versioned, validated
  "payloadRef": "exec_…" | "pkg_…",                 // composition: the typed record lives beside the task
  "contextRefs": [{ "kind": "pr", "ref": "cryptonomicon46/DietApp#24" }],
  "status": "…", "priority": 0, "approvalPolicy": "…",
  "createdAt": "…", "updatedAt": "…", "expiresAt": "…", "version": 1
}
```

**Generic lifecycle** (review and other non-financial work):

```
draft → awaiting_share_approval → available → claimed → in_progress → awaiting_review
      → awaiting_return_approval → completed
(any non-terminal) → cancelled | expired ; claimed/in_progress → failed
```

Terminal states are final. Every transition is versioned, and illegal ones return 409.

## 6. Review-task model

```jsonc
// ReviewPackage@1 — bounded; assembled by Claude, shown to Sam before sharing
{ "title": "Muse Action Bridge — M0", "purpose": "architecture review",
  "summary": "…", "designDocument": "<markdown, ≤ 200 KB>",
  "changedFiles": ["docs/muse/M0_DESIGN.md", "…"], "relevantDiffs": "<unified diff, ≤ 200 KB>",
  "assumptions": ["…"], "knownRisks": ["…"], "questionsForReviewer": ["…"],
  "privateDataClassification": "none" }        // must be "none" to share (validator + secret scan)
// ReviewResult@1 — structured enough for Claude to act on
{ "overallAssessment": "approve_with_changes", "blockers": [{ "id": "B1", "text": "…", "where": "…" }],
  "highPriorityIssues": [], "recommendations": [], "optionalImprovements": [],
  "acceptedAssumptions": [], "disputedAssumptions": [], "approvalRecommendation": "approve | changes | reject",
  "prose": "<markdown>" }
```

**Package guards, applied before `awaiting_share_approval`:**
- a size cap;
- `privateDataClassification` must be `none`;
- a secret and PII scan, reusing the sensitive-text patterns from the voice PR and checking for keys,
  tokens, emails and household names;
- no whole-repo dumps (`changedFiles` ≤ 50).

**Approval states:** `created → awaiting_share_approval → shared → reviewed →
awaiting_return_approval → returned → closed`. These map onto the generic statuses above.

## 7. Muse-specialised task relationship: Option B, composition

- An `AgentTask` with `taskType: external_action` **links to** an `ExternalActionExecution` record.
  That record is the Muse M0 `AgentRequest`, unchanged in substance: leases, execution phase,
  commit-intent, `outcome_unknown`, `reconciliation_required`, proposal hash, idempotency, spending
  constraints.
- The generic task status only **mirrors** the execution for listing and UI. The execution record's
  state machine is authoritative, and the generic router can never move it.

**Why not Option A** (Muse fields folded into the envelope)? It would either weaken the irreversible-
action rules to fit review tasks, or burden every task with lease and commit fields.

## 8. Capability and scoping model

| Integration | Capabilities (exhaustive) | Can never |
| --- | --- | --- |
| Muse | `external_actions.claim`, `.heartbeat`, `.update`, `.request_approval`, `.commit_intent`, `.complete`, `.fail`, `.reconcile` | read any family record, read source, see other integrations |
| ChatGPT (reviewer) | `review.read_shared_package`, `review.submit_result` | read unshared packages, read results, create tasks, touch household |
| Claude (builder) | `review.submit_package`, `review.read_returned_result`, `review.list_own` | read household, approve its own share, read packages it didn't author |
| Any | none implied by role or provider | escalate scopes, register integrations, approve anything, read credentials |

- Capabilities are checked in **one** place (`can(integration, capability, task)`), server-side, on
  every call.
- Only Sam, via a member session as the owner, can create integrations, change capabilities or
  approve.
- Integration credentials never reach a browser.

## 9. Approval model

**One `Approval` record type:**

```jsonc
{
  "taskId": "…",
  "gate": "share | return | spend | commit | requester",
  "subjectHash": "…",        // the exact package, result or proposal
  "approvedBy": "m_sam",
  "decision": "approve | reject",
  "at": "…"
}
```

- **Bound to `subjectHash`:** any change to the package, result or proposal voids the approval.
- **Engineering gates:**
  - `share`: Sam approves before ChatGPT can read;
  - `return`: Sam approves before Claude can read.
- **Household gates** (Muse M0 §13, unchanged):
  - `requester` and `spend`, with owner spending separate from requester confirmation;
  - commit gating via commit-intent.
- **Loop prevention:** a review task can't create another task. Claude has to make a new submission,
  which needs a fresh share approval. Optionally, a per-day cap on shares.

## 10. Credential model

**Per integration, never shared:**
- **Bearer** (Muse, and MCP connectors that use API keys): 32 random bytes, shown once, stored as an
  HMAC with a Worker pepper; scoped, expiring (90 days default), rotatable with a 10-minute overlap,
  revocable, and rate-limited per integration.
- **OAuth 2.1** (preferred where the client supports it): Claude custom connectors support OAuth,
  including Dynamic Client Registration.
  - Pawmily would act as its own small authorization server **only for the engineering domain**.
  - Consent is shown to Sam and scoped to that integration's capabilities.
  - There is a reported Claude OAuth edge case to test (§19).
- **Never logged:** Authorization headers, tokens, client secrets or peppers.
- **The audit log** records `credential_issued`, `credential_rotated` and `integration_revoked` with
  hints only.

## 11. MCP adapter design

- **Shape:** one remote MCP endpoint per domain, using the Streamable HTTP transport:
  - `/v2/mcp/engineering`, for Claude and ChatGPT;
  - later, possibly `/v2/mcp/household` for Muse, if MCP proves better than REST there.
- **Tools are a projection of the caller's capabilities.** `tools/list` returns only what this
  integration may call:
  - **reviewer:** `list_shared_reviews`, `get_review_package`, `submit_review`;
  - **builder:** `submit_for_review`, `list_my_reviews`, `get_review_result`;
  - **household (later):** `claim_external_action`, `heartbeat_external_action`,
    `request_approval`, `commit_intent`, `complete_external_action`, `fail_external_action`,
    `reconcile_external_action`.
- **Mark read-only tools** with `readOnlyHint`. ChatGPT asks for confirmation on the rest, which
  suits the human-in-the-loop model.
- **No** `execute_arbitrary_action`, no generic `query`, no `list_all_tasks`.
- Every tool calls the same `TaskService` method as its REST twin. MCP and REST have no separate
  state.

## 12. REST adapter design

Following repo conventions (all under `/v2`, in an `agentRoutes()` module like `voiceRoutes`):

| Who | Routes |
| --- | --- |
| Member (Sam) | `GET/PUT /v2/agents/integrations`, `POST …/integrations/{id}/credential` (once), `DELETE …/credential`, `GET /v2/agents/tasks`, `POST /v2/agents/tasks/{id}/approve` and `/reject` (gate + subjectHash), `POST /v2/agents/reviews/{id}/paste-result` (manual fallback) |
| Integration (bearer/OAuth) | household (from Muse M0): `/v2/agents/int/external-actions/claim-next`, `…/{id}/heartbeat`, `/status`, `/commit-intent`, `/complete`, `/fail`, `/reconcile`; engineering (REST twin of the MCP tools): `/v2/agents/int/reviews/…` |

Errors use one JSON shape, `{ "error": { "code", "message" } }`.

## 13. Routing model

`AgentRouter.route({ domain, taskType, requester })` → `{ integrationId } | { none, why }`:
1. Candidates: enabled integrations in that domain whose **role** handles the `taskType`, e.g.
   `architecture_review` → `deputy_engineer`, `external_action` → `external_action_executor`.
2. Filter by requester authorization (household) or ownership (engineering), capability, and health.
3. Pick the owner's default for that role. With one candidate, it's automatic.
4. **External actions:** the router only *selects* the executor. Creating the execution still goes
   through the Muse policy checks and commit gates, which the router cannot skip.
5. A future `direct_api` integration for a task type outranks an agent when present.

## 14. Audit model

**One append-only table per Durable Object:**

```
(id, at, taskId|integrationId, event, actorKind, actorId, meta)
```

- **Events:**
  - `task_created`, `share_requested`, `share_approved`, `shared_to_agent`;
  - `agent_claimed`, `agent_result_submitted`, `return_approved`, `task_closed`;
  - `approval_rejected`, `credential_issued`, `credential_rotated`, `integration_disabled`,
    `integration_revoked`;
  - plus the Muse execution events from Muse M0 §19.
- **`meta`** holds ids, hashes, sizes, counts and status only, **never payload text**, secrets,
  payment details or family data.
- **Retention:** 1 year for the engineering domain; household follows the family's data lifetime and
  is deleted with the family.

## 15. Failure and degradation behaviour

| Unavailable | Product effect | What the user gets |
| --- | --- | --- |
| ChatGPT integration (disabled, not connected, can't write) | Nothing breaks | **Export review package** (copy or download markdown) and **Paste review** (manual return), with the same approvals and audit |
| Claude integration | Nothing breaks | "Save implementation request". The package stays in the Hub until Claude next pulls it |
| Muse | Talk works; no external execution | "Household Agent unavailable"; the task can be prepared and saved; "do it yourself in Muse" as advice only |
| The Hub itself (Durable Object error) | Every other app feature unaffected | Agent features show "unavailable", fail closed |

## 16. Provider-disable strategy

- **Per integration, in Me › Connected agents:**
  - **Pause** (`enabled=false`): calls are refused, and data and credential are kept.
  - **Revoke credential:** refused immediately.
  - **Remove:** the integration and credential are deleted, and the audit is kept.
- **Operator kill switches**, Worker vars like the voice PR's `CLOUD_VOICE`:
  - `AGENTS_HOUSEHOLD=off`
  - `AGENTS_ENGINEERING=off`
- **No feature imports a provider directly.** Talk asks the router, and review screens ask the
  TaskService, so a missing provider is just "none".

## 17. Migration path from the current Muse proposal

| Existing Muse concept | → Hub component | Stays specialised? |
| --- | --- | --- |
| `ExternalAgentIntegration` | `AgentIntegration` (`domain: household`, `role: external_action_executor`, `provider: meta`) | No, generalised |
| Muse credential (`pmk_…`) | integration credential (bearer) | No |
| Scopes `agent.requests.*` | capabilities `external_actions.*` | No |
| `ExternalActionRouter` / `MuseActionProvider` | `AgentRouter` + provider adapter | No |
| `AgentRequest` | `AgentTask` envelope **+ linked `ExternalActionExecution`** | **Yes, the execution record** |
| Leases, `claim-next`, heartbeat | `ExternalActionExecution` | **Yes** |
| `executionPhase`, commit-intent, `outcome_unknown`, `reconciliation_required` | `ExternalActionExecution` | **Yes, non-negotiable** |
| Proposal hash and approval binding | generic `Approval` with `gate: commit/spend/requester` and `subjectHash` | No (the record is generic; the rules stay Muse's) |
| Household Agent policy (per action class, limits, owner approval) | `integration.policy`, evaluated by the external-action service | **Yes, the evaluation** |
| Requester / beneficiary / owner | `requestedByMemberId` / `affectedMemberIds` / `ownerMemberId` | No |
| Audit events | generic audit table (Muse events included) | No |
| Household Agent settings and activity UI | Me › Connected agents › Muse | No (it's one row) |

Nothing in the Muse M0 design is dropped.

## 18. Build now vs defer

**Recommendation: Option B.** Build Muse's minimal infrastructure first, shaped so that it *is* the
generic core. Don't build a framework ahead of its first user.

| Now (with the Muse bridge) | Deferred |
| --- | --- |
| `agentCore`: registry, capability check, task envelope, generic `Approval`, audit table, credential service, router with one rule | Engineering domain (`EngineeringHub` DO), until the review bridge is authorized |
| `AgentHub` DO (household) + `ExternalActionExecution` + Muse REST/OpenAPI | MCP adapter for household, unless Muse shows REST is inadequate |
| Me › Connected agents (one row: Muse) | Claude/ChatGPT rows, OAuth server, review screens |
| Kill switch `AGENTS_HOUSEHOLD` | `direct_api` provider |

**Why B:**
- There's a real first user.
- The generic pieces are small: maybe 300 lines of core code.
- The Muse-specific safety code is written once, in the right place.
- A Hub-first PR would ship code nobody calls and would have to guess the review bridge's needs.

## 19. Risks and unknowns

1. **ChatGPT write actions on Sam's plan.** Sources conflict. If ChatGPT is read-only, the review
   returns through **Paste review**, which is already designed.
2. **Claude custom-connector OAuth.** A reported auth failure with some OAuth 2.1 setups. Test a
   bearer/authless-plus-token variant as a fallback, and prefer OAuth only once it's proven.
3. **Muse:** polling interval, unattended connector calls and protocol fidelity (Muse M0 §20).
4. **Data leaving the trust boundary:** review packages go to OpenAI; household tasks go to Meta. Both
   are plaintext by necessity and must be stated on the privacy page. Mitigations are the package
   scanner and the share approval.
5. **Prompt injection through returned reviews.** Claude must treat a ReviewResult as *data from a
   peer*, not instructions. The Hub labels it as such, and changes still go through normal PR review
   and CI.
6. **Scope creep into an "agent platform".** Mitigated by the "Can never" column (§8) and no generic
   tools.
7. **Cost:** consumer Claude and ChatGPT pulls use Sam's subscriptions, not API credits. The Hub
   itself costs little: Durable Object storage on the current plan.

## 20. Recommended branch and PR sequence

1. **`v2/muse-bridge`** (after this M0 and the Muse M0 are approved): `agentCore`, `AgentHub` DO,
   `ExternalActionExecution`, Muse REST/OpenAPI, Me › Connected agents (Muse row).
   - Stage 0 smoke test against a logging stub first.
   - The PR stays unmerged for independent review.
2. **`v2/review-bridge`:** the `EngineeringHub` DO, ReviewPackage/ReviewResult, share and return
   approvals, **export/paste fallback first**, then the engineering MCP endpoint and Claude/ChatGPT
   rows.
   - Verify ChatGPT write capability on Sam's plan before relying on `submit_review`.
3. **`v2/agents-mcp-household`:** only if Muse needs MCP.
4. **`direct_api` providers:** per merchant, only where a real API exists.

Each PR:
- passes CI;
- keeps every provider optional;
- is deployed only with explicit approval.
