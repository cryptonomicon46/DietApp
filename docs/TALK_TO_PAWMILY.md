# 🗣️ Talk to Pawmily — whole-life command layer (architecture review)

**STATUS: T0 (mockups + action registry as tested code) authorized and done 2026-10-30 — see `docs/mockups/talk/CHECKPOINT_T0.md` and `js/talkActions.js`. T1 (single-domain requests that are yours) is built — `js/talkParse.js`, `server/talkAi.js`, `family/talk.js`. T2–T4 are NOT authorized yet.** Prepared 2026-10-30 from the owner's "Whole-Life Command Layer" proposal, fitted to the code on `main` `aa4fe63` and `v2/health-2b`. Nothing here is built. Voice, calendar planning, route/traffic intelligence, day-plan orchestration and background coaching need their own authorization. Examples use Sam and Pat.

Product model: **Understand → Plan → Capture → Coordinate.** You have a thought, tell Pawmily, it checks the facts it needs, proposes something sensible, you approve, and the right existing parts of OurPawmily update.

## 1. Constraints the existing system sets (these shape everything)

| Fact in the code | Consequence for the assistant |
|---|---|
| Domain records are sealed on the phone with the family key (Watch `body`, books `body`, Us plans `body`, events `body`, requests `box`, workouts, Health parts). The connector stores ciphertext and can't read or write their contents. | **The assistant's executor runs on the phone.** Claude (on the Worker) can only *propose* typed actions; the phone validates them and applies them through the same write paths the screens use, which seal as they always do. The family key never leaves the phone. |
| Every write route checks membership and permissions on the server (Health parts, Closet owner-only, Us `visibleTo`, Watch `sees`, Read `aud`). | Assistant actions call those same routes, so permissions apply automatically. No assistant-specific route writes domain data. |
| The AI gateway (`server/aiGateway.js`) allowlists fields per purpose, caps sizes and daily use, and audits without values. | Each assistant call is a gateway purpose with its own allowlist and cap, built the way `diet.coach` is (`planFacts` on the phone → `cleanFacts` on the Worker). |
| A precedent for typed actions exists: `server/assistant.js` returns Claude's tool calls to the phone as the same actions `js/commands.js` produces, and stores nothing. `js/foodText.js` and `js/commands.js` handle common phrases on the phone first. | Same shape, generalized: local parsers first, then Claude for the rest, and the result is always a list of typed actions, never prose that the app acts on. |
| Startup budget (`scripts/perf/budget.json`): 14 requests, about 178 KB of script. | The Talk control loads its module on the first tap. Nothing runs in the background. |
| Five tabs. | No sixth tab. One Talk control reachable from every tab (placement is a decision, §10). |

## 2. Components

```
 Talk control (phone) ── local parsers (foodText, commands, title lookups) ──┐
        │ unplaced words                                                     │
        ▼                                                                    ▼
 Intent router (Claude, gateway purpose talk.route) ──► Plan: [typed steps] + questions
        │ needs facts                                                        │
        ▼                                                                    │
 Context Broker (phone, read-only adapters) ◄──── External Context Broker (Worker, providers)
        │ structured facts with ids                                         │
        ▼                                                                    ▼
 Composer (Claude, talk.plan; may be the same call) ──► 1–3 options citing fact ids
        ▼
 Validator (phone): schema, permissions, recomputed conflicts, every fact cited
        ▼
 Proposal card (one card, every step listed) ── Apply / Change / Save idea / Ask Pat
        ▼
 Executor (phone): each domain's own write path, with Undo; shared steps become proposals to the other person
```

- **Talk control:** a text field. Voice is the keyboard's dictation only, as in Tell me: no audio reaches the app. It shows context-sensitive examples (§8).
- **Local first pass:** existing on-phone parsers resolve what they can ("2 eggs and toast", "bench 135 for 8", "weigh in 161.4"), so common captures need no Claude call.
- **Intent router:** Claude with structured output. Input:
  - the words;
  - today's date, time zone and the current tab;
  - the action registry (names and argument schemas, §5);
  - **role tokens instead of names.** The phone replaces "Pat" with `partner` and other members with `member:2`, and maps them back. Names never need to reach Claude.

  Output is a plan of typed steps plus the smallest clarification questions. One call can also compose (below) when no facts are missing.
