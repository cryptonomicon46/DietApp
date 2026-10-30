// 🍽 Food with Claude, only when someone taps for it: a rough estimate from one photo (a plate,
// a restaurant dish, a nutrition label or a menu), or from the words of "Tell me" when the phone
// couldn't place them itself. Only what the gateway let through arrives here: that one picture
// (redrawn on the phone — no location or camera details) or that text. Nothing is kept; the
// phone shows the answer as an editable estimate and the person confirms before anything is logged.
const ITEM = {
  type: 'object', additionalProperties: false, required: ['name', 'amount', 'kcal', 'p', 'c', 'f'],
  properties: { name: { type: 'string' }, amount: { type: 'string' }, kcal: { type: 'number' }, p: { type: 'number' }, c: { type: 'number' }, f: { type: 'number' } },
};
export const PHOTO_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['kind', 'found', 'name', 'items', 'serving'],
  properties: {
    found: { type: 'boolean' }, kind: { type: 'string', enum: ['plate', 'label', 'menu'] }, name: { type: 'string' },
    items: { type: 'array', items: ITEM }, serving: { type: 'string' },
  },
};
export const TEXT_SCHEMA = { type: 'object', additionalProperties: false, required: ['items'], properties: { items: { type: 'array', items: ITEM } } };
const COMMON = `- Give each item's calories, protein (p), carbs (c) and fat (f) in grams for the amount shown, as realistic typical values — not a range. amount is a short plain portion ("~6 oz", "1 cup", "2 slices").
- Restaurant food usually has more oil and butter than it looks; lean a little generous on fat for restaurant dishes.
- Describe only the food and drink. Never describe a person, their body or face, or the place.`;
export const PHOTO_INSTRUCTIONS = `This photo was taken to log a meal. Work out what it shows and answer as the JSON asked for:
- kind "label" when it's a nutrition-facts label: one item for ONE serving exactly as printed (name = the product if visible), serving = the serving size as printed.
- kind "menu" when it's a menu that lists calories: one item for the dish that looks chosen or the first one, with its printed calories.
- kind "plate" for food on a plate, in a bowl or a takeaway box: one item per food, at most 8. name = a short name for the meal ("Salmon, rice & asparagus").
- found false (and no items) when there's no food or nutrition label in it.
${COMMON}`;
export const TEXT_INSTRUCTIONS = `Someone said what they ate or drank. List each food or drink as the JSON asked for, at most 12, using the amounts they said (a typical portion when they didn't say).
${COMMON}`;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(+n) ? +n : lo));
const clean = (s, n = 60) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
export function tidyItems(list, max = 12) {
  return (Array.isArray(list) ? list : []).slice(0, max).map((x) => ({
    name: clean(x?.name, 60), amount: clean(x?.amount, 30),
    kcal: Math.round(clamp(x?.kcal, 0, 3000)), p: Math.round(clamp(x?.p, 0, 300)), c: Math.round(clamp(x?.c, 0, 400)), f: Math.round(clamp(x?.f, 0, 250)),
  })).filter((x) => x.name);
}
async function ask(client, content, schema, model) {
  const res = await client.messages.create({ model, max_tokens: 3000, output_config: { effort: 'low', format: { type: 'json_schema', schema } }, messages: [{ role: 'user', content }] });
  if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') throw Object.assign(new Error(res.stop_reason), { status: 502 });
  try { return JSON.parse((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')); } catch { throw Object.assign(new Error('unreadable answer'), { status: 502 }); }
}
export async function estimatePhoto(client, payload, { model = 'claude-sonnet-5-5' } = {}) {
  const hint = { label: 'It should be a nutrition label.', menu: 'It should be a menu.', restaurant: 'It is a restaurant dish.' }[payload.hint] || '';
  const j = await ask(client, [{ type: 'image', source: { type: 'base64', media_type: payload.mime, data: payload.image } }, { type: 'text', text: `${PHOTO_INSTRUCTIONS}${hint ? `\n${hint}` : ''}` }], PHOTO_SCHEMA, model);
  const items = j.found ? tidyItems(j.items, 8) : [];
  return { found: !!j.found && items.length > 0, kind: ['plate', 'label', 'menu'].includes(j.kind) ? j.kind : 'plate', name: clean(j.name, 60), serving: clean(j.serving, 40), items };
}
export async function estimateText(client, payload, { model = 'claude-sonnet-5-5' } = {}) {
  const j = await ask(client, [{ type: 'text', text: `${TEXT_INSTRUCTIONS}\n\nWhat they said:\n${payload.text}` }], TEXT_SCHEMA, model);
  return { items: tidyItems(j.items, 12) };
}
