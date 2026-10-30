# 🍽 Simpler meal logging — mockups (design only, nothing built)

Owner's ask (2026-10-30): the three icons on Health's next-meal row (📷 🎙️ 🍴) are confusing now that Talk
is how you speak meals. Simplify it. Let photos come from the photo library, not only the camera. Keep
manual entry for eating out, and macros for packaged meals.

Screens are in `screens.html` (`#row`, `#other`, `#photo`, `#photoest`, `#out`, `#pack`, `#alt`).
`node docs/mockups/meals/shoot.mjs` photographs them at 390 px, at 320 px and in dark mode
(`out/`, not committed).

## Proposal
1. **Health › next meal: two buttons, not four.** **✓ As planned** and **＋ Something else**. The meal
   chips stay as they are.
2. **"Something else" opens one sheet, "Log lunch"** (the meal can be changed), listing every other way:
   - **🎙️ Say what you had** (gold, first): opens Talk with the meal set. It replaces Tell me's mic.
     Talk already handles meals with **Plan it / ✓ Plan & log** and **✏️ Edit amounts**.
   - **📷 From a photo:** see 3.
   - **🍴 Ate out:** pick the closest dish and how much.
   - **📦 Packaged:** the only place where macros are typed.
   - Small links: **Same as yesterday**, **Drinks**, **Low-carb today**.
3. **Photo:** **🖼 Choose from Photos** (first) and **📷 Take a photo now**.
   - Today's picker forces the camera (`capture="environment"` in `family/meals.js`). The fix is
     two inputs, library and camera, as Look already does.
   - It asks which meal you ate, so a photo from earlier can still be logged.
   - The estimate comes back as foods you can resize, like Tell me's, with
     **✓ Plan & log / Plan it / ✏️ Edit amounts**.
4. **Ate out does one job.** "Snap the dish" moves to the Photo way. Small links stay:
   **📷 Have a photo?**, **🧾 Menu shows calories**, **🍷 Drinks**.
5. **Packaged:** label fields, servings, **📷 Snap or choose the label**, and **Save it for next time**.

**Alternative (#alt, not recommended):** **✓ As planned · 🎙️ Say it · ⋯** on the row itself. It's one tap
faster for voice, but it's three buttons again, and a ⋯ menu hides the photo and packaged options.

## Questions for the owner
1. Is **"＋ Something else"** the right wording? Other options: "Log it another way", "Something different".
2. **Yesterday for photos:** today's meal log covers today only. Logging into yesterday means editing a
   past day's log, which is more work. Recommendation: today only for now. Keep "Yesterday" for later.
3. **Tell me's typing box:** when voice isn't available, Talk already accepts typing. Remove Tell me as a
   separate sheet? (Recommended: yes. Talk is the one place to say or type a meal.)
4. **The Meals tab in the trackers (All meals ›)** stays as it is for deeper edits.

## What doesn't change
- Privacy: only the chosen photo goes to Claude, redrawn first, and isn't kept.
- What Talk sends.
- Where data is saved.
