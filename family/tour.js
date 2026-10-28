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
    ['☀️', 'Your day and today', 'The best windows for a run or a walk, and what’s happening at home today.'],
    ['🏆', 'The house', 'The Gold Card chore race, and cooking, dishes and laundry: log it for you, your partner or both.'],
    ['🐾', 'The dogs', 'Fed, walked, park, treats, meds, and appointments with who drives.'],
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
    ['💌', 'Notes and plans', 'Little notes, and plans you answer 🙌 / 🤔 / ⏰.'],
    ['💡', 'Date ideas', 'Movies, new restaurants and events. 💗 privately; a match becomes a plan.'],
    ['🧭', 'Plan an outing', 'Pick a Bay Area spot and a day; get a timeline with trains, tables and maps.'],
    ['⭐', 'How was it?', 'Rate places after a plan; suggestions learn what you like.'],
  ] },
  { id: 'calendar', eyebrow: 'Calendar and 🍿 Watch', title: 'Your days, and your shows', go: 'calendar', cards: [
    ['📅', 'One family calendar', 'Everyone’s events, ⭐ golden days, ❤️ dates, 🐾 appointments, linked phone calendars.'],
    ['👔', 'Dress for the day', 'What each of you should wear, from the weather where you’ll be.'],
    ['🍿', 'Watch', 'Where you’re up to, 🆕 new episodes, 🕐 up next, bingo and couples picks.'],
  ] },
  { id: 'me', eyebrow: 'Health and Me', title: 'Each person’s own', go: 'me', cards: [
    ['🥗', 'Health', 'Diet (meal plans, logging, groceries) and fitness (lifting, runs, rides). Private until you share.'],
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
  id: '2026-11a',
  title: 'New: a simpler OurPawmily',
  text: 'Five places along the bottom: Home, Us, Calendar, Threads and Health',
  slides: ['new', 'help'],
};
SLIDES.push({ id: 'new', eyebrow: '✨ What’s new', title: 'A simpler OurPawmily', cards: [
  ['🏠', 'Home', 'Today, the house and the dogs on one screen: Next up, your day, chores and the Gold Card, the dogs.'],
  ['📖', 'Threads, and 📷 Photos', 'Threads have their own place at the bottom, with your albums under Photos.'],
  ['💪', 'Health', 'Diet and fitness, where Trackers used to be.'],
  ['🗂', 'Moments and the news are gone', 'Your old posts are kept, not deleted. The health meter is retired.'],
  ['🚩', 'Report and block', 'On a thread, a reply or a chat message someone else wrote: tap ⋯ or the message.'],
] });

export const TOUR = SLIDES.filter((s) => s.id !== 'new').map((s) => s.id);
export const slide = (id) => SLIDES.find((s) => s.id === id) || null;
// The tour page for the screen you're on.
export const SCREEN = { home: 'home', threads: 'threads', us: 'us', watch: 'calendar', calendar: 'calendar', me: 'me', family: 'me', member: 'me', chats: 'chats', chat: 'chats' };
