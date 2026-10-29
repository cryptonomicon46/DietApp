// 👔 Look with Claude, only when someone taps for it: name one piece from its cut-out photo, or
// find the pieces in a photo of a whole outfit. Only what the gateway let through arrives here:
// that one picture (redrawn on the phone — no location or camera details). Nothing is kept; the
// phone shows the answer and the person confirms every piece before anything is added.
const CATS = ['outer', 'top', 'bottom', 'dress', 'shoes', 'watch', 'accessory'];
const PIECE = {
  type: 'object', additionalProperties: false,
  required: ['name', 'cat', 'sub', 'color', 'pattern', 'formality', 'warmth'],
  properties: {
    name: { type: 'string' }, cat: { type: 'string', enum: CATS }, sub: { type: 'string' }, color: { type: 'string' },
    pattern: { type: 'string', enum: ['solid', 'stripe', 'check', 'print', 'texture'] }, formality: { type: 'integer' }, warmth: { type: 'integer' },
  },
};
export const ITEM_SCHEMA = { type: 'object', additionalProperties: false, required: ['piece', 'found'], properties: { found: { type: 'boolean' }, piece: PIECE } };
const BOX = { type: 'object', additionalProperties: false, required: ['x', 'y', 'w', 'h'], properties: { x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' } } };
export const PIECES_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['pieces'],
  properties: { pieces: { type: 'array', items: { type: 'object', additionalProperties: false, required: [...PIECE.required, 'sure', 'box'], properties: { ...PIECE.properties, sure: { type: 'boolean' }, box: BOX } } } },
};
const COMMON = `- name: short and plain, how a person would say it — "Navy blazer", "Light-blue Oxford", "Charcoal trousers", "Brown loafers", "Steel dive watch". A brand or model only if it's clearly legible.
- cat: outer (blazers, jackets, coats, cardigans), top, bottom, dress (and jumpsuits), shoes, watch, accessory (belt, tie, bag, glasses, hat, scarf).
- sub: the kind in one or two words (blazer, oxford, chinos, loafers, dive watch…). color: the main colour in plain words (navy, light blue, charcoal, tan…).
- formality 1–5: 1 gym or lounge, 2 casual, 3 smart casual / business casual, 4 business, 5 formal. warmth 0–3: 0 light (tee, linen), 1 shirt-weight, 2 sweater-weight, 3 coat.
- Describe only the clothes. Never describe the person, their body or face, or the room.`;
export const ITEM_INSTRUCTIONS = `This photo shows one piece of clothing or one accessory. Describe it as the JSON asked for. If there's no piece of clothing in it, set found to false.\n${COMMON}`;
export const PIECES_INSTRUCTIONS = `This photo shows an outfit — someone wearing it (often a mirror photo) or the pieces laid out. List each piece of clothing and each accessory you can see, as the JSON asked for, at most 8.\n${COMMON}
- box: where the piece is, as fractions of the image's width and height (x, y = top left; w, h = size), a little generous rather than tight.
- sure: true only when the piece is clearly visible. Something small or partly hidden (a watch under a cuff, shoes cut off at the edge) is sure: false, with a plain name ("Watch").`;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(+n) ? +n : lo));
const clean = (s, n = 60) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
export function tidyPiece(p) {
  return { name: clean(p?.name, 80), cat: CATS.includes(p?.cat) ? p.cat : 'top', sub: clean(p?.sub, 30).toLowerCase(), color: clean(p?.color, 20).toLowerCase(), pattern: p?.pattern || 'solid', formality: Math.round(clamp(p?.formality, 1, 5)), warmth: Math.round(clamp(p?.warmth, 0, 3)) };
}
export function tidyPieces(j) {
  return (Array.isArray(j?.pieces) ? j.pieces : []).slice(0, 8).map((p) => {
    const x = clamp(p.box?.x, 0, 1), y = clamp(p.box?.y, 0, 1);
    return { ...tidyPiece(p), sure: !!p.sure, box: { x, y, w: clamp(p.box?.w, 0.02, 1 - x), h: clamp(p.box?.h, 0.02, 1 - y) } };
  }).filter((p) => p.name);
}
async function ask(client, payload, text, schema, model) {
  const res = await client.messages.create({
    model, max_tokens: 4000, output_config: { effort: 'low', format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: payload.mime, data: payload.image } }, { type: 'text', text }] }],
  });
  if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') throw Object.assign(new Error(res.stop_reason), { status: 502 });
  try { return JSON.parse((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('')); } catch { throw Object.assign(new Error('unreadable answer'), { status: 502 }); }
}
export async function nameItem(client, payload, { model = 'claude-sonnet-5-5' } = {}) {
  const j = await ask(client, payload, ITEM_INSTRUCTIONS, ITEM_SCHEMA, model);
  return { found: !!j.found, item: j.found ? tidyPiece(j.piece) : null };
}
export async function findPieces(client, payload, { model = 'claude-sonnet-5-5' } = {}) {
  return { pieces: tidyPieces(await ask(client, payload, PIECES_INSTRUCTIONS, PIECES_SCHEMA, model)) };
}
