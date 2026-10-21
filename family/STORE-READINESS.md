# OurPawmily Families: store readiness

What the App Store (Apple) and Google Play require of an app like this, what the beta already does, and what's left before submitting.

## Done in the beta

| Requirement | Where | How it's met |
|---|---|---|
| **Account deletion in the app** (Apple 5.1.1(v), Google Play account deletion policy) | Me › Account & security › Delete my account | Type DELETE to confirm. Deletes the account, every sign-in, the person's data, posts, comments and likes. Families pass to another grown-up who has joined, or are deleted if nobody else has. The care log keeps entries as "Former member". `server/family.js` → `deleteAccount` |
| **Deletion request outside the app** (Google Play: a web link) | `family/delete-account.html` | Steps in the app, an email route for people without the app, and what's deleted and kept |
| **Privacy policy** linked in the app and the store listing | `family/privacy.html` | What's collected, who sees it, processors (Cloudflare, Google, GitHub Pages, Open-Meteo, Anthropic), retention, rights, children, health data |
| **Terms / community rules** for user content (Apple 1.2) | `family/terms.html` | Rules on objectionable content; reports acted on within 24 hours |
| **Report, hide, block** for user-generated content (Apple 1.2) | ⋯ on every post | Report (hidden for the reporter, flagged 🚩 to the family's creator), Hide, Block author; unblock in Me |
| **Age gate and consent** (COPPA; Google Play Families policy) | First sign-in | 13+ confirmation and acceptance of the Terms and Privacy Policy, versioned (`TERMS_VERSION`), so a new version asks again. Under-13s are profiles their parents manage, with no account |
| **Download your data** (GDPR / CCPA access and portability) | Me › Download my data | JSON with the account, families, the person's data, posts and comments |
| **Sign-in security** | Google sign-in | Google ID token verified server-side (signature, audience, expiry, verified email). Sessions are random 32-character tokens lasting 30 days, at most 10 per account. "Sign out on all devices"; list of signed-in devices |
| **Invites only for the right person** | Invites | The invite link works only for the invited Google account, once, within 14 days. The code is in the URL `#` part, so it never reaches server logs |
| **Least visibility** | Server checks on every request | Outsiders get 404. Diet & fitness only for the people chosen. Connected families see only the posts marked for them and never see email addresses |
| **Abuse limits** | Server | 120 changes per minute per account, size caps on text and photos, input cleaning |
| **Web hardening** | `family/index.html` | Content-Security-Policy (only our files, Google sign-in and the connector), strict referrer, everything escaped before display |
| **Family management** | Me › Family settings | Rename; choose sections (Dogs, Feed, Diet & fitness, Calendar); hand over to another grown-up; delete the family (type its name); leave a family |

## Before submitting to the stores

1. **Native apps:** wrap `family/` with Capacitor for iOS and Android, and add push notifications. Apple doesn't accept plain web wrappers without app-like features; push, the care log and the camera cover that.
2. **Sign in with Apple** (Apple 4.8): required alongside Google sign-in on iOS. The server needs a `verifyApple` next to `verifyGoogle`, with the same session model.
3. **Support email:** set `SUPPORT_EMAIL` on the connector (`npx wrangler secret put SUPPORT_EMAIL`). It shows in the app and is the address the policy pages refer to. Put the same address on both store listings.
4. **Store privacy forms** (answers that match this app):
   - **Apple privacy labels**, *Data Linked to You*: Contact Info (name, email); User Content (photos, posts, comments); Health & Fitness (weight, meals, if you use Diet & fitness); Identifiers (user ID). Purpose: App Functionality. *Data Used to Track You*: none.
   - **Google Play Data safety**: the same data types. Collected, not shared with third parties for their own use. Encrypted in transit. Users can request deletion. Not used for ads.
5. **Content review:** a way for us to act on reports. The support email is the stated channel; a small admin view of `report:*` would make it quicker.
6. **Storage:** before many families join, move from Workers KV to D1 (a database) and R2 (photos). KV is fine for the beta.
7. **Payments** (when subscriptions or AI credits arrive): Apple / Google in-app purchase for digital goods (RevenueCat suggested), plus a restore-purchases button.
8. **Data protection extras:** encrypt sensitive fields (diet & fitness) at rest with a key held as a Worker secret, and keep a record of deletions.
