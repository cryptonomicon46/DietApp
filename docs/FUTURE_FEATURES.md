# Future Product Concepts

**STATUS: DESIGN ONLY / NOT AUTHORIZED FOR IMPLEMENTATION.**

Prepared 2026-10-28 from the future amendments in “Review app code options.” Detailed designs below are not an approved engineering backlog. Do not interrupt current phases, add migrations, connect providers, schedule Scout jobs or ship UI for them without explicit implementation authorization. Existing approved Watch/date work remains in OURPAWMILY_2_0.md; the Read/Discover expansion and generalized media discussion model below remain future work.

## Read + Watch + Discover inside Us

**Status (2026-10-28 amendment):** core **Read is now approved and built** (Phase 4 amendment — see docs/BUILD_PROGRESS.md): Want to Read → Reading → Finished (Dropped in details), one book per title with each member's own 📖/🎧 state and optional progress, Open Library metadata incl. series/authors/genres, Discuss → one Thread per book, and per-member signals with structured reasons (`js/books.js`). **Still design only:** the personalized Scout/Discover engine (updates and recommendations), release/announcement fetching, author/series follow UI, adaptation discovery, notifications. The notes below remain the design for those.

Explore a lightweight shared culture experience within Us, without another bottom tab or a return to generic News. Keep Tonight, This week, Ideas and Watch understandable; introduce Read/Discover through calm progressive disclosure rather than six permanent large cards.

Read mirrors Watch:

| Read | Watch |
| --- | --- |
| Want to read | Want to watch |
| Reading | Watching |
| Finished | Finished |
| Dropped | Dropped |

Keep planned viewing distinct from actual viewing. Progress is optional: users can mark Reading/Watching without percentages, page counts or episode numbers. A compact “Right now” view can show who is reading/watching what, but only where that person has chosen to share it.

Public book metadata may include title, author, cover, publication date, genre, series/order and ISBN where available. Personal status, progress, ratings, dates and notes are separate private state. Explore follow-author/series/show/franchise actions and easy list additions without mandatory tracking.

## Personalized Discover and Scout

Each person explicitly chooses interests; examples such as nonfiction/science/technology or fantasy/romantasy are optional choices, not inferred profiles. Allow interests to be changed/reset and explicit Interested / Not for me feedback. Do not infer sensitive characteristics or build opaque behavioral profiling.

Show roughly 3–6 relevant candidates, with a concise reason: followed genre, author or series; a new season for a saved show; a related adaptation; or credible reception matching selected interests. Use popularity/trends only when relevant. Show “For both of you” only when overlap is meaningful. Do not create an infinite engagement feed or resurrect generic News/Rescue News.

Scout could monitor public sources for meaningful changes:

- Book/series announcements, publication dates and new releases.
- Film/TV releases, new seasons, credible reviews and relevant trailers.
- Book-to-screen adaptation announcements and availability.

Discover primarily serves people who open it. Explore low-volume controls such as important followed releases only or no Discover notifications; trivial publicity should not generate alerts.

Proposed pipeline:

```text
Reliable public sources → Scout → public candidates/cache
                                      ↓
                    phone-side ranking with private preferences/history
                                      ↓
                            personal Discover
                                      ↓
                         Save to Read/Watch or Discuss
```

Extend the existing Scout concept rather than introducing another unrelated AI system. Keep private notes/history out of AI requests where practical. Factual dates, authors, ISBNs, streaming availability and adaptation relationships need reliable public sources; AI memory is not a factual database. AI may summarize/classify public candidates. Research API access, terms, licensing, commercial restrictions and rate limits before choosing providers.

## Book ↔ screen adaptations

Where reliable metadata establishes the relationship, connect a book or series with its movie/TV adaptation. A book reader may see Add to Watch; a viewer may see Want to read. Distinguish an announcement from a confirmed date or released adaptation. Do not fabricate relationships or release dates.

Explore whether adaptation discussion should reuse the book Thread or use a linked adaptation Thread. This remains a UX decision, not a settled schema requirement.

## Discuss → Thread: one discussion system

Every future Read, Watch and Discover item should offer **Discuss**. Reuse Threads for date ideas and media discussions; do not add separate Read/Watch/Discover comments, search or notification systems.

```text
Book / show / movie / Discover candidate / date idea
                         ↓ Discuss
             Find an authorized Thread for its stable reference
                      ↙              ↘
                 reopen             create
                         ↓
              Normal encrypted Thread conversation
                         ↓ deliberate user action
          Add to Read/Watch, decide a plan, or schedule activity
```

Default to one discussion per stable item/reference within the authorized context. Repeated Discuss opens the same accessible Thread; never reveal inaccessible Threads while looking for a match. An explicit separate-discussion action may be explored. Exact reference storage and deduplication must be designed consistently with E2EE and access control; conceptual `type + itemId` is not a finalized schema.

Use a structured encrypted reference card rather than duplicating large text bodies. Book cards may show cover/title/author/genre/year/status; film/show cards may show poster/title/year/release information/status. Keep public metadata separate from private reading state and conversation. The person reading an item and the people allowed into its Thread are different questions.

Threads retain normal replies, images, author editing, pins, search and notifications. Explore quiet discussion indicators and lightweight Read/Watch filters while retaining boards; avoid a new folder hierarchy or noisy badges. Search encrypted discussion text locally/in memory, including item references as permitted; no plaintext server index.

Enable deliberate actions in both directions: a Discover candidate can start a discussion before being saved; a Thread can offer Want to read or Add to Watch. AI never silently changes lists, creates plans or performs privileged actions.

## Privacy and security

- Default personal Read state/history to private unless explicitly shared. Explore a simple “Share what I’m reading with family” control and whether status-only sharing is sufficient.
- Keep private notes encrypted and out of Scout/provider payloads.
- Respect Family membership, partner-only Us access and normal Thread permissions.
- Public media metadata is distinct from private per-person state and discussion.
- Family encryption keys never reach media APIs or AI providers.
- Preserve the frozen key architecture; document its server-enforced sharing limitation. Any stronger cryptographic isolation requires separate approval and audit.

## Performance and model choices to evaluate

No Read/Discover startup work on Home: no news/release fetches, Scout initialization, hidden cover downloads, automatic AI on every Us open, or full Thread-index downloads just to show counts. Use cached public candidates, background jobs only when separately authorized, lazy screens, small payloads and on-demand images. Preserve established performance gates.

Compare a generic media/library model with separate Read/Watch records sharing utilities. Choose the simpler auditable implementation, keeping public item metadata, per-person state and authorized Thread references distinct. Do not force an abstraction or duplicate private information.

## Proposal required before implementation

After the authorized simplification work and Us foundation are stable, prepare a reviewable proposal covering:

1. Mobile Us layout, Read/Watch details, optional progress and shared snapshots.
2. Personal Discover, meaningful overlap, follow controls, releases and adaptation cards.
3. Discuss → Thread, deduplication, reference-card privacy, reverse list actions, search and notification reuse.
4. Data model alternatives, public sources/API terms, Scout architecture and accurate metadata handling.
5. Sharing/consent defaults, E2EE/access review, AI payload boundaries and performance impact.
6. Bounded implementation phases, validation and migration/rollback needs.

Review and explicit implementation authorization are required before building any of this.

## Separate future security project

Per-person/per-area cryptographic isolation for Diet/Fitness needs its own design and audit before commercial/external-family launch. It is not authorized here and must not be bundled into Read/Discover work or the currently frozen key system.
