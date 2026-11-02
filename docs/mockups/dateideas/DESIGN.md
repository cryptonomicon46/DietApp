# 💞 Us: dates from your calendar, and a better Date ideas deck

**Built 2026-11-02** (`v2/us-dates-ideas`; the owner approved the mockups and the suggested defaults below). The mockups stay as the reference. The mockups are `screens.html` (#dates, #isdate, #deck, #seen, #browse, #lists, #after, #uscard). `node docs/mockups/dateideas/shoot.mjs` photographs them at 390 px, 390 px dark and 320 px into `out/`.

Owner's request, 2026-11-02:
- A movie booked on the calendar should show under our date nights as upcoming.
- Date ideas isn't intuitive:
  - picking a movie and then moving on means tapping *Not for us*;
  - there is no *Watched*;
  - there is no easy way to page through.

## What the app does today (checked in `family/app.js`)

### ❤️ Dates › upcoming

It lists only plans made in the app: ✨ Suggest, 🧭 Plan an outing, and a match made into a plan (`us.plans`, `isUpcoming`). Calendar events are never looked at, so a movie booked through a ticketing site and added to Google or iCloud Calendar doesn't appear. The 2-2-2-2 chip keeps saying *date night due* even when one is booked.

### Date ideas (`ideasSheet`)

It shows one card at a time with three buttons.

| Button | What it does |
| --- | --- |
| ✕ Not for us | Hides the idea for 90 days. |
| ⏭ Later | Hides the idea for 2 days. |
| 💗 I'd love this | Picks it; the deck then moves on. |

Problems:
- There is no Back or Next. *Later* is the only way to move on without judging an idea, and it also hides it.
- There is no *Seen it* or *Been there*.
- *Later* is not a list you can come back to.
- Picks and matches only show up as a "Picked" button on the card.
- What you pass is kept per phone (localStorage), so a second phone shows the passed ideas again.
- Family or kids' events can reach the deck (e.g. a children's stage show).

## What recommendation and matching apps do (research)

