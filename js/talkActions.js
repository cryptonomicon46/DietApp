// 🗣️ Talk to Pawmily — the actions it may propose, and the rules around them (T0: design as tested
// code; nothing calls this yet, no screen uses it, nothing is sent to Claude). docs/TALK_TO_PAWMILY.md.
//
// The assistant never writes anything itself. Claude (later, through the AI gateway) may only answer
// with a plan of these typed steps; the phone checks each one here, shows them as one card, and on
// Apply runs them through each domain's own code (the same paths the screens use, which seal what
// they save with the family key). Domains stay authoritative: Watch writes Watch, Read writes Read…
//
//   kind     read (looks something up, changes nothing) · capture (saves something of yours, after a
//            preview) · coordinate (involves other people)
//   affects  self · couple (your shared list with your partner) · household · shared (another
//            person's time or plans — always proposed to them first, never written for them)
//   via      the existing code and route it reuses (documentation; checked by hand at T1)

// Vocabularies the domains already use (tests check they match their sources).
export const WATCH_STATUSES = ['want', 'watching', 'upnext', 'finished', 'dropped']; // server/family.js
export const BOOK_STATES = ['want', 'reading', 'finished', 'dropped']; // js/books.js STATUSES
export const PLAN_KINDS = ['movie', 'show', 'brunch', 'lunch', 'dinner', 'coffee', 'walk', 'workout', 'other']; // server/us.js
export const PLAN_REPLIES = ['in', 'maybe', 'later']; // server/us.js (decline / counter: decision 3)
export const REQUEST_KINDS = ['ride', 'petsit', 'walk', 'babysit', 'meal', 'errand', 'other']; // server/home.js
export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

