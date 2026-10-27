---
description: Bring README.md up to date with every app feature in the code
---

Update README.md so it fully and accurately describes OurPawmily as it is in the code right now.

1. Find what exists. Read the code, not just the old README:
   - family/app.js: every screen, tab, sheet and setting the user can reach.
   - js/: the trackers and shared logic.
   - server/*.js and server/README.md: every feature that needs the connector, a secret, or a scheduled job.
   - The git history since the README last changed (`git log -- README.md`, then `git log` since that commit), to catch what's new.
   - docs/ARCHITECTURE.md, family/privacy.html and family/terms.html, so the README matches them.

2. Rewrite README.md for a non-technical family member, in this order:
   - What the app is (2-3 sentences) and how to open it.
   - A features section grouped the way the app is laid out: Family (Moments, Threads, Market, albums, news, Next up), Dogs & chores, Calendar, Us / Watch, Trackers, Me / settings. One line per feature: what it does and where to find it.
   - Privacy in plain words: what's end-to-end encrypted, what the server can see, which AI features send what to whom (Claude, Gemini), and that each is optional. This must match docs/ARCHITECTURE.md section 6 and privacy.html.
   - Features that need setup (API keys, Google Cloud switches), with a pointer to server/README.md rather than repeating the steps.
   - For developers: folder layout in a few lines, `npm test`, the CI "Check" workflow (a green ✓ on the latest commit means it's safe to run pawdeploy), and links to docs/ARCHITECTURE.md and server/README.md.
   - Mark anything unfinished or parked as "coming", not as working.

3. Rules:
   - Never include secrets, keys, tokens, household codes, invite or device links, account IDs, or real people's or family names. Use neutral names (Sam, Pat) in examples.
   - Don't describe features that aren't in the code. If unsure whether something ships, check the code; if still unsure, leave it out and list it in your summary.
   - Don't change any code. Edit only README.md, unless docs/ARCHITECTURE.md is clearly out of date, in which case say so and propose the fix.
   - Keep it scannable: short sections, tables or bullets, emoji used the way the app uses them.

4. When done:
   - Run `npm test` (it must still pass).
   - Show me a summary of what was added, removed or corrected, plus anything you weren't sure about.
   - Commit with a message starting "Docs: README", and push to main.

$ARGUMENTS
