# ✳️ Claude in Pawmily + 📧 Inbox to-dos — design checkpoint (DESIGN ONLY, not authorized to build)

Owner's ask (2026-10-31): go through the inboxes and track important emails and things to take care
of; talk to Claude inside the app, maybe as a separate "Claude" window. What are the implications,
is there a delay versus the Claude app, and does it use the API credits?

Mockups: `screens.html` (open with `#entry`, `#chat`, `#context`, `#tab6`, `#inbox`, `#setup`,
`#usage`); `node docs/mockups/claude/shoot.mjs` photographs them into `out/` (390 px, 320 px, dark).
Synthetic data; Sam and Pat are example names.

## A. Talking to Claude inside the app

**Where it lives — recommended: a second mode in Talk, not a sixth tab.**
- Screen 1 (`#entry`): Talk gets **⚡ Do it · ✳️ Ask Claude**. *Do it* is today's Talk (cards you
  approve). *Ask Claude* is a full conversation — anything you'd ask the Claude app.
- Screen 2 (`#chat`): the chat opens full height. Answers stream in as they're written. When Claude
  suggests something Pawmily can do (add to the calendar, a grocery item, log a meal), it shows the same
  approve-first card as Talk. Nothing changes until you tap.
- Screen 3 (`#context`): **what Claude can see**. Only what you type, unless you switch on a source
  for that chat: your calendar for the next 7 days, your food today, your WHOOP today, the grocery list.
  Names become roles. Never sent: notes, threads, other people's health, the family key.
- Screen 4 (`#tab6`): the alternative, a sixth bottom tab. **Not recommended.** It changes the
  approved five-tab design (CLAUDE.md) and crowds the labels at 320 px. Talk is already one tap away on
  every tab.

**Will it be slower than the Claude app?** About the same, *if it streams*.
- The request goes phone → our Cloudflare connector → Anthropic. The extra hop adds roughly
  0.05–0.15 s.
- The first words appear in about 1–2 seconds, like the Claude app.
- Today's Talk waits for the whole answer. That's fine for short cards, but a long chat answer would
  take 5–15 s to appear. The chat must stream (server-sent events through the connector). That's
  the main piece of new plumbing.
- **What the Claude app has that this wouldn't, at first:**
  - web search and research;
  - file and PDF uploads;
  - Projects and memory;
  - artifacts;
  - your chat history synced across devices.

  Each could be added later; web search, for one, is an API tool with its own cost.
- **What only Pawmily can do:**
  - use your family context, with your consent and privacy rules;
  - offer one-tap actions into Calendar, Groceries, Meals, Watch and Read.

**Does it use your API credits?** Yes.
- Every chat message is an Anthropic API call with the key on the connector. It's billed pay-as-you-go
  to the Anthropic Console account that owns the key.
- It does **not** use your Claude Pro/Max subscription; a subscription can't be used by another app.
- Rough cost at current API prices:

| Model | Price per million tokens (in / out) | A typical chat message |
| --- | --- | --- |
| Sonnet 5.5 (the app's default today) | $2 / $10 | about 1–2¢ |
| Opus 5.5 | $4 / $20 | about 2–4¢ |
| Haiku 5.5 | $0.10 / $0.50 | well under 1¢ |

  Long chats cost more, because the history is re-sent with each message. Prompt caching cuts most of
  that.
- **Typical bill:** 30 messages a day on Sonnet comes to roughly $10–20 a month.
- **Screen 7 (`#usage`):** a monthly cap (e.g. $20) and a per-feature breakdown, so a busy month can't
  surprise you. At the cap, chats pause; everything else keeps working.
- **Free alternative:** an **Open in Claude app ↗** link hands the question to the Claude app on your
  subscription. That costs no API credits, but it has no Pawmily context or buttons. The exact
  prefill-link format still has to be checked.

**Privacy:**
- **What leaves the phone:** chat text goes to Anthropic (the API isn't used for training, and data
  is kept for a limited time under Anthropic's API terms), plus only the context switches you turn on.
- **Where chats are kept:** on the phone, locked with the family key; they can be deleted.
- **Who sees them:** they aren't shared with your partner and never sit readable on the connector.
- **Privacy page:** it would need a new "Claude chat" section.

## B. Inbox to-dos (bills, appointments, RSVPs, forms)

**What you'd see (screen 5, `#inbox`):** a few cards in 🏠 Home › 🔔 Needs you, **only on your own
phone**.
- *PG&E bill $142.18 due Nov 8* → ⏰ Remind me · ✓ Paid · Dismiss.
- *Dentist asks you to confirm Tue 3:30* → 🗓 Add to calendar · ✍️ Draft reply · Dismiss.
- An FYI with just OK.

Each one is approve-first, like Talk.

**Three ways to connect (screen 6, `#setup`):**
1. **Forward what matters — recommended.**
   - **How it works:** a Gmail filter ("from:pge.com OR subject:appointment…") forwards matching mail
     to your own private Pawmily address. Nothing else in your inbox is ever read.
   - **Needs:** a domain on Cloudflare with Email Routing, which a `workers.dev` address can't receive
     mail on. Gmail also checks the forwarding address with a code, which Pawmily would show you.
2. **Connect Gmail, read-only.**
   - **How it works:** Pawmily checks new mail in the labels you pick, hourly.
   - **Limits:** Gmail's read scope is a "restricted" scope. Without Google's security review, the app
     stays in testing mode (up to 100 test users), and Google makes you reconnect every 7 days.
     Workable for two people, but the weekly reconnect is real friction.
3. **Share one email:** Share › Pawmily from Mail or Gmail, for one-offs.

**How it would work:**
1. The connector receives the email.
2. Claude reads it. Haiku is plenty here and costs well under a cent a day for dozens of emails.
3. Claude returns at most a few structured to-dos: kind, due date, amount, an action, and the sender's
   name.
4. The email itself is not kept.

**Privacy and security decisions needed before building:**
- **Plaintext on the connector:** forwarded mail arrives readable, as with any mail server, so the
  "only the phone can read it" end-to-end promise doesn't cover it in transit. The connector can't lock
  the to-do with the family key, because only phones hold it. Two options:
  - **(a)** keep the to-do readable for a short time until your phone collects it and re-locks it;
  - **(b)** lock it to a per-person device key. That means new cryptography, which CLAUDE.md freezes
    without your explicit approval.
- **Strictly per person:** never visible to your partner unless you turn a card into a shared request
  or calendar event.
- **Prompt-injection guard:** an email can contain instructions. Claude only ever returns the fixed
  to-do fields, and every action waits for your tap. Pawmily never sends an email itself; *Draft reply*
  opens your mail app with the draft.
- **Privacy page:** it needs an "Email" section: what's read, by whom, what's kept, how to disconnect.

## C. Suggested order (needs your go-ahead; nothing here is authorized yet)
1. **Ask Claude in Talk:**
   - streaming chat;
   - chats kept on the phone, locked;
   - context switches, all off;
   - approve-first action cards;
   - the usage cap in Me;
   - Open in Claude app.
2. **Inbox, forwarding route:** needs a domain on Cloudflare and decision (a) or (b) above.
3. **Gmail read-only:** only if forwarding proves too limiting.

## Decisions for you
1. **Where the chat lives:** Talk mode (recommended) or a sixth tab?
2. **Chat model and cap:** Sonnet default and a $20/month cap?
3. **Inbox route:** forwarding (needs a domain on Cloudflare) or Gmail read-only (weekly reconnect)?
4. **Inbox to-dos storage:** (a) briefly readable on the connector until your phone locks them, or
   (b) new per-device keys (a frozen-security change that needs your explicit approval)?
