# Amendment: Us — Read + Watch + Discover + Threads

**Status: recorded, not scheduled.** A future architecture amendment for the 💞 Us experience. It does not change the approved OurPawmily 2.0 phases, and nothing here is built until (1) the approved phases and the Us redesign (Phase 4) are stable and (2) the UX proposal in §26 has been reviewed.

Names in examples: Sam and Pat.

## The principle

OurPawmily has **one discussion system: Threads.** Watch, Read, Discover and date planning don't get their own comments. They all do:

> **Discover → Read / Watch → Discuss → Thread → Decision / activity → History**

Threads become the household's persistent, searchable memory; Read, Watch and Discover stay focused on their own jobs. The old generic social feed and News are **not** brought back.

## Requirements (as given)

1. **Us: Read + Watch.** Us = Tonight · This week · Ideas · Watch · Read · Discover, shown with progressive disclosure (not six big cards). Read deliberately mirrors Watch.
   - Watch statuses: Want to watch · Watching · Finished · Dropped (plus Planned tonight / Actually watched where they apply).
   - Read statuses: Want to read · Reading · Finished · Dropped.
2. **Who's reading / watching what:** a compact "Right now" snapshot per person (e.g. 📺 Sam · Severance S2 E4; 📖 Pat · Fourth Wing · 68%). Items open details. Progress is optional — "Reading" alone is fine.
3. **Every Watch / Read / Discover item can start a Thread** via **Discuss**. No feature-specific comments.
4. **Watch → Thread:** Discuss creates (or reopens) a Thread with a structured, encrypted reference card (title, type, status, season, View show). The Thread is a normal Thread: replies, images, edit your replies, pin, search, normal notifications.
5. **Read → Thread:** identical for books (title, author, genre, who's reading, View book).
6. **One item → one discussion:** each item has a stable reference, `thread.ref = { type: 'book' | 'show' | 'movie', itemId }`. Discuss finds an authorized Thread with that reference and opens it, or creates one. A separate Thread is possible only as an explicit choice.
7. **Reference cards, not copied text:** book card (cover, title, author, genre, year, status); show/movie card (poster, title, year, streaming/release info where available, Watch status). Public metadata can update on its own; the private discussion stays encrypted. The Thread references the item instead of duplicating records.
8. **Thread → Read / Watch actions:** a media Thread offers *Want to read* / *Add to Watch* — always a deliberate tap. AI never changes lists silently.
9. **Discover cards:** *Save* (Want to read / Add to Watch) · *Discuss* · *Not for me*. Discuss works even before anyone saves the item.
10. **Date ideas use the same pattern:** Date idea → Discuss → Thread (as already proposed for Us in 2.0 §C, keyed by the idea token). Household matters and app feedback are Threads too.
11. **Thread search** covers text and referenced items ("Severance" → 📺 Severance, Watch discussion; "Fourth Wing" → 📖 book discussion; "anniversary" → 💞 date discussion). Search stays on the phone, in memory; no plaintext server index.
12. **Light filters:** All · Pinned · Home · Dates · Watch · Read · App feedback. Boards stay the main organisation; the reference type gives automatic filtering. No folder hierarchy.
13. **Discussion indicator:** a quiet 💬 6 / "💬 Discussing" on items that have a Thread; tapping opens it. No badge noise.
14. **Notifications:** discussion replies are ordinary Thread notifications. No book / watch / date notification types.
15. **Personal vs shared:** the media item is shared public metadata; each person's status is personal state; the Thread is shared with authorized household members under Family permissions. "Who's reading it" and "who can see the discussion" are different things.
16. **Personal Discover:** per person, from interests they choose (e.g. Sam: nonfiction, science, technology, notable fiction, film/TV; Pat: fantasy, series, releases, adaptations). Nothing sensitive is inferred. Interested · Not for me · Follow author / series / show.
17. **Quality over quantity:** about 3–6 strong items, not a feed. Ranking may use genres, follows, Read/Watch lists, past ratings, Interested / Not for me, recency, credible reception, popularity, novelty.
18. **Book ↔ adaptation links** where reliable public metadata supports it ("Based on a book you're reading" → Add to Watch / Discuss; watching an adaptation may surface 📖 Read the book). To decide in the proposal: reuse the book's Thread or create a linked adaptation Thread — whichever is cleaner.
19. **Release scout:** follow authors, series, shows, franchises; alert only on meaningful changes (book announced / dated / released, season announced / released, trailer, major credible reception, adaptation announced). No trivial publicity.
20. **Discover, not News:** "What's new that I'd actually care about?" Categories: Books · Watch · Dates. "For both of you" only when there's real overlap.
21. **Scout architecture:** public sources → Scout → candidates → public metadata cache → **phone-side private ranking** → Discover. Private Read/Watch history isn't sent to AI providers.
22. **AI is not the fact database:** release dates, ISBNs, authors, publication and release dates, streaming availability and series metadata come from reliable public APIs / data / search, never from model memory. AI may summarise, classify, rank public candidates and write short explanations. API terms, commercial restrictions and rate limits are researched before building.
23. **Privacy:** Read state is private by default; a simple "Share what I'm reading with family" switch. Personal book notes stay encrypted and never go to Scout or AI. Media Threads follow normal Thread access. Family keys never go to media APIs or AI providers.
24. **Performance:** none of this is start-up work — no release or movie fetches on Home, no Scout on Home, no covers for invisible items, no AI on every Us open, no full Thread index just to show counts. Cached public Scout results, lazy loading, background jobs, small payloads, on-demand images, lightweight reference IDs. The 2.0 performance budget (`scripts/perf/budget.json`) applies.
25. **Data model:** before building, compare (A) one generic media/library model with (B) separate Read and Watch records sharing utilities, and pick whichever is easiest to understand and audit. Either must support media item ↔ personal state ↔ Thread reference without duplicating private data.

## 26. The proposal to prepare later

After the approved phases are complete, a reviewed UX + architecture proposal covering: Us with Read added; Watch UX; Read UX; who's reading/watching what; personal Discover; For both of you; a book release recommendation; a Watch release/review recommendation; follow author/series/show; book ↔ adaptation; Watch → Thread; Read → Thread; Discover → Thread; Thread → Add to Watch/Read; search and filters for media Threads; privacy controls; media APIs and data sources; Scout changes; performance impact; E2EE impact.

## Notes for that proposal (from the current code)

- Threads already carry the pieces this needs: encrypted bodies, screenshots/PDFs, boards, tags, *Seen by*, report/block, and per-file authorization (2.0 Phase 0). A `ref` field and a reference card fit the existing thread record; the 2.0 Us plan (§C) already proposes `card` + `ref` for date ideas, so media should reuse exactly that.
- Watch data lives in `watch:<fid>` (shows, where you're up to, ratings, nights) with TMDB episode dates; a Read model would sit beside it.
- The weekly Scout (`server/scout.js`) already gathers public candidates for date ideas and caches them; Discover would extend it rather than add a second crawler.
- Thread search is planned on the phone (2.0 Phase 3); media references make it searchable without any server index.