- **Context Broker (internal):** read-only adapters on the phone, one per domain, each returning structured facts under a tested allowlist. `dayContextForPlanning` (Health 2 Phase B) is one adapter, not the centre. Each adapter's privacy boundary is unit-tested.
- **External Context Broker:** providers on the Worker return current facts with a source, a fetch time and an id (§6).
- **Composer:** Claude combines the facts into 1–3 options. It may only cite facts by id; it does not produce times, hours, distances or availability itself.
- **Validator (phone):**
  - checks each step against its schema;
  - recomputes calendar conflicts from the calendar itself, never trusting "No calendar conflicts" from Claude;
  - checks that every displayed time, place, opening hour or travel time traces to a fact id;
  - drops anything that fails.
- **Proposal card:** one card for the whole compound request, with the steps listed and individually un-tickable. Nothing changes until Apply.
- **Executor (phone):** applies approved steps through the owning domain's code, in order, with Undo where the domain has one. A failed step stops the rest and says which step it was.

## 3. Proposal lifecycle — evaluated against what exists

The proposed `Draft → Proposed → Accepted → Executed` already exists in three places. A generic stored proposal object would duplicate their state, so the recommendation is **no new stored proposal type**:

| Need | Existing equivalent | Lifecycle today | Gap |
|---|---|---|---|
| Shared activity, date, outing, errand with someone | 💞 Us "Feeling like" plans (`server/us.js`, `/families/:fid/us/plans`) | author → `to` → replies `in` / `maybe` / `later` → `agreed` → `planToCalendar` adds the event → `done` → rated. An outing itinerary attaches (`x.outing`). | No **Decline** reply. No **Suggest change** (a counter-time). An agreed plan goes on the calendar automatically, while the proposal says to *offer* it (decision, §10). |
| Ask the household for a hand | 🙋 Home requests (`server/home.js`) | `open` → `claimed` → `done` | none |
| An opinion from your partner | 👔 Fit Check (`server/look.js`) | sent → Hit / Miss / A / B | none (Look-only) |
| Self-only changes (workout version, rest-of-day meals, a day plan) | `W.proposeVariant` preview, Adjust the rest of today | in memory: preview → Apply → Undo | none — keep these ephemeral |

The phone-side proposal card is a **view model that is never stored**. It either:
- becomes one of the records above when it's sent; or
- applies self-only steps directly after Apply.