// Argument types: compact, turned into JSON Schema for Claude's structured output (jsonSchema).
const str = (max, o = {}) => ({ type: 'string', max, ...o });
const one = (values, o = {}) => ({ type: 'string', enum: values, ...o });
const int = (min, max, o = {}) => ({ type: 'integer', min, max, ...o });
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, TIME = { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' };
const ID = { type: 'string', pattern: '^[A-Za-z0-9:_-]{1,64}$' };
const req = (t) => ({ ...t, required: true });
// One stop of a proposed outing. A place, its hours or a travel time must cite a fact (a provider
// answer the phone holds); a time or "what" you said yourself is { source: 'you' }.
const STOP = { type: 'object', fields: { at: TIME, what: str(80), place: str(120), factId: ID, source: one(['you', 'fact']) } };

export const ACTIONS = {
  'watch.find': { domain: 'Watch', kind: 'read', affects: 'self', args: { query: req(str(120)) }, via: 'family/watch.js + /tv/search, /movies (TMDB)' },
  'watch.add': { domain: 'Watch', kind: 'capture', affects: 'couple', args: { title: req(str(120)), tmdbId: int(1, 1e9), media: one(['movie', 'tv']), status: one(WATCH_STATUSES), aud: one(['us', 'family']) }, undo: 'delete', via: 'family/watch.js → POST /families/:fid/watch/shows (title sealed)' },
  'watch.setStatus': { domain: 'Watch', kind: 'capture', affects: 'couple', args: { showId: req(ID), status: req(one(WATCH_STATUSES)) }, undo: 'previous status', via: 'family/watch.js status update' },
  'read.find': { domain: 'Read', kind: 'read', affects: 'self', args: { query: req(str(120)) }, via: 'family/read.js + /books/search (Open Library)' },
  'read.add': { domain: 'Read', kind: 'capture', affects: 'couple', args: { title: req(str(160)), olWorkId: { type: 'string', pattern: '^OL\\d{1,12}W$' }, state: one(BOOK_STATES), aud: one(['us', 'me', 'family']), recBy: one(['partner', 'member']) }, undo: 'delete', via: 'family/read.js → /families/:fid/books (recBy: decision 5)' },
  'read.setState': { domain: 'Read', kind: 'capture', affects: 'self', args: { bookId: req(ID), state: req(one(BOOK_STATES)), page: int(0, 20000) }, undo: 'previous state', via: '/families/:fid/books/:id/me (your own state only)' },
  'us.plan.propose': { domain: 'Us', kind: 'coordinate', affects: 'shared', args: { kind: req(one(PLAN_KINDS)), day: req(DATE), time: TIME, where: str(120), note: str(300), audience: one(['couple', 'family']), stops: { type: 'array', max: 6, items: STOP } }, undo: 'cancel', via: 'POST /families/:fid/us/plans (body sealed) — the proposal itself' },
  'us.plan.reply': { domain: 'Us', kind: 'coordinate', affects: 'shared', args: { planId: req(ID), reply: req(one(PLAN_REPLIES)) }, undo: 'change reply', via: '/families/:fid/us/plans/:id/reply' },
  'ideas.save': { domain: 'Dates', kind: 'capture', affects: 'couple', args: { text: req(str(160)), kind: one(PLAN_KINDS) }, undo: 'delete', via: 'gap — no saved-ideas list yet (decision 4)', gap: true },
  'calendar.freeBusy': { domain: 'Calendar', kind: 'read', affects: 'self', args: { from: req(DATE), to: req(DATE), who: one(['me', 'partner', 'both']) }, via: 'js/calendar.js occursOn / mergeEvents on the phone (times only, never titles)' },
  'calendar.addMine': { domain: 'Calendar', kind: 'capture', affects: 'self', args: { date: req(DATE), start: TIME, end: TIME, title: req(str(120)) }, undo: 'delete', via: 'POST /families/:fid/events with who = you only' },
  'schedule.feasibility': { domain: 'Calendar', kind: 'read', affects: 'self', args: { from: req(DATE), to: req(DATE), minutes: req(int(5, 24 * 60)), placeFactId: ID }, via: 'free/busy + travel and hours facts (T3); js/nextup.js free hours today' },
  'home.request': { domain: 'Home', kind: 'coordinate', affects: 'household', args: { kind: req(one(REQUEST_KINDS)), day: DATE, time: TIME, text: str(200) }, undo: 'delete', via: 'server/home.js POST /families/:fid/requests' },
  'home.claim': { domain: 'Home', kind: 'coordinate', affects: 'household', args: { requestId: req(ID) }, undo: 'unclaim', via: 'server/home.js /requests/:id/claim' },
  'care.log': { domain: 'Dogs & chores', kind: 'capture', affects: 'household', args: { chore: req(str(40)), pets: { type: 'array', max: 6, items: ID } }, undo: 'un-tick', via: 'POST /families/:fid/care/:date/:id (a family chore)' },
  'fitness.useWorkout': { domain: 'Fitness', kind: 'capture', affects: 'self', args: { templateId: req(ID) }, undo: 'remove from today', via: 'family/fitness.js startWith' },
  'fitness.variant': { domain: 'Fitness', kind: 'capture', affects: 'self', args: { intent: req(one(['lighter', 'shorter'])) }, undo: 'undo variant', via: 'W.proposeVariant → preview → Apply' },
  'fitness.describe': { domain: 'Fitness', kind: 'capture', affects: 'self', args: { text: req(str(1500)) }, undo: 'remove from today', via: '/ai/workout (workout.text) → review → Today\'s Workout' },
  'diet.log': { domain: 'Diet', kind: 'capture', affects: 'self', args: { meal: req(one(MEALS)), text: req(str(600)) }, undo: 'unlog', via: 'family/meals.js: parseMeal on the phone, diet.text for the rest → preview → Log' },
  'threads.draft': { domain: 'Threads', kind: 'coordinate', affects: 'household', args: { title: req(str(120)), body: str(2000) }, undo: 'discard', via: 'opens the Threads composer filled in — never posts' },
  'look.today': { domain: 'Look', kind: 'read', affects: 'self', args: {}, via: 'family/look.js Top 3 on the phone' },
};

// ---------- checking one step ----------
function check(t, v, path, errs) {
  if (v == null || v === '') { if (t.required) errs.push(`${path} is needed`); return undefined; }
  if (t.type === 'string') {
    if (typeof v !== 'string') { errs.push(`${path} should be text`); return undefined; }
    const s = v.replace(/\s+/g, ' ').trim();
    if (t.max && s.length > t.max) errs.push(`${path} is too long`);
    if (t.enum && !t.enum.includes(s)) errs.push(`${path} isn't one of ${t.enum.join(', ')}`);
    if (t.pattern && !new RegExp(t.pattern).test(s)) errs.push(`${path} isn't valid`);
    return s;
  }
  if (t.type === 'integer') {
    if (!Number.isInteger(v) || v < t.min || v > t.max) { errs.push(`${path} should be a whole number ${t.min}–${t.max}`); return undefined; }
    return v;
  }
  if (t.type === 'array') {
    if (!Array.isArray(v)) { errs.push(`${path} should be a list`); return undefined; }
    if (v.length > t.max) errs.push(`${path} has too many`);
    return v.slice(0, t.max).map((x, i) => check(t.items, x, `${path}[${i}]`, errs));
  }
  if (t.type === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) { errs.push(`${path} should be an object`); return undefined; }
    const out = {};
    for (const [k, ft] of Object.entries(t.fields)) { const c = check(ft, v[k], `${path}.${k}`, errs); if (c !== undefined) out[k] = c; }
    for (const k of Object.keys(v)) if (!(k in t.fields)) errs.push(`${path}.${k} isn't allowed`);
    return out;
  }
  return undefined;
}
// A step Claude proposed → { ok, step: {action, args (cleaned)}, errors }. Unknown actions, unknown
// fields and anything malformed are refused, never guessed at.
export function validate(step) {
  const def = ACTIONS[step?.action];
  if (!def) return { ok: false, errors: [`unknown action ${String(step?.action).slice(0, 40)}`] };
  const errors = [], args = check({ type: 'object', fields: def.args }, step.args ?? {}, step.action, errors) || {};
  return { ok: !errors.length, step: { action: step.action, args }, errors };
}

