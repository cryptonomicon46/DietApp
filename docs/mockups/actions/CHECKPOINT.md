# ⚡ Quick actions (Muse, iPhone Shortcuts, OpenTable): design checkpoint (DESIGN ONLY, not authorized to build)

Owner's ask (2026-10-31): buttons in Pawmily that have Muse book an OpenTable table or buy a coffee.
Muse works behind the scenes and doesn't need any app data: the button just means "buy a coffee" or
"book dinner".

**Connectors checked:** there is no OpenTable or Muse connector, either installed or in the connector
directory.
- OpenTable has no public booking API for consumer apps.
- Pawmily already builds prefilled OpenTable links (`server/scout.js` `openTableUrl`: restaurant,
  date, time, party size).
- How Muse accepts a trigger is **not known yet**. The owner needs to say which of these it offers: a
  webhook/API URL, an iPhone Shortcuts action, an email or text address, or a link.

Mockups: `screens.html` (`#home`, `#confirm`, `#sent`, `#dinner`, `#setup`, `#talk`);
`node docs/mockups/actions/shoot.mjs` photographs them into `out/`. The places in them are made up.

## The idea: a quick action is a named button with a fixed signal
1. **Home › ⚡ Quick actions** (`#home`): your own buttons, e.g. ☕ My usual coffee, 🍽 Dinner for 2.
   Only you see them unless you share one with your partner.
2. **Confirm first** (`#confirm`): every action that spends money or books something asks once and
   shows exactly what's sent. It also has a cool-down so a double tap can't order twice.
3. **What it sends:**
   - only the signal: `{ "action": "coffee.usual" }`;
   - for dinner, the details you picked on the button: place, date, time, party size (`#dinner`).
   - Never sent: your calendar, location, names, health, the family key.
4. **Status** (`#sent`): "Sent to Muse", plus Muse's confirmation if Muse can report back. There's a
   short history, kept on the phone.
5. **Talk** (`#talk`): "Get me my usual coffee" matches your quick action on the phone, with no
   Claude involved, and shows the same confirm card.

## Three ways a button can run (`#setup`), the owner picks per button
| Way | How | What leaves Pawmily | Fits |
| --- | --- | --- | --- |
| **Muse (webhook)** | The connector POSTs the signal to Muse's URL. The URL is a secret, kept on the connector and locked, never on the phone. | The fixed signal, plus the button's own details | Muse has a webhook or API |
| **iPhone Shortcut** | The button opens `shortcuts://run-shortcut?name=…`, and your Shortcut does the rest (it can call Muse, order, text…). | Nothing: it all runs on the iPhone | Muse (or the coffee app) has a Shortcuts action |
| **Open a link** | Opens OpenTable (or a coffee app's order page) already filled in; you finish there. | Nothing, beyond what you see in the link | No automation needed, or as a fallback |

The Shortcut way is the most private and needs no server work. The webhook way is the most
"one tap" but needs a small connector route, and so a `pawdeploy`.

## Safety
- **Confirmation:** confirm-before-run is locked on for anything that buys or books.
- **No double runs:** a cool-down per button (e.g. 10 minutes).
- **Per person:** buttons are yours; sharing one with your partner is explicit.
- **Logging:** the Muse URL is never shown or logged. The connector keeps only a count, not the
  payload.
- **Prompt-injection guard:** Pawmily never lets an AI pick or fire an action on its own. Talk can
  only *propose* one of your existing buttons, and you tap.

## Decisions for the owner
1. How does Muse take a trigger: webhook URL, Shortcuts action, email or text, or a link?
2. Which buttons first: ☕ usual coffee and 🍽 dinner for 2?
3. Who sees them: just you, or some shared with your partner?

## Revision (owner, 2026-10-31): one "Ask Muse" box instead of many buttons
Owner: sending a request to Muse makes more sense than Shortcuts; speak what you want rather than
building many shortcuts. Start with coffee and dinner reservations. Muse holds the card and pays.

**Recommended design** (screens `#muse`, `#musesend`, `#musereply`, `#musetalk`):
1. **🤖 Ask Muse** (`#muse`): one sheet with two one-tap requests (☕ My usual coffee, 🍽 Book a
   table with place, day, time and people) and a box to say or type anything else.
2. **Check, then send** (`#musesend`): you see exactly what Muse gets, which is the sentence you said
   and nothing from the app. Muse pays with the card it already holds and confirms in Muse if it needs
   to. Pawmily never sees the card.
3. **Muse replies** (`#musereply`): if Muse can call back, confirmations land in Pawmily, visible only
   to you, e.g. "Booked: Luna Trattoria · Sat 7 PM" with 🗓 Add to our calendar. Without a callback,
   you see "Sent ✓" and the details stay in Muse.
4. **From Talk** (`#musetalk`): "Ask Muse to …" is recognised on the phone, with nothing going to
   Claude, and goes to the same check.

**Plumbing:**
- The connector forwards the request to Muse's request URL or API, with Muse's key kept on the
  connector as a secret.
- A second, small route would receive Muse's replies if Muse supports callbacks.
- This is a connector change, so it needs a `pawdeploy`.
- Shortcuts stay an optional fallback for things Muse can't do.

**Still needed from the owner:** how Muse receives a request (an API or webhook URL and key, an email
or text address, or only its own app), and whether it can send a confirmation back.
