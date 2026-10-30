# OurPawmily

**A private family app for a couple, their kids and their dogs.** Everyday family life in one place: who fed and walked the dogs and did the chores, the dogs' appointments and health records, a shared calendar, plans and notes for each other, threads and family albums, and each person's own food and training. You sign in with Google, your family's content is end-to-end encrypted on your phones, and it runs in the phone's browser — add it to the Home Screen and it works like an app.

**Open it:** the app is at `/family/` on the site (the Home Screen icon opens it). Tap **Continue with Google**, accept the terms, and create a family or open an invite. **Try it on this phone (demo)** runs everything on the phone without an account.

## What's in it

The bottom bar has five places: **🏠 Home · 💞 Us · 📅 Calendar · 📖 Threads · 💪 Health**. 💞 Us shows only for a couple. 💪 Health shows when the family manages diet & fitness: your Diet and Fitness on one calm screen, with the detailed food and training screens a tap away. Along the top right: **💬** your chats, **❓** help, **＋** creates anything, and **Me** (your picture). 🍿 📺 Watch is the first thing in 💞 Us.

### 🗣️ Talk to Pawmily
Say or type what you'd like done instead of finding the screen for it. On 🏠 Home it's the golden **Talk to Pawmily** bar under the greeting; on Us, Calendar, Threads, Health, Watch, Read and Look it's a small gold circle at the bottom right, which slides away while you scroll down or type and isn't shown in busy screens (Fitness, chats, Me). Tapping either opens the Talk sheet **already listening** — just speak: your words appear as you say them, and when you pause Talk reads the request (*Done* stops early, *Type instead* opens the box; 🎤 in the sheet listens again). Listening uses your phone's own speech recognition — on an iPhone Apple's speech service turns your voice into text, as with Siri dictation; on Android Google's — and OurPawmily only receives the text, never audio. Where the browser can't listen, or if you choose *Don't listen when I open Talk*, the box opens for typing (or the keyboard's 🎤). Example phrases for the tab you're on fill the box when tapped.
- **What it can do now:** add a show or movie to your watchlist (*"Add Dune to our watchlist"*) or move one (*"We're watching Severance now"*, *"We finished The Bear"*); add a book (*"Add Project Hail Mary to our reading list — Pat recommended it"*, which records *Recommended by Pat* on the book) or move one (*"I'm starting Piranesi"*, *"I finished reading Piranesi"*); log a meal (*"Log lunch: chicken bowl and an iced latte"* opens 🎙️ Tell me already read); describe a workout (opens Describe it, read); *"Make today's workout lighter"* (its preview); and dogs and chores (*"Walked the dog"*, *"Fed the dogs dinner"*).
- **You always approve:** each request becomes a small card — the show with *Show / Movie*, the book Open Library found (several matches → *Which book?*), *Severance: Want to Watch → Watching* — and nothing changes until you tap it. Then the sheet closes, you stay where you were, and the message has **Undo**.
- **Private by design:** your phone reads everyday requests itself. Only what it can't read goes to Claude, and then only your words, with people's names swapped for roles (*"for Pat and me"* → *"for [partner] and me"*), the tab and today's date — never your watchlist, books, plans or anything else; your lists are matched on the phone. Nothing you said is kept. Without Claude on the connector, the phone's own reading still works.
- **Questions about your day:** *"What's on today?"*, *"What's Pat up to today?"*, *"When's the best time to go for a run?"*, *"What's my meal plan for the rest of the day?"*, *"How's my recovery?"* — the first time, Talk asks before it sends anything: to answer, your phone sends Claude today's and tomorrow's calendar as the Calendar tab shows it (times, titles, places, whose — names swapped for roles), the free time it worked out, the forecast for your area (every 2 hours, with sunrise and sunset), your own WHOOP numbers when WHOOP is connected (Sleep %, Recovery %, Strain), and your own food today when you use Diet (your meal plan, what you've logged and what's left — never your weight). When the question is about going somewhere (a place you name, a Movement gym, or a place on your calendar), it adds drive times from where you are with Google Maps' live traffic, and the place's opening hours; your phone asks for your location the first time (rounded to about 100 m, never kept), and the answer has a 🚗 *Directions ›* link that opens Google Maps. Without location, it leaves room for the trip and says so. The answer is a few lines (*Open Calendar ›*, or *Open Health ›* for food and WHOOP questions), and suggested times come as cards — only ones that fit a free gap your phone found — with **Add to my calendar** (your calendar only) and Undo.
- **Not yet:** proposing plans to someone else, places and travel times, bookings and *Plan my day* are later steps; Talk says so and suggests what it can do.

### 🏠 Home
A greeting with today's date on top (*Good afternoon, Sam. Here's your Wednesday, October 28.*), the golden **🗣️ Talk to Pawmily** bar, then everything the household needs today. On a wide screen (a Mac, or an iPad held sideways) the dogs sit in a second column.

