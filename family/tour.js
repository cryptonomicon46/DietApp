// 📖 The tour: what's in the app, one screen per area, plus "What's new" after an update.
// Plain data so it's easy to keep in step with the README (update both together).
// Each slide: id, eyebrow, title, cards [icon, title, text], and `go` = the screen "Show me" opens.

export const SLIDES = [
  { id: 'welcome', welcome: true, title: 'Welcome to {family}', text: 'Here’s a 2-minute look at what’s here: the dogs, the chores, plans, photos and the calendar.', note: '🔒 Everything you post is locked on your phone first.' },
  { id: 'oneminute', eyebrow: 'The basics', title: 'The app in one minute', cards: [
    ['📱', 'Like an app', 'Add it to your Home Screen. It works on a Mac or iPad too.'],
    ['🔑', 'Google sign-in', 'No new password: your Google account keeps it yours.'],
    ['🧭', 'Getting around', 'Family · Dogs & chores · 💞 Us · Calendar · Trackers along the bottom; ＋ creates anything; ❓ is help.'],
    ['🔒', 'Private', 'What you write and post is locked on your phone before it’s sent.'],
  ] },
  { id: 'moments', eyebrow: 'Family › Moments', title: 'Your day and your photos, in one feed', go: 'feed', cards: [
    ['✨', 'Next up', 'The one thing to do next and when: a walk, a run, calling Mom, a new episode.'],
    ['📸', 'The feed', 'Photos and updates for the family, with likes, comments and 🙋 asks for help.'],
    ['📷', 'Albums', 'Link a Google Photos album, or copy favorites in. Only the family sees them.'],
    ['📰', 'News', 'Politics, Tech and Bay Area headlines, twice a day. Pick topics with ⋯.'],
    ['🎬', 'Movies', 'What’s in theaters and coming, with scores. Turn it on in Me.'],
  ] },
  { id: 'threads', eyebrow: 'Family › Threads', title: 'Longer conversations, in your own time', go: 'threads', cards: [
    ['📚', 'Write it up', 'Learned, Talk, How-to, ❓ Ask or 📊 Poll — for just you two, the family, or friends’ families.'],
    ['📷', 'Screenshots', 'Add plan comparisons or tables: pick, paste or drag them in, with a caption each.'],
    ['🏷️', 'Tag people', 'Tap a face or type @. They get a notification; new things land in ✨ For you.'],
    ['✨', 'Tidy it up', 'Turns rough notes into headings and bullets, only when you tap it.'],
  ] },
  { id: 'dogs', eyebrow: 'Dogs & chores', title: 'The house and the dogs, top to bottom', go: 'pets', cards: [
    ['🏆', 'Gold Card', 'The month’s chore race, with a prize for the winner.'],
    ['🏠', 'The house', 'Cooking, dishes, laundry: log it for you, your partner or both.'],
    ['🐾', 'The dogs', 'Fed, walked, park, treats, meds. A ⭐ golden day is two outings, or one and a treat.'],
    ['📅', 'Appointments', 'Groomer, vet, vaccines, who drives. Ones in your calendars are suggested.'],
    ['🐶', 'Rescue news', 'Dogs up for adoption nearby, checked daily.'],
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
  { id: 'me', eyebrow: 'Trackers and Me', title: 'Each person’s own', go: 'me', cards: [
    ['🥗', 'Trackers', 'Food (meal plans, logging, groceries) and Train (lifting, runs, rides). Private until you share.'],
    ['👤', 'Me', 'Your family, people and pets, notifications, light or dark, and your account.'],
    ['🔑', 'Recovery phrase', 'Write it down: it unlocks your family on a new phone if you lose this one.'],
  ] },
  { id: 'privacy', eyebrow: 'Privacy', title: 'Locked on your phone first', cards: [
    ['🔒', 'Locked', 'Posts, photos, notes, plans, threads, albums, diet and fitness, the dogs’ details, events.'],
    ['👀', 'Server sees', 'Names, who’s in the family, the chores log, appointment times, when things happened.'],
    ['🤖', 'AI helpers', 'Optional. Help, Tidy it up and outings use Claude or Gemini; none of them gets your keys.'],
  ] },
  { id: 'help', eyebrow: 'Help', title: 'Stuck? Tap ❓ anytime', cards: [
    ['📖', 'This tour', 'Always in ❓ Help, along with what’s new.'],
    ['💬', 'Ask', 'Ask how anything works, or report a problem.'],
    ['❓', 'Right where you are', 'Empty screens have a “How this works” link.'],
  ] },
];

// After an update with new features: one card on Moments for people who aren't new.
export const WHATS_NEW = {
  id: '2026-10b',
  title: 'New: screenshots and tags in Threads',
  text: 'Plus Albums, News, Movies and ❓ Help',
  slides: ['new', 'help'],
};
SLIDES.push({ id: 'new', eyebrow: '✨ What’s new', title: 'New this month', cards: [
  ['🏷️', 'Threads: screenshots and tags', 'Add screenshots with captions, tag people with @, and see what’s for you in ✨ For you.'],
  ['📷', 'Albums', 'Family › Moments: link Google Photos albums or copy photos in.'],
  ['📰', 'News', 'Politics, Tech and Bay Area headlines on Moments, and 🐶 rescue news on Dogs.'],
  ['🎬', 'Movies and 🆕 episodes', 'Turn Movies on in Me; Watch shows new episodes and what’s up next.'],
  ['🖥️', 'Bigger screens', 'On a Mac or iPad, a sidebar and two columns.'],
] });

export const TOUR = SLIDES.filter((s) => s.id !== 'new').map((s) => s.id);
export const slide = (id) => SLIDES.find((s) => s.id === id) || null;
// The tour page for the screen you're on.
export const SCREEN = { feed: 'moments', threads: 'threads', pets: 'dogs', us: 'us', watch: 'calendar', calendar: 'calendar', me: 'me', family: 'me', member: 'me' };