// ---------- what happens to a step once you tap Apply ----------
// read → looked up, nothing saved · apply → saved through its domain after the preview you saw ·
// propose → becomes a proposal to the other person (an Us plan, a request), never a direct write ·
// open → opens the screen filled in (Threads) · unavailable → shown as "not yet".
export function modeOf(action) {
  const d = ACTIONS[action];
  if (!d) return 'unavailable';
  if (d.gap) return 'unavailable';
  if (d.kind === 'read') return 'read';
  if (action === 'threads.draft') return 'open';
  if (action === 'us.plan.reply' || action === 'home.claim') return 'apply'; // answering, not asking
  if (d.affects === 'shared' || d.kind === 'coordinate') return 'propose';
  return 'apply';
}

// ---------- a whole plan (one card) ----------
// Every step valid; every place, opening time or travel time traced to a fact the phone holds;
// at most 8 steps. → { ok, steps: [{action, args, mode}], errors }
export function checkPlan(plan, facts = {}) {
  const errors = [], steps = [];
  const list = Array.isArray(plan?.steps) ? plan.steps : [];
  if (!list.length) errors.push('nothing to do');
  if (list.length > 8) errors.push('too many steps');
  list.slice(0, 8).forEach((raw, i) => {
    const v = validate(raw);
    if (!v.ok) { errors.push(...v.errors.map((e) => `step ${i + 1}: ${e}`)); return; }
    for (const [j, s] of (v.step.args.stops || []).entries()) {
      const fact = s.factId && facts[s.factId];
      if ((s.place || s.source === 'fact') && !fact) errors.push(`step ${i + 1}: stop ${j + 1} names a place or time no lookup gave`);
      if (fact && s.place && fact.name && fact.name !== s.place) errors.push(`step ${i + 1}: stop ${j + 1} doesn't match its fact`);
    }
    if (v.step.args.placeFactId && !facts[v.step.args.placeFactId]) errors.push(`step ${i + 1}: unknown place`);
    steps.push({ ...v.step, mode: modeOf(v.step.action) });
  });
  return { ok: !errors.length, steps, errors };
}

// ---------- names never leave the phone ----------
// People's names → role tokens before anything is sent ("dinner with Pat" → "dinner with [partner]"),
// and back again in what comes back. people: [{ id, name, role: 'me' | 'partner' | 'member' }]
export function toTokens(text, people = []) {
  const map = {};
  let n = 0, out = String(text || '');
  const sorted = [...people].filter((p) => p?.name && p.role !== 'me').sort((a, b) => b.name.length - a.name.length);
  for (const p of sorted) {
    const token = p.role === 'partner' ? '[partner]' : `[member:${++n}]`;
    const re = new RegExp(`(^|[^\\p{L}])${p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}])`, 'giu');
    if (re.test(out)) { out = out.replace(re, `$1${token}`); map[token] = p.id; }
  }
  return { text: out, map };
}
export function fromTokens(text, map = {}, people = []) {
  return String(text || '').replace(/\[(partner|member:\d+)\]/g, (t) => people.find((p) => p.id === map[t])?.name || t);
}

// ---------- what each lookup may tell the assistant ----------
// The facts the phone may put in front of Claude for a request, field by field. Anything else a
// lookup has (titles of calendar events, notes, other people's lists, health history) stays here.
export const CONTEXT = {
  'calendar.freeBusy': ['date', 'start', 'end', 'busy', 'who'],
  'watch.find': ['id', 'title', 'year', 'media', 'status', 'addedBy'],
  'read.find': ['id', 'title', 'author', 'year', 'state'],
  'fitness.day': ['date', 'recovery', 'sleep', 'strain', 'plannedWorkout'], // whoopDay.js dayContextForPlanning
  // External context adapters (T2a/T3): each provider's answer is normalised on the phone or the
  // connector into these fields only — no provider objects travel further (js/talkDay.js).
  'weather': ['date', 'at', 'tempF', 'rainChance', 'windMph'], // dayWeather ← Open-Meteo
  'daylight': ['date', 'sunrise', 'sunset'], // dayWeather ← Open-Meteo
  'food': ['target', 'eaten', 'left', 'meals', 'extrasLogged', 'doneLogging'], // foodFacts ← js/dayPlan.js
  'travel': ['place', 'found', 'address', 'openNow', 'hoursToday', 'drives'], // travelFacts ← server/travel.js ← Google Maps
  'drive': ['leave', 'minutes', 'miles'], // one departure inside travel.drives
};
export function minimizeFacts(adapter, facts) {
  const keep = CONTEXT[adapter];
  if (!keep) return null;
  const pick = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k]) => keep.includes(k)));
  return Array.isArray(facts) ? facts.map(pick) : pick(facts);
}

