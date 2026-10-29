// 📖 The tour: what's in the app, one screen per area, plus "What's new" after an update.
// Plain data so it's easy to keep in step with the README (update both together).
// Each slide: id, eyebrow, title, cards [icon, title, text], and `go` = the screen "Show me" opens.

export const SLIDES = [
  { id: 'welcome', welcome: true, title: 'Welcome to {family}', text: 'Here’s a 2-minute look at what’s here: today at home, the two of you, the calendar, threads and photos, and your health.', note: '🔒 Everything you post is locked on your phone first.' },
  { id: 'oneminute', eyebrow: 'The basics', title: 'The app in one minute', cards: [
    ['📱', 'Like an app', 'Add it to your Home Screen. It works on a Mac or iPad too.'],
    ['🔑', 'Google sign-in', 'No new password: your Google account keeps it yours.'],
    ['🧭', 'Getting around', 'Home · 💞 Us · Calendar · Threads · Health along the bottom; 💬 chats, ❓ help and ＋ create at the top.'],
    ['🔒', 'Private', 'What you write and post is locked on your phone before it’s sent.'],
  ] },
  { id: 'home', eyebrow: '🏠 Home', title: 'What the household needs today', go: 'home', cards: [
    ['✨', 'Next up', 'The one thing to do next and when: a walk, a run, calling Mom, a new episode.'],
    ['🔔', 'Needs you', 'A hand someone asked for, a ride nobody’s driving, a thread you’re tagged in — and 🙋 Ask for a hand.'],
    ['🛒', 'Groceries', 'One list the whole household shares: add, tick, clear.'],
    ['🏆', 'The house', 'The Gold Card chore race, and cooking, dishes and laundry: log it for you, your partner or both.'],
    ['🐾', 'The dogs', 'Fed, walked, park, treats, meds; appointments, vaccines and more under More about the dogs.'],
  ] },
  { id: 'threads', eyebrow: '📖 Threads', title: 'Longer conversations, and your photos', go: 'threads', cards: [
    ['📚', 'Write it up', 'Learned, Talk, How-to, ❓ Ask or 📊 Poll — for just you two, the family, or friends’ families.'],
    ['📷', 'Screenshots and 📎 PDFs', 'Add plan comparisons, tables or a whole deck as a PDF: pick, paste or drag them in.'],
    ['🏷️', 'Tag people', 'Tap a face or type @. They get a notification, and you see when they’ve seen it.'],
    ['🔎', 'Search and ★ Saved', 'Find anything said in a thread — searched on your phone. ☆ Save the ones you’ll want again.'],
    ['📷', 'Photos', 'Your albums: link a Google Photos album, or copy favorites in. Only the family sees them.'],
  ] },
  { id: 'chats', eyebrow: '💬 Chats', title: 'Message the grown-ups', go: 'chats', cards: [
    ['💬', 'One to one, or everyone', 'A chat with each grown-up in the family, and 👨‍👩‍👧 Grown-ups when there are three or more.'],
    ['😊', 'Emojis, reactions, replies', 'Tap a message to react, reply or unsend. Add photos, screenshots or PDFs with ＋.'],
    ['⚡', 'Instant', 'Messages arrive as they’re sent, with typing… and ✓✓ Read.'],
    ['🧒', 'Grown-ups only', 'Never pets or kids: only people with their own account who are 18 or over.'],
  ] },
  { id: 'us', eyebrow: '💞 Us', title: 'Just the two of you', go: 'us', cards: [
    ['📺', 'Watch', 'What you’re watching and what’s next. ＋ Episode logs tonight; Want to Watch → Watching → Watched.'],
    ['📚', 'Read', 'What each of you is reading or listening to. ＋ Book, pick it, 📖 Reading or 🎧 Listening — done.'],
    ['❤️', 'Dates', 'Plans you answer 🙌 / 🤔 / ⏰, 🧭 Plan an outing, and the 2-2-2-2 rhythm.'],
    ['✨', 'Ideas for Us', 'A few movies, new restaurants and events. 💗 privately, 💬 discuss, and a match becomes a plan.'],
    ['💌', 'Notes', 'Little notes just for the two of you.'],
  ] },
  { id: 'calendar', eyebrow: '📅 Calendar', title: 'When it’s happening', go: 'calendar', cards: [
    ['📅', 'One family calendar', 'Everyone’s events, ⭐ golden days, ❤️ dates, 🐾 appointments, linked phone calendars.'],
    ['👔', 'Today’s Look', 'What to wear today, from clothes you own — tap it for Look.'],
    ['❤️', 'Plans and dates', 'A plan you both said yes to goes on both your calendars.'],
  ] },
  { id: 'me', eyebrow: 'Health and Me', title: 'Each person’s own', go: 'me', cards: [
    ['💪', 'Health', 'Your day: today’s weight, calories and protein, how your plan is going, and today’s workout — Start Workout opens Train, and Resume picks it up. Private unless you share.'],
    ['👤', 'Me', 'Your family, people and pets, notifications, light or dark, and your account.'],
    ['🔑', 'Recovery phrase', 'Write it down: it unlocks your family on a new phone if you lose this one.'],
  ] },
  { id: 'privacy', eyebrow: 'Privacy', title: 'Locked on your phone first', cards: [
    ['🔒', 'Locked', 'Posts, photos, messages, notes, plans, threads, albums, diet and fitness, the dogs’ details, events.'],
    ['👀', 'Server sees', 'Names, who’s in the family, the chores log, appointment times, when things happened.'],
    ['🤖', 'AI helpers', 'Optional. Help, Tidy it up and outings use Claude or Gemini; none of them gets your keys.'],
  ] },
  { id: 'help', eyebrow: 'Help', title: 'Stuck? Tap ❓ anytime', cards: [
    ['📖', 'This tour', 'Always in ❓ Help, along with what’s new.'],
    ['💬', 'Ask', 'Ask how anything works, or report a problem.'],
    ['❓', 'Right where you are', 'Empty screens have a “How this works” link.'],
  ] },
];

// After an update with new features: one card on Home for people who aren't new.
export const WHATS_NEW = {
  id: '2026-12c',
  title: 'New: Look — what to wear today',
  text: 'Start with an outfit you already wear; three Looks for today, and a Fit Check with your partner',
  slides: ['new', 'help'],
};
SLIDES.push({ id: 'new', eyebrow: '✨ What’s new', title: 'Look: what to wear today', cards: [
  ['📸', 'Start with a Look you wear', 'One photo of an outfit you already wear is a Look. Find its pieces later — or don’t.'],
  ['👔', 'Three Looks for today', 'From your own clothes, for today’s plans and weather. Swap a piece, then Wear this.'],
  ['❤️', 'Fit Check', 'Send one Look to your partner for a quick Hit or Miss. Only that Look is shared.'],
  ['🔒', 'Yours alone', 'Your Closet and what you wear are private to you. Find it from Today’s Look on Calendar.'],
] });

export const TOUR = SLIDES.filter((s) => s.id !== 'new').map((s) => s.id);
export const slide = (id) => SLIDES.find((s) => s.id === id) || null;
// The tour page for the screen you're on.
export const SCREEN = { look: 'calendar', home: 'home', threads: 'threads', us: 'us', watch: 'us', read: 'us', calendar: 'calendar', me: 'me', family: 'me', member: 'me', chats: 'chats', chat: 'chats' };