**Couple-matching apps** use a Tinder-style deck. A *match* happens when both people swipe right, and matches go into a shared "to watch" list.
- *Matched* uses that flow ([App Store](https://apps.apple.com/us/app/-/id1623287922)).
- *Swatched!* adds a third direction: left is not interested, right is want to see, and **up is "seen it"** ([App Store](https://apps.apple.com/us/app/swatched/id1579291584)).

**Feedback guidelines** (BBC GEL, [Recommendations feedback](https://bbcbreakingnews.pages.dev/gel/features/recommendations-feedback)):
- Replace the item **straight away** once someone answers, because getting better recommendations is the main reason people give feedback.
- Keep **"I've already watched this"** separate from "don't recommend this". The first marks the item as played, since people watch things elsewhere.
- Always offer **Undo**.

YouTube follows the same pattern: *I've already watched it* and *I don't like it* are separate choices, and Undo appears right after you choose ([YouTube Help](https://support.google.com/youtube/answer/6125535)).

**Streaming apps** (Netflix, JustWatch and similar) give two modes, and people use both:
- **browsing:** rows or grids of posters, for scanning and comparing;
- **deciding:** one title at a time, with details.

They also keep the lists you made (*My List*) visible in one place.

## Proposal

### 1. ❤️ Dates › Coming up includes your calendars (#dates, #isdate, #after)

**What appears.** Events in the next 3 weeks from what the Calendar tab already shows: family events, linked calendars, and plans.

**Which events count automatically** (all decided on the phone): an event that includes both of you and looks like a date. It looks like a date when any of these is true:
- it is at a theatre set in Ideas settings;
- its title matches a movie the scout found;
- it looks like a restaurant booking (OpenTable or Resy wording);
- it is a show or concert;
- its title contains *date*, *dinner* or *movie*.

**Events that might be dates** (only on one calendar, or with no clear sign) get a one-time question: **❤️ Yes, date night** or **Not a date**. Every Calendar event also gets **❤️ Mark as date night** in its details.

**The 2-2-2-2 chip** reads *date night booked · Fri* instead of *due*.

**After the date:**
- it is counted as the date night, with Undo;
- *For you* asks *How was it?* (the existing ⭐ rating);
- a movie leaves Ideas and, if rated, goes to 📺 Watch › Watched.

**In the deck**, a scout movie already on the calendar shows **📅 Booked Fri** and is not offered again.

### 2. Date ideas: decide one at a time, or browse (#deck, #seen, #browse, #lists)

**🃏 One at a time** (default) has four answers, each moving on at once with Undo:

| Answer | Swipe | Meaning |
| --- | --- | --- |
| ✕ Not for us | ← | Hidden. |
| 👁 Seen it | ↑ | Never comes back. For places it reads *Been there*; for events, *Going / went*. Offers ★ Rate it → Watch › Watched. |
| ⏭ Save | — | Goes to the Saved list. |
| 💗 Want to | → | Your private pick; both picks = 💞 match. |

The card also has **‹ ›** to flip without answering, a progress bar, and *3 of 79 movies*.

**▦ Browse all** is a poster grid, 12 at a time, with **Show 12 more**:
- same tabs as the deck;
- a 💗 on each poster;
- badges for 💞 Match, 💗 Picked and 📅 Booked;
- *Hide seen*;
- tapping a poster opens it in the deck at that spot.

**Lists** sit above the deck:
- **💗 My picks**, private;
- **💞 Matches**, each with **📅 Make it a plan**;
- **⏭ Saved**.

**Saved state.** Seen, passed and saved move from per-phone storage into your own trackers, in the full copy and in no shared part, so they follow you to every phone and your partner never sees them. Picks and matches keep today's private match mechanism.

### 3. ✨ Ideas for Us card (#uscard)

- Matches come first, with **📅 Make it a plan**.
- A swipeable poster row replaces the three text rows.
- One button opens the sheet: **💡 Find a date idea · 93 this week**.
- Kids' and family events are left out of date ideas.

## Privacy

Nothing new leaves the phone:
- Calendar matching uses what the Calendar tab already shows and runs on the phone.
- Date-night marks, Seen, Saved and passed are kept in your own encrypted trackers, outside every shared part.
- Picks and matches use today's HMAC tokens.
- No AI is involved.

## Suggested build order (each front-end only unless noted)

1. **Dates from your calendar:**
   - Coming up, including calendar events;
   - the date-night question and *Mark as date night*;
   - the *booked* chip;
   - after-the-date counting with Undo;
   - 📅 Booked in Ideas.
2. **The deck:**
   - four answers with Undo;
   - ‹ › and swipe;
   - the Saved list and the three lists;
   - Seen/passed/saved synced in your trackers, carrying over what this phone already passed.
3. **Browse all and the Us card:**
   - the poster grid;
   - the poster row on Us;
   - the kids' filter. The filter needs the scout's event categories. If the scout doesn't already tag them, that part is a Worker change and needs `pawdeploy`.

## Decisions for the owner

1. **Automatic counting.** Should a date-like event for both of you count automatically, or should every calendar event be asked about once?
2. **After the date.** Should the date go onto the 2-2-2-2 by itself (with Undo), or wait for you to rate it?
3. **Seen it.** Should Seen it on a movie also offer to add it to 📺 Watch › Watched (as drawn), or just hide it?
4. **Default view.** Should the sheet open on One at a time (as drawn), or on Browse all?

## As built (differences from the mockups)

- **Decisions**, using the suggested defaults:
  - a date-like booking for both of you counts by itself; others are asked once;
  - the day after, it's counted automatically, with Undo;
  - 👁 Seen it on a movie offers ★ Rate it into 📺 Watch › Watched;
  - the sheet opens on 🃏 One at a time.
- **Swipe.** Only → (want to) and ← (not for us). An upward swipe would fight scrolling the sheet on a phone, so 👁 Seen it is a button only.
- **Booked movies.** A booked scouted movie is out of the deck. After the date is counted it's marked seen.
- **Kids' filter.** It uses the tags the scout already sends (Ticketmaster's *family* segment) and title words. No Worker change was needed.
- **Code location.** The screens are drawn by `family/ideas.js` (it loads with Us), so start-up stays within the script budget.
