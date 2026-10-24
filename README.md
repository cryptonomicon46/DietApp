# OurPawmily

**One shared app for a couple and their dogs.** OurPawmily keeps the everyday life of a two-person household with dogs in one place: who fed and walked the dogs, the dogs' health records, a shared calendar, notes and plans for each other, and each person's own food and training. It runs in the phone's browser (add it to the Home Screen and it works like an app), needs no account, and keeps the two phones in step through a private phrase only the two of you know.

## Why it's useful for a family with dogs

- **No more "did you feed them?"** One tap logs a feeding or a walk, and the other phone sees it right away. The 🐕 tab turns red while the dogs still need their meal and green once they've eaten.
- **The dogs' records in one place.** Vaccines with due dates, medications and refills, food and supplements, the vet and microchip, and the certificates themselves as PDFs or photos. Either of you can update them, and both see overdue vaccines and refills due soon.
- **Happier dogs, made into a game.** "Golden days" (two outings, or an outing and a treat), streaks, the happiest month, and a monthly 🪙 gold coin for whoever did the most feedings and walks.
- **Safe walks.** Hour-by-hour weather, air quality and an estimated pavement temperature, so you walk when the asphalt won't burn paws.
- **One family calendar.** Shared events, repeating ones (paychecks, the gardener, the groomer), your iPhone calendars linked in, and the whole thing shown in Apple or Google Calendar.
- **Time for each other.** Daily post-it notes, "feeling like…" plans the other answers with 🙌 / 🤔 / ⏰, and the shows you watch together.
- **Each person's own health goals.** Meal plans with exact portions, a weekly check-in, a lifting program and workout tracking, kept per person: you can view each other's day, but only edit your own.
- **Looking for another dog?** A shared board of adoption ads you've each found, with reactions and a status.
- **Private by design.** Your data lives on your phones and in your own small cloud store, readable only with your household phrase. Nothing personal is in this code repository.

## The seven tabs

| Tab | What it's for |
|---|---|
| **🏠 Home** | Today at a glance: the dog buttons and how close today is to a golden day, today's calendar, your day in time order (best run, ride and dog-walk windows with temperatures; after 9 PM it plans tomorrow), your gyms' yoga and fitness class schedules, your next meal, the weekly check-in and your 30-day weight trend, your partner's latest note and plan, and today's training. |
| **🐕 Dogs** | Pavement temperature and the best walk windows, the Feed / Walk / Dog park / Treat buttons, golden days, dog profiles and documents, the dog-duty scoreboard, and the adoption board. |
| **🍽 Food** | Your meal plan (with the morning weigh-in at the top), plus **Weight**, **Groceries** and **Scan** pages from the bar at the top. |
| **🏋︎ Train** | Your training card (WHOOP / Garmin calories, workout fuel), the best run and ride windows, class schedules, and the lifting log. |
| **📅 Calendar** | 💞 The 2-2-2-2 card on top (❤️ Log a date), then the shared family calendar, 👔 how each of you should dress for the chosen day, linked phone calendars, and the subscription link for Apple / Google Calendar. |
| **💞 Us** | One page: 💌 today's notes, ✨ feeling like (plans) and 📺 watching, each a compact section. |
| **🔐 Privacy** | Privacy settings: your household code (show, change, send), sharing status, and how your data is kept. |

## How a family uses it: the secret phrase

Each phone keeps its owner's data, and the two phones share through a **household code**. Think of it as a shared password: whoever has it can see your shared data, so keep it between the two of you.

**Setting up (once, about 5 minutes):**

