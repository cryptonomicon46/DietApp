# 🗣️ Talk to Pawmily — Checkpoint T0 (design, stop for review)

**Status:** T0 only, authorized 2026-10-30 ("move on to the next phase, talk to pawmily").
- Built: mockups, plus the action list and its rules as tested code (`js/talkActions.js`, `tests/talk.test.js`).
- Not built: nothing is wired to a screen, nothing calls Claude, and there are no new routes. Nothing is deployed.
- Architecture: `docs/TALK_TO_PAWMILY.md`.

## 1. What the mockups show (`screens.mjs`, photographed in the running app at 390 px, 320 px and dark)

| # | Screen | The one likely action |
|---|---|---|
| T1 | 🗣️ Talk button in the header on every tab | Tap 🗣️ |
| T2 | Talk on Home: a text box, keyboard dictation, 3 examples for Home | Type or speak |
| T3 | Talk on Us: examples change with the tab | Add a movie |
| T4 | A book to Read, with "Recommended by Pat" | Add to Read |
| T5 | Several matches → the smallest question ("Which Dune?") | Tap one |
| T6 | "We're watching Severance now" → a status change, then Undo | Move to Watching |
| T7 | Date proposal: a plan, not a booking; both of you free (checked on the phone) | Propose to Pat |
| T8 | Pat's side, on Us: 🙌 I'm in · Another time · Can't | I'm in |
| T9 | Another time → Sam accepts or keeps the first time | Accept 7:00 |
| T10a / b | Both in → on the calendar automatically (A), or "Add to calendar" offered (B) | — |
| T11 | Compound: Watch + Calendar + proposal in one card, each step tickable | Do these |
| T12 | A meal, through the existing Tell me preview | Log lunch |
| T13 | Plan my day (T4): a proposal you can take or leave, with WHOOP as context | Looks good |
| T14 | Something it can't do: says so, and offers the nearest screen | Propose to Pat |
| T15 | First use: exactly what Talk sends | Got it |

## 2. What's built as code (`js/talkActions.js`, 8 tests)

- **21 actions** across Watch, Read, Us plans, Dates, Calendar, schedule, Home requests, dogs and chores, Fitness, Diet, Threads and Look.
  - Each names the domain that owns it, its kind (read / capture / coordinate), who it affects (self / couple / household / shared) and the existing code it reuses.
  - Each has a strict argument schema; the JSON Schema for Claude's structured output is generated from it.
  - The vocabularies are checked against their sources (Watch statuses, book states, plan kinds and replies, request kinds).
- **Checking a step:** unknown actions, unknown fields and bad values are refused, never guessed.
- **What Apply does** (`modeOf`):
  - read: changes nothing;
  - apply: saved, after the preview;
  - propose: anything involving someone else's time becomes an Us plan or a request, never a direct write;
  - open: Threads opens the composer, never posts;
  - unavailable: the saved-ideas list doesn't exist yet.
  - There is no action that puts an event on someone else's calendar.
- **A whole card** (`checkPlan`): at most 8 steps. A place, opening time or travel time must cite a fact from a lookup; an invented restaurant is refused.
- **Names stay on the phone** (`toTokens` / `fromTokens`): "dinner with Pat" goes out as "dinner with [partner]", and the name is put back in what comes back.
- **What each lookup may tell the assistant** (`CONTEXT`, `minimizeFacts`):
  - calendar: free/busy times only, never event titles;
  - Watch and Read: a few fields;
  - the Phase B WHOOP planning facts, as they are;
  - places and travel, for T3.
- **Examples** only offer actions that are built.

## 3. Decisions for you (the mockups use my recommendation; alternatives shown where they matter)

1. **Where Talk lives:** a 🗣️ button in the header on every tab (T1, recommended), or inside ＋ Create.
   - At 320 px the extra button makes the family name wrap onto two lines ("The / Pack"; see T11 at 320).
   - If you choose the header, I'd tighten the header buttons on narrow phones (≤ 360 px) so the name stays on one line.
   - Inside ＋ Create avoids that, but Talk is then two taps away.
2. **When both say yes:** keep today's behaviour, where the plan goes on the calendar automatically with Undo (T10a, recommended), or offer "Add to calendar" (T10b).
3. **Plan replies:** add *Another time* and *Can't* (T8–T9, recommended), alongside today's In · Maybe · Later, or replace Maybe and Later with them.
4. **Saved date ideas:** a small couple-only "Our ideas" list (recommended), or save ideas as undated plans. Until then, *Save idea* is shown as unavailable.
5. **"Recommended by Pat" on books** (T4): yes (recommended) or no.
6. **Places, opening hours and travel:** which providers, and what starting point is sent (an area, not your address). That's T3; until then plans say *your words* and nothing is invented (T7).
7. **A history of what you asked:** none (recommended), or a short private list on the phone.

## 4. Proposed next step after approval: T1

Single-domain requests that only change your own things, with no external providers:
- Watch: add, change status;
- Read: add, change state;
- Diet: log a meal;
- Fitness: use a workout, describe one, make it lighter;
- a dog walk or chore done.

Built as:
- the 🗣️ button and sheet;
- a new AI gateway purpose `talk.route` (your words with roles instead of names, plus the action list; per-person daily cap; audit without values);
- the phone checking every step here;
- each domain's own save path.

T2 (calendar and proposals), T3 (places and travel) and T4 (Plan my day) each get their own approval.
