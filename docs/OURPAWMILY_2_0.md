# OurPawmily 2.0 — Approved Architecture

Prepared 2026-10-28 from “Review app code options.” This records the approved direction requested for this handoff, not proof of implementation or blanket authorization to build all phases. The revised phase order and explicit decisions supersede conflicting details in the original attached proposal. Current session authorization and review gates still apply. Future Read/Discover concepts are isolated in FUTURE_FEATURES.md.

## Product principle

One app answers: “What does our household need to know or do today?” Use one identity, one Family, one invitation mechanism and one permission model. Simplify existing flows and preserve family history.

## Navigation and destinations

Exactly five primary tabs, in order: **Home · Us · Calendar · Threads · Health**.

| Destination | Responsibility |
| --- | --- |
| Home | Needs attention/Requests, one Now line, shared Groceries, chores and dog care, pinned Threads. Requests replace feed help asks. |
| Us | Tonight, This week, three curated Ideas, Watch. Distinguish planned viewing from what was actually watched, changed or skipped. Date discussion uses Threads; agreed plans lead to Calendar. |
| Calendar | Existing month/day views, plans and dog appointments; retain private subscription capability. |
| Threads | Household discussion/reference memory, search, pins/favourites, boards and App feedback; Photos/Albums under Threads → Photos. Search encrypted content locally in memory. |
| Health | Personal Diet and Fitness inside the Family app, private by default; consolidate the separate tracker experience without losing history. |

Settings remains behind the profile picture: Family & sharing, Devices, Notifications, Recovery, Appearance and Help. Dog profiles, vaccines and spending belong under Settings → Family → dog; care actions live on Home and appointments in Calendar. Preserve chat and shared photo infrastructure.

Retire the Street Fighter health meter, including an optional playful mode for now. Use calm Diet consistency such as “5 of 7 days on target.” Preserve existing targets and approve-first check-ins during migration.

## Feed retirement and retained history

- Hide Moments/social-feed composition and posts from normal navigation; do not delete historical posts.
- Keep old posts read-only; Settings → Old posts is the intended later access point. Preserve export capability.
- Hide News and Rescue News, stop their initialization/network requests, and preserve their code/data for now.
- Give Threads its own destination. Preserve albums/photos and the shared photo store, upload/viewer, encryption and export dependencies.
- Preserve notification preferences while relabeling shared “feed” notifications for Threads. Resolve legacy `#feed` links to Home.
- Provide report/block capability for Threads/chat before retiring feed-only entry points.
- Stop feed-only startup requests. Remove dead feed code only after dependency checks and regression verification; data deletion is not approved.

## Identity, invitations and permissions

**Google-authenticated User → Family → Membership → Permissions.** A Family of one is valid. Retire unauthenticated “Just the trackers” code-based sharing with a migration path that preserves existing data.

Invitations are tied to the recipient's Google/Gmail account. The Family owner initially chooses household areas the invited member may access. Do not introduce a complex administrator hierarchy or let ordinary members grant areas excluded by the owner. Household access covers Home (including groceries/chores), Calendar, Threads and Us where applicable; Us remains partner-only, and existing child limits remain respected. Preserve existing members' access during migration.

Diet and Fitness are separate personal areas and records. They are private by default; the data owner chooses separately, per member, whether to share their Diet and/or Fitness. An invitation never grants the inviter access to the recipient's Health data automatically. Existing single sharing lists copy into both lists to preserve current sharing until changed. Expose controls under Settings → Family → Member → Sharing.

Approved permission scope includes invitation area selection, `member.access`, Diet/Fitness sharing settings, server enforcement and authorization tests. Every relevant route must enforce area/resource access, not merely hide UI. Test both “Fitness shared, Diet denied” and the reverse, excluded members, cross-family access, and file authorization.

## Household-code retirement

Codes are absent from normal authenticated-family UX. Sharing occurs through membership and explicit permissions, with no second tracker-sharing system.

1. **Phase 1:** hide every code surface: Devices, Privacy, Link phones, send/change-code controls, Help, tours and normal setup instructions. Decouple Family server configuration from tracker `lp.g.sync`.
2. **Phase 2:** new authenticated families receive no code and do not write tracker data to legacy code storage. First remove the unconditional code creation dependency in `sync.ensure()` and move dog documents/adoption-photo uploads to the Family encrypted file store.
3. **Phase 10:** copy existing dog files, replace calendar subscriptions with private account/Family links, reconcile tracker data, and stop legacy writes after verification. Preserve Recover reads from old codes for the proposed 90-day transition; verify the transition start and rollback before applying it.

Design the calendar replacement before removing existing subscription functionality. Preserve recovery and code-backed data until migration is verified. Legacy routes may remain internal during migration; read-only retirement and deletion require separate approval. Do not interpret the recovery transition as permission to change frozen key recovery.

