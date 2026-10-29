// 💬 "Describe it": a workout in words → the workout model, worked out on the phone (no AI).
//   "Squats x3 at 165 lbs superset with 55 lb RDLs, then lunges x3 with 45 lb dumbbells superset
//    with rows at the same weight."
//   "4 rounds: Overhead Press 12/12/11/11, Bent-over Row 12/13/14/13"
//   "Bench 3x10 @ 135" · "Plank 3x45s" · "Run 3 miles"
// It never fills in what wasn't said: a missing rep count or weight stays empty and is marked to
// check, and words it couldn't place come back in `unread` (the review screen shows them).
import { normalize } from './workout.js';

const NUM = '(\\d+(?:\\.\\d+)?)';
const UNIT = '(lbs?|pounds?|#|kgs?|kilos?|kilograms?)';
const BODYWEIGHT = /\b(bodyweight|body weight|bw|push-?ups?|pull-?ups?|chin-?ups?|dips?|sit-?ups?|crunch(es)?|bicycle crunch(es)?|plank|burpees?|mountain climbers?|air squats?|jumping jacks?|leg raises?|flutter kicks?|hollow (hold|rock)s?)\b/i;
const FILLER = /\b(of|at|for|with|and|the|a|an|x|rpe|rir|rest|tempo|pause|reps?|sets?|rounds?|each|per|side|dumbbells?|dbs?|kettlebells?|kbs?|barbell|same|weight|lbs?|pounds?|kgs?|kilos?|seconds?|secs?|minutes?|mins?|miles?|meters?|metres?|km|then|do|did)\b/gi;
const HEADING = /\b(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\b|\b(jan(uary)?|feb(ruary)?|march|apr(il)?|june?|july?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?)\b|\b(week|day)\s*\d+\b|\btoday\b/i;
const unitOf = (u) => (/^k/i.test(u || '') ? 'kg' : 'lb');
const title = (s) => s.replace(/\s+/g, ' ').trim().replace(/(^|[\s(-])([a-z])/g, (m, a, b) => a + b.toUpperCase());

// One exercise from a chunk of words.
function item(chunk, { unit, prevWeight }) {
  let s = ` ${chunk} `;
  const out = { sets: null, reps: null, repsList: null, weight: null, weights: null, unit, time: null, distance: null, distUnit: null, bw: false, same: false };
  const take = (re, fn) => { s = s.replace(re, (...m) => { fn(m); return ' '; }); };
  take(/\bsame weight\b|\bsame\b/i, () => { out.same = true; });
  // Times: "45s", "45 sec", "1:30", "2 min".
  take(new RegExp(`\\b(\\d+)\\s*[x×]\\s*(\\d+)\\s*(s|secs?|seconds?)\\b`, 'i'), (m) => { out.sets = +m[1]; out.time = +m[2]; });
  take(new RegExp(`\\b(\\d+)\\s*[x×]\\s*(\\d+):(\\d\\d)\\b`, 'i'), (m) => { out.sets = +m[1]; out.time = +m[2] * 60 + +m[3]; });
  take(/\b(\d+):(\d\d)\b/, (m) => { out.time = +m[1] * 60 + +m[2]; });
  take(new RegExp(`\\b${NUM}\\s*(s|secs?|seconds?)\\b`, 'i'), (m) => { out.time = Math.round(+m[1]); });
  take(new RegExp(`\\b${NUM}\\s*(mins?|minutes?)\\b`, 'i'), (m) => { out.time = Math.round(+m[1] * 60); });
  // Distances: "3 miles", "500 m", "5k".
  take(new RegExp(`\\b${NUM}\\s*(mi|miles?)\\b`, 'i'), (m) => { out.distance = +m[1]; out.distUnit = 'mi'; });
  take(new RegExp(`\\b${NUM}\\s*(km|k)\\b`, 'i'), (m) => { out.distance = +m[1]; out.distUnit = 'km'; });
  take(new RegExp(`\\b${NUM}\\s*(m|meters?|metres?)\\b`, 'i'), (m) => { out.distance = +m[1]; out.distUnit = 'm'; });
  // Weights: "165 lbs", "40/45/50 lb", "@ 135", "at 135".
  take(new RegExp(`${NUM}(?:\\s*/\\s*${NUM})+\\s*${UNIT}`, 'i'), (m) => { const all = m[0].match(/\d+(?:\.\d+)?/g).map(Number); out.weights = all; out.unit = unitOf(m[m.length - 3]); });
  take(new RegExp(`${NUM}\\s*${UNIT}(?![a-z])`, 'i'), (m) => { out.weight = +m[1]; out.unit = unitOf(m[2]); });
  take(new RegExp(`(?:@|\\bat)\\s*${NUM}(?:\\s*/\\s*${NUM})*`, 'i'), (m) => { const all = m[0].match(/\d+(?:\.\d+)?/g).map(Number); if (all.length > 1) out.weights = all; else out.weight = all[0]; });
  // Sets × reps: "3x10", "3 x 10", "3 sets of 10"; a rep list "12/12/11/11"; "x3" alone = 3 sets.
  // "135x5" (a weight bigger than any set count, times reps) is one set of 5 at 135.
  take(/\b(\d+)\s*(?:x|×|sets?\s+of)\s*(\d+)\b/i, (m) => { if (+m[1] > 20 && +m[2] <= 30 && !/sets?\s+of/i.test(m[0])) { out.weight = +m[1]; out.reps = +m[2]; } else { out.sets = +m[1]; out.reps = +m[2]; } });
  // A number list: reps ("12/12/11/11"), or weights once the reps are known ("5x5 135/155/175").
  take(/\b\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)+\b/, (m) => { const all = m[0].split('/').map((x) => +x.trim()); if (out.reps != null && out.weight == null && !out.weights) out.weights = all; else out.repsList = all; });
  if (out.sets == null) take(/(?:^|\s)[x×]\s*(\d+)\b/i, (m) => { out.sets = +m[1]; });
  if (out.sets == null) take(/\b(\d+)\s*sets?\b/i, (m) => { out.sets = +m[1]; });
  take(/\b(\d+)\s*reps?\b/i, (m) => { out.reps = +m[1]; });
  // "10 push-ups": a count before the name is its reps.
  if (out.reps == null && !out.repsList) take(/^\s*(\d+)\s+(?=[a-z])/i, (m) => { out.reps = +m[1]; });
  // "Bench 5x5 135" / "4 x 8 x 135": one bare weight-sized number after sets × reps is the weight —
  // not "RPE 8" or "rest 60", and not on a bodyweight move.
  if (out.reps != null && out.weight == null && !out.weights && !BODYWEIGHT.test(chunk) && !/\b(rpe|rir|rest|tempo|sec|secs|min|mins|pause)\b/i.test(chunk)) {
    const bare = s.match(/\b\d+(?:\.\d+)?\b/g);
    if (bare?.length === 1 && +bare[0] >= 20) take(/\b(\d+(?:\.\d+)?)\b/, (m) => { out.weight = +m[1]; });
  }
  if (BODYWEIGHT.test(chunk) && out.weight == null && !out.weights) out.bw = true;
  if (out.same && out.weight == null && prevWeight) { out.weight = prevWeight.weight; out.unit = prevWeight.unit; }
  const leftover = s.replace(/[@,.:;()]/g, ' ').replace(/\b\d+(\.\d+)?\b/g, (n) => { out.stray = [...(out.stray || []), n]; return ' '; });
  const name = title(leftover.replace(FILLER, ' ').replace(/[^a-z\s'-]/gi, ' '));
  return { ...out, name };
}
// Its sets (one per round), with what wasn't said marked to check.
function setsOf(it, rounds) {
  // A stated set count wins; a shorter list leaves the rest empty (and marked), never copied.
  const n = rounds || it.sets || it.repsList?.length || it.weights?.length || 1;
  return Array.from({ length: n }, (_, i) => {
    const reps = it.repsList ? it.repsList[i] ?? null : it.reps;
    const weight = it.weights ? it.weights[i] ?? null : it.weight;
    const timed = it.time != null || it.distance != null;
    const uncertain = [];
    if (reps == null && !timed) uncertain.push('reps');
    if (weight == null && !it.bw && !timed) uncertain.push('weight');
    return { reps: timed && reps == null ? null : reps, weight: it.bw ? null : weight, unit: it.unit, bw: it.bw, time: it.time, distance: it.distance, distUnit: it.distUnit || 'mi', uncertain };
  });
}

export function parseWorkout(text, { unit = 'lb', today = '' } = {}) {
  const unread = [];
  const blocks = [];
  // Parts: lines, ";" and "then" (a "N rounds:" header keeps its list together).
  // A header on its own line ("4 rounds:", "Circuit:") gathers the lines under it, up to a blank line
  // or the next header.
  const HEAD = /^\s*(?:(?:circuit|superset)\s*\(?\s*\d+\s*(?:rounds?|x|sets?)\s*\)?|\(?\s*\d+\s*(?:rounds?|x|sets?)\s*\)?(?:\s*of)?(?:\s*(?:circuit|superset))?|circuit|superset)\s*[:—-]?\s*$/i;
  const grouped = [];
  let head = null;
  for (const line of String(text || '').replace(/\r/g, '').split('\n')) {
    if (HEAD.test(line)) { head = grouped.push(line.trim().replace(/[:—-]?$/, ':')) - 1; continue; }
    if (!line.trim()) { head = null; grouped.push(''); continue; }
    if (head != null) grouped[head] += `${/:$/.test(grouped[head]) ? ' ' : ', '}${line.trim().replace(/[.,;]$/, '')}`;
    else grouped.push(line);
  }
  const parts = grouped.join('\n').split(/\n+|;|\bthen\b|(?<=[a-z\d)])\.\s+/i).map((x) => x.trim()).filter(Boolean);
  let prevWeight = null;
  for (let part of parts) {
    let rounds = null, kind = null;
    part = part.replace(/^(?:circuit|superset)?\s*\(?\s*(\d+)\s*(?:rounds?|x|sets?)\s*\)?\s*(?:of)?\s*[:—-]?\s*/i, (m, n) => { rounds = +n; return ''; });
    if (/^circuit\b/i.test(part)) { kind = 'circuit'; part = part.replace(/^circuit\s*[:—-]?\s*/i, ''); }
    // Exercises in this part: "superset with", "+", "&" and (in a rounds list) commas join them.
    const joined = /\bsuperset(?:ted)?\s+with\b|\bss\b|\s\+\s|\s&\s/i.test(part);
    let chunks = part.split(/\bsuperset(?:ted)?\s+with\b|\bss\b|\s\+\s|\s&\s/i);
    // Commas: a new exercise when words follow ("Bench 3x10, rows 3x12"), the same one when only
    // numbers do ("Bench 5x5 135, 155, 175").
    chunks = chunks.flatMap((c) => c.split(',').reduce((acc, bit) => { if (acc.length && !/[a-z]{2,}/i.test(bit.replace(/\b(lbs?|kg|reps?|sets?|sec|s)\b/gi, ''))) acc[acc.length - 1] += `/${bit.trim()}`; else acc.push(bit); return acc; }, []));
    const items = [];
    for (const c of chunks.map((x) => x.trim()).filter(Boolean)) {
      const it = item(c.replace(/(\d)\s*\/\s*(\d)/g, '$1/$2'), { unit, prevWeight });
      // A heading like "Monday 10/28" or "Week 3": not an exercise.
      if (HEADING.test(c) && !/\d\s*[x×]\s*\d|\b(sets?|reps?|rounds?|lbs?|kg)\b/i.test(c)) { unread.push(c); continue; }
      if (!it.name) { unread.push(c); continue; }
      if (it.stray) {
        unread.push(c);
        // Only words and a number nobody can place: not an exercise to add.
        if ([it.sets, it.reps, it.repsList, it.weight, it.weights, it.time, it.distance].every((v) => v == null)) continue;
      }
      if (it.weight != null) prevWeight = { weight: it.weight, unit: it.unit };
      items.push(it);
    }
    if (!items.length) continue;
    const together = rounds != null || joined || kind === 'circuit';
    if (together) {
      // A superset/circuit's rounds: as stated, else what its exercises agree on (else unsure).
      const counts = [...new Set(items.map((it) => it.sets || it.repsList?.length || it.weights?.length).filter(Boolean))];
      const r = rounds || (counts.length === 1 ? counts[0] : null);
      blocks.push({ kind: kind || undefined, rounds: r || Math.max(1, ...counts), uncertain: r ? [] : ['rounds'], items: items.map((it) => ({ name: it.name, sets: setsOf(it, r || Math.max(1, ...counts)) })) });
    } else for (const it of items) blocks.push({ items: [{ name: it.name, sets: setsOf(it, null) }] });
  }
  const w = normalize({ title: 'Workout', date: today, source: 'text', blocks });
  // A two-exercise "circuit"/rounds list keeps the kind it was given; uncertain rounds are kept.
  blocks.forEach((b, i) => { if (b.uncertain?.length) w.blocks[i].uncertain = [...new Set([...(w.blocks[i].uncertain || []), ...b.uncertain])]; });
  return { workout: w, unread };
}
// Worth asking the AI? Only if the phone couldn't place something, or found nothing.
export const needsHelp = ({ workout, unread }) => unread.length > 0 || !workout.blocks.length;