| Feature | What it does |
|---|---|
| **✨ Next up** | The one thing to do next and when — a run at the best free hour, calling Mom in her window, a class, new episodes when you're both free — with *Why?*, *Today's plan*, and an optional nudge 30 minutes before. Worked out on the phone. For whoever it's set up for, 📞 the call-Mom line sits at its bottom. |
| **🔔 Needs you** | What's waiting on you: a hand someone asked for (*I can help*), one you said you'd give (*✓ Done* or *Can't now*), a dog ride nobody's driving this week (*I'll drive*), a thread you're tagged in. Then your own 🙋 requests (*✓ Sorted*, ✕) and **🙋 Ask for a hand**. |
| **🛒 Groceries** | One list for the household: type *milk, eggs, bread* to add three, tap to tick, *Clear* what's in the cart. Everyone in the family sees the same list. |
| **🏆 Gold Card** | The month's chore race: points, streaks, and the prize. In the first week of a month, the last month's winner is on top. |
| **🎬 Movies** | Opt-in (Me › 🎬 Movies): what's in theaters with critic and audience scores, what's coming, where it's streaming, and 🔔 alerts for the ones you're waiting for. |
| **🏠 The house** | Who cooked, did the dishes, laundry, garbage, groceries, cleaning — log for yourself, your partner or both. |
| **🐾 The dogs** | Feed, walk, dog park, treats and meds; ⭐ golden days; 🦮 the best time to walk (with pavement heat); a row of the dogs (tap one for its page) and ＋ Add a pet. |
| **More about the dogs** | Folded away until you open it: 💉 vaccines due, 📅 appointments (with who drives each way, and dog appointments found in your linked calendars), how happy the dogs are, the dog cards and 💰 spending. |
| **📌 Pinned** | The family's pinned threads. Then the Hall of fame (past Gold Card winners). |

### 📖 Threads
| Feature | What it does |
|---|---|
| **📖 Threads** | Write-ups read and answered in your own time: Learned, Talk, How-to, Ask (with ✓ Best answer) and Poll — for just you two, the family, or friends' families. Add 📷 screenshots (plan comparisons, tables…) and 📎 PDFs (a benefits deck…), 🏷️ tag people with @, see who's seen it (the people you tagged first), see tags and anything new first in ✨ For you, and 🗂 move a thread to another board (or a board of your own) any time. 🔎 Search every thread (on your phone only), ☆ Save the ones to find again (★ Saved), ✎ edit your own replies and add up to 4 📷 images to a reply. The 💡 App feedback board is for ideas and problems with the app; 📮 *Send to the app's developer* shows exactly what will be sent before anything goes. ⋯ on someone else's thread or reply: 🚩 Report or ⛔ Block. |
| **📷 Photos** | The family's own albums: link a shared Google Photos album, copy photos in from your phone or pick them in Google Photos. Family only. |

### 💬 Chats
| Feature | What it does |
|---|---|
| **💬 Chats** | Instant messages between the grown-ups in the family: one to one, and a **👨‍👩‍👧 Grown-ups** group when there are three or more. Emojis, reactions, replies, photos, screenshots and PDFs, *typing…*, ✓✓ read and *Seen by*. Never pets or kids: only people with their own account, not added as a child and not under 18 by their birthday. The 💬 at the top right (with a count). Tap someone else's message to 🚩 Report or ⛔ Block. |
| **🛒 Market** | *Coming:* sell, give away, lend or ask for things with your family and friends' families, with a lending library and "wanted" matches. |

**Gone in 2.0:** the Moments feed (old posts are kept on the server, not deleted; a read-only *Settings › Old posts* comes later), 📰 News and 🐶 Rescue news (hidden), and the ❤️ health meter (retired; what people saved is untouched). 

### 💞 Us (just the two of you)
Top to bottom: **📺 Watch** (what you're watching and what's next, one tap to log an episode), **📚 Read** (what each of you is reading or listening to right now), what's waiting for your answer, **❤️ Dates** (plans you answer 🙌 / 🤔 / ⏰, the 2-2-2-2 rhythm, ✨ Suggest, 🧭 Plan an outing, ❤️ Log a date), **✨ Ideas for Us** (a few curated movies, new restaurants and events — 💗 privately, matches become plans, 💬 Discuss any of them), **💌 Notes**, and a link to 📓 your notebook in Threads.

### 📅 Calendar
A shared month view with everyone's events, ⭐ golden days, ❤️ dates, 🐾 appointments and 💞 plans; repeating events; linked iCloud / Google calendars (read-only); a small **👔 Today's Look** card under today's events (*Dinner at 5:30 PM · Cool evening · 52–66°F · 3 looks ready → View Looks*); reminders.

### 📺 Watch
First in 💞 Us: "2 watching · 3 want to watch", the shows that matter tonight (🆕 new episodes first, then what you're watching, then ⭐ Up Next), each with one button — **＋ Episode** (or **✓ Watched** for a movie) — and **Open Watchlist →**. Every show is in one of three places: **Want to Watch → Watching → Watched**. ⭐ Up Next just puts something first in Want to Watch. Tap a show for its details: where you're up to, your ★ rating, history, 💬 Discuss, 🎲 Bingo, and under *More*: share or keep private, ✋ Drop, delete.

### 📚 Read
Second in 💞 Us, right under Watch: for each of you, what you're reading or listening to right now (*🎧 Fourth Wing · 63%*, *📖 Project Hail Mary*), your **Want to Read** count, **Open Books →** and **＋ Book**.
- **＋ Book:** type a title, author or ISBN, pick the book, then **📖 Reading**, **🎧 Listening** or **Want to Read** (or *Already finished it*). Details (author, cover, series and its number, genres) come from Open Library — nothing to type. Can't find it? *Add it by hand* (title and author).
- **One book, each of you your own way:** the same book can be 🎧 Listening · 63% for Pat and 📖 Reading · 28% for Sam; nobody's status or progress changes anyone else's. Progress is optional — a %, page, chapter, or minutes into an audiobook.
- **Books** (*Open Books →*): **Reading** (by person), **Want to Read** (yours first) and **Finished** (by year; ✋ Dropped tucked underneath). Tap a book: your status (Want to Read · Reading · Finished), 📖 / 🎧 / both, how far, ★ when finished, and **💬 Discuss** — one just-you-two thread per book, reopened every time. **⋯** has ✋ Dropped, who sees it (**Only me · Us two · Family** — the two of you by default; it can change only while nobody else has the book on their list), series / narrator / audiobook length, *Take off my list* and delete.

### 💪 Health
Your day in one calm screen, private unless you share it. **Today** comes first — three things, always in this order — then the rest:
- **⚖️ Weight:** a box for today's weight and **Save** (it goes into your trackers, so 🍽 Meals and ⚖︎ Weight have it), or *Weight ✓ 163.0 lb* once it's in.
- **🍽 Food:** the next meal — *Lunch is next · Ground beef & rice · 598 kcal* — with **✓ As planned** (one tap logs it), **📷** (a photo), **🎙️** (Tell me) and **🍴** (Ate out). Tap the meal to open it (below).
  - **After a bigger meal than planned** (a restaurant lunch, say), until the next meal's time it says *Plans change. You have ~850 kcal and ~55 g protein left today* — or *Today is at its calorie target · about 60 g protein to go* — with **Adjust the rest of today** (your remaining meals, already re-fitted to what's left, and other options) and **What fits?** Your targets never change here; nothing is called over or failed. At the next meal's time it's that meal again, *re-fitted to what's left*.
  - **Once breakfast, lunch and dinner are in:** *3 meals logged · 1,610 kcal · 151 g protein* with **✓ Done logging today** (tells your weekly check-in this day is complete) and **＋ Add** (a snack or drinks).
- **🏋️ Workout:** today's workout with **Start workout**; once started, *3 of 5 exercises · 9 of 15 sets* with **▶ Resume**; once finished, *Lower body · done · 52 min · 15 sets* with **View summary** for the rest of the day; or **＋ Add workout**.
- **One quiet "Next:"** beside *Today* says the most useful thing for the time of day — *log today's weight* in the morning, *lunch* around lunchtime, *resume Lower body* during a workout, *finish today's log* in the evening — and that row is gently highlighted. Only one, never a list or a streak.
- **⌚ WHOOP** (only when WHOOP is connected on this phone, between Today and Nutrition & plan): WHOOP's look for WHOOP's data — its dark card, *Data by WHOOP*, and three rings in its order and colours: **Sleep** (sleep performance, *72%*, *5.9 h of 8.1 h* under it), **Recovery** (*31%*, the ring in WHOOP's green, yellow or red) and **Strain** (*3.1* on WHOOP's 0–21 scale, *yesterday 14.2*). **Tap a ring** for what's behind it: *Recovery* — heart rate variability, resting heart rate, respiratory rate, sleep performance, blood oxygen and skin temp, each beside *your usual* once there are 14 days; *Sleep* — bed and wake times, the stages (awake, light, deep, REM), hours against what WHOOP says you needed and why (baseline, sleep debt, strain, naps), sleep consistency, efficiency, respiratory rate and disturbances; *Strain* — today so far (*updated 10:42 AM*), calories, average and max heart rate, steps, and today's WHOOP workouts with their heart-rate zones (WHOOP gives zones per workout, so the total is your workouts', not the whole day), each marked *✓ in Fitness* when it matched a workout you logged. While Health is open, Strain and today's workouts refresh every 5 minutes. Then one calm line: *Recovery is lower than your usual*, *in your usual range*, *higher than your usual*, or, until there are 14 scored days, *Building your usual range — 9 of 14 days so far*. Your usual is the middle half of your own last 30 days; days WHOOP hasn't scored, couldn't score, or is still calibrating don't count. Before WHOOP has scored today it says *Not scored yet* — never yesterday's number. **Last 7 days ›** lists each day's Sleep, Recovery and Strain. When Recovery is lower than your usual (or the night was much shorter than WHOOP says you needed) and there's a workout today, **🪶 Make today's workout lighter** shows exactly what would change — *Bench Press 3 sets → 2 · Rows 3 sets → 2 · about 15 → 10 min, same weights and reps* — with **Apply** or *Keep original*. It's for today only (saved workouts never change) and **Undo** stays on the card. WHOOP informs; it never changes your plan by itself. A connection made before Recovery and Sleep were asked for shows *Reconnect WHOOP* here instead (workouts keep syncing). Opening Health brings in what's new from WHOOP (at most every 20 minutes); nothing updates while the app is closed.
- **Nutrition & plan:** *1,240 / 1,950 kcal* and *112 / 150 g protein* (and *Includes 250 kcal from alcohol* when there is some), your plan's phase and week with its status (✅ On track, ⏳ Slower than planned, ⚡ Ahead of plan or 🌱 Too early to tell — see *Plan progress* below), how many complete days you've logged this week, and **Today's plan ›**, which opens 🍽 Meals.
- **More:** ⚖️ *Weight trend* (with the last 90 days as a little line), 🔔 the morning weigh-in reminder (a calm 7 AM notification with no numbers in it, until you weigh in), and ⌚ *Devices*.

**A meal, on one screen.** Tapping a meal opens it: its foods with their grams (− / ＋ or type; the other foods re-size to keep the meal balanced), its calories, protein, carbs and fat, and what's left today. Then **✓ Log as planned**, and **📷 Photo · 🎙️ Tell me · 🍴 Ate out**. Everything else is under **More**: 🔁 *Same as yesterday*, ✏️ *Quick macros*, 📦 *Packaged*, 🍷 *Drinks*, 🥑 *Low-carb today*, ↩︎ *Unlog*, and *Swap foods, combos and more in Today's plan ›*. Health and 🍽 Meals use the same plan and the same numbers.
- **🎙️ Tell me:** type — or tap the 🎤 on your phone's keyboard and say — *"two eggs, two slices of sourdough, half an avocado and coffee"*. Your phone reads everyday foods itself; anything it can't place (*3 slices of pizza*) is read by Claude from **the words only** (never audio — the keyboard turns speech into text before OurPawmily sees it). You always see what it got, item by item, to check, remove or edit before **Log**.
- **📷 Photo:** a plate, a restaurant dish, a nutrition label or a menu with calories. Claude makes a rough estimate — shown as one, item by item, with *Portion: Light · Regular · Large* and *How much you ate: All · Most · Half* — and nothing is logged until you tap **Log**. A label comes back as a 📦 packaged meal for one serving (choose ½ · 1 · 1½ · 2 servings, and save it for next time). The photo is never kept.
- **🍴 Ate out:** where (optional), **📷 Snap the dish**, or pick what's closest (12 typical restaurant dishes) with portion and how much you ate, or *Menu lists calories*.
- **✏️ Quick macros:** protein, carbs and fat (± 5 g or type); calories work themselves out (or type them).
- **🍷 Drinks:** red, white, beer and a cocktail with − / ＋ counts, a wine pour (5, 6 or 9 oz, remembered), or *Something else* (name and calories). With a meal or on their own. Alcohol counts in your calories but **apart from protein, carbs and fat**, and the day shows how much of it was alcohol.
- **What fits?** Three ideas for what's left today, ranked on your phone from your planned meals, saved combos, packaged meals and meals you've had recently — when calories are used up but protein isn't, light protein-first ones (Greek yogurt, a shake, tuna). *Use for dinner* makes it your dinner plan; you log it when you eat.

**🏋️ Fitness** (*Fitness and history ›* from the workout, or the workout row):
  - **＋ Add Workout**, each with a line saying what it's for: ✍️ **Build it** (pick the exercises, sets, reps and weights yourself) — a set for each round, each with its own reps and weight (12 / 12 / 11 / 11 reps, or 40 / 45 / 50 lb), straight sets, 🔗 supersets and 🔁 circuits with any number of rounds, bodyweight, timed (plank 45 s), distance (row 500 m) and **each side** (lunges, step-ups); 💬 **Describe it** and 📷 **Photo** (below); a saved workout; and *📋 From my program* when the program is on. Building says *This becomes Today's Workout* and ends with **▶ Start now**, *Save for later today*, or **✓ Log as done** (you already did it: every set is recorded as planned, and you can change any of them in history).
  - **Names:** a workout gets a suggested name from its exercises — *Upper body circuit · 4 rounds*, *Lower body · 5 exercises* — shown as you build it; type your own instead, or rename it later from history.
  - **📋 Lifting program (optional):** until you choose it, Fitness shows only a quiet *Set up a lifting program*. It's the full-body, 3-days-a-week program (see *Train* below); once it's on, *📋 From my program* makes the next program day (e.g. *Day B · Moderate · Week 2*) into Today's Workout, with each exercise's rep range, reps in reserve, rest and a suggested weight from what you last lifted. Finishing it moves the program on.
  - **Today's Workout** (*‹ Fitness* at the top): the plan — each exercise and set, the rounds, any notes — with **Start Workout**, *Edit* and *Remove from today*.
  - **Train** (*‹ Today's Workout* at the top): doing it, set by set or round by round. Each exercise shows its plan and **last time** — *Plan 3 × 8 @ 40 lb · Last time 40 × 8, 40 × 8, 40 × 7* — so you don't have to remember. Each set shows the plan; tap ✓ to record it as planned, or type what you actually did first. **✓ All sets** (or *All rounds*) ticks an exercise's open sets as planned, and **✓ Log remaining sets as planned** (at the end) first lists exactly what it will record; both have **Undo**. A finished round folds into one line — *Set 3 — 8 × 135 ✓*, with *(plan 10 × 135)* beside anything that differed. **⏱ Rest timer** (off unless you turn it on; remembered on that phone) starts when you tick a set — after the whole round in a superset or circuit — with *+30 s* and *Skip*; it shows only while the app is open. Leave any time: what you've logged is kept (on your phone too, locked like the rest), and 💪 Health shows **Resume**. **Complete workout** opens a short summary — time, sets, pounds lifted, any 🏆 new best — and, when you did every planned set of an exercise at the planned weight, *Try 140 lb next time?* (**Accept** or *Keep 135*; +5 lb, or +10 lb for squats, deadlifts and other big leg lifts). Accepting only changes the next time you do that exercise and your saved copies of it; nothing changes otherwise.
  - **History:** strength and circuit workouts — yours, your older lifting-program sessions and device workouts that are lifting or circuit style — each showing what you did set by set (and the plan where it differed), with **Rename**, **🔁 Do it again today** (what you actually did becomes the new target) and *Save it*. Other device activity (runs, rides, climbing…) isn't listed: one quiet line says how many there were in the last 30 days. They still sync and still count in your Diet calories.
  - **⌚ With WHOOP:** a finished workout's summary (and its history entry) shows the WHOOP workout that goes with it — *strain 9.8 · 330 kcal · avg 117 / max 158 bpm* and a bar of time in each heart-rate zone. A workout you started and finished in the app takes the WHOOP workout it overlaps; one you *Logged as done* takes the WHOOP workout of the same day that ended closest to when you logged it — never one from another day. *Not this one?* lets you pick another from that day or *None of these*. Until WHOOP has scored it: *Waiting for WHOOP…*. The matched WHOOP workout isn't listed again in history, and its calories count once in your Diet (from WHOOP, as before). These workout numbers are Fitness, shared as your Fitness is.
  - Your workouts are locked on your phone and stored as two records of yours — Today's Workout (with saved ones) and your history — readable only by you and whoever you share your Fitness with. Saving on two phones at once never overwrites a newer copy.
- **Who can see it:** the line under the title (*🔒 Private*, or *Shared: Diet with Pat*) opens two switches for each person — **Diet** and **Fitness**, separately. Only you can change them.

The detailed screens are each person's **🍽 Food** (Meals, Weight and Groceries — meal plans with exact portions, logging, weekly check-ins, plan progress, groceries with barcode scan) and, signed in, **Activity** (the day's activities and training calories, runs, rides, climbing). The header of every tracker screen says where you are — *‹ Health · Meals* — and takes you back to 💪 Health. Details in *The trackers, in detail* below.

### 👔 Look
What should I wear today? From clothes you actually own — and you don't have to catalog your wardrobe first. Look is its own screen (from the Today's Look card on 📅 Calendar, or on 🏠 Home when there's something for today), with **Today · Closet · Saved** at the top and *‹ Calendar* (or *‹ Home*) to go back.
- **Start with a Look you already wear.** *Add a Look*: a photo of a whole outfit — a mirror photo, a full-length one, an outfit laid flat or one you already have — a name (*Dinner Look*, suggested) and, if you like, what it's for (Work, Meeting, Business casual, Smart casual, Dinner, Date, Other). Save it and it's usable straight away. Then *Build your Closet from this?* **Find pieces** — or **Not now**, which is fine.
- **Find pieces:** first it says it *sends only this photo to Claude to find the pieces*. Each piece comes back cut out — *Navy blazer, Light-blue Oxford, Charcoal trousers, Brown loafers* — for you to keep, rename or skip; something small or half hidden says *Possible watch — check it* instead of guessing a model. If a piece looks like one you already have, it asks: *Looks like your Navy blazer — Use existing / Add new*; nothing is merged or added without you. You can also **mark a piece yourself** by dragging a box over it (and that's what happens when Claude isn't set up).
- **Add an item:** photograph one piece (laid flat or against a plain wall works best). The background is removed on your phone — no other app needed — and you get *Looks like Light-blue Oxford* with its colour, kind and how dressy it is: **Looks right** or **Edit**. When the background is too busy it says *Couldn't clean this image perfectly* — **Use original**, **Try again** or **Retake**; you can always save. One tap says what it is (top, bottoms, jacket, shoes, watch, accessory, dress). **✨ Name it with Claude** sends just that cut-out picture; once you've used it, the next pieces are named the same way (it says so). Watches are first-class pieces.
- **Today:** a short line for the day (*Thu, Oct 29 · Dinner at 5:30 PM · San Jose · 52–66°F*, with *Dinner* and *Smart casual*), then the best Look as a large **flat-lay of your own pieces** (or your outfit photo), its name (*Navy Dinner*), one line on why it works, **Wear this**, and **⇄ Swap · ☆ Save · ❤️ Ask Pat**. *Other good options* — two more — scroll sideways. On a wide screen the day, Fit Checks and a Closet shortcut sit on the right.
- **Swap:** only the kinds in that Look (Shirt, Jacket, Trousers, Shoes, Watch); pick another and the board changes at once, with **↶ Undo**; *No watch* is an option. Also *Warmer, Cooler, More casual, More formal, Different shoes, Different watch, Surprise me*, and *Not today* or *Not my style*.
- **Wear this** remembers the Look, the day and its pieces (last worn, times worn), shows *✓ Today's Look · Navy Dinner — have a good night*, and counts as a strong "yes" for next time. **Saved** keeps the Looks you like (*Navy Dinner · Last worn Oct 18 · Wear again*); wearing the same thing again is good data, not a problem.
- **How it decides** — on your phone, nothing sent: today's events (the most dressed-up one decides: a client meeting, dinner, a date…; only a short label is shown, never the event's title), the weather where the calendar puts you (feels-like when you leave, later, rain), how dressy each piece is and how warm, colours that go together, what you wore lately, your Saved Looks, Fit Check answers, and what you've chosen before (worn, saved, swapped, more casual, not my style). No style quiz.
- **❤️ Ask Pat — Fit Check:** send the Look (or two to compare, A vs B) with an optional message (*Dinner tonight — what do you think?*). *Only this Look will be shared* — not your Closet. Pat gets a notification and sees *Fit Check · Sam is considering this* with **🔥 Hit** or **🙈 Miss** (or **A / B / Neither 😬**); a Miss can say what's off (shoes, jacket, watch, colours, too formal, too casual, not my style) or be *Just Miss*. You see *🔥 Pat says HIT → Wear this*, or *🙈 Miss — shoes → Fix it*, which re-ranks today's Looks around it. *💬 Discuss* opens a thread about it only if you want one. Fit Checks last two weeks.
- **Closet:** your pieces as a picture grid (thumbnails, loaded as they scroll into view), search, and filters for only the kinds you have (All · Tops · Bottoms · Jackets · Shoes · Watches · Accessories). Tap a piece to edit it (name, kind, colour, how dressy, warmth; optional brand, model, material, size, notes), mark it unavailable (at the cleaner's), make it a favourite, or delete it — a deleted piece never comes back in suggestions, but Looks you wore keep showing it.
- **Private:** your Closet, its pictures, your Saved Looks and what you've worn are yours alone — not your partner's, not the family's creator's. In an encrypted family they're locked on your phone first.

### ❓ Help and the tour
The **❓** at the top of every screen (and **Help** at the foot of the sidebar on a Mac) opens Help: **📖 Take the tour** (one page per area, with *Show me* to jump there), **✨ What's new**, **🧭 This screen**, and the help chat. Someone who's just created or joined a family sees a welcome and the tour once, then a *New here?* card for a week; after an update with new features, everyone else gets one *What's new* card. Empty screens link to the page that explains them.

### 👤 Me
Your family and its people and pets, privacy (💪 who sees your Diet and your Fitness, separately), ⛔ Blocked (unblock people here), 🔐 encryption, 📲 add a device, 🔑 recovery phrase, 🔔 notifications, 🌗 appearance, 💬 help, and your account (download your data, delete your account).

## Privacy in plain words

- **Sign-in:** with Google only, and only for an email Google has verified.
- **End-to-end encrypted:** posts, photos, comments, notes, plans, threads, chat messages, albums, everyone's diet & fitness, the dogs' details and appointment notes, calendar events and ratings are locked on your phone with your family's key before they're sent. The server stores text it can't read.
- **What the server can see:** names of people and pets, who's in which family, the chores log and Gold Card, games, dates and drivers of appointments, who's chatting with whom and when (and reactions), and when things happened.
- **Your keys:** live only on your family's devices. A new device gets them from an invite link, **📲 Add a device**, or your **🔑 Recovery phrase**. Treat those links like passwords.
- **Photos and PDFs:** each file remembers who uploaded it. Only that person or the family's creator can replace or delete it, and threads, albums, chats and listings only take files you uploaded yourself. A friends' family can open a file only through the shared thread or post it's on, never one that tags someone your family keeps private, and nothing once the families disconnect.
- **🚩 Report and ⛔ Block:** on someone else's thread or reply (⋯), or a chat message (tap it). A report hides it for you and the family's creator sees a count; a chat report keeps only which message and why, never what it says. Block hides that person's threads, replies and chats. Unblock in Me › Blocked.
- **AI features:** every one is optional, and none of them gets your family's keys. Every request goes through one checkpoint on the connector that sends only the fields that feature needs, sends personal content only to Claude (never a free service that may train on it), limits how many a day each person can make, and keeps a 30-day note of each request without its content.

| Feature | Who answers | What's sent |
|---|---|---|
| 💬 Help | Claude (Anthropic) | Your questions; to help with your account: your name, email, family and member names |
| ✨ Tidy it up (Threads) | Claude | Only the text you tap it on |
| 💬 Describe it (Fitness) | Claude when you tap *✨ Read it with Claude*; your phone when you tap *Read on this phone instead* (or offline) | The words you typed and your weight unit — nothing else |
| 📷 Photo (Fitness) | Claude, only when you tap *Read it* | That one picture, redrawn on your phone (no location or camera details) and your weight unit; not kept |
| 📈 Ask about my plan (Meals) | Claude, only after you've seen *Sends your plan numbers and your question to Claude* | Your plan's numbers only — phase, week, targets, a 7-day summary (days logged and on target, average calories and protein), the trend, the planned rate, the goal date, how many days you trained — plus your question and this chat's earlier questions and answers. Never your name, meals, notes, weights or anyone else's data; nothing kept |
| 🎙️ Tell me (Health) | Your phone first; Claude only for words your phone couldn't place | The words you typed or dictated (your keyboard turns speech into text — no audio is sent); nothing else; not kept |
| 📷 Meal photo (Health) | Claude, only when you tap *Estimate it* | That one picture, redrawn on your phone (no location or camera details), and whether it's a label or a restaurant dish; not kept |
| 👔 Find pieces (Look) | Claude, only after it says so and you tap | That one outfit photo, redrawn on your phone (no location or camera details); not kept |
| 👔 ✨ Name it with Claude (Look) | Claude, when you tap (then for the next pieces you add, as it says) | That one cut-out picture; not kept |
| 🏋️ Ask Claude (Train, trackers on their own) | Claude | The workout command you typed and today's exercises |
| 🧭 Plan an outing / swap a stop | Claude only | The place you typed, the day, your choices and your home town; your taste line only when 💞 *Use our taste* is on |
| 💡 Weekly date ideas | Gemini with Google Search, or Claude | Your area and the dates |
| 📰 News and 🐶 rescue news | Hidden in 2.0 (not fetched) | When switched back on: public headlines and the rescue's name — nothing about you |

The full privacy policy is in [family/privacy.html](family/privacy.html), and the technical details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Features that need setup

Most features work as soon as the connector (a small Cloudflare Worker) is deployed. Some need a key or a switch, all explained step by step in [server/README.md](server/README.md):
- **Google sign-in:** a Google client ID.
- **Claude features** (help, tidy, outings, date ideas, reading workouts from words or photos): an Anthropic API key. **Gemini** (optional, free within Google's daily allowance, for date ideas only): a Gemini API key; Claude stays as the backup.
- **Date ideas, movies and episodes:** Ticketmaster, TMDB and OMDb keys (SeatGeek optional).
- **📥 From Google Photos** in albums: the Google Photos Picker API switched on in Google Cloud.
- **Photos:** the R2 bucket.
- **WHOOP in Devices:** WHOOP keys on the connector. Until then Devices says *Not available yet*.

## The older trackers without an account

The trackers still open without signing in (*Just the trackers?* on the sign-in screen), but then they stay on that phone. Sharing happens only through an OurPawmily family: Google sign-in, family membership, and each person choosing whether to share diet and fitness. Signed out, the trackers' 🔐 Privacy shows *Share through your family* with a link to OurPawmily.

Before accounts, two phones could share through a household code. No new code is ever made now, and the code no longer appears anywhere in the app. A phone that already shared that way and isn't signed in keeps syncing quietly in the background. Once you sign in to OurPawmily, your phone stops sending your trackers the old way — from then on only the people you choose in the family see your Diet and your Fitness — and it still reads your partner's copy the old way only until they move over too. Dog files shared the old way are copied into your family's locked file store the first time a signed-in phone opens them, and the trackers' linked calendars refresh through your account. 🛟 Recover can still read the older shared copies; nothing stored was deleted.

---

# Detailed specifications

## 👨‍👩‍👧 The family app, in detail

Everything at `/family/`, feature by feature.

- **Sign in with Google.** Your account is protected by Google's sign-in, including its 2-Step Verification. No shared phrase is needed. Only an email Google has verified can sign in, and a sign-in token dated in the future is refused.
- **Families:** one person creates the family and becomes its creator.
  - **People:** add a partner, kids, parents and others. Grown-ups get an **invite by email**, and only that Google account can accept it (once, within 14 days). Young kids can be added without an account and managed by the grown-ups.
  - **🔑 What each person can use:** the family's creator chooses, for each person, which parts of the household they use — **🏠 Home** (requests, groceries, chores, the dogs), **📅 Calendar** and **📖 Threads** (with 📷 Photos). Everyone has all three unless the creator turns some off — when adding the person (*What they can use*), or later on their page (*🔑 What Pat can use*). The server checks it on every request, not just the screens: someone without Threads sees no Threads tab, can't open or be tagged in a thread, and can't open its photos; without Home, Home shows just their own day and they get no requests. Nobody else can change it, and it never touches a person's 💪 Health (theirs to share) or 💞 Us (just for a couple). Everyone who joined before 2.0 keeps everything.
  - **One set of dogs:** the family app's dogs and the trackers' 🐕 Dogs tab are the same dogs. Name, breed, birthday and photo come from the family app; food, meds, vaccines and the vet are edited in the trackers and show on the pet's profile. Each side picks up the other's changes when the trackers sync with your account, the newest edit of each detail wins, and a dog in only one app is added to the other (matched by name, so no duplicates).
  - **Pets:** add each pet with a photo, its breed and birthday (✎ Edit on the pet's profile changes the photo). Photos are cropped square and shrunk on the phone before upload. Everyone in the family sees the pets.
- **🏠 Home, top to bottom:** a greeting with today's date (*Good afternoon, Sam. Here's your Wednesday, October 28.*), ✨ Next up, 🔔 Needs you, 🛒 Groceries, last month's Gold Card winner (first week of the month), 🎬 Movies (opt-in), then 🏆 the Gold Card race, 🏠 The house, 🐾 The dogs, *More about the dogs*, 📌 Pinned threads and the Hall of fame. On a wide screen (Mac, or iPad held sideways) the house and the dogs are in a second column. Old links like `#feed` and `#dogs` open Home. (2.0 took the ☀️ Today, 🏃 Your day and ☕ This week cards off Home; ✨ Next up and *Today's plan* cover the day.)
  - **🙋 Requests** (🔔 Needs you › 🙋 Ask for a hand, or ＋ › 🙋 Ask for a hand): pick 🚗 a ride, 🐾 pet sitting, 🦮 a dog walk, 🧸 babysitting, 🍲 a meal, 🛒 an errand or 🙋 a hand, add a few words and (optionally) a day and time. The grown-ups in the family get a notification (kids don't, and can't ask or offer). One person takes it with *I can help* (you hear "✅ Pat can help"); either of you marks it done. Who asked, or the family's creator, can remove it. Done requests disappear after a week. In an encrypted family what you write is locked on your phone; the server keeps who asked, the kind, the day and who's helping.
  - **🛒 Groceries:** anyone in the family adds, ticks and removes; ticked things fold under *N in the cart* until someone clears them (up to 200 on the list). Each item is locked on the phone in an encrypted family. (The trackers' meal-plan grocery list is separate and stays in 💪 Health.)
  - **✨ Suggest** (＋ › ✨ Suggest): 🍽️ Dinner, 🍿 Movie, 📺 Show, 🥞 Brunch, 🥗 Lunch, ☕ Coffee, 🚶 Walk, 🏋️ Work out or ✨ Other, then what, where, when (tonight, today, tomorrow, this weekend, a day), a time, a note, and who (just you two, or the whole family). Your partner gets a bold **NEW** card with 🙌 I'm in · 🤔 Maybe · ⏰ Another time; when everyone's in it becomes **🎉 It's a plan!** (with Directions, and Get tickets for a movie) and shows in 💞 Us. Your own suggestions show ⏳ waiting, with Another day / Cancel; ✓ We did it moves it to the recap chips.
  - **💌 Notes** (in 💞 Us): post-it notes only the two of you see (five colours, quick emoji), ❤️ to keep one, a note streak; they clear after a week unless hearted.
  - Everything in ✨ and 💌 is end-to-end encrypted. The trackers' old "Feeling like" plans, answers and notes come over automatically the first time each of you opens Home.
- **The old feed (Moments) is gone.** 2.0 took the feed out of the app: there's no Family tab, and ＋ no longer offers 📸 Post (🙋 Ask for a hand replaced its help asks). Nothing new goes on it — not golden days, dog appointments, bingo wins or picks endings. The old posts are kept on the server, not deleted, and a read-only *Settings › Old posts* comes later.
- **Connected families:** anyone can invite a close friend, who then creates their own family (or uses one they run). The two families are then connected, and a thread shared with 🤝 friends' families shows up for them too. Nothing else is shared with them, not even email addresses. They can open a photo or PDF only by naming the shared thread (or old shared post) it's on, never one that tags someone your family keeps private, and nothing after the families disconnect.
- **Who can change a file:** each photo or PDF records who uploaded it. Only that person or the family's creator can replace or delete it, and threads, albums, chats and market listings only accept files you uploaded yourself. Encryption is unchanged.
- **Privacy:** your Diet (goal, meals, macros, weight) and your Fitness (workouts, activity) are private until you share them — each part separately, person by person — in **💪 Health** (the sharing line) or **Me › 💪 Who can see my Health**. Nobody can turn it on for you. Your phone saves your trackers as three locked parts — Diet, Fitness and Us (the 2-2-2-2 and date ratings, for your partner) — and people get only the parts you share; your full copy (with linked calendar addresses and device sign-ins) is only yours. Until your phone has saved the parts once (it does the first time you open the app after the update), someone you shared everything with before keeps seeing your full copy, as before.
- **🔐 End-to-end encryption:** each family has a secret key that lives only on its members' devices. Posts, photos, comments, notes and plans, everyone's diet & fitness, the dogs' details and appointment notes are locked on the phone before they're sent, so the server (and Cloudflare, and the app's maintainer) only stores text it can't read. New families start encrypted; an existing family's creator turns it on in **Me › 🔐 Encryption**, which locks everything already stored.
  - **Getting the key on a device:** an invite link carries it (after the "#", which never reaches a server); **📲 Add a device** makes a link for your other phone or computer (or for a partner who joined before encryption); or **🔑 Recovery phrase** (25 letters/digits you write down) unlocks a backup of your keys on a new device.
  - **Friends' families:** each connection has its own key, carried in the connection invite; posts shared with them get a key of their own, locked for your family and each connection.
  - **Not encrypted** (the server needs these to work): names of family members and pets, who's in which family, the chores log and Gold Card, games, golden-day notes and appointment dates and drivers.
  - A device without the key shows a 🔒 banner and locked posts, and the trackers don't send anything until it has the key.
- **Profiles:** if someone has shared it with you, their profile shows their weight trend and how many days they logged meals. Each pet's profile shows its breed, age, food, vaccines (with a heads-up when one is due) and vet.
- **Bring over the current app** (Me tab): copies everything the current app keeps on that phone into the family. Your own data goes to you, your partner's shared copy is held for them until they accept their invite, and each dog becomes a pet. **Download a backup** first saves the whole current app as a file. Nothing is deleted, and running it again refreshes the copies. Afterwards it reads every copy back from the server and compares it with the phone, section by section (✅ Sam: all 27 sections match: 412 weigh-ins, 210 days of meals…), and flags anything that didn't arrive.
- **Demo:** until the connector is updated and given a Google client ID (see server/README.md), **Try it on this phone** runs the whole thing on the phone itself. You can sign in as different people to try invites.
- **Choose what to manage:** when creating a family, pick from 🐶 Dogs, 🧺 Chores, 🥗 Diet & fitness and 📅 Calendar (a family that had the old 📸 Feed keeps it in its settings, but it isn't offered any more). Change it later in Me › Family settings, where the creator can also rename the family, hand it over or delete it.
- **🐾 Dogs and chores on Home** (what used to be the Dogs & chores tab), top to bottom: 🏆 the Gold Card race, 🏠 The house (chores), then 🐾 The dogs (care log, best walk time, a row of the dogs, ＋ Add a pet), and *More about the dogs* (appointments, vaccines, how happy they are, the dog cards, spending — loaded only when you open it). A ride nobody has taken in the next week also shows under 🔔 Needs you.
  - **📅 Appointments** (＋ › 🐾 Dog appt, the 📅 Calendar, or *More about the dogs*): dog appointments (✂️ grooming, 🩺 vet, 💉 vaccination, 🦷 dental, 🏨 boarding). Each has the dogs going, the place, a 🚗 drop-off and a 🏁 pick-up with a driver, a repeat (e.g. grooming every 6 weeks) and notes. A leg nobody has taken shows "who? Tap to take it". Mark it ✓ done with the cost; a vaccination sets the dog's next due date (rabies and DHPP every 3 years, the rest yearly), which the trackers pick up, and a repeating one books the next.
  - **💉 Vaccines:** anything due within 60 days, with 📅 Book it (or "booked ✓").
  - **🦮 Best time to walk:** today's best hour from the San Jose forecast, an hour-by-hour strip, and a pavement-heat warning for paws.
  - **The dogs:** a card each with photo, breed, age, weight, food and the most urgent vaccine or meds refill.
  - **How happy are the dogs:** golden days and outings this month, the golden-day streak, and the last 12 months.
  - **💰 Dog spending** this year, from the costs added to finished appointments.
  - **From your calendars:** events in your linked calendars over the next 45 days that look like a dog appointment (groomer, vet, vaccine, dental, boarding, or a dog's name) are suggested with **＋ Add** (opens the appointment with the day, time and place filled in) or **Not a dog thing**. Once added, the calendar copy is hidden so it doesn't show twice.
  - **🐶 Rescue news** is hidden in 2.0 (not loaded); the code is kept.
- **🏆 Chores** (on Home): one shared log for the family. Pick **Who did it? Me · 👫 Both · <your partner>**, then tap what was done, so either of you can log a chore for the other. Got it wrong? Each entry has the other two choices (e.g. **Me · 👫 Both** on one logged for your partner); points follow. Switching to 👫 Both offers to add your partner to your earlier entries today. Whoever logged an entry (or did it) can undo it. **🏠 The house** folds away with Hide / Show (remembered on each phone) and still counts for the Gold Card.
  - **The dogs:** 🍳 Breakfast, 🍲 Dinner, 🦮 Walk, 🌳 Dog park, 🦴 Treat, 💊 Meds, with ⭐ Golden day.
  - **⭐ Golden days:** when a day turns golden, the other grown-ups get a ⭐ notification with the dogs' thank-you note (thanking whoever took them out, by what the dogs call them), and the phone that logged it shows the note too. Nothing goes on the old feed. Set what the pets call you in **Me › What the pets call you** (Dad, Mom…).
  - **The house:** who cooked 🍳 breakfast (+2), 🥪 lunch (+2) and 🍝 dinner (+3), 🍽️ Dishes, 🗑️ Garbage, 🧺 Laundry, 🛒 Groceries, 🧽 Cleaning, 💩 Poop patrol.
  - **✎ Edit chores** (any grown-up): remove any chore from the buttons, built-in or your own (bring it back any time), or add your own to the dogs or the house (emoji, name, 0–5 points). What's already logged keeps its points.
  - **Points by effort** (cleaning 4; laundry and groceries 3; walks, park and poop patrol 2; feeding, meds, garbage and dishes 1; treats are for love). Every tap gets a little burst of ✨ and says where you stand.
  - **The Gold Card:** the month's top scorer wins a gold card, with a prize the family's creator sets (e.g. "picks date night"). A tie shares it. The race shows points, chores and 🔥 streaks, the winner tops Home in the first week of the next month, and past winners go in the **Hall of fame**.
  - Bringing over the current app also brings its feeding, walk, park and treat history into this log.
- **🎲 Show bingo** (🍿 Watch › 🎲 Bingo & 💑 picks, or 🎲 Bingo on a show): before an episode, start a game from a card set and everyone in the family gets their own shuffled 5×5 card with a free middle. Tap squares as they happen; the first full row, column or diagonal is BINGO 🎉, and everyone's progress shows under the card. **New show, no app update:** ＋ New card set → ✨ *Write them with Claude* (when the connector has an Anthropic key), 📋 *Copy a prompt* for Claude/ChatGPT and paste the squares back, 📄 *Load a file* (.txt one per line, or a JSON list), or type your own. Card sets stay in the family.
- **💑 Couples picks** (🍿 Watch › 🎲 Bingo & 💑 picks): a prediction game for dating shows like Love Is Blind. Start a season with the couples (one per line, "Name & Name"; add more later) and everyone privately ticks what each couple will do: 💥 fight, 😭 cry, 💔 cheat, 🍷 get drunk & pass out, ❤️ say "I love you", 👪 family disapproves, 🔥 an ex comes up, 💸 fight about money (plus your own), and how it ends: 💍 both say "I do", 🙅 a "no" at the altar, or 💔 split before the wedding. When a couple's scene airs, anyone ticks what happened. That locks everyone's picks for that couple and reveals them. Scoring: +2 for each pick that happens, +5 for calling the ending, and −1 for each pick that never happened once the ending is in, so ticking everything doesn't pay. A leaderboard keeps score.
- **What friends' families can see** (Me › your family › Manage, set by the creator): 🧸 kids are private by default, and 🐾 pets are shared unless you turn them off. Friends' families don't see private members, and anything that tags someone private is kept in the family (and hidden from friends if it was shared before).
- **Safety:** ⋯ on someone else's thread or reply → 🚩 Report (hides it for you; the family's creator sees a report count) or ⛔ Block (hides that person's threads, replies and chats). In 💬 Chats, tap someone else's message → 🚩 Report… (keeps only the message number and the reason, never the content, which stays end-to-end encrypted) or ⛔ Block (removes your chats with them). Unblock in **Me › Blocked**.
- **Your account:** see where you're signed in, sign out on all devices, download all your data, or **delete your account**. Deleting removes your data, the threads and replies you wrote, posts, comments and likes everywhere (leaving a family removes the ones there), and families you created pass to another grown-up.
- **First sign-in:** confirm you're 13+ and accept the [Terms](family/terms.html) and [Privacy Policy](family/privacy.html). Younger kids are profiles their parents manage. [How account deletion works](family/delete-account.html).
- **💬 Help** (Me › Help, "Trouble signing in?" on the sign-in screen, and 🔐 Privacy in the trackers): ask how anything works, from setting up a family and inviting people to entering macros and setting up a diet plan. Quick questions are one tap. When the connector has an Anthropic API key, Claude answers and can check your account and families, resend an invite, sign out your other devices (after you confirm) and file a problem. Without the key, or offline, it answers from the built-in guide. **📮 Report a problem** sends a note to the app's maintainer.
- **🛠 Maintainer** (Me tab, for the emails in `ADMIN_EMAILS`): problems people filed, with their help chat; app errors phones hit in the last 7 days (just the error and where, counted); and the nightly check, which repairs leftovers from half-finished changes and lists what it fixed.
- What's in place for the App Store and Google Play, and what's left, is in [family/STORE-READINESS.md](family/STORE-READINESS.md).
- **💪 Health** (bottom bar, when the family manages Diet & fitness) opens your Health screen (above); its buttons open the trackers: the food, macros, training, dogs and calendar screens you know, now **saved to your OurPawmily account** once you're signed in. They're the same on every phone or computer you sign in on: a new device loads them before it opens, and a change on one device shows up on the others. Someone's Diet or Fitness comes from their account only if they've shared that part with you (💪 Health › the sharing line, or Me › 💪 Who can see my Health); your partner also gets your 💞 2-2-2-2 and date ratings, nobody else does. Friends' families never see anyone's trackers, and kids' details stay inside the family. WHOOP sign-ins stay on each device. The ‹ OurPawmily button (the app icon) at the top left of the trackers goes back to the family app, and 🔐 Privacy shows where your trackers are saved. The family app and the trackers have the connector's address built in (a phone that pointed at another connector before keeps it).
- **🛟 Recover my data** (🔐 Privacy in the trackers): finds every copy of your trackers — this device, your account, older shared copies (from before accounts), the bigger copy the server keeps whenever a much smaller one replaces it, and backup files — shows what each holds, and adds back whatever this device is missing. It never removes or replaces anything. If you shared before accounts, your partner's phone keeps a copy of your data: they tap **Save <your name>'s copy as a file** and you load it with **Add from a backup file**. Each phone also keeps the old copy before a much smaller one replaces it.
- **📅 Calendar** (bottom bar), in the trackers' look: a month grid with a coloured dot for each person's events (one colour each, green for both) and ⭐ golden days, ❤️ us time, 🐾 dog appointments and 💞 plans; the chosen day's list with a name chip on every event (an invite you both accepted, or an event in two calendars, shows once with **Both**); ❤️ *Log a date* (on a past day, the 2-2-2-2 line, or ＋ › Log a date — a date with what and where, us time, an overnight trip or a getaway; ✎ Edit or delete from the day) — kept in your trackers, end-to-end encrypted, and combined with your partner's when you share; 👔 *Dress for the day* for both of you (one box marked *together* when you'll be in the same place, dressed for the longer of your two days); and *Coming up* for the next two weeks (appointment drop-offs and pick-ups show who's driving, or "nobody yet"). ＋ › 📅 Event (or ＋ Add an event on the Calendar) adds one (all day or timed, repeats, who it's for, a reminder); tap an event for ✎ Edit, Delete, **Add to my phone's calendar** (a calendar file) or Google Calendar. Events from the trackers' calendar come over the first time. **Linked calendars:** paste an iCloud public-calendar link or a Google secret iCal address and its events show read-only on your phone; the link itself is saved encrypted. Event titles, places and notes are encrypted like the rest; since the server can't read them, there's no subscription feed to Apple or Google Calendar for now — add events one at a time instead. A calendar already subscribed with the old link keeps updating, and a private family subscription link comes later.
- **Family under Me:** the Me tab lists everyone in the family with Manage ›, ＋ Person and ＋ Pet.
- **✨ Next up** near the top of Home: the one thing to do next and when (a due run at the best free hour, Mom in her window, a class, new episodes when you're both free), with Why?, Today's plan, ✓ / ⏰ / ✕ that teach it your habits, and an optional nudge 30 minutes before. Worked out on the phone.
- **📰 News** is hidden in 2.0: the app doesn't load it, and the connector's twice-daily edition only runs when its `NEWS_ON` setting is on. The code and stored editions are kept.
- **📷 Photos** (📖 Threads › 📷 Photos, the albums): ＋ New album with a name and, optionally, a Google Photos shared-album link (opens in Google Photos). Copy photos in **📷 From this phone** or **📥 From Google Photos** (Google's own picker: you choose photos and they're downloaded to your phone, then locked and uploaded). Open a photo to see it full size or remove it from the album; ✏️ renames, relinks or deletes the album. Album names, links and photos are encrypted and seen only by your family. Kids can add photos.
- **🎬 Movies** (opt-in: Me › 🎬 Movies): a card on Home with **In theaters** (critic and audience scores, ⭐ critics' picks) and **Coming soon**. Tap a movie for its theaters date, where it's streaming or to rent, 🎟 showtimes, ✨ *Suggest to* your partner, and **🔔 Alert me** when it reaches theaters or streaming (a notification at 9 AM). Movie data from TMDB, where-to-watch from JustWatch, scores via OMDb.
- **📺 New episodes** (Watch): for the shows you're watching or want to watch, the episode dates from TMDB: how many new episodes since where you're up to (🆕 3 new, E6–E8), the next drop, "Season 3 is out" for a show you want to watch, and the right show matched with *Not the right show?*. Shows with new episodes also feed ✨ Next up and tonight's pick.
- **📷 Screenshots in Threads:** up to 12 per write-up — ＋ Add (several at once), paste (⌘V on a Mac) or drag them in, with a caption each. They're kept sharper than photos so table text stays readable, show as a strip in the thread, open full size, can be added or removed with Edit, are locked with the thread's key, and are deleted with the thread.
- **📎 PDFs in Threads:** up to 5 per write-up, 20 MB each — 📎 PDF next to ＋ Screenshot, or paste / drag them in. Each shows as a card with its name, pages and size; tapping it unlocks it on that device and opens it in the phone's or Mac's own PDF viewer (on an iPad or Mac a preview shows right in the sheet), with *Save a copy*. Locked with the thread's key, counted in the family's photo space, removable with Edit, deleted with the thread. Save PowerPoint or Keynote decks as PDF first (File › Export › PDF).
- **❤️ Health meter, 🪙 coins and 🍪 cookies:** retired in 2.0. Diet now shows *N of the last 7 days near target* (in 💪 Health and on the food screen) and ✓ for a day that finished where your plan wanted. What people saved is untouched.
- **💬 Chats:** the 💬 at the top right (a red count shows chats with something new) opens your chats: one with each other grown-up in the family, plus **👨‍👩‍👧 Grown-ups** when there are three or more. Who can chat is checked by the connector on every message: a person with their own account who wasn't added as a child and isn't under 18 by their birthday (add a birthday in their profile; a birthday can only keep someone out, never let a child in); never pets. Type and send (Enter sends on a Mac; Shift+Enter for a new line), 😊 for emojis (an emoji on its own shows big), tap a message to react (❤️ 😂 😮 😢 🙏 👍), ↩︎ Reply, copy or unsend it, and ＋ for 🖼️ Photos, 📷 Camera, 📋 Screenshot (kept sharper) or 📎 PDF — or paste and drag them in. Messages show instantly and arrive the moment they're sent (a live connection while the app is open), with *typing…*, *online*, ✓ Sent / ✓✓ Read, and *Seen by* in the group. Someone who joins the group later sees what's said from then on. Notifications say who wrote ("💬 Pat"), never what, and only when you're not already looking at that chat (Me › 🔔 *Messages from your family*). Tap someone else's message for 🚩 Report… or ⛔ Block (see *Safety*). On a Mac or a big iPad the list and the conversation sit side by side. Leaving the family removes your one-to-one chats; deleting your account also removes your messages in the group.
- **🗂 Boards in Threads:** 🗂 Move (at the top of a thread) puts it on another board after it's posted — 👨‍👩‍👧 Family, 🐾 Dogs, 🏠 House & money, or one of the family's own — and anyone in the family can do it (the thread then shows *moved by …*). **＋ Board** (after the board chips) or *＋ Add a board* in Move adds one of your own, like 🎓 School or ✈️ Trips (up to 12, any grown-up; ✕ removes one and its threads go back to Family). **💞 Just us** is guarded: only a thread one of the couple wrote can move into it, and moving one out asks first, since the whole family will then see it. Threads shared with friends' families stay on Friends'. Board names aren't encrypted (like chore names).
- **👀 Seen by, in Threads:** under a write-up, everyone you tagged with ✓ *seen* (and when) or *not yet*, then everyone else in the family who's opened it. Friends' families don't see who in yours has read it.
- **🏷️ Tags in Threads:** tap faces under a write-up, or type **@** and pick a name. Only people with an account who'll see the thread can be tagged (just-us: only your partner). Tagged people get a notification ("Sam tagged you in a thread", never the content); the server knows who's tagged. **✨ For you** (first chip in Threads) puts tags and anything new on top, marked *🏷️ You're tagged* or *New*, with a count. A banner slides down in the app when something new arrives (not over an open sheet), 📖 Threads keeps its badge until you've looked, and coming back to the app checks once. ✨ Tidy it up sends @tags as @1, @2… and puts the names back.
- **🛒 Market** (coming): sale, free, lend and wanted listings for your family and, by default, friends' families (chosen per listing), with 🙋 interest, a lending library (lent to whom, back by when) and matches for what you're looking for. The server side is in place; the screens are next.
- **🔁 Run, ride, hot yoga reminders** (Me › ✨ Next up & reminders, or ⋯ in ✨ Next up): pick how often (every day to once a week); when one is due ✨ Next up suggests it at a good free hour (✓ Done ticks it) and a 7 AM note lists what's due, and a WHOOP workout (or Strava, if it was already connected) or one logged in the trackers ticks it off by itself.
- **📞 Call Mom** at the bottom of ✨ Next up (only for whoever it's set up for): the best time to call, and (🔁 Remind me every 2 weeks) a box to tick when you've called — quiet until it's due again, then one notification a day at a good time until it's ticked.
- **📖 Threads** (bottom bar) has two tabs: **Threads** and **📷 Photos** (the albums). Threads are write-ups people read and answer in their own time: 📚 Learned, 💬 Talk, 📌 How-to, ❓ Ask (▲ and ✓ Best answer) and 📊 Poll, for just the two of you, the family, or friends' families. Boards (Just us · Family · Dogs · House & money · 💡 App feedback · Friends' · ★ Saved) filter them; 🔎 Search looks through titles, write-ups, replies, captions and PDF names on your phone — the threads are unlocked in memory only while you search, and nothing goes to a server index; replies can ❝ quote, carry up to 4 📷 images, and be ✎ edited by whoever wrote them (marked *edited*); ☆ Save keeps your own shortlist; on 💡 App feedback, 📮 Send to the app's developer opens a form showing exactly the summary and details that will be sent (you can change them first) — nothing else from the family; opening one marks it read; follow for replies; pin the useful ones; drafts save themselves; ✨ Tidy it up (Claude, opt-in) turns rough notes into headings and bullets.
- **💞 Us** (second in the bottom bar, only for a couple): everything private between the two of you, in this order — **📺 Watch** (above), **For you** (only what needs your answer: a plan to answer with 🙌 / 🤔 / ⏰, a match, "how was it?" after a plan), **❤️ Dates** (what's planned, the 💞 2-2-2-2 chips with your recent dates, and ✨ Suggest · 🧭 Plan an outing · ❤️ Log a date, with your recent outings), **✨ Ideas for Us** (well-rated movies at your theatres with showtimes, new bars and restaurants with OpenTable links, events, and a starter list — 💗 in private, and when you both pick the same one it's a match you can make into a plan for both calendars; 💬 *Discuss* opens one thread about the idea for you two, then *Make it a plan* puts it on both calendars once you both say yes), **💌 Notes**, and **📓 Our notebook** (one line: your just-us write-ups, which live in Threads). **🧭 Plan an outing** ( type a Bay Area neighborhood or town, pick the day, cuisine and how you'll get there, and Claude (never a free AI tier) plans a timeline with trains or parking, OpenTable and map links, with every link checked; it plans in the background and tells you when it's ready; swap any stop for another cuisine, save it, or send it to your partner as a plan), **⭐ How was it?** after a plan (😕 🙂 😍, 👎 👍 ❤️ per place, quick tags — kept in your encrypted trackers; they reorder the picks and, if you allow it, shape outings), Just-us write-ups read as letters with ✍️ notes beside a paragraph. A red badge on Us counts what's waiting for you. Shows you add are just you two unless you tick *Share with the family* (for bingo with everyone); any show can switch either way.
- **＋ Create** (top right, every screen): **You & your partner** (for a couple) — ✨ Suggest, 🧭 Outing, 💌 Note, ❤️ Log date — then **Family** — 📖 Write it up, 📅 Event, 🙋 Ask for a hand (not for kids), 🐾 Dog appt (when the family manages dogs). *Suggest a plan* is one flow for anything ahead (dinner, a movie, 🍷 date night…; tonight, tomorrow, this weekend or a day you pick): when you're both in, it goes on the calendar for both of you, and afterwards "❤️ Log it as a date" counts it for your 2-2-2-2.
- **Bottom bar:** 🏠 Home · 💞 Us (for a couple) · 📅 Calendar · 📖 Threads · 💪 Health (when the family manages diet & fitness). **Me** is the round picture at the top right. The icons are drawn in the text colour, so they read the same in light and dark mode.
- **🌗 Appearance** (Me): 📱 Automatic (follows your phone — iPhone can switch to dark at sunset), ☀️ Light or 🌙 Dark, for OurPawmily and your trackers on that device.
- **📸 Quick photos:** each photo is saved as two files, a small one for scrolling and the full one when you tap it, locked on your phone first in an encrypted family. Albums and threads only load what's on screen and keeps photos on the phone after the first look. Older photos move over by themselves.
- **🔔 Notifications** (Me › 🔔 Notifications, once per device): a nudge when your partner sends a plan, answers yours or leaves a note; when someone books the dogs in or takes a drop-off or pick-up; when the dogs have a ⭐ golden day or someone starts or wins bingo; when someone asks the family for a hand (🙋 Requests, grown-ups only) or says they can help with yours; and when someone replies to or tags you in a thread. Reminders come the day before and an hour before an appointment, at an event's reminder time, and at 9 AM a week before and on the day a vaccine is due. Turn each kind on or off, send a test, or turn it off for one device. On iPhone, add the app to the Home Screen first (Share › Add to Home Screen) and turn them on from there. Notifications say who did what, never what an encrypted note, plan, request or event says (a request says only its kind and day).
- **📺 Watchlist** (💞 Us › 📺 Watch › *Open Watchlist →*; ‹ goes back to Us): three tabs — **Watching**, **Want to Watch** (⭐ Up Next first, then *Later*) and **Watched** (newest first, then 📅 *Month by month*, 🏆 the year recap and ✋ *Dropped*, where a dropped show can be brought back). Each card shows the service, where you're up to and one action: **＋ Watched an episode** logs tonight, moves you to the next episode (into the next season when the episode list says so) and moves a Want-to-Watch show into Watching; for a movie **✓ We watched it** makes it Watched. A second episode the same night keeps the night. When the episode list shows you just watched the final episode of a show that has ended, it asks whether to mark it Watched — it never decides on its own. **＋ Add** starts a show or movie in Want to Watch (or Watching, or Watched). Details (tap a card): Want to Watch / Watching / Watched, ⭐ Make it Up Next, − / ＋ episode and *Set season & episode*, ★ ratings (yours and your partner's), how many nights together, 💬 **Discuss** (opens the thread about it — the same one for both of you — just you two), 🎲 *Bingo*, and under *More*: share with the family or keep it just you two, ✋ Drop it, delete. Older shows keep their history: a show with no status counts as Watching and a movie as Watched, as before. Titles and services are end-to-end encrypted. **🎲 Bingo & 💑 couples picks ›** opens the games.
- **One app:** the Home Screen icon opens OurPawmily, and 💪 Health in its bottom bar opens food, macros and training (the sign-in screen also has *Just the trackers? Open them without signing in*, which keeps them on that phone only — sharing happens only through a family). Once you're signed in, the trackers are just **🍽 Food** and **Activity** (workouts are in 💪 Health › 🏋️ Fitness; add more trackers later as you need them), and their header reads *‹ Health · Meals* (or Weight, Groceries…) and goes back to 💪 Health: Home, Calendar, 🐕 Dogs and 💞 Us live in OurPawmily, and 🔐 Privacy (with 🛟 Recover and Devices) is the 🔐 button at the top. A pet's page in OurPawmily has *✎ Edit in 🥗 Trackers › Dogs* for food, meds, vaccines and the vet. *Ask Claude* in the trackers goes through your account.
- **No household code:** no new code is ever made, and it no longer appears anywhere — no code in 🔐 Privacy, no *Link phones*, no one-tap link, no sharing section in Devices, no calendar subscribe link. A phone that already shared that way and isn't signed in keeps syncing quietly in the background. Once you sign in to OurPawmily, your phone stops sending your trackers the old way — from then on only the people you choose in the family see your Diet and your Fitness — and it still reads your partner's copy the old way only until they move over too. Dog files shared the old way are copied into your family's locked file store the first time a signed-in phone opens them, and the trackers' linked calendars refresh through your account. 🛟 Recover can still read the older shared copies; nothing stored was deleted.

# The trackers, in detail

The trackers are the food, training, dogs and calendar screens that came before the family app. Signed in, 💪 Health shows just **🍽 Food** and **Activity** (Home, Dogs, Calendar and Us live in the family app, and workouts in 🏋️ Fitness). Without an account, all of the tabs below are there, kept on that phone only; sharing happens only through an OurPawmily family.

## 🏠 Home

- Greeting and date, then today's calendar events (or the next one).
- **Dogs:** compact Feed / Walk / Dog park / Treats & toys buttons (tap your name), overdue vaccines or refills, a new dog on the adoption board, and how close today is to a ⭐ golden day.
- **Your day:** the best run, ride and dog-walk windows in time order with the temperature range. A 🐾 marks a run or ride that overlaps a good walk window. Everything ends by 9 PM, and from 9 PM on, Home, Train and Dogs plan tomorrow.
- **📞 Call Mom** (in *Your day*, on the first profile's phone only): the morning time when it's a good evening hour in India (8–10 PM IST) and a good hour here (7:30–9:30 AM Pacific). That's 7:30–9:30 AM while daylight saving is on and 7:30–8:30 AM in winter. The row shows the time in India too, and drops off once the window has passed. The hours and whose phone shows it are set in `js/brief.js` (`CALL`).
- **👔 Dress for work** (first row of *Your day*): where your calendar puts you (San Jose when it doesn't say), the feels-like temperature when you leave, at the warmest point and when you head home, what to wear, and when to take a layer off and put it back on. Tap it for the Calendar tab, which shows both of you.
- **🧗 Gym classes:** each gym's live **🧘 Yoga** and **🏋️ Fitness** schedule one tap away, plus map links and the classes you take today (added under Train). The gyms are set in `js/brief.js`.
- **Food:** the next meal, and the weekly check-in reminder (red when overdue).
- **⚖️ Weight trend:** a small line of your 7-day average weight over the last 30 days, with today's weight, the 30-day change, the pace per week and how far to goal. Tap it for Food › Weight.
- **💞 Just the two of you:** a gentle love note when a date, intimacy or a trip is coming up (from the 2-2-2-2 rhythm), with **✓ We did it** and **💡 Suggest for Saturday**.
- **Us:** your partner's latest note and next plan. **Train:** today's training.
- Home works even before a diet profile is set up.

## 🐕 Dogs

- **Pavement, hour by hour** (top): the best morning and evening walk windows with an estimated **pavement temperature**. Sun heats asphalt far above the air: about 125°F at 77°F in full sun, and above about 125°F it can burn paws. Weather and air quality come live from Open-Meteo (free, no key). The location is set in `js/brief.js`.
- **Feed the dogs:** an upright oval split in two, with the top half for one partner (blue) and the bottom for the other (magenta).
  - Each half is pale yellow until something is logged, then green, and the button becomes a circle.
  - Breakfast runs 4 AM–4 PM and dinner 4 PM–4 AM (Pacific).
  - Only the phone that logged a feeding can undo it.
- **🐾 Walk** and **🌳 Dog park:** the same split ovals, plus a **👫 Both** button for an outing you did together: it gives each of you a point on the scoreboard but counts as one outing toward a golden day (also on Home). Tap again for another outing, and *Undo last* takes back the last one logged on your phone. They reset at 6 AM.
- **🍪 Treats & toys:** Treat on top (once a day, anyone can tap), 🧸 New toy below (name optional, counted per month).
- **Tab colour, visible from anywhere:**
  - **red** = still needs this meal
  - **green** = fed
  - **bright green** = fed and walked
  - **gold** = a ⭐ golden day
- **⭐ Golden days:** a day with two outings (walks or the dog park), or one outing plus a treat; the stars show on the shared 📅 Calendar. The card shows:
  - golden days and days out for the month and year
  - the current streak
  - a bar for each month, with the happiest month crowned 🏆
- **🐶 Our dogs:** a profile per dog, shared by both phones. Edits to different fields from each phone both survive.
  - Breed, birthday, weight.
  - Food (brand, type, amount) and supplements.
  - Medications and prescriptions: dose, schedule, prescribing vet, refill date.
  - Vaccines, given and next due, marked Current / Due soon / Overdue.
  - Vet, microchip, notes.
  - **Documents:** vaccine certificates and vet records as PDFs or photos (up to 10 MB), opened with one tap on any phone in the family. Signed in, each one is locked with your family's key and kept in the family's file store (as are adoption-board screenshots); documents shared earlier through a household code still open.
  - Overdue vaccines and refills due within a week show here and on Home.
- **🏆 Dog duty:** who did the feedings, walks and park trips, for Today, this Month or this Year, with the leader crowned 👑. Each month's leader wins a **🪙 gold coin** (ties get none), and the year's coins and each month's winner are listed.
- **🏡 Dogs up for adoption** (bottom): a shared board of adoption ads.
  - **Adding a dog:** tap **＋ Add a link**, then **📋 Paste** the ad's link (Facebook: Share › Copy link; tracking parameters are removed). Add the name, age, sex, size, breed, where, notes and a screenshot of the ad, which is shrunk to save space.
  - **Each card shows:** the photo, **Open ad ↗**, both partners' reactions (❤️ 👍 🤔 👎) and a status (Just found → Interested → Contacted → Applied → Meet & greet). *Pass*, *Adopted by others* or *🎉 Ours!* moves the card to **Past**.
  - A dog the other partner adds is marked **New** and mentioned on Home.
  - Facebook doesn't let other sites show its posts, so the card keeps what you type plus the screenshot.

## 🍽 Food

Three pages from the bar at the top: **🍽 Meals · ⚖︎ Weight · 🛒 Groceries** (Scan opens from Groceries; old `#scan` links still open it).

**📈 Plan progress** (top of Meals): your phase and week (*Cut · week 5 of 8*), days left and how far to your goal, a status — **✅ On track**, **⏳ Slower than planned**, **⚡ Ahead of plan** or **🌱 Too early to tell** — an estimate worded as one (*At your recent estimated trend, reaching 168 lb by Jan 8 is unlikely (around Feb 2 instead).*), one next step, and *Why?* with the reasoning (the trend, the plan's rate, how many days are logged and weigh-ins this week). Body weight swings with water, salt and food, so it says *Too early to tell* rather than guess when there's too little to go on: fewer than about 5 weigh-ins this phase in the last three weeks, under about ten days of them, a long gap, or a change too fast to be fat (more than 3 lb a week). Maintenance and a diet break aim to hold steady; a lean gain reads the other way; with no goal there's no date. It's worked out on your phone and **never changes your targets** — the weekly check-in suggests changes and nothing changes until you approve.

**💬 Ask about my plan** (in the plan progress card, signed in, your own plan): ask Claude about your plan — *Am I on track?*, *Why is my weight not moving?*, *What should I focus on this week?* or your own question — and follow up in the same little chat. The first time, it says **Sends your plan numbers and your question to Claude**, with *What's sent* listing exactly those numbers; nothing goes until you tap OK. Claude explains and suggests; it can't change your calories, macros, phase, weight, meals, workouts or logs. When it suggests a change to your targets, **Review it in your weekly check-in ›** opens the check-in, where nothing changes until you approve. The chat isn't saved; closing the screen clears it.

**Meals.** Daily calories and protein / fat / carb targets, split into breakfast, lunch and dinner with exact portions (grams plus oz / cups / slices / scoops).
- **Defaults:**
  - Breakfast: eggs + sourdough (or wheat bread or a lavash wrap) + avocado, or oatmeal + whey.
  - Lunch and dinner: chicken, beef, salmon (farmed Atlantic or wild sockeye, which has about half the fat), cod, trout, shrimp, canned tuna (by the can) or smoked turkey / chicken breast deli slices (by the slice, ½ oz each) with rice (or brown rice, potato, sweet potato, quinoa, sourdough or a **lavash wrap**, by the sheet: 100 kcal, 6 g protein, 1 g fat, 19 g carbs) and veggies (mixed, broccoli, zucchini, cauliflower or salad).
- **Swaps:** every item has a swap menu (e.g. almond butter for peanut butter, butter or avocado for fat, steak / chicken thigh / breast / ground beef / fish, sweet potato for rice), and swaps are remembered.
- **Portions − / +:** each food has a grams box with − and + (one tap = the usual step; hold to keep going) or an exact weight. Your amount is locked 🔒 and the rest of the meal re-balances.
- **Cooked or raw:**
  - Each item has its own **cooked | raw** switch (oats: **dry | cooked**); macros are the same either way.
  - Meat, fish, eggs, rice and veggies are weighed cooked.
  - The grocery list converts back to raw amounts.
- **The day rebalances itself:** when a meal you changed (or already logged) comes out over or under its protein, fat or carbs — say extra almond butter at breakfast, 19 g fat against 12 — the difference is taken from (or added to) the meals you haven't touched or logged yet, in proportion, so the day still adds up. Those meals show *⚖️ −3 g fat, +4 g carbs to balance your other meals*.
- **Net carbs:** carbs are counted as **net carbs** (total carbs minus fiber), and calories leave fiber out, the way most tracking apps count them — e.g. 40 g dry oats = 23 g carbs, ~135 kcal. Fiber comes from USDA values for built-in foods, Open Food Facts for scans, and an optional *Fiber* box for foods you add.
- **Daily plan at a glance:** Meal 1, Meal 2 and Meal 3 (breakfast, lunch, dinner) each show their foods, amounts and macros against the meal's target, with **✓ I ate this**. Pills mark a meal that's 🔒 daily or 🥑 low-carb.
- **A meal's page** (tap a meal):
  - **Protein, carbs and fat as bars** against the meal's target, with how far over or under each one is.
  - **Foods by macro:** 🍗 Protein, 🍚 Carbs, 🥦 Veggies and 🥑 Fats, each with its subtotal and its own **＋ Add…** list showing only that kind of food (proteins under Protein, and so on). Packaged and mixed foods (bars, shakes, coffee drinks, your own mixed foods) get their own 📦 section. Each list ends with **＋ New … (enter its macros)**, which opens the form with the right category picked.
  - **📦 Packaged meal** (Factor, a meal-prep kitchen): type the label's macros and pick it from your list after. You can also type a whole meal's macros under **✍️ Enter the meal's macros yourself**.
  - **🔒 Same every day:** keeps this exact meal (foods and amounts, or a packaged meal) every day, and the other meals balance around it. Change it for one day and the page offers **Save as daily** or **Back to daily**. Your daily meals are on the grocery list too.
  - **🥑 Low-carb today:** protein stays the same, carbs drop to about 10% of the meal's calories, and half those calories come back as healthy fat, so the meal ends up roughly 80–120 kcal lighter. A low-carb breakfast switches to eggs. The other meals aren't padded with the skipped carbs. **Why these numbers?** gives the sources: low-carb is under ~26% of calories from carbs (Feinman et al. 2015), high protein protects muscle (Morton et al. 2018), and carbs should match activity (Impey et al. 2018).
  - Also: swap foods, swipe a food left (or ✕) to remove it (with **Undo**), saved combos, 🍴 Ate out, **‹ Back to today's plan**, and **↺ Start over** to return to the suggested foods.
- **😴 Rest day:** one switch above the meals makes all three low-carb for the day.
- **Your own meals:** **⭐ Saved combos** store a meal's foods by name, and **any combo loads into any meal** — eggs for dinner is fine. The meal's own combos are listed first, then breakfast, lunch, dinner and snack combos, then your partner's. **⚖️ Fit to target** scales a combo to the meal.
- **Snacks and extras:**
  - **🍎 Afternoon snack:** fruit, nuts, yogurt, shakes and bars. Its calories come out of lunch and dinner, so the day still adds up.
  - **☕ Coffee shop:** lattes, cappuccinos, cortados, flat whites, mochas, chai and a chocolate chip cookie.
  - **⚡ Bars & shakes:** common protein bars and shakes.
- **＋ New food (your own macros):** every food menu (swap menus and *+ Add a food*) ends with **＋ New food…**. Enter the name, what one serving is (e.g. *3 tenders*, optionally its weight), and the protein, carbs and fat per serving (calories optional). The app suggests whether it's mostly **protein, carbs, fat or mixed** (you can change it), adds it to that meal, and from then on it's in the lists for both of you: proteins and mixed foods in the protein menus, carbs in the carb menus (and toast at breakfast), fats in the fat menus, all of them under *My foods* in *+ Add a food* and on the grocery list. Amounts read naturally (*6 tenders*), and a mixed food is capped at about ¾ of a meal's calories so its own carbs and fat don't blow the meal. *My foods* in the form lists them; delete your own there.
- **📦 Prepared:** for pre-packaged or catered meals, type the label's protein, carbs and fat (and calories, or they're worked out from the macros), pick ½ / 1 / 1½ / 2 meals, and **☆ Save to my prepared meals** — next time pick it from the list on any meal. Your partner's saved prepared meals appear in the list too.
- **🍴 Ate out:** estimate a restaurant meal (dish, portion, how much you ate; estimates lean generous) or enter the menu's calories. **🍷 Drinks with the meal** adds wine, beer or cocktails.
- **Logging:**
  - **✓ I ate this** logs a meal and locks it until *Unlog to edit*.
  - The bar at the top shows calories and macros left today. It's hidden on Dogs, Us and Calendar.
  - **Any day:** ‹ › moves through past days (what was logged) and up to two weeks ahead (planned meals you can edit).
- **Lower weigh-in = a short congrats:** whenever today's weight is lower than your last weigh-in, the weigh-in card says so with a line to keep going — e.g. *📉 −0.6 lb — you're on the right track. Trust the trend, not the day.* (🎉 *New low* when it's your lowest yet).
- **💪 Encouragement for checking in:** after the morning weigh-in and each logged meal, a short line of encouragement appears right there (never a pop-up). A day with the **weigh-in and breakfast, lunch and dinner logged** gets a 💪 — on the Food day bar, on Home and on the shared 📅 Calendar, where tapping the day shows which of you checked in.
- **Daily deficit game:** burned − eaten.
  - 🪙 10 for each deficit day, +5 if it's sustainable, and 🍪 for hitting protein.
  - Streak bonuses at 3, 7, 14 and 30 days.
  - Very large deficits earn no bonus.
- **Weekly check-in:** every 7 days from the diet's start day. A missed one waits, and Home and the Food tab badge flag it.
  - **The week in numbers:** weight change (7-day averages), average intake against target, days logged, and your real maintenance (from intake and the weight trend, 3,500 kcal ≈ 1 lb).
  - **Suggested change:** sized to your planned pace (±50–250 kcal, carbs first, protein kept, never below the floor).
    - It adds food if you're losing more than 1% of body weight a week.
    - It suggests no cut if the week was under-logged or over target.
    - After 8–12 weeks of cutting (sooner if you're worn down), it suggests a 2-week diet break at maintenance.
  - **Exports:**
    - **⇩ Week as CSV** shares a one-row-per-day file.
    - **📋 Copy for Claude** copies a ready-to-paste summary.
    - **🔔 Weekly reminder** adds a repeating calendar event on check-in day.
- **8-week program:** a strip shows the phase (e.g. *cut · week 3 of 8*). At the end, a review of weight, adherence, protein, workouts and strength recommends what's next: a diet break, keep cutting, maintenance or a lean gain.

**Weight.**
- A graph of weigh-ins, the 7-day average, your goal and the planned path, with tap-to-read values.
- **Stats:** meals on target, deficit and protein days, and workouts over 7/30/90/365 days.
- **Export data:** a zip of CSVs (meals, days, activities, lifting sessions and sets, weigh-ins, check-ins).
- **Backup / Restore:** everything as one file.
- **📤 Share…:** the day's meals, your combos or your progress, as text, a poster image or CSV. Progress can be shared **📸 with photos** (your first, middle and latest progress photos side by side — under the poster, or as one image alongside the text) or **without photos**.

**🩻 Body composition (DEXA)** (Weight page, under the graph): add each DEXA scan — past ones too — with weight, body fat %, fat mass, lean mass, and optionally bone mass and visceral fat (VAT). Missing numbers are worked out (fat from weight × body fat %; lean = weight − fat − bone).
- Tiles for the latest body fat %, fat mass and lean mass with the change since your first scan (green when fat goes down and lean goes up), and a one-line summary of the journey.
- Four small charts on the same timeline: **Weight** (scan weights over your 7-day average weigh-ins), **Body fat %**, **Fat mass** and **Lean mass**; tap a dot for its value. Scan days are marked on the weight graph above.
- **All scans** table with scan-to-scan changes; edit or remove a scan. Scans sync, back up, and export as `dexa_scans.csv`.

**📸 Progress photos** (Weight page, and in the weekly check-in): add a photo (front, side or back; today or an earlier date). The **first, middle and latest** of the program show side by side with their dates and weights — or tap ☆ on up to three to compare those — and **📤 Share progress** sends your progress summary with or without them. Photos stay **only on that phone**: never synced, uploaded or included in backups; they leave it only when you choose *With photos* and share.

**Groceries.** A weekly list built from the plan, grouped by store, with checkboxes, and **▦ Scan a barcode** at the top (*‹ Groceries* goes back).

**Scan** (from Groceries). Scan a barcode (or type it) for macros from [Open Food Facts](https://world.openfoodfacts.org), see how it fits, and add it to a meal, a snack or the grocery list.

## 🏋︎ Train

Signed in to OurPawmily, this tab is **Activity**: everything below except the lifting logger, with *🏋️ Workouts are in Fitness — Open Fitness ›* at the top, because workouts (and the lifting program) live in 💪 Health › 🏋️ Fitness as one kind of workout. *🏋️ Lifting* in *Log a workout* opens Fitness too. On its own (not signed in), the trackers keep the lifting logger as described here.

- **Log a workout in one tap:** 🏋️ Lifting (jumps to today's session), 🔥 Hot yoga, 🏃 Run, 🚴 Bike (both ask for **miles**, so pace and weekly miles add up), 🧗 Climbing and ✨ Other.
- **🧗 Climbing session:** its own card with a **Bouldering | Top rope | Lead** bar. Count **attempts** (and, optionally, **sends ✓**) per grade with − / + — V4–V6 for bouldering and 5.10a–5.11a for ropes by default, every other grade (V0–V10, 5.8–5.12d) one tap away. One session can mix all three; gym and minutes are saved with it, and **Done** adds it as the day's climbing activity for calories.
- **📈 Progress** (button on the training card): **This week** or **this month**, against the one before:
  - **Lifting:** sessions, sets, volume, new PRs, estimated 1-rep max for squat, bench and deadlift, and **sets per muscle group** against a line at 10 sets a week (scaled for the month), with the change from the last period — training volume rather than the weight itself.
  - **Cardio:** run miles and average pace, bike miles and rides, hot yoga classes and hours (synced WHOOP workouts count too).
  - **Climbing:** sessions, top send per style, and sends out of attempts per grade, with highlights like a higher top send or a better send rate.
  - Climbing sessions export as `climbing.csv`.
- **Training card:**
  - Add activities by sport (running, cycling, climbing, lifting, swimming, hiking, HIIT, yoga…) with intensity and minutes.
  - Calories come from your own WHOOP history for that sport once there are 3+ sessions, otherwise from standard MET values.
  - Synced workouts replace matching manual ones.
  - Training calories are added back as carbs.
  - Sessions of 45+ minutes get an **intra-workout carb** target (banana, sports drink, gel, dates).
- **Weather & best windows (one card):** the temperature, rain, wind and air quality, then one line each for the best 4-mile run hour and the best 25–30 mile ride window (daylight), with the temperature range, a score and any watch-outs. Scored on feels-like temperature, rain, wind, air quality, UV and daylight, with an hour-by-hour strip.
- **Classes:** links to each gym's live yoga and fitness schedule, plus your regular classes (days and time), shown here and on Home on those days.
- **Lifting:**
  - **Program:**
    - Full body, 3 days a week (A heavy · B moderate · C light), from a 54-exercise library across 10 muscle groups.
    - Sets × reps, reps in reserve and rest are set for you, and the next weight is suggested from your last session.
    - Weeks 1–5 build, week 6 is a deload, then a new block starts.
    - Bodyweight moves progress by reps, then by harder variations.
  - **Session tools:**
    - **⦿ Plate calculator** shows the plates per side.
    - **↑ / ↓ / Later** reorder the session, and **📌 Keep this order** saves it.
    - **＋ Add exercise after** adds a movement.
  - **🎤 Command bar** (type or speak):
    - "squats 3 sets of 5 at 185", "bench 135 for 8, 8, 7", "one more set of 8", "check all my sets for calves", "move rows after squats", "weigh in 160.8".
    - Anything it can't parse can go to **Claude** through the connector (optional).
    - Every command has **Undo**.
- **Recent workouts** and the **Exercise library** fold away (tap the title: Show ▾ / Hide ▴), closed by default and remembered on each phone.
- **Devices** (💪 Health › *Devices ›* in OurPawmily, or 🔐 Privacy › Devices here): nothing to paste or set up.
  - **WHOOP:** *Connect WHOOP* when the connector has WHOOP set up (otherwise *Not available yet*) → WHOOP's own sign-in page → back to 💪 Health, where your last two weeks of workouts come in. After that they sync on their own when you open the trackers, or with *Sync now*. WHOOP is asked for workouts, each day's calories burned and strain, and your Recovery and Sleep (not your profile or body measurements). Recovery and Sleep come in only through OurPawmily (💪 Health) and are yours alone (below). Workouts show in 🏋️ Fitness history and count toward today's calories; the day's total burn (*WHOOP (so far today)*) replaces the estimate unless you typed one. If WHOOP stops sharing (you removed access in WHOOP, or the sign-in ran out) Devices says *reconnect*; if WHOOP is down it says so and tries next time. The same workout never comes in twice. *Disconnect* asks WHOOP to remove OurPawmily's access and keeps the workouts already brought in.
  - **Connecting shares nothing:** the WHOOP sign-in stays on the device you connected on (never in your account copy or with anyone). Workouts and calories it brings in are part of your Fitness — seen only by the people you share your Fitness with. **Recovery and Sleep are private to you**: they're kept in your own account copy only (locked like the rest), in no part anyone can be given, whatever your Fitness sharing.
  - **Connected before Recovery and Sleep?** Your workouts keep syncing; 💪 Health shows *Reconnect WHOOP* once, and reconnecting adds them (the family's WHOOP app needs *read:recovery* and *read:sleep* ticked — see `server/README.md`).
  - **Garmin:** not available. Garmin only opens its data to approved companies (its developer program doesn't take personal apps), so there's no direct connection, and none is pretended. **Apple Health:** needs an iPhone app, not available yet.
  - **Strava** shows only if it was already connected, so you can disconnect it.

## 📅 Calendar

- **💞 The 2-2-2-2 rhythm** (top of the 📅 Calendar tab, and on Home): a date every **2** weeks, intimacy **2** times a week, an overnight trip **2** times a year, and a multi-night getaway every **2** years — just the two of you (book the dog sitter).
  - A gentle, rotating love note for the one that's due or coming up: a date that falls due by the weekend, a second time this week (from Thursday on), or a trip that's due. Chips show all four at a glance (✓, soon, due, and 💗 count this week).
  - **✓ We did it** logs it (either phone; trips and dates can be logged for an earlier day), **💗 +1** for intimacy, and **💡 Suggest for Saturday** sends it to your partner as a *Feeling like* plan for the coming weekend, which they answer 🙌 / 🤔 / ⏰.
  - **❤️ Log a date** (top of the card): type what you did (movie, drinks, dinner, a bookshop… anything), where, and the day — no list to pick from. What you've typed before is suggested as you type.
  - Every logged moment shows as a ❤️ on the shared **📅 Calendar**, next to the dogs' ⭐ golden days.
  - **Fix or add later:** tap a day on the calendar (or a moment under *Logged moments*) and **✎ Edit** changes what, where or the day, or **Delete** removes it — from either phone, whoever logged it. **❤️ Log a date on this day** adds another one to that day.
  - A multi-night getaway also counts as an overnight trip. Weeks run Monday to Sunday. Logged moments can be removed.
- **👔 Dress for the day** (trackers on their own, without an account; in OurPawmily it's replaced by 👔 Look) (under the chosen day, today through a week ahead): for each of you, where you'll be, the feels-like temperature when you leave, at the warmest point and when you get home, and how to layer.
  - **Where:** an event for that person (or for both of you) whose title or location names a place puts them there for the day: *Office – SF*, *Oakland*, or an address in San Francisco. Otherwise it's **San Jose (95131)**. The menu next to each name changes a day by hand (**↺ Use the calendar** undoes it).
  - **When:** an hour before your first event of the day until an hour after your last one, or 8 AM–6 PM when the calendar is empty.
  - **How the day goes:** *cool start, warm midday, cool again by evening*, *hot all day*, *cold all day* or *steady*. Then the layers: a base (tee → long sleeves), a light layer or sweater, and a jacket or coat only when it's cold enough. A rain jacket when rain is likely, or a windbreaker when it's gusty. Layers you'll shed are marked *take off later*, with times, e.g. *Jacket off around 10 AM, back on by 6 PM*. Plus an umbrella, sunglasses and sunscreen, or warm socks when they're needed.
  - **📍 Places:** San Jose, San Francisco and Oakland are built in. Add more by city or ZIP (e.g. *Palo Alto* or *94301*) and they're shared with your partner's phone. Weather comes from Open-Meteo, refreshed hourly.
- **Shared events:** either phone can add, edit or delete. Each event has a title, day, time or all-day, place, who it's for (both or either of you), a reminder and notes.
- **Repeats:**
  - Every day, week or 2 weeks (paychecks).
  - Monthly on a date, or on a weekday (e.g. the 2nd Tuesday).
  - The last day of the month, or twice a month (e.g. the 1st and 15th).
  - Quarterly or yearly, or every N days / weeks / months / years.
  - An optional end date, and **Skip** removes a single date.
- **One place for everything:** each day also shows ❤️ for your 2-2-2-2 moments (dates with their kind and place, with a map link) and ⭐ for the dogs' golden days, with a monthly count of dates and golden days.
- **Views:** a month view with coloured dots, the chosen day, and what's coming up. New events from your partner badge the tab.
- **Per event:** **Apple Calendar** (a calendar file with your reminder) and **Google Calendar** buttons.
- **📲 Bring in a calendar:**
  - Link an iPhone iCloud calendar (Calendar app → Calendars → ⓘ → Public Calendar → Share Link) or a Google calendar's secret iCal address. Its events show read-only, refreshed every half hour.
  - Or import an .ics file once.
- **Show this calendar in Apple or Google Calendar:** the old subscribe link carried the household code, so it isn't shown any more. Calendars already subscribed keep updating; a private family subscription link comes later.

## 💞 Us

Everything for the two of you on one page, in compact sections; forms and history open only when you need them.

- **💌 Notes:** a post-it board for each other.
  - It starts fresh every morning at 5 AM, and earlier notes move to *Earlier notes*. Unread notes stay until seen.
  - Emoji, colours, ↩ replies, ❤️ and a daily streak.
  - New notes badge the tab.
  - **Notes last 2 days.** Each phone deletes its own notes (and hearts on them) once they're 2 days old; only the days you wrote are kept, for the 💌 streak.
- **✨ Feeling like:** suggest a plan (movie, show, brunch, dinner, coffee, a walk, a workout…) with where, when, time and a note.
  - The other answers 🙌 I'm in, 🤔 Maybe or ⏰ Another time.
  - Mark it done or cancel it.
  - Places get a map link.
- **📺 Watching:** shows and movies you watch together on any service.
  - **📺 We watched tonight** counts each night, once even if you both tap.
  - Each of you rates ★1–5, and you can mark a title Finished or Dropped.
  - Views by month, plus a year recap (nights, titles, your favourite, top services).


## 🔐 Privacy

- **Share through your family** (not signed in): sharing with your partner means an OurPawmily family, with a link to open it. Signed in: where your trackers are saved and who can see them.
- **How your data is kept:** a short summary of where your data lives and good habits.
- **Devices** and **🛟 Recover my data.**

## Profiles and older sharing (trackers without an account)

- **Profiles.** There are two profiles (names set in `js/storage.js`). First launch asks whose phone it is. Each person's data (profile, meals, weigh-ins, lifting, coins) is kept separately and is editable only on its owner's phone.
- **Older sharing.** Phones that paired before accounts keep syncing their shared things (dog log and profiles, the calendar, notes, plans, shows, the adoption board) quietly in the background until they move to the family. New phones can't pair this way; share through an OurPawmily family instead.

## How food targets are set

- Maintenance: Mifflin-St Jeor BMR × activity factor.
- Deficit: your chosen pace (0.5–1% of body weight per week, max 2 lb/week), never more than 25% below maintenance, with a 1200/1500 kcal floor.
- Protein ≈ 1 g per lb of goal weight; fat ≈ 27% of calories; carbs fill the rest.
- Training days (when Profile → Activity is "Count my workouts"): base = BMR × 1.3, plus 75% of each workout's net calories, added as carbs. Intra-workout carbs: <45 min none; ~1 h small amounts; 1–2.5 h 30–60 g/h; >2.5 h up to 90 g/h.

### Nutrition sources

| Setting | Paper |
|---|---|
| 0.5–1%/wk loss; protein, fat 15–30%, carbs | Helms, Aragon & Fitschen 2014, *JISSN* 11:20 — [doi](https://doi.org/10.1186/1550-2783-11-20) |
| Slower loss keeps more lean mass | Garthe et al. 2011, *IJSNEM* 21(2):97–104 |
| Protein ≥1.6 g/kg | Morton et al. 2018, *Br J Sports Med* 52:376 — [doi](https://doi.org/10.1136/bjsports-2017-097608) |
| Protein in a deficit | Jäger et al. 2017 ISSN position stand, *JISSN* 14:20 — [doi](https://doi.org/10.1186/s12970-017-0177-8) |
| Protein per meal | Schoenfeld & Aragon 2018, *JISSN* 15:10 — [doi](https://doi.org/10.1186/s12970-018-0215-1) |
| BMR equation | Mifflin et al. 1990, *Am J Clin Nutr* 51:241 — [doi](https://doi.org/10.1093/ajcn/51.2.241) |
| Carbs follow training load | Thomas, Erdman & Burke 2016, *Med Sci Sports Exerc* 48:543 — [doi](https://doi.org/10.1249/MSS.0000000000000852) |
| Intra-workout carbs | Jeukendrup 2014, *Sports Med* 44(S1):S25 — [doi](https://doi.org/10.1007/s40279-014-0148-z) |
| Wearable calorie error 27–93% | Shcherbina et al. 2017, *J Pers Med* 7:3 — [doi](https://doi.org/10.3390/jpm7020003) |
| MET values for planned sessions | Ainsworth et al. 2011, *Med Sci Sports Exerc* 43:1575 — [doi](https://doi.org/10.1249/MSS.0b013e31821ece12) |

### Training sources

| Setting | Paper |
|---|---|
| Each muscle ~3×/week | Schoenfeld, Ogborn & Krieger 2016, *Sports Med* 46:1689 — [doi](https://doi.org/10.1007/s40279-016-0543-8) |
| ~10+ weekly sets per muscle, rising | Schoenfeld, Ogborn & Krieger 2017, *J Sports Sci* 35:1073 — [doi](https://doi.org/10.1080/02640414.2016.1210197) |
| Heavy / moderate / light days | Schoenfeld et al. 2017, *JSCR* 31:3508 — [doi](https://doi.org/10.1519/JSC.0000000000002200) |
| Reps in reserve | Helms et al. 2016, *Strength Cond J* 38(4):42 — [doi](https://doi.org/10.1519/SSC.0000000000000218) |
| Failure not required | Refalo et al. 2023, *Sports Med* 53:649 — [doi](https://doi.org/10.1007/s40279-022-01784-y) |
| Progressive overload | ACSM 2009 position stand, *MSSE* 41:687 — [doi](https://doi.org/10.1249/MSS.0b013e3181915670) |
| Rest 2–3 min on compounds | Schoenfeld et al. 2016, *JSCR* 30:1805 |
| Deload week | Bell et al. 2023, *Sports Med Open* 9:87 — [doi](https://doi.org/10.1186/s40798-023-00633-0) |

This is general guidance, not medical or veterinary advice. Check with a doctor, dietitian or vet if you have health conditions.

---

# For developers

## Run it

No build step: plain HTML, CSS and ES modules. Serve the folder over HTTP and open it:

```sh
npm start          # python3 -m http.server 8080 → http://localhost:8080 (family app at /family/)
npm test           # unit tests (node:test)
```

**Folders:** `family/` is the family app, `index.html` + `js/` the trackers (and shared logic the family app loads), `server/` the connector (Cloudflare Worker), `tests/` the tests, `scripts/` the release and link-check scripts, `docs/` the project documents. How it all fits together, including sign-in, encryption and what each AI feature sends, is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Project documents:** [CLAUDE.md](CLAUDE.md) (how changes are made, tested, documented and deployed), [docs/OURPAWMILY_2_0.md](docs/OURPAWMILY_2_0.md) (the approved 2.0 direction), [docs/BUILD_PROGRESS.md](docs/BUILD_PROGRESS.md) (what's built, with evidence, and what's open), [docs/FUTURE_FEATURES.md](docs/FUTURE_FEATURES.md) and [docs/AMENDMENT-US-READ-WATCH-DISCOVER.md](docs/AMENDMENT-US-READ-WATCH-DISCOVER.md) (design only, not built). Run `/update-readme` in Claude Code for a full pass over this README, the help guide and the tour.

**The Check:** every push runs the tests, then opens every kind of link the app builds and every news feed in a real browser, and runs a performance budget on `/family/` (start-up requests, duplicates, layout shift, script size; `scripts/perf/`) (`.github/workflows/check.yml`). A green ✓ on the newest commit (on the repo page, or the **Check** run in Actions — not *github-pages*) means it's safe to deploy the connector.

The camera scanner needs **HTTPS** on a phone. The easiest host is GitHub Pages: repo **Settings → Pages → Deploy from branch** (root folder), then open the site on the phone and **Add to Home Screen**.

## The connector

Accounts and families, photos (R2), 💬 chats (a Durable Object per family), notifications, linked calendars, date ideas, outings, movies and episodes, WHOOP sign-in and the AI features go through a small Cloudflare Worker in [`server/`](server/README.md), with scheduled jobs for the nightly check, reminders and the weekly date scout (the news edition runs only when `NEWS_ON` is set). App changes go live through GitHub Pages; connector changes need a deploy from a computer:

```sh
cd server
npm install        # first time on a fresh copy
npx wrangler deploy
```

Or run `bash scripts/pawdeploy.sh` from anywhere: it pulls the latest code for the branch you have checked out (normally `main`), keeps your local storage id in `server/wrangler.toml`, and deploys. It stops without deploying if the pull fails or the storage id is still the placeholder. To get the short `pawdeploy` command, run this once from the project folder (in Git Bash on Windows; use `~/.zshrc` on a Mac):

```sh
echo "alias pawdeploy='bash \"$(pwd)/scripts/pawdeploy.sh\"'" >> ~/.bashrc && source ~/.bashrc
```

Secrets are added with `npx wrangler secret put …` and never committed.

## Releasing an update

Run `node scripts/bump-version.mjs` before committing. It gives every tracker file a new `?v=` address (through the import map in `index.html`) and renames the offline cache, so phones never mix old and new files after an update. For the family app, raise the `?v=` on `app.js` and `style.css` in `family/index.html` by hand; phones then offer *tap to update*. To bring this README up to date, run `/update-readme` in Claude Code.

## Code map

| File | What it does |
|---|---|
| `js/app.js` | Tabs, Home, Food, check-ins, profiles |
| `js/plan.js`, `js/foods.js` | Targets, meal planning, foods, check-in math |
| `js/dayPlan.js` | 🍽 One food day — targets, plan, log, what's left, drinks, What fits — shared by the trackers and 💪 Health |
| `js/foodText.js` | 🎙️ Tell me on the phone: everyday sentences → foods and amounts |
| `family/health.js`, `family/meals.js` | 💪 The Health screen (Today's three anchors) and logging food from it (the meal sheet, photo, Tell me, ate out, drinks, What fits) |
| `family/fitness.js`, `js/workout.js` | 🏋️ Workouts: build, train (all sets, last time, rest timer), summary and next-step suggestions |
| `js/brief.js`, `js/briefTab.js` | Weather, walk / run / ride windows, dog buttons, golden days, scoreboard |
| `family/crypto.js` | 🔐 End-to-end encryption: sealing, keys on the device, recovery phrase |
| `family/app.js` | 👨‍👩‍👧 The family app: every screen (Home with the house and dogs, Next up, movies, threads and photos, Us, calendar, watch, Me) |
| `family/tour.js` | 📖 The in-app tour pages and "What's new" (kept in step with this README by `/update-readme`) |
| `family/api.js`, `family/ideas.js`, `family/migrate.js` | Talking to the connector (and running it on the phone for the demo); ranking date ideas; bringing over the trackers |
| `js/nextup.js` | ✨ Next up: candidates × free hours, scored on due-ness, weather, calendar and habits |
| `js/dogcal.js` | 🐾 Spotting dog appointments in linked calendars |
| `js/marketMatch.js` | 🛒 Matching listings to what you're looking for, on the phone |
| `server/family.js` | The family API (`/v2/…` on the connector; also runs on the phone for the demo), help desk, nightly maintenance |
| `server/us.js` | 💞 Feeling-like plans and notes: who they're for, days, answers, streaks |
| `server/appts.js` | 🐾 Dog appointments: drivers, repeats, vaccine due dates, spending |
| `server/picks.js` | 💑 Couples picks: events, endings and scoring |
| `server/bingo.js` | 🎲 Show bingo: reading pasted squares, dealing cards, finding bingo |
| `server/goldenPost.js` | ⭐ The dogs' golden-day thank-you notes (sent as a notification; no longer posted) |
| `server/helpAgent.js`, `server/helpGuide.js` | 💬 The help assistant (Claude with account tools) and the guide it answers from |
| `js/dress.js`, `js/dressTab.js` | 👔 Dress for the day (trackers on their own): places from the calendar, layering for each person's weather; `js/dress.js`'s places and weather also feed 👔 Look |
| `js/look.js`, `js/cutout.js` | 👔 Look on the phone: the Closet model, flat-lay layout, today's context, recommendations, swaps, learning; background removal |
| `family/look.js` | 👔 Look's screens (Today, Closet, Saved, Add a Look / item, Find pieces, Swap, Fit Check), loaded when opened |
| `server/dietAi.js` | 🍽 Meal estimates with Claude from one photo or Tell me's words (nothing kept) |
| `server/look.js`, `server/lookAi.js` | 👔 Each person's Closet record and pictures (theirs alone), Fit Checks; naming a piece and finding pieces with Claude |
| `js/dogs.js`, `js/adopt.js` | Dog profiles and documents; adoption board |
| `js/calendar.js`, `js/calTab.js` | Calendar rules, .ics import / export, Calendar tab |
| `js/notes.js`, `js/plans.js`, `js/shows.js` | Us tab: notes, plans, watching |
| `js/lifting.js`, `js/lift.js` | Lifting program and log |
| `js/sync.js`, `js/household.js`, `js/storage.js` | Profiles, the older background sync (until migration), the 🔐 Privacy card |
| `js/server.js` | The connector's built-in address for the family app and trackers |
| `js/account.js`, `js/accountBoot.js` | Saves the trackers to your OurPawmily account (family sign-in) |
| `js/recover.js` | 🛟 Recover: finds every copy of your trackers and adds back what's missing |
| `server/worker.js` | The connector: routing and the scheduled jobs |
| `server/threads.js` | 📖 Threads: boards, replies, polls, reads, who's seen it |
| `server/home.js` | 🏠 Home's shared lists: 🙋 Requests and 🛒 Groceries (sealed text) |
| `server/chat.js`, `server/chatHub.js` | 💬 Chats: who can chat, messages, reactions, reads; each family's live chat room (a Durable Object) |
| `family/chat.js` | 💬 The chat screens, loaded only once the app is on screen |
| `family/search.js` | 🔎 Thread search on the phone (no server index), loaded only when you search |
| `server/albums.js` | 📷 Albums: sealed titles and links, photos in R2 |
| `server/market.js` | 🛒 Market: listings, interest, lending |
| `server/news.js` | 📰 News editions from public feeds, and 🐶 rescue news (hidden; runs only with `NEWS_ON`) |
| `server/scout.js`, `server/outing.js`, `server/links.js` | 💡 Weekly date ideas, 🧭 outings, and checking every link they find |
| `server/search.js` | 🔎 Web search for date ideas: Gemini first, Claude as the backup (outings use Claude only) |
| `server/movies.js`, `server/tv.js` | 🎬 Movies and alerts; 📺 episode dates (TMDB) |
| `server/nudges.js`, `server/push.js` | 📞 Reminders and Next up nudges; 🔔 Web Push and the 15-minute reminders job |
| `server/photos.js` | 📸 Photo files in R2, sizes and the family quota |
| `server/assistant.js` | 🏋️ Ask Claude for workout commands |