## Security and privacy constraints

The existing family-key architecture is frozen: no changes to keys, key generation/distribution/recovery, Google authentication, invite-token security or E2EE cryptography. Permission records are permitted within that boundary.

All family devices currently sharing a Family key may decrypt ciphertext if they obtain it. Server checks enforce member/Health permissions; they do not create cryptographic isolation between those devices. Record this limitation honestly. Separate per-person/per-area keys require their own future design and audit before commercial/external-family launch; they are not part of this implementation authorization.

Keep private data encrypted in storage and transit through existing mechanisms. Thread search stays client-side/in-memory; no plaintext server search index. Enforce per-resource file access. Close identified security findings with evidence rather than assuming the redesign fixes them.

Later AI phases must use a purpose/field-allowlisted privacy gateway. Keep private calculations/ranking on the phone where practical; cloud public discovery receives public/minimized inputs. Never send Family keys. Log field names rather than private values. AI drafts require deliberate user confirmation before saving or privileged actions. Image parsing requires explicit consent, metadata stripping, uncertain-field review and retention-terms review before implementation.

## Performance constraints

The source conversation reports Phase A results; these are historical comparison points, not measurements of the current repository. Reproduce with the same harness: phone viewport, 4× CPU slowdown, 120 ms latency and synthetic family.

| Metric | Reported baseline / direction |
| --- | --- |
| Startup API requests, first 6 seconds | Approximately 18, down from 30; never above 18, target ≤14 after feed retirement |
| Duplicate startup requests | 0 |
| Cold first/largest paint | Approximately 1.25 s each; proposal budget ≤5% regression |
| First useful content | ≤1.6 s target |
| Cold long-task total | Approximately 410 ms; do not increase |
| Layout shift | Approximately ≤0.04 reported; preserve it (proposal outer ceiling 0.05) |
| Requests on fresh-data tab switch | ≤4 |
| Startup script, gzipped by 6 seconds | Approximately 182 KB reported; no growth |

Add the performance harness to CI. Keep Health, workout builder, ideas, search and image import lazy. Hidden feed/news work must not run. Record comparable before/after results; investigate material regressions before merging.

## Revised implementation sequence

This is the revised roadmap, not an automatically authorized queue. The source's explicit initial implementation gate was Phase 0 + Phase 1, then STOP for review. A later operating-mode example mentioning Phases 0–2 did not itself grant that authorization.

| Phase | Scope and dependencies |
| --- | --- |
| 0 — Safety net | Validate/integrate Phase A, performance CI, report/block, per-resource file authorization, identified security fixes and dependency tests. Any integration that deploys requires approval. |
| 1 — Navigation and simplification | Five tabs; feed hidden; household codes out of normal UX; independent server configuration; Devices cleanup. Health may open existing trackers until its migration. |
| 2 — No new codes | Remove new-family code creation after encrypted dog-file upload dependencies are resolved. |
| 3 — Home & Threads | Requests, shared Groceries, chores/dog care, search, favourites, reply images/editing and App feedback; preserve encrypted content. |
| 4 — Us | Tonight / This week / Ideas / Watch, planned versus actual outcomes, date Discuss → Thread → Calendar. |
| 5 — Health shell & Diet | Diet/Fitness split into separate encrypted records; preserve originals and existing targets/history; calm consistency UI. |
| 6 — Family permissions | After Phase 5 split: member areas, per-person Diet/Fitness sharing and server authorization matrix. |
| 7 — Fitness | Blocks/rounds for straight sets, supersets, circuits and intervals; manual builder, repeat/templates, history/progress; adapt old sessions without rewriting them. Never invent missing workout values. |
| 8 — AI privacy gateway & text | Gateway before parsers; local grammar first, minimized cloud fallback, uncertain fields flagged, user-confirmed drafts. |
| 9 — Photo → workout | After gateway and retention review: explicit consent, re-encoded image, draft review and uncertainty handling. |
| 10 — Legacy code migration | May run after Phase 2 when dependencies are ready; verified copies/reconciliation, private calendar replacement, recovery transition and rollback. No unapproved deletion. |
| 11 — Devices | Later WHOOP polish and Garmin work after provider eligibility/terms are verified. |

Phase 1 removes Connector URL, server/README instructions, WHOOP/Garmin CSV import and household-code controls from normal Devices UI. Do not pretend unsupported integrations are connected. Later integration work must verify official provider terms; proposal API pricing/eligibility claims are not approved facts. Do not build password-based Garmin scrapers or assume Strava satisfies household sharing/AI requirements.

At the Phase 0–1 review gate report exact commits/files, security fixes, actual test results, navigation evidence, every removed code surface, remaining backend dependencies, before/after network measurements, regressions and implications for Phase 2. Do not deploy without approval.
