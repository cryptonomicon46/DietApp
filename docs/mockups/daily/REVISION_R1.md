# Daily Health + Talk UX: design delta after the independent review (2026-11-01)

The review's verdict was **Approve with changes**: proceed with Release 1 (C + D + E), with F + H next. This file
records only what changed. Everything else in `CHECKPOINT.md` and `REVIEW_PROMPT.md` stands.

## Changes adopted

**1. Logging coverage (Part F, Release 2): no manufactured 100%.**
- "I'm done logging today" marks the *day's logging* complete. It does **not** change how many meals were
  expected.
- Version 1 reports facts:
  - meals logged;
  - days marked complete;
  - days with all three main meals logged.
- Below/at-target statistics count only well-logged days:
  - marked complete, or all three mains logged;
  - a snacks-only day qualifies only if it was marked complete.
- No coverage percentage until an explicit "skipped meal" state exists.

**2. Meal source metadata (Part H, Release 2): two fields, not one.**
- `sourceContext`: `plan | home | packaged | eatout`.
- `captureMethod`: `template | combo | manual | said | photo | again | quick`.
- `fitKcal` when the meal was fitted.
- "How often did I eat out?" reads `sourceContext`. Older meals without these fields stay valid.

**3. The meal sheet without duplicated actions (Part H, Release 2).**
- Prominent: **📦 Packaged** and **🍴 Ate out**.
- The source picker holds plan, templates, combos, smoothie, bar/shake and Same as yesterday.
- Photo, Describe, closest plate and Drinks live **only** inside Ate out.
- Low-carb and Save as combo sit in one small secondary row.
- The picker is an anchored panel capped at about 45% of the screen, scrolling inside itself.
- A logged meal opens on its current contents, and its main action is **Update meal**.
- Fit-to defaults to the plan's target and is remembered per person and meal slot only while that
  target is unchanged.

**4. Corrections accumulate (Part E, Release 1).**
- There is one canonical draft. Every correction, deterministic or AI, applies to the **current
  draft**.
- The AI fallback receives the current draft plus the new correction, never the original words plus
  only the latest correction.
- After a fallback the card highlights the changed rows and asks again. Nothing commits automatically.

**5. Listening is more patient (Part D, Release 1).**

| Silence | What happens |
| --- | --- |
| Under 2 s | Normal pause |
| About 2 s | "Still listening…" |
| **3.5 s** | Auto-finish (tunable; tune on the owner's iPhone) |

Also:
- No words at all for 9 s: "I didn't hear anything".
- 90 s in total: finish.
- **Done** finishes at once, and keeps any interim words.
- If iPhone refuses to restart on its own: no restart loop. Every word already heard is kept, and the
  screen shows **Tap to keep talking** (which appends) and **Done**.
- The microphone is off whenever a review card is showing.

**6. Confidence per area (Part F, Release 2).**
- Nutrition, weight, training and WHOOP each get their own confidence, based on fractions of the period
  (≥ 70% for strong; weight needs 3+ weigh-ins for a week).
- Partial data never hides exact facts:
  - "4 of 7 days were complete; on those, 3 were below target."
  - "Training: 3 strength sessions and 2 runs."
- At most three differences per comparison. Weight differences appear only with enough weigh-ins.

**7. Sync fingerprint = what the card shows (Part C, Release 1).**
- The before/after comparison covers the whole display model: `recoveryContext`, which holds every
  value and line on the card, plus today's WHOOP workouts (id, strain, minutes, kcal).
- If they're equal, the message is "WHOOP synced — no newer scores yet."

## Review answers adopted (Release 1)

- **Home order:**
  - greeting, then Talk;
  - **needs attention, only when something is urgent** (an overdue ask, an appointment within 2
    hours, or something marked urgent);
  - then **WHOOP + SYNC WHOOP**;
  - then Next up and the rest, unchanged.

  Routine household items never displace WHOOP.
- **Auto-sync on opening Home:** yes. It's the same 20-minute rule as Health, run after paint, through
  the one controller.
- **The SYNC WHOOP button** stays full-width under the card. After a successful sync it briefly reads
  **✓ WHOOP SYNCED**.
- **Stale data:** a plain line, "WHOOP data may be out of date · Last synced 6:42 AM", above the card.
- **Wording:**
  - "Couldn't refresh WHOOP. Showing your last synced data."
  - "WHOOP synced — no newer scores yet."
  - "Still listening…" and "Tap to keep talking".
  - "Review meal · not logged yet" and "Review workout · not saved yet".
  - The buttons: **Log meal**, **Create workout**, **Edit**, **Change by voice**, **Cancel**.
- **Spoken confirmation** counts only for a standalone confirmation: yes, yep, yeah, looks good, go
  ahead, log it, create it, save it, that's right. "Yes, but…" or "looks good, add avocado" is a
  correction. Bare "okay" and "sure" are not confirmations.
- **Phone-side corrections in version 1:**
  - **Meals:** change amount or unit, half or double, add, remove, change the meal, servings.
  - **Workouts:** sets, reps, weight, rounds, add, remove, superset two exercises.
- **Workout time** is shown only from the existing deterministic `durationFor`.
- **Drafts are in memory only.** If the app is killed, the draft is gone and nothing is written.

## Deferred (as the review recommends)

- AI phrasing of insights.
- WHOOP battery (the official API doesn't expose it).
- The "Recovery scored at" time.
- A meal-skip system.
- Any new tab.
- MCP / Muse / Agent Hub.