At most, an unsent draft can stay on the phone (like Tell me's text).

**Shared-person rule:** every action in the registry declares who it affects (`self` / `shared`). A `shared` step cannot execute directly; the executor turns it into an Us plan (or a request) addressed to those people. Concretely:
- a calendar event whose `who` includes someone else is created only by `planToCalendar` after they answer;
- the assistant never posts to Threads; it opens the composer prefilled.

## 4. Domains stay authoritative (no assistant database)

Watch writes to `watch:<fid>`, Read to `books:<fid>`, Us plans to `us:<fid>`, Calendar to `events:<fid>`, Home to `requests:<fid>`, Fitness to the member's `workouts/today|log`, Diet to the sealed Health parts via `editMine`. The assistant keeps no memory of its own. Provenance it needs is stored as a **structured field on the domain record**, never in conversation logs:
- Watch already has `by` (who added a show), so "What did Pat suggest we watch?" reads Watch shows with `by = partner` and status Want to Watch;
- Read needs a new optional field for "recommended by Pat" (decision, §10).

## 5. Action registry, fitted to the repository

These are proposed names in the repo's own vocabulary, not final. "Write path" is the existing phone code and route each action reuses.

| Action | Kind | Affects | Write path / source | Confirm | Undo |
|---|---|---|---|---|---|
| `watch.add {title, tmdbId, kind, status, aud}` | capture | couple's list | `family/watch.js` add → `POST /families/:fid/watch/shows` (title sealed); title resolved through TMDB (`server/tv.js`, `server/movies.js`) | card | delete |
| `watch.setStatus {showId, status}` | capture | couple's list | existing status update (`want` / `watching` / `upnext` / `finished` / `dropped`) | card (1 tap) | previous status |
| `watch.find {query}` | read | — | Watch record on the phone + TMDB search | — | — |
| `read.add {olWorkId, list, recBy?}` | capture | `us` / `me` / `family` | `family/read.js` → `/families/:fid/books` | card | delete |
| `read.setState {bookId, s, p?}` | capture | self | `/families/:fid/books/:id/me` (own state only) | card | previous state |
| `us.plan.propose {kind, day, time, where, note, itinerary?}` | coordinate | `shared` | `POST /families/:fid/us/plans` (body sealed) | card → sent to partner | Cancel |
| `us.plan.reply {planId, r}` (+ decline / counter, if approved) | coordinate | shared | `/us/plans/:id/reply` | card | change reply |
| `ideas.save {text, kind?}` | capture | couple | **gap:** no user-saved Date idea list exists (ideas are starter, scouted and past dates, with private pick tokens) — decision | card | delete |
| `calendar.freeBusy {range, who}` | read | — | `js/calendar.js` `occursOn` / `mergeEvents` over `events:<fid>` and linked feeds, computed on the phone | — | — |
| `calendar.addMine {date, start, end, title}` | capture | self only | `POST /families/:fid/events` with `who` = me | card | delete |
| `schedule.feasibility {window, place?, minutes}` | read (composite) | — | free/busy + travel facts + opening hours → feasible start times; extends the free-hour search already in `js/nextup.js` | — | — |
| `home.request {kind, day, time, text}` / `home.claim {id}` | coordinate | household | `server/home.js` routes | card | delete / unclaim |
| `dogs.log {kind}` / `chores.done {id}` | capture | household | care log (`/care`), chores (`/chores`) | card (1 tap) | existing un-tick |
| `fitness.useWorkout {templateId}` / `fitness.variant {intent}` / `fitness.describe {text}` | capture | self | `startWith`, `W.proposeVariant`, `/ai/workout` | preview | Undo |
| `diet.log {meal, items}` | capture | self (Diet sharing applies) | `family/meals.js` `commit` via `editMine`; words through `parseMeal` / `diet.text` | preview | Unlog |
| `threads.draft {board, title, body}` | coordinate | readers | opens the composer prefilled — never posts | composer | — |
| `look.today` | read | self | `family/look.js` Top 3 on the phone | — | — |
| `reminder.set` | capture | self | **gap:** only fixed nudge kinds exist (`server/nudges.js`) — future | — | — |

Ambiguity rule: when a lookup finds several matches (two "Dune"s), the card asks the smallest question, e.g. three choices with year and poster. It never guesses silently.

## 6. External Context Broker

| Provider need | Today in the code | Gap / decision |
|---|---|---|
| Weather | Open-Meteo, on the phone (`js/dress.js`, Look) | none |
| Movies / TV, streaming | TMDB + OMDb (`server/movies.js`, `server/tv.js`) | none |
| Books | Open Library (`server/books.js`) | none |
| Events | Ticketmaster, SeatGeek (weekly scout, per area) | on-demand use and terms to check |
| Showtimes | Claude / Gemini web search in the scout — **LLM-derived, not provider facts** | a showtimes provider, or label as "found by search — check before you go" |
| Places, opening hours | Claude / Gemini web search in outings (`server/outing.js`, `server/search.js`) — **LLM-derived** | a places provider (choice, terms, cost) — decision |
| Routing / traffic | none | a routing provider; what origin is sent (home area vs. exact address) — decision |
| Reservations | outbound links only (🍽 Reserve) | out of scope; links only |

**Rule:** a value shown as a fact (time, hours, distance, travel time, availability, price) must come from a provider response or a domain adapter and carry that fact's id. The validator rejects a proposal that shows a value it can't trace. Search-derived values that can't be traced are shown as "found by search", never as facts. Provider calls send only the public query (a place, an area, a title, dates), never names, calendar titles or anything sealed. They are cached like today's providers (Cloudflare cache, nothing stored about who asked).

## 7. Compound requests

Take "Add that movie to our Watch list and see whether we can watch it Saturday after dinner":
1. Router plan: `watch.find` → `watch.add`; `calendar.freeBusy` (Saturday, couple); showtimes for the title near home; `schedule.feasibility` (after a dinner slot, travel); then `us.plan.propose`.
2. Context and providers run in parallel.
3. One card: "Add *Dune: Part Two* to Want to Watch · Saturday: dinner 6:30 → 8:40 PM show at …, 12 min drive · No calendar conflicts (checked on this phone)". Buttons: Propose to Pat · Change · Just add to Watch.
4. Apply: the Watch add happens now (self-capture on the couple's list); the evening becomes an Us plan to Pat with the itinerary attached. When Pat answers 🙌, the calendar step follows the agreed-plan rule (§10).

The user never sees which providers ran. Each fact on the card can show its source on tap.

## 8. Discovery

The Talk control shows 3–4 context-sensitive examples. They're prefilled phrasings, not command buttons; tapping one fills the field for editing.
- Home: Plan my day · What needs me? · Plan something this weekend
- Us: Plan a date · Add a movie · Add a book
- Health: Log my meal · Build today's workout
- Calendar: Can I fit something in? · When am I free?

Only examples whose actions are built and authorized are shown. Unsupported requests get a plain "I can't do that yet", with the nearest screen.

## 9. Privacy, cost and performance (to settle before any build)

- **Per-intent context budgets:**
  - Claude sees the words, role tokens and only the facts an adapter returns for that request;
  - never the family key, names, notes, Threads, Closet, full histories or location beyond an area;
  - recovery and sleep only for their owner.
- **What's stored:**
  - no transcripts on the connector; the audit line only (purpose, sizes, status);
  - an optional local history on the phone (decision).
- **Third parties:** only public queries to providers (§6).
- **Caps:** per-person daily caps per purpose, as today.
- **Performance:**
  - no startup cost;
  - a capture is one Claude call at most (zero when parsed locally);
  - a compound plan is one router/composer call plus parallel lookups;
  - target a card in under 3 s on a phone, and measure it.

## 10. Decisions for the owner

1. **Where the Talk control lives:** a header button on every tab (recommended), or in the ＋ Create menu.
2. **Agreed plans and the calendar:** today an agreed Us plan is added to the calendar automatically (announced by a toast). Keep that (both explicitly said 🙌), or switch to an "Add to calendar" offer as the proposal describes?
3. **Us plan replies:** add *Decline* and *Suggest another time* (counter-proposal) — recommended, since the shared-person rule needs them.
4. **Saved Date ideas:** add a small couple-scoped "Our ideas" list (sealed, with the existing pick tokens) — recommended — or save ideas as undated Us plans.
5. **Read provenance:** add an optional `recBy` (member id) on a book so "Pat recommended this" is structured.
6. **Places/hours and routing providers:** which providers, what origin is sent, cost and terms. This needs research with the provider domains reachable.
7. **Local history of what you asked:** none (recommended), or a short private list on the phone.

## 11. A possible sequence (each its own authorization and checkpoint)

- **T0** — mockups at 390 px for the control, examples, one-step card, compound card and clarification; the action registry and adapter allowlists as tested code with no UI.
- **T1** — single-domain captures, self-only, no external providers: Watch add/status, Read add/state, Diet log, Fitness use/variant/describe, dog log, chore done.
- **T2** — coordination: `calendar.freeBusy`, Us plan proposals with decline/counter, Home requests.
- **T3** — external context: places/hours and routing providers (after decision 6), schedule feasibility, date and outing proposals.
- **T4** — compound requests and Plan my day, with WHOOP context (`dayContextForPlanning`) as one input among many.

## 12. Extensibility — voice, context adapters, skills, tools (DESIGN ONLY beyond what's built; owner note 2026-10-30)

Talk stays on its authorized V1 features. ElevenLabs, reservation and media providers, and more autonomous agents are **not authorized**. This section records the seams that let them be added later without a rewrite.

**The flow:**
voice or text → intent and context → Pawmily orchestrator (the phone reader `js/talkParse.js`, or Claude through the gateway) → typed steps or a proposal (`js/talkActions.js` `validate` / `checkPlan`) → a card you approve (Undo) → each domain's own write path, sealed with the family key.

### 12.1 Voice providers (built as a seam)
- **`VoiceInputProvider`**: audio → transcript.
  - Today it's the browser's speech recognition (`family/app.js` `listenNow`). It must start inside the tap.
  - Talk receives only a session `{ text, ended, error, listener, stop(), abort() }` and never touches the recognizer.
- **`VoiceOutputProvider`**: response text → audio.
  - It's `{ id, available(), speak(text), stop() }` (`family/voice.js` `browserVoiceOutput`: the phone's own speech synthesis, Apple's on-device voices on iPhone).
  - Talk takes it from its context (`c.voiceOut`), falling back to the browser one.
- **Voice never owns reasoning or state.** A provider turns sound into text, and text into sound. Validation, consent, privacy minimisation and writes stay in Pawmily.

### 12.2 External context adapters (built for weather, food and travel)
- Each adapter normalises its provider's answer into only the fields Pawmily needs. The allowlists are `CONTEXT` in `js/talkActions.js`, and tests check that every normaliser's output fits its allowlist:
  - `weather` / `daylight`: `dayWeather` ← Open-Meteo
  - `food`: `foodFacts` ← `js/dayPlan.js`
  - `travel` / `drive`: `travelFacts` ← `server/travel.js` ← Google Maps
- Provider objects never travel past the adapter.
- A missing provider (no key, offline, permission refused) leaves its facts out, and the answer says so.
- **Future adapters** follow the same shape: a provider call behind the connector, a normaliser, an allowlist entry and a test.
  - `places` is already inside `travel`.
  - `restaurantAvailability`, `media` and `books` would come later; Watch and Read already have their own server adapters.

### 12.3 Skills (design only)
- Possible future skills: Day Planner, Schedule Feasibility, Date Concierge, Household Triage, Health Planner, Media Librarian, Errand Optimizer.
- These are **bounded prompts, not agents**. Each gets a scoped context built on the phone from adapters (no database access), returns typed steps or a proposal checked by `checkPlan`, and keeps no state between requests.
- "Ask about my day" is today's Day Planner in this shape: `dayContext` → `talk.day` → answer and suggestions, each re-checked on the phone.
- A request that spans domains ("Can we visit the Rolex store and get dinner afterward?") becomes **one** plan card, not several agent replies.

### 12.4 Tool registry (built as `toolSpec`)
Every action in `ACTIONS` exposes, through `toolSpec(action)`:
- input schema (JSON Schema from `args`) and output (facts, a saved id with Undo, or a proposal id);
- required permission (the Family area the server already enforces);
- privacy class;
- read or write;
- confirmation: `none` for reads, `tap` for your own writes, `theirs` for anything touching someone else's time;
- failure behaviour.

A tool is added to the registry first. External callers (a future voice agent included) get registry tools only, never database access, and every write keeps Pawmily-side validation and confirmation.

### 12.5 Provider independence
- **Domain models** name no provider.
- **Claude** sits behind `server/aiGateway.js`. The model comes from settings; Gemini already backs some features.
- **Maps** sit behind `server/travel.js`.
- **Weather** sits behind `js/brief.js` / `dayWeather`.
- **Speech** sits behind 12.1.
- The UI works without each optional provider. With no Claude, the phone reader still handles everyday requests. With no Maps key, location or speech, those parts are simply left out.

### 12.6 A future ElevenLabs evaluation (design only; needs its own authorization)
- **First, a chained test:** ElevenLabs realtime speech-to-text (as a `VoiceInputProvider`) → the existing Pawmily orchestration → ElevenLabs streaming text-to-speech (as a `VoiceOutputProvider`).
- **Setup:**
  - The API key stays on the connector, which issues short-lived tokens or proxies the stream.
  - Audio would then go to ElevenLabs, so the privacy page and consent would change.
- **Measure:** latency, accuracy on household names (still swapped for roles before any AI), cost, and behaviour on iPhone.
- **Only after that,** consider letting an external voice-agent platform call tools. Start read-only, or with narrow proposal tools from `toolSpec` (`confirm: 'tap' | 'theirs'`). Pawmily validates and confirms every write. The agent never holds the family key or any private context beyond a tool's allowlist.
