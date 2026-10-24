// What the help assistant knows about the app: one section per topic. The assistant gets all of
// it as its reference; without Claude (no API key, or the on-phone demo) the closest sections
// answer on their own.

export const GUIDE = [
  { id: 'signin', title: 'Signing in', keys: 'sign in login log in google account password reset forgot two factor 2fa verification locked out',
    text: `OurPawmily has no passwords of its own: everyone signs in with their Google account (Continue with Google), so Google's own security — including 2-Step Verification — protects the account.
- Forgot your Google password or can't get into Google? Use Google's account recovery at https://accounts.google.com/signin/recovery, then come back and tap Continue with Google.
- Turn on 2-Step Verification at https://myaccount.google.com/security for the best protection.
- Signed in with the wrong Google account? Me › Sign out, then sign in with the right one.
- "Sign in first" or you were logged out: sign-ins last 30 days; just sign in again.
- First sign-in asks you to confirm you're 13 or older and accept the Terms and Privacy Policy.
- Don't see Continue with Google? The family's connector hasn't been set up with Google sign-in yet; you can still try everything with "Try it on this phone (demo)".` },
  { id: 'family', title: 'Creating a family', keys: 'create family start new family name modules what to manage creator owner',
    text: `After signing in, Create your family: give it a name and your name in it, and choose what it manages (Dogs, Chores, Family feed, Diet & fitness, Calendar). You become its creator. You can change the name and the sections later in Me › Family settings, hand the family over to another grown-up, or delete it. One account can be in up to 5 families.` },
  { id: 'members', title: 'Adding people, kids and pets', keys: 'add member add person partner spouse wife husband kid child children pet dog cat add pet breed birthday',
    text: `Family tab:
- + Add a person: their name, how they're related to you, and their Google email for the invite. Leave the email empty for a young child you manage — they won't have an account.
- + Add a pet: name, kind (dog, cat…), breed and birthday. Everyone in the family sees pets.
- Tap anyone to open their profile; pets show breed, age, food, vaccines and vet once the current app's data is brought over.
- Kids under 13 never get accounts — they're profiles the grown-ups manage.` },
  { id: 'invites', title: 'Invites', keys: 'invite invitation link email join accept expired wrong email resend not working',
    text: `Grown-ups join with an invite sent to their Google email. When you add a person with an email, the app makes an invite link — share it by message, email or copy.
- Only that Google account can use it, once, within 14 days.
- "This invite is for someone else": the person is signed in with a different Google account — sign out and sign in with the email the invite was sent to.
- "Expired or already used": open their profile in the Family tab and tap Send the invite again (or ask me to resend it).
- A friend's family: Family tab › Invite a friend's family. They create their own family (or use one they run) and the two families connect.` },
  { id: 'privacy', title: 'Privacy', keys: 'privacy private who can see share diet fitness kids private pets private connected families friends leak',
    text: `- Only people in your family see it. Outsiders get nothing — not even that it exists.
- Diet & fitness (weight, meals, training) is private until you turn sharing on for a specific person: Me › Who can see my diet & fitness. Nobody can turn it on for you.
- Friends' families (connected families) see only posts you mark "+ connected families", and never emails. Family tab › What friends' families can see: kids are private by default (a post tagging a private kid stays in the family), pets are shared unless you turn them off.
- Progress photos in the diet app stay on your phone.
- Download everything: Me › Download my data. Delete everything: Me › Delete my account.` },
  { id: 'e2ee', title: 'Encryption, family key and recovery phrase', keys: 'encryption encrypted locked lock key recovery phrase new phone device mac computer add a device cant read see posts banner',
    text: `Families are end-to-end encrypted: posts, photos, notes, plans, diet & fitness and the dogs' details are locked on your devices with a family key the server never sees. A device needs that key: invite links carry it; on a phone that can read your family go to Me › 🔐 Encryption › 📲 Add a device and open that link on the new phone or computer; or use Me › 🔐 Encryption › Use my recovery phrase. A 🔒 banner means this device doesn't have the key yet. Write your recovery phrase down (Me › 🔐 Encryption › 🔑 Recovery phrase) — nobody, including the app's maintainer, can recover it for you. The family's creator turns encryption on for an older family in Me › 🔐 Encryption.` },
  { id: 'calendar', title: 'The family calendar', keys: 'calendar event add event repeat reminder month day coming up linked icloud google ical subscribe apple calendar ics appointment drop off pick up',
    text: `📅 Calendar in the bottom bar shows the month with dots for events, linked calendars, dog appointments and plans. Tap a day to see it; Coming up lists the next two weeks. Add an event with ＋ › 📅 Calendar event (all day or timed, repeats, who it's for, a reminder). Tap an event to edit or delete it, or Add to my phone's calendar / Google Calendar. To link an iPhone calendar: Calendar app › Calendars › ⓘ › Public Calendar › Share Link, then paste it under Linked calendars (Google: Settings › your calendar › Secret address in iCal format). Linked events show only on your phone. Because events are encrypted, there's no subscription link for the whole calendar.` },
  { id: 'notify', title: 'Notifications', keys: 'notifications notification notify push alert reminder remind buzz ping not getting turn off iphone home screen test',
    text: `Me › 🔔 Notifications › Turn on for this device, then allow it. Do it once on each phone or computer. On iPhone it only works from the Home Screen app: Share › Add to Home Screen, open OurPawmily from there, then turn it on. You get a nudge for plans, answers and notes; dog appointments, drivers and vaccines due; calendar reminders; comments and help on your posts; golden days and games — switch each kind on or off. Not getting them? Tap Send a test; if nothing shows, check the phone's Settings › Notifications for OurPawmily, or turn it off and on again here. Notifications never show what an encrypted note or plan says.` },
  { id: 'feel', title: 'Feeling like, notes and the Today card', keys: 'feeling like plan suggest dinner movie date night tonight brunch coffee hike note post-it love note streak today card plus menu reply im in maybe another time',
    text: `On the Feed, ✨ What are you feeling like? — tap 🍽️ Dinner, 🍿 Movie, 📺 Show, ☕ Coffee, 🚶 Walk… (or the ＋ button › I'm feeling like…), fill in what, where and when, and send it. Your partner answers 🙌 I'm in, 🤔 Maybe or ⏰ Another time; when you're both in it's a plan 🎉 and shows in ☀️ Today. 💞 Just us has post-it notes only you two see (＋ › Leave a note); ❤️ a note to keep it past a week. ☀️ Today shows the dogs' last meal, the next walk time, tonight's plan and your macros left.` },
  { id: 'feed', title: 'The feed', keys: 'feed post photo share comment like tag hide report block',
    text: `Tap + to post: text and a photo, tag who's in it, and choose who sees it (your family, or + connected families). Like and comment on posts. The ⋯ menu on a post: Delete (yours, or any if you created the family), Hide, Report (flags it to the family's creator), Block the author (unblock in Me).` },
  { id: 'help', title: 'Asking for help (pet sitting, babysitting)', keys: 'ask for help pet sitting babysitting dog walk ride meal request offer sitter',
    text: `Tap + › 🙋 Ask for help: pick pet sitting, babysitting, a dog walk, a ride, a meal or a hand, set the dates and time, add details, and choose who can see it. Open requests from others show at the top of the feed under "Can you help?" — tap I can help and add a note. Whoever asked picks someone, and the request becomes Sorted ✓. Helpers don't see each other's offers.` },
  { id: 'appts', title: 'Dog appointments, vaccines and walk times', keys: 'appointment grooming groomer vet vaccine vaccination dental boarding daycare drop off pick up driver book walk time weather pavement spending cost',
    text: `Dogs & chores tab › 📅 Coming up › ＋ Appointment: pick grooming, vet, vaccination, dental or boarding, the dogs, the place, the drop-off and pick-up times and who drives each (leave "Anyone" and whoever's free taps "who? Tap to take it" — on that screen or the feed). Grooming can repeat every few weeks. Tap an appointment to take or give up a leg, edit it, or mark it ✓ done with the cost; a vaccination sets the next due date on the dog's record. 💉 Vaccines lists what's due soon with 📅 Book it. 🦮 Best time to walk shows today's best hour and warns when the pavement is too hot for paws. 💰 Dog spending adds up the costs.` },
  { id: 'chores', title: 'Chores and the Gold Card', keys: 'chores points gold card laundry garbage poop groceries cleaning dishes walk feed treat meds streak prize champion',
    text: `Chores tab: tap what you did — the dogs (breakfast, dinner, walk, dog park, treat, meds) and the house (poop patrol, garbage, laundry, groceries, cleaning, dishes). 👫 logs it for both of you; Undo removes your own. Points by effort (cleaning 4; laundry, groceries 3; walks, park, poop 2; feeding, meds, garbage, dishes 1). The month's top scorer wins the 🏆 Gold Card (a tie shares it) with a prize the creator sets, and goes into the Hall of fame. ⭐ Golden day = two dog outings, or one plus a treat.` },
  { id: 'bingo', title: 'Show bingo', keys: 'bingo show card cards love is blind netflix watch episode squares game new card set upload prompt chatbot',
    text: `Tap 🎲 at the top. ＋ New card set: type the show, then either ✨ Write them with Claude, 📋 Copy a prompt for any chatbot (paste the answer back), 📄 Load a file (.txt one square per line, or a JSON list), or type your own — at least 24 squares, 30+ is best. Then ▶ Start a game: everyone in the family gets their own shuffled card with a free middle. Tap squares as they happen; a full row, column or diagonal is BINGO and goes on the feed. No app update is ever needed for a new show.` },
  { id: 'picks', title: 'Couples picks (predictions)', keys: 'couples picks predict prediction love is blind couple fight cry cheat drunk altar i do wedding score leaderboard season',
    text: `Tap 🎲 › 💑 Couples picks › ＋ New season: name the show and list the couples, one per line ("Name & Name"). Everyone privately ticks what each couple will do (fight, cry, cheat, get drunk, say "I love you"…) and how it ends (💍 I do, 🙅 no at the altar, 💔 split before the wedding). When their scene airs, tick what happened under "What happened" — that locks everyone's picks for that couple and shows them. +2 for each pick that happens, +5 for calling the ending, −1 for each pick that didn't happen once the ending is in. The leaderboard is at the top; endings go on the feed.` },
  { id: 'golden', title: 'Golden days and notes from the dogs', keys: 'golden day star dogs note thank you post mom dad pets call me',
    text: `A ⭐ golden day is two outings (walks or dog park), or one outing plus a treat, logged in the Chores tab. When the day turns golden, the dogs post a thank-you note on the feed to whoever took them out — a little different each time. They call you Mom & Dad until you pick a name in Me › What the pets call you. The family's creator can turn the notes off in Me › Family settings.` },
  { id: 'import', title: 'Bringing over the current app', keys: 'import bring over migrate port data current app old app backup missing data',
    text: `Me › Bring over the current app (on the phone that has the current app): first tap Download a backup, then Bring it over. It copies your meals, weigh-ins, training, dog duties and calendar, your partner's shared copy (held for them until they accept their invite) and your dogs. It then checks every section arrived (✅ all sections match). Nothing is deleted from the current app; running it again refreshes the copies. Your partner should run it on their phone too, to bring their own latest data.` },
  { id: 'account', title: 'Your account', keys: 'account delete account download data export sign out all devices devices sessions leave family',
    text: `Me › Account & security: see where you're signed in, Sign out on all devices, Download my data (a file with everything), Delete my account (type DELETE; your data, posts, comments and likes go; families you created pass to another grown-up, or are deleted if nobody else has joined). Leave a family from Me (if you're not its creator).` },
  { id: 'diet-setup', title: 'Diet app: setting up your plan', keys: 'diet app setup profile targets calories macros goal weight pace cut maintenance plan set up',
    text: `In the current app's Food tab, set up your profile (Profile): sex, age, height, weight, activity, goal weight and pace. The app works out daily calories and protein, fat and carbs, splits them across Meal 1, 2 and 3 (breakfast, lunch, dinner) and suggests foods sized to hit each meal's target. Workouts from Train (or WHOOP/Strava) add calories on active days. Weigh in a few times a week; weekly check-ins fine-tune the calories.` },
  { id: 'diet-meals', title: 'Diet app: meals and macros', keys: 'meal macros protein carbs fat add food swap portion grams packaged factor prepared enter macros manual low carb rest day same every day lock daily combo',
    text: `Tap a meal to open its page:
- Bars show Protein, Carbs and Fat against the meal's target.
- Foods are grouped as Protein, Carbs, Veggies and Fats; each has its own + Add… list with only that kind of food. "+ New … (enter its macros)" adds your own food (e.g. a store-bought item) by its label.
- 📦 Packaged meal (Factor, a meal-prep kitchen): type the label's protein, carbs, fat (and calories); save it to pick next time.
- ✍️ Enter the meal's macros yourself: type a whole meal's numbers.
- 🔒 Same every day: keeps this meal daily; other meals balance around it.
- 🥑 Low-carb today: protein stays, carbs drop to ~10% of the meal, half come back as fat. 😴 Rest day above the meals does all three.
- Use − / + or type grams; swipe a food left to remove it; ✓ I ate this logs it.` },
  { id: 'demo', title: 'The demo', keys: 'demo try on this phone test without google',
    text: `"Try it on this phone (demo)" runs the whole family app on that phone only — nothing is sent anywhere. Sign in as anyone; to try an invite, copy the link, sign out, sign in with the invited email, and open the link.` },
  { id: 'problems', title: 'Something isn’t working', keys: 'bug glitch broken not working error crash slow blank screen stuck update refresh problem report',
    text: `Try these first: pull down to refresh or close and reopen the app; make sure you're online; check you're signed in with the right Google account (Me). The app updates itself — reopening loads the newest version. Still broken? Tell me what you were doing and what you saw, and I'll file it for the app's maintainer.` },
];

export const GUIDE_TEXT = GUIDE.map((s) => `## ${s.title}\n${s.text}`).join('\n\n');

const STOP = new Set('can cant the and for you your how what who does with this that are not why when where get got have has use using about'.split(' '));

// The closest guide sections to a question, for answering without Claude: whole-word hits on a
// section's keywords count most, a shared word stem (invite / invited) a little.
export function guideMatch(question, n = 2) {
  const words = (String(question || '').toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => w.length > 2 && !STOP.has(w));
  const scored = GUIDE.map((s) => {
    const keys = `${s.keys} ${s.title}`.toLowerCase().match(/[a-z0-9]+/g);
    const score = words.reduce((a, w) => a + (keys.includes(w) ? 3 : w.length > 3 && keys.some((k) => k.length > 3 && (k.startsWith(w) || w.startsWith(k))) ? 1 : 0), 0);
    return { s, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.filter((x) => x.score * 3 >= scored[0].score * 2).slice(0, n).map((x) => x.s);
}