// ---------- the examples under the Talk box (phrases to start from, not commands) ----------
export const EXAMPLES = {
  home: [['Plan my day', 'calendar.freeBusy'], ['What needs me?', 'home.claim'], ['Plan something this weekend', 'us.plan.propose']],
  us: [['Plan a date', 'us.plan.propose'], ['Add a movie', 'watch.add'], ['Add a book', 'read.add']],
  health: [['Log my meal', 'diet.log'], ['Build today\'s workout', 'fitness.describe']],
  calendar: [['Can I fit something in?', 'schedule.feasibility'], ['When am I free?', 'calendar.freeBusy']],
};
// Only examples whose action is built (and authorized) show.
export function examplesFor(tab, built = new Set()) { return (EXAMPLES[tab] || EXAMPLES.home).filter(([, a]) => built.has(a)).map(([t]) => t); }

// ---------- JSON Schema of one action's arguments (for structured output, later) ----------
function schemaOf(t) {
  if (t.type === 'object') return { type: 'object', properties: Object.fromEntries(Object.entries(t.fields).map(([k, v]) => [k, schemaOf(v)])), required: Object.entries(t.fields).filter(([, v]) => v.required).map(([k]) => k), additionalProperties: false };
  if (t.type === 'array') return { type: 'array', items: schemaOf(t.items), maxItems: t.max };
  if (t.type === 'integer') return { type: 'integer', minimum: t.min, maximum: t.max };
  return { type: 'string', ...(t.max ? { maxLength: t.max } : {}), ...(t.enum ? { enum: t.enum } : {}), ...(t.pattern ? { pattern: t.pattern } : {}) };
}
export const jsonSchema = (action) => schemaOf({ type: 'object', fields: ACTIONS[action].args });

// ---------- the tool registry view: what every action declares ----------
// Anything that can act for Talk — today's phone reader and Claude's steps, later a bounded skill
// ("Day Planner", "Health Planner"…) or an external voice agent — goes through these specs: never
// a database, never a provider's own objects. A future tool is added here first, with all fields.
//   permission  the Family permission area the server already enforces for that domain
//   privacy     what kind of data it touches (decides what may leave the phone, and to whom)
//   access      read (changes nothing) · write (saves through the domain's own code)
//   confirm     'none' (a read) · 'tap' (a card you approve, with Undo) · 'theirs' (a proposal the
//               other person answers — never written for them)
//   output      what comes back to Talk: facts (read), the saved record's id (write), or a proposal id
//   onFailure   what the person sees; nothing is half-saved
const PERMISSION = { Watch: 'us', Read: 'us', Us: 'us', Dates: 'us', Calendar: 'calendar', Home: 'home', 'Dogs & chores': 'home', Fitness: 'fitness', Diet: 'diet', Threads: 'threads', Look: 'look' };
const PRIVACY = { Diet: 'health (yours alone unless you share Diet)', Fitness: 'health (yours alone unless you share Fitness)', Look: 'personal (yours alone)', Calendar: 'schedule (names become roles before any AI)', Threads: 'household messages (never sent to AI by Talk)' };
export function toolSpec(action) {
  const d = ACTIONS[action];
  if (!d) return null;
  const mode = modeOf(action), read = d.kind === 'read';
  return {
    action, domain: d.domain, input: jsonSchema(action),
    output: read ? { type: 'facts', fields: CONTEXT[action] || CONTEXT[d.domain.toLowerCase()] || [] } : mode === 'propose' ? { type: 'proposal', fields: ['id', 'to', 'status'] } : { type: 'saved', fields: ['id'], undo: d.undo || null },
    permission: PERMISSION[d.domain] || 'family', privacy: PRIVACY[d.domain] || (d.affects === 'self' ? 'yours' : d.affects === 'couple' ? 'shared with your partner' : 'shared with the household'),
    access: read ? 'read' : 'write', confirm: read ? 'none' : mode === 'propose' ? 'theirs' : 'tap',
    onFailure: read ? 'say what couldn\'t be looked up; the rest still answers' : 'show the error on the card; nothing is saved',
    available: mode !== 'unavailable',
  };
}