1. **Open the app on both phones** in Safari (or the browser you'll use) and tap **Share › Add to Home Screen**. Safari, Chrome and the Home Screen icon each keep their own data, so always open it the same way.
2. **Pick whose phone it is.** On first launch each of you taps your own name. You can only edit your own profile on your phone; your partner's is view-only.
3. **Choose a secret phrase together**, out loud or in person: something only the two of you would know and nobody could guess, ideally 4 or more unrelated words (for example *"purple kites over the bay"*). Avoid your names, your dogs' names, your street or birthdays.
4. **Type the same phrase on both phones.** Tap your partner's name at the top, then **Link phones**, type the phrase into the box and tap **Link**. Spaces, dashes and capitals don't matter: "Purple Kites" and "purple-kites" are the same.
   *Or* skip the phrase: one phone taps **Send** to text its code, and the other enters it or taps the link.
5. **Done.** Within a few minutes each phone shows the other's feedings, walks, notes, events and dog records.

**Changing the code (now and then, or if it may have been seen):** go to **🔐 Privacy › Our household code › 🔄 Change our code**. Either of you can do it.

- Everything moves to a new random code, and the old one is emptied, so an old screenshot or link shows nothing.
- The other phone pauses sharing and pops up **New household code**.
- Tap **Send to…** to send the new code privately (Messages or AirDrop). Your partner taps the link or pastes the code, and you're both back in sync.
- Re-add the calendar subscription afterwards, because its link contains the code.

**Good habits:**
- Never post the phrase or code in a group chat or on social media, or put it in a screenshot.
- Lock both phones with Face ID or a passcode.
- Don't store passwords, ID or bank numbers in notes or documents.

## Privacy and security

- **Where data lives.** Each phone stores its owner's data in the browser. A small Cloudflare worker (the *connector*) holds a copy of each person's shared data, filed under your household code, so the other phone can read it.
- **What the connector requires.** It answers only to the right code and only over HTTPS. Service keys (Claude, WHOOP, Strava) are kept as Cloudflare secrets, never in the app or this repository. WHOOP and Strava sign-ins stay on the phone that made them.
- **What's in the repository.** It holds only the app's code. Anyone who downloads or opens the app gets their own empty copy with its own new code. `.gitignore` blocks exports, documents, photos and connector secret files from ever being committed.

---

# Detailed specifications

## 👨‍👩‍👧 OurPawmily Families (beta)

The next version of the app, at `/family/` (also linked from 🔐 Privacy). It runs alongside the current app, which keeps working unchanged.

- **Sign in with Google.** Your account is protected by Google's sign-in, including its 2-Step Verification. No shared phrase is needed.
- **Families:** one person creates the family and becomes its creator.
  - **People:** add a partner, kids, parents and others. Grown-ups get an **invite by email**, and only that Google account can accept it (once, within 14 days). Young kids can be added without an account and managed by the grown-ups.
  - **One set of dogs:** the family app's dogs and the trackers' 🐕 Dogs tab are the same dogs. Name, breed, birthday and photo come from the family app; food, meds, vaccines and the vet are edited in the trackers and show on the pet's profile. Each side picks up the other's changes when the trackers sync with your account, the newest edit of each detail wins, and a dog in only one app is added to the other (matched by name, so no duplicates).
  - **Pets:** add each pet with a photo, its breed and birthday (✎ Edit on the pet's profile changes the photo). Photos are cropped square and shrunk on the phone before upload. Everyone in the family sees the pets.
- **🏠 Feed, top to bottom:**
  - **☀️ Today:** whether the dogs have been fed (tap to log), the next good walk time, tonight's plan, and your macros left (from your trackers).
  - **✨ What are you feeling like?** One tap on 🍽️ Dinner, 🍿 Movie, 📺 Show, 🥞 Brunch, 🥗 Lunch, ☕ Coffee, 🚶 Walk, 🏋️ Work out or ✨ Other opens the form with that picked: what, where, when (tonight, today, tomorrow, this weekend, a day), a time, a note, and who (just you two, or the whole family). Your partner gets a bold **NEW** card with 🙌 I'm in · 🤔 Maybe · ⏰ Another time; when everyone's in it becomes **🎉 It's a plan!** (with Directions, and Get tickets for a movie) and shows in Today. Your own suggestions show ⏳ waiting, with Another day / Cancel; ✓ We did it moves it to the recap chips.
  - **💞 Just us:** post-it notes only the two of you see (five colours, quick emoji), ❤️ to keep one, a note streak; they clear after a week unless hearted.
  - **📅 Coming up:** the next agreed plan and dog appointment, flagging a ride nobody has taken.
  - Then posts. Everything in ✨ and 💞 is end-to-end encrypted. The trackers' old "Feeling like" plans, answers and notes come over automatically the first time each of you opens the feed.
- **＋ (center of the bottom bar, and top right):** ✨ I'm feeling like… first, then 💌 Leave a note, 📸 Post, 🐾 Dog appointment, 🙋 Ask for help.
- **Feed:** a private, Instagram-style feed with photos, captions, tags for the people and pets in a photo, likes and comments. A family's posts are seen only by that family.
- **Connected families:** anyone can invite a close friend, who then creates their own family (or uses one they run). The two families are then connected, and a post shared with *+ connected families* shows up for them too. Nothing else is shared with them, not even email addresses.
- **Privacy:** your diet & fitness (weight, meals, training) is private until you turn sharing on for a specific person in **Me › Who can see my diet & fitness**.
- **🔐 End-to-end encryption:** each family has a secret key that lives only on its members' devices. Posts, photos, comments, notes and plans, everyone's diet & fitness, the dogs' details and appointment notes are locked on the phone before they're sent, so the server (and Cloudflare, and the app's maintainer) only stores text it can't read. New families start encrypted; an existing family's creator turns it on in **Me › 🔐 Encryption**, which locks everything already stored.
  - **Getting the key on a device:** an invite link carries it (after the "#", which never reaches a server); **📲 Add a device** makes a link for your other phone or computer (or for a partner who joined before encryption); or **🔑 Recovery phrase** (25 letters/digits you write down) unlocks a backup of your keys on a new device.
  - **Friends' families:** each connection has its own key, carried in the connection invite; posts shared with them get a key of their own, locked for your family and each connection.
  - **Not encrypted** (the server needs these to work): names of family members and pets, who's in which family, the chores log and Gold Card, games, golden-day notes and appointment dates and drivers.
  - A device without the key shows a 🔒 banner and locked posts, and the trackers don't send anything until it has the key.
- **Profiles:** each person's profile shows their posts and, if they've shared it with you, their weight trend and how many days they logged meals. Each pet's profile shows its breed, age, food, vaccines (with a heads-up when one is due) and vet.
- **Bring over the current app** (Me tab): copies everything the current app keeps on that phone into the family. Your own data goes to you, your partner's shared copy is held for them until they accept their invite, and each dog becomes a pet. **Download a backup** first saves the whole current app as a file. Nothing is deleted, and running it again refreshes the copies. Afterwards it reads every copy back from the server and compares it with the phone, section by section (✅ Sam: all 27 sections match: 412 weigh-ins, 210 days of meals…), and flags anything that didn't arrive.
- **Demo:** until the connector is updated and given a Google client ID (see server/README.md), **Try it on this phone** runs the whole thing on the phone itself. You can sign in as different people to try invites.
- **Choose what to manage:** when creating a family, pick from 🐶 Dogs, 🧺 Chores, 📸 Feed, 🥗 Diet & fitness and 📅 Calendar. Change it later in Me › Family settings, where the creator can also rename the family, hand it over or delete it.
- **🐾 Dogs & chores** (tab): everything about the dogs on one screen.
  - **📅 Coming up:** dog appointments (✂️ grooming, 🩺 vet, 💉 vaccination, 🦷 dental, 🏨 boarding). Each has the dogs going, the place, a 🚗 drop-off and a 🏁 pick-up with a driver, a repeat (e.g. grooming every 6 weeks) and notes. A leg nobody has taken shows "who? Tap to take it", on this screen and on the feed card the appointment posts. Mark it ✓ done with the cost; a vaccination sets the dog's next due date (rabies and DHPP every 3 years, the rest yearly), which the trackers pick up, and a repeating one books the next.
  - **💉 Vaccines:** anything due within 60 days, with 📅 Book it (or "booked ✓").
  - **🦮 Best time to walk:** today's best hour from the San Jose forecast, an hour-by-hour strip, and a pavement-heat warning for paws.
  - **The dogs:** a card each with photo, breed, age, weight, food and the most urgent vaccine or meds refill.
  - **How happy are the dogs:** golden days and outings this month, the golden-day streak, and the last 12 months.
  - **💰 Dog spending** this year, from the costs added to finished appointments.
  - Then the shared log, house chores and the Gold Card (below).
- **🏆 Chores** (same tab): one shared log for the family. Pick **Who did it? Me · 👫 Both · <your partner>**, then tap what was done, so either of you can log a chore for the other. Got it wrong? Each entry has the other two choices (e.g. **Me · 👫 Both** on one logged for your partner); points follow. Switching to 👫 Both offers to add your partner to your earlier entries today. Whoever logged an entry (or did it) can undo it. **🏠 The house** folds away with Hide / Show (remembered on each phone) and still counts for the Gold Card.
  - **The dogs:** 🍳 Breakfast, 🍲 Dinner, 🦮 Walk, 🌳 Dog park, 🦴 Treat, 💊 Meds, with ⭐ Golden day and a week strip.
  - **The dogs say thank you:** when a day turns ⭐ golden, the dogs post a note on the feed thanking whoever took them out ("Dear Dad, thank you for a walk and the dog park… P.S. Please disregard any sock incidents. Forever yours, …"). Each note is put together from a greeting, a line about the day, a quirky P.S. and a sign-off, and recent lines aren't reused, so they read differently every time. One post a day, family only. Set what the pets call you in **Me › What the pets call you** (Dad, Mom…), and the family's creator can turn the notes off in Family settings.
  - **The house:** 💩 Poop patrol, 🗑️ Garbage, 🧺 Laundry, 🛒 Groceries, 🧽 Cleaning, 🍽️ Dishes.
  - **Points by effort** (cleaning 4; laundry and groceries 3; walks, park and poop patrol 2; feeding, meds, garbage and dishes 1; treats are for love). Every tap gets a little burst of ✨ and says where you stand.
  - **The Gold Card:** the month's top scorer wins a gold card, with a prize the family's creator sets (e.g. "picks date night"). A tie shares it. The race shows points, chores and 🔥 streaks, the winner tops the feed in the first week of the next month, and past winners go in the **Hall of fame**.
  - Bringing over the current app also brings its feeding, walk, park and treat history into this log.
- **🎲 Show bingo** (🍿 at the top › 🎲 Bingo & 💑 picks, or 🎲 Bingo on a show): before an episode, start a game from a card set and everyone in the family gets their own shuffled 5×5 card with a free middle. Tap squares as they happen; the first full row, column or diagonal is BINGO 🎉, the win goes on the feed, and everyone's progress shows under the card. **New show, no app update:** ＋ New card set → ✨ *Write them with Claude* (when the connector has an Anthropic key), 📋 *Copy a prompt* for Claude/ChatGPT and paste the squares back, 📄 *Load a file* (.txt one per line, or a JSON list), or type your own. Card sets stay in the family.
- **💑 Couples picks** (🍿 › 🎲 Bingo & 💑 picks): a prediction game for dating shows like Love Is Blind. Start a season with the couples (one per line, "Name & Name"; add more later) and everyone privately ticks what each couple will do: 💥 fight, 😭 cry, 💔 cheat, 🍷 get drunk & pass out, ❤️ say "I love you", 👪 family disapproves, 🔥 an ex comes up, 💸 fight about money (plus your own), and how it ends: 💍 both say "I do", 🙅 a "no" at the altar, or 💔 split before the wedding. When a couple's scene airs, anyone ticks what happened. That locks everyone's picks for that couple and reveals them. Scoring: +2 for each pick that happens, +5 for calling the ending, and −1 for each pick that never happened once the ending is in, so ticking everything doesn't pay. A leaderboard keeps score, and each ending goes on the feed with who called it.
- **🙋 Ask for help:** a post can be a request (🐾 pet sitting, 🧸 babysitting, 🦮 a dog walk, 🚗 a ride, 🍲 a meal, or a hand) with dates and a time. Open requests from others sit at the top of the feed under **Can you help?** People tap **🙋 I can help** with a note, and whoever asked picks someone, which marks the request **Sorted ✓**. Share it with *+ connected families* to ask friends' families too.
- **What friends' families can see** (Family tab, set by the creator): 🧸 kids are private by default, and 🐾 pets are shared unless you turn them off. Friends' families don't see private members, and a post that tags someone private is kept in the family (and hidden from friends if it was shared before).
- **Safety:** every post has ⋯ → Hide, Report (flagged 🚩 to the family's creator) or Block its author (unblock in Me).
- **Your account:** see where you're signed in, sign out on all devices, download all your data, or **delete your account**. Deleting removes your data, posts, comments and likes everywhere, and families you created pass to another grown-up.
- **First sign-in:** confirm you're 13+ and accept the [Terms](family/terms.html) and [Privacy Policy](family/privacy.html). Younger kids are profiles their parents manage. [How account deletion works](family/delete-account.html).
- **💬 Help** (Me › Help, "Trouble signing in?" on the sign-in screen, and 🔐 Privacy in the trackers): ask how anything works, from setting up a family and inviting people to entering macros and setting up a diet plan. Quick questions are one tap. When the connector has an Anthropic API key, Claude answers and can check your account and families, resend an invite, sign out your other devices (after you confirm) and file a problem. Without the key, or offline, it answers from the built-in guide. **📮 Report a problem** sends a note to the app's maintainer.
- **🛠 Maintainer** (Me tab, for the emails in `ADMIN_EMAILS`): problems people filed, with their help chat; app errors phones hit in the last 7 days (just the error and where, counted); and the nightly check, which repairs leftovers from half-finished changes and lists what it fixed.
- What's in place for the App Store and Google Play, and what's left, is in [family/STORE-READINESS.md](family/STORE-READINESS.md).
- **🥗 Trackers** (bottom bar, when the family manages Diet & fitness): the food, macros, training, dogs and calendar screens you know, now **saved to your OurPawmily account** once you're signed in. They're the same on every phone or computer you sign in on: a new device loads them before it opens, and a change on one device shows up on the others. Your partner's day comes from their account only if they've turned sharing on for you (Me › Who can see my diet & fitness). Friends' families never see anyone's trackers, and kids' details stay inside the family. WHOOP/Strava sign-ins stay on each device. The 👨‍👩‍👧 button at the top of the trackers goes back to the family app, and 🔐 Privacy shows where your trackers are saved. The household code keeps working alongside until both of you have moved over.
- **🛟 Recover my data** (🔐 Privacy in the trackers): finds every copy of your trackers — this device, your account, the household code, the bigger copy the server keeps whenever a much smaller one replaces it, and backup files — shows what each holds, and adds back whatever this device is missing. It never removes or replaces anything. Your partner's phone keeps a copy of your data from household sharing: they tap **Save <your name>'s copy as a file** and you load it with **Add from a backup file**. Each phone also keeps the old copy before a much smaller one replaces it.
- **📅 Calendar** (bottom bar), in the trackers' look: a month grid with a coloured dot for each person's events (one colour each, green for both) and ⭐ golden days, ❤️ us time, 🐾 dog appointments and 💞 plans; the chosen day's list with a name chip on every event; 👔 *Dress for the day* for both of you; and *Coming up* for the next two weeks (appointment drop-offs and pick-ups show who's driving, or "nobody yet"). ＋ › 📅 Calendar event adds one (all day or timed, repeats, who it's for, a reminder); tap an event for ✎ Edit, Delete, **Add to my phone's calendar** (a calendar file) or Google Calendar. Events from the trackers' calendar come over the first time. **Linked calendars:** paste an iCloud public-calendar link or a Google secret iCal address and its events show read-only on your phone; the link itself is saved encrypted. Event titles, places and notes are encrypted like the rest; since the server can't read them, there's no subscription feed to Apple or Google Calendar any more — add events one at a time instead.
- **Family under Me:** the Me tab lists everyone in the family with Manage ›, ＋ Person and ＋ Pet.
- **🔔 Notifications** (Me › 🔔 Notifications, once per device): a nudge when your partner sends a plan, answers yours or leaves a note; when someone books the dogs in or takes a drop-off or pick-up; when the dogs have a ⭐ golden day or someone starts or wins bingo; and when someone comments on your post or offers help. Reminders come the day before and an hour before an appointment, at an event's reminder time, and at 9 AM a week before and on the day a vaccine is due. Turn each kind on or off, send a test, or turn it off for one device. On iPhone, add the app to the Home Screen first (Share › Add to Home Screen) and turn them on from there. Notifications say who did what, never what an encrypted note, plan or event says.
- **🍿 Watch** (🍿 at the top, or ＋ › Add to Watch): the shows and movies you watch together. **Now** has what you're watching, each with where you're up to (S2 · E5, ＋ Episode), 📺 *We watched tonight*, everyone's ★ ratings, ▶️ / 🎉 / ✋ status, and 🎲 *Bingo* (starts that show's game from its card set, or makes one). **By month** and the **year recap** (nights, shows, movies, finished, most watched, your favourite, which service) work as they did in the trackers, whose 📺 Watching list comes over the first time. Titles and services are end-to-end encrypted. **🎲 Bingo & 💑 picks ›** opens the games.
- **One app:** the Home Screen icon opens OurPawmily, and 🥗 Trackers in its bottom bar opens food, macros and training (the sign-in screen also has *Just the trackers? Open them without signing in*). Once you're signed in, the trackers drop their 🐕 Dogs and 💞 Us tabs — the dogs, plans, notes and shows live in OurPawmily — and Home links there instead; run/ride windows, gym classes and the calendar stay. A pet's page in OurPawmily has *✎ Edit in 🥗 Trackers › Dogs* for food, meds, vaccines and the vet. *Ask Claude* in the trackers goes through your account.
- **The household code retires** on its own once you're both on accounts and share your diet & fitness with each other: nothing is uploaded to it any more, the trackers say so in 🔐 Privacy, and its last copies stay on the server for 🛟 Recover my data.

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
  - **Documents:** vaccine certificates and vet records as PDFs or photos (up to 10 MB), opened with one tap on either phone.
  - Overdue vaccines and refills due within a week show here and on Home.
- **🏆 Dog duty:** who did the feedings, walks and park trips, for Today, this Month or this Year, with the leader crowned 👑. Each month's leader wins a **🪙 gold coin** (ties get none), and the year's coins and each month's winner are listed.
- **🏡 Dogs up for adoption** (bottom): a shared board of adoption ads.
  - **Adding a dog:** tap **＋ Add a link**, then **📋 Paste** the ad's link (Facebook: Share › Copy link; tracking parameters are removed). Add the name, age, sex, size, breed, where, notes and a screenshot of the ad, which is shrunk to save space.
  - **Each card shows:** the photo, **Open ad ↗**, both partners' reactions (❤️ 👍 🤔 👎) and a status (Just found → Interested → Contacted → Applied → Meet & greet). *Pass*, *Adopted by others* or *🎉 Ours!* moves the card to **Past**.
  - A dog the other partner adds is marked **New** and mentioned on Home.
  - Facebook doesn't let other sites show its posts, so the card keeps what you type plus the screenshot.

## 🍽 Food

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
- **💪 Encouragement for checking in:** after the morning weigh-in and each logged meal, a short line of encouragement appears right there (never a pop-up). A day with the **weigh-in and breakfast, lunch and dinner logged** gets a 💪 — on the Food day bar, on Home (with your streak) and on the shared 📅 Calendar, where tapping the day shows which of you checked in.
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

**Groceries.** A weekly list built from the plan, grouped by store, with checkboxes.

**Scan.** Scan a barcode (or type it) for macros from [Open Food Facts](https://world.openfoodfacts.org), see how it fits, and add it to a meal, a snack or the grocery list.

## 🏋︎ Train

- **Log a workout in one tap:** 🏋️ Lifting (jumps to today's session), 🔥 Hot yoga, 🏃 Run, 🚴 Bike (both ask for **miles**, so pace and weekly miles add up), 🧗 Climbing and ✨ Other.
- **🧗 Climbing session:** its own card with a **Bouldering | Top rope | Lead** bar. Count **attempts** (and, optionally, **sends ✓**) per grade with − / + — V4–V6 for bouldering and 5.10a–5.11a for ropes by default, every other grade (V0–V10, 5.8–5.12d) one tap away. One session can mix all three; gym and minutes are saved with it, and **Done** adds it as the day's climbing activity for calories.
- **📈 Progress** (button on the training card): **This week** or **this month**, against the one before:
  - **Lifting:** sessions, sets, volume, new PRs, estimated 1-rep max for squat, bench and deadlift, and **sets per muscle group** against a line at 10 sets a week (scaled for the month), with the change from the last period — training volume rather than the weight itself.
  - **Cardio:** run miles and average pace, bike miles and rides, hot yoga classes and hours (synced WHOOP / Garmin workouts count too).
  - **Climbing:** sessions, top send per style, and sends out of attempts per grade, with highlights like a higher top send or a better send rate.
  - Climbing sessions export as `climbing.csv`.
- **Training card:**
  - Add activities by sport (running, cycling, climbing, lifting, swimming, hiking, HIIT, yoga…) with intensity and minutes.
  - Calories come from your own WHOOP / Garmin history for that sport once there are 3+ sessions, otherwise from standard MET values.
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
- **Devices:**
  - **WHOOP** and **Garmin** (through Strava) sync automatically through the connector.
  - **WHOOP export** and **Garmin CSV** import with no setup.

## 📅 Calendar

- **💞 The 2-2-2-2 rhythm** (top of the 📅 Calendar tab, and on Home): a date every **2** weeks, intimacy **2** times a week, an overnight trip **2** times a year, and a multi-night getaway every **2** years — just the two of you (book the dog sitter).
  - A gentle, rotating love note for the one that's due or coming up: a date that falls due by the weekend, a second time this week (from Thursday on), or a trip that's due. Chips show all four at a glance (✓, soon, due, and 💗 count this week).
  - **✓ We did it** logs it (either phone; trips and dates can be logged for an earlier day), **💗 +1** for intimacy, and **💡 Suggest for Saturday** sends it to your partner as a *Feeling like* plan for the coming weekend, which they answer 🙌 / 🤔 / ⏰.
  - **❤️ Log a date** (top of the card): type what you did (movie, drinks, dinner, a bookshop… anything), where, and the day — no list to pick from. What you've typed before is suggested as you type.
  - Every logged moment shows as a ❤️ on the shared **📅 Calendar**, next to the dogs' ⭐ golden days.
  - **Fix or add later:** tap a day on the calendar (or a moment under *Logged moments*) and **✎ Edit** changes what, where or the day, or **Delete** removes it — from either phone, whoever logged it. **❤️ Log a date on this day** adds another one to that day.
  - A multi-night getaway also counts as an overnight trip. Weeks run Monday to Sunday. Logged moments can be removed.
- **👔 Dress for the day** (under the chosen day, today through a week ahead): for each of you, where you'll be, the feels-like temperature when you leave, at the warmest point and when you get home, and how to layer.
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
- **Show this calendar in Apple or Google Calendar:** subscribe once per phone to see all shared events there.

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

- **Our household code:** masked until *Show*, when it was last changed, **🔄 Change our code** and **Send to…** (see *How a family uses it* above).
- **Sharing between your phones:** when this phone last sent and checked (with *Refresh*), whose phone it is, and a shortcut to the sharing, connector and device settings.
- **How your data is kept:** a short summary of where your data lives and good habits.

## Profiles and sharing

- **Profiles.** There are two profiles (names set in `js/storage.js`). First launch asks whose phone it is. Each person's data (profile, meals, weigh-ins, lifting, coins) is kept separately and is editable only on its owner's phone. The switch at the top shows the other person's day, view-only.
- **Shared things.** Dog feedings, walks, treats and profiles, the calendar, notes, plans, shows and the adoption board are combined from both phones. Each phone writes only its own copy, so nothing is overwritten.
- **Sync.** A phone uploads a few seconds after a change and checks for the other phone's updates every few minutes and when opened.

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

No build step. Serve the folder over HTTP and open it:

```sh
npm start          # python3 -m http.server 8080 → http://localhost:8080
npm test           # unit tests
```

The camera scanner needs **HTTPS** on a phone. The easiest host is GitHub Pages: repo **Settings → Pages → Deploy from branch** (root folder), then open the site on the phone and **Add to Home Screen**.

## The connector

Sharing between phones, dog documents and photos, the calendar feed, linked iCloud calendars, WHOOP / Strava sign-in and *Ask Claude* go through a small Cloudflare Worker in [`server/`](server/README.md). App changes go live through GitHub Pages; connector changes need a deploy from a computer:

```sh
cd server
npm install        # first time on a fresh copy
npx wrangler deploy
```

Secrets are added with `npx wrangler secret put …` and never committed.

## Releasing an update

Run `node scripts/bump-version.mjs` before committing. It gives every app file a new `?v=` address (through the import map in `index.html`) and renames the offline cache, so phones never mix old and new files after an update.

## Code map

| File | What it does |
|---|---|
| `js/app.js` | Tabs, Home, Food, check-ins, profiles, sharing settings |
| `js/plan.js`, `js/foods.js` | Targets, meal planning, foods, check-in math |
| `js/brief.js`, `js/briefTab.js` | Weather, walk / run / ride windows, dog buttons, golden days, scoreboard |
| `family/crypto.js` | 🔐 End-to-end encryption: sealing, keys on the device, recovery phrase |
| `family/` | 👨‍👩‍👧 OurPawmily Families (preview): sign-in, families, invites, feed, privacy, bringing data over |
| `server/family.js` | The family API (`/v2/…` on the connector; also runs on the phone for the demo), help desk, nightly maintenance |
| `server/us.js` | 💞 Feeling-like plans and notes: who they're for, days, answers, streaks |
| `server/appts.js` | 🐾 Dog appointments: drivers, repeats, vaccine due dates, spending |
| `server/picks.js` | 💑 Couples picks: events, endings and scoring |
| `server/bingo.js` | 🎲 Show bingo: reading pasted squares, dealing cards, finding bingo |
| `server/goldenPost.js` | ⭐ The dogs' golden-day thank-you notes |
| `server/helpAgent.js`, `server/helpGuide.js` | 💬 The help assistant (Claude with account tools) and the guide it answers from |
| `js/dress.js`, `js/dressTab.js` | 👔 Dress for the day: places from the calendar, layering for each person's weather |
| `js/dogs.js`, `js/adopt.js` | Dog profiles and documents; adoption board |
| `js/calendar.js`, `js/calTab.js` | Calendar rules, .ics import / export, Calendar tab |
| `js/notes.js`, `js/plans.js`, `js/shows.js` | Us tab: notes, plans, watching |
| `js/lifting.js`, `js/lift.js` | Lifting program and log |
| `js/sync.js`, `js/household.js`, `js/storage.js` | Profiles, household sync, changing the household code |
| `js/account.js`, `js/accountBoot.js` | Saves the trackers to your OurPawmily account (family sign-in) |
| `js/recover.js` | 🛟 Recover: finds every copy of your trackers and adds back what's missing |
| `server/worker.js` | The connector |
