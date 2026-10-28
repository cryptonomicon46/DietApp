---
description: Bring README.md, the in-app help guide and the tour up to date with every app feature in the code
---

Update README.md, the help chat's guide (server/helpGuide.js) and the tour (family/tour.js) so they fully and accurately describe OurPawmily as it is in the code right now.

1. Find what exists. Read the code, not just the old README:
   - family/app.js: every screen, tab, sheet and setting the user can reach.
   - js/: the trackers and shared logic.
   - server/*.js and server/README.md: every feature that needs the connector, a secret, or a scheduled job.
   - The git history since the README last changed (`git log -- README.md`, then `git log` since that commit), to catch what's new.
   - docs/ARCHITECTURE.md, family/privacy.html and family/terms.html, so the README matches them.
   - docs/OURPAWMILY_2_0.md and docs/BUILD_PROGRESS.md for what's built; docs/FUTURE_FEATURES.md is design only — never describe it as working.

2. Rewrite README.md for a non-technical family member, in this order:
   - What the app is (2-3 sentences) and how to open it.
   - A features section grouped the way the app is laid out: 🏠 Home, 💞 Us (and 🍿 Watch), 📅 Calendar, 📖 Threads (and 📷 Photos), 💪 Health, 💬 Chats, Me / settings. One line per feature: what it does and where to find it. Hidden or retired features (the old feed, news) are mentioned once as hidden, not described as working.
   - Privacy in plain words: what's end-to-end encrypted, what the server can see, which AI features send what to whom (Claude, Gemini), and that each is optional. This must match docs/ARCHITECTURE.md section 6 and privacy.html.
   - Features that need setup (API keys, Google Cloud switches), with a pointer to server/README.md rather than repeating the steps.
   - For developers: folder layout in a few lines, `npm test`, the CI "Check" workflow (a green ✓ on the latest commit means it's safe to run pawdeploy), and links to docs/ARCHITECTURE.md and server/README.md.
   - Mark anything unfinished or parked as "coming", not as working.

3. Rules:
   - Never include secrets, keys, tokens, household codes, invite or device links, account IDs, or real people's or family names. Use neutral names (Sam, Pat) in examples.
   - Don't describe features that aren't in the code. If unsure whether something ships, check the code; if still unsure, leave it out and list it in your summary.
   - Don't change any code. Edit only README.md, the text inside server/helpGuide.js (keep its entries, ids and exports) and the wording in family/tour.js (step 4), unless docs/ARCHITECTURE.md, family/privacy.html or server/README.md are clearly out of date, in which case say so and propose the fix.
   - Keep it scannable: short sections, tables or bullets, emoji used the way the app uses them.

4. Keep the help guide in step: server/helpGuide.js is what the ❓ help chat knows. Every screen name, button and path it mentions must match the app; fix any that moved or were retired.

5. Keep the in-app tour in step: family/tour.js holds the 📖 tour pages (and "What's new"). If features were added or changed, update the matching pages there in the same plain words. When the change is something existing members should hear about, give WHATS_NEW a new `id` and list the new things on its `new` page. Run `npm test` (tests/tour.test.js checks the pages).

6. When done:
   - Run `npm test` (it must still pass; tests/help.test.js and tests/tour.test.js check these files).
   - Show me a summary of what was added, removed or corrected, plus anything you weren't sure about.
   - Commit with a message starting "Docs:" on the working branch and push that branch. Merging to main deploys the site, so it needs my approval (see CLAUDE.md).

$ARGUMENTS
