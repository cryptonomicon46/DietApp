# Future Product Concepts

**STATUS: DESIGN ONLY / NOT AUTHORIZED FOR IMPLEMENTATION.**

Prepared 2026-10-28 from the future amendments in “Review app code options.” Detailed designs below are not an approved engineering backlog. Do not interrupt current phases, add migrations, connect providers, schedule Scout jobs or ship UI for them without explicit implementation authorization. Existing approved Watch/date work remains in OURPAWMILY_2_0.md; the Read/Discover expansion and generalized media discussion model below remain future work.

## Read + Watch + Discover inside Us

**Status (2026-10-28 amendment):** core **Read is now approved and built** (Phase 4 amendment — see docs/BUILD_PROGRESS.md): Want to Read → Reading → Finished (Dropped in details), one book per title with each member's own 📖/🎧 state and optional progress, Open Library metadata incl. series/authors/genres, Discuss → one Thread per book, and per-member signals with structured reasons (`js/books.js`). **Still design only:** the personalized Scout/Discover engine (updates and recommendations), release/announcement fetching, author/series follow UI, adaptation discovery, notifications. The notes below remain the design for those.

Explore a lightweight shared culture experience within Us, without another bottom tab or a return to generic News. Keep Tonight, This week, Ideas and Watch understandable; introduce Read/Discover through calm progressive disclosure rather than six permanent large cards.

Read mirrors Watch:

| Read | Watch |
| --- | --- |
| Want to read | Want to watch |
| Reading | Watching |
| Finished | Finished |
| Dropped | Dropped |

Keep planned viewing distinct from actual viewing. Progress is optional: users can mark Reading/Watching without percentages, page counts or episode numbers. A compact “Right now” view can show who is reading/watching what, but only where that person has chosen to share it.

Public book metadata may include title, author, cover, publication date, genre, series/order and ISBN where available. Personal status, progress, ratings, dates and notes are separate private state. Explore follow-author/series/show/franchise actions and easy list additions without mandatory tracking.

## Personalized Discover and Scout

Each person explicitly chooses interests; examples such as nonfiction/science/technology or fantasy/romantasy are optional choices, not inferred profiles. Allow interests to be changed/reset and explicit Interested / Not for me feedback. Do not infer sensitive characteristics or build opaque behavioral profiling.

Show roughly 3–6 relevant candidates, with a concise reason: followed genre, author or series; a new season for a saved show; a related adaptation; or credible reception matching selected interests. Use popularity/trends only when relevant. Show “For both of you” only when overlap is meaningful. Do not create an infinite engagement feed or resurrect generic News/Rescue News.

Scout could monitor public sources for meaningful changes:

- Book/series announcements, publication dates and new releases.
- Film/TV releases, new seasons, credible reviews and relevant trailers.
- Book-to-screen adaptation announcements and availability.

Discover primarily serves people who open it. Explore low-volume controls such as important followed releases only or no Discover notifications; trivial publicity should not generate alerts.

Proposed pipeline:

```text
Reliable public sources → Scout → public candidates/cache
                                      ↓
                    phone-side ranking with private preferences/history
                                      ↓
                            personal Discover
                                      ↓
                         Save to Read/Watch or Discuss
```

Extend the existing Scout concept rather than introducing another unrelated AI system. Keep private notes/history out of AI requests where practical. Factual dates, authors, ISBNs, streaming availability and adaptation relationships need reliable public sources; AI memory is not a factual database. AI may summarize/classify public candidates. Research API access, terms, licensing, commercial restrictions and rate limits before choosing providers.

## Book ↔ screen adaptations

Where reliable metadata establishes the relationship, connect a book or series with its movie/TV adaptation. A book reader may see Add to Watch; a viewer may see Want to read. Distinguish an announcement from a confirmed date or released adaptation. Do not fabricate relationships or release dates.

Explore whether adaptation discussion should reuse the book Thread or use a linked adaptation Thread. This remains a UX decision, not a settled schema requirement.

## Discuss → Thread: one discussion system

Every future Read, Watch and Discover item should offer **Discuss**. Reuse Threads for date ideas and media discussions; do not add separate Read/Watch/Discover comments, search or notification systems.

```text
Book / show / movie / Discover candidate / date idea
                         ↓ Discuss
             Find an authorized Thread for its stable reference
                      ↙              ↘
                 reopen             create
                         ↓
              Normal encrypted Thread conversation
                         ↓ deliberate user action
          Add to Read/Watch, decide a plan, or schedule activity
```

Default to one discussion per stable item/reference within the authorized context. Repeated Discuss opens the same accessible Thread; never reveal inaccessible Threads while looking for a match. An explicit separate-discussion action may be explored. Exact reference storage and deduplication must be designed consistently with E2EE and access control; conceptual `type + itemId` is not a finalized schema.

Use a structured encrypted reference card rather than duplicating large text bodies. Book cards may show cover/title/author/genre/year/status; film/show cards may show poster/title/year/release information/status. Keep public metadata separate from private reading state and conversation. The person reading an item and the people allowed into its Thread are different questions.

Threads retain normal replies, images, author editing, pins, search and notifications. Explore quiet discussion indicators and lightweight Read/Watch filters while retaining boards; avoid a new folder hierarchy or noisy badges. Search encrypted discussion text locally/in memory, including item references as permitted; no plaintext server index.

Enable deliberate actions in both directions: a Discover candidate can start a discussion before being saved; a Thread can offer Want to read or Add to Watch. AI never silently changes lists, creates plans or performs privileged actions.

## Privacy and security

- Default personal Read state/history to private unless explicitly shared. Explore a simple “Share what I’m reading with family” control and whether status-only sharing is sufficient.
- Keep private notes encrypted and out of Scout/provider payloads.
- Respect Family membership, partner-only Us access and normal Thread permissions.
- Public media metadata is distinct from private per-person state and discussion.
- Family encryption keys never reach media APIs or AI providers.
- Preserve the frozen key architecture; document its server-enforced sharing limitation. Any stronger cryptographic isolation requires separate approval and audit.

## Performance and model choices to evaluate

No Read/Discover startup work on Home: no news/release fetches, Scout initialization, hidden cover downloads, automatic AI on every Us open, or full Thread-index downloads just to show counts. Use cached public candidates, background jobs only when separately authorized, lazy screens, small payloads and on-demand images. Preserve established performance gates.

Compare a generic media/library model with separate Read/Watch records sharing utilities. Choose the simpler auditable implementation, keeping public item metadata, per-person state and authorized Thread references distinct. Do not force an abstraction or duplicate private information.

## Proposal required before implementation

After the authorized simplification work and Us foundation are stable, prepare a reviewable proposal covering:

1. Mobile Us layout, Read/Watch details, optional progress and shared snapshots.
2. Personal Discover, meaningful overlap, follow controls, releases and adaptation cards.
3. Discuss → Thread, deduplication, reference-card privacy, reverse list actions, search and notification reuse.
4. Data model alternatives, public sources/API terms, Scout architecture and accurate metadata handling.
5. Sharing/consent defaults, E2EE/access review, AI payload boundaries and performance impact.
6. Bounded implementation phases, validation and migration/rollback needs.

Review and explicit implementation authorization are required before building any of this.

## Grocery ordering hand-off (research only)

**Status: DESIGN ONLY / NOT AUTHORIZED.** Researched 2026-10-29 from official provider documentation. No retailer buttons or integrations exist in the app.

**Method and limits.** This session's network policy blocked direct page fetches from the provider domains (docs.instacart.com, instacart.com, company.instacart.com and others failed to resolve). Every finding below comes from web-search results restricted to the providers' own domains, which show page excerpts. The pages themselves were not opened, and several had no visible date. Before any build, re-read each cited page directly. "Not confirmed" means the official sources found did not say.

| Provider | Public API | Affiliate / deep link | Partner-only | Unsupported | Notes |
| --- | --- | --- | --- | --- | --- |
| Instacart | Developer Platform (IDP): "Create shopping list page" and recipe page; **access is currently invite-only and closed to new applicants** | IDP's Impact affiliate program is only for approved IDP partners; a plain web link has no documented support | Connect APIs (carts, fulfilment, account linking) | Scraping or automating instacart.com | Best technical fit, but you can't get in right now |
| Amazon Fresh / Whole Foods | None for Fresh or Whole Foods. PA-API 5.0 is retired; its replacement, the Creators API, needs 10 qualifying sales in 30 days | Add-to-Cart form (ASIN + quantity); not confirmed to work for Fresh or Whole Foods carts | Fresh API only through an AWS public-sector programme | Scraping; the Alexa Lists API was retired on 2024-07-01 | Needs ASINs, not item names |
| Walmart | Affiliate Marketing API (read-only product search and lookup; needs an Impact publisher ID) | Affiliate text and item links via Impact; add-to-cart link format not confirmed | Online Pickup & Delivery / Add To Cart service (Walmart business review, subscription) | Scraping; AI agents must follow the separate Agentic Access Terms | Marketplace APIs are for sellers and solution providers, not shoppers |
| Safeway (Albertsons) | None found | None found | Not public; partner integrations exist (e.g. the Safeway ChatGPT plugin) | Robots, spiders and scraping are banned without written permission | Also sold on Instacart |
| Costco | None found | No affiliate programme found | Same-Day delivery is run by Instacart | Terms ban data mining, robots and unapproved software | Costco through Instacart is possible, but IDP doesn't let a developer choose the store |

### Instacart
IDP's `POST /idp/v1/products/products_link` takes line items. Each item needs only a product name, plus optional quantity or measurements, brand filters and UPCs. It returns a shareable Instacart URL where the shopper chooses a store, fills a cart and checks out. Instacart asks developers to cache and reuse these URLs. A recipe-page endpoint, a nearby-retailers endpoint and an MCP server (authenticated with the same API key) wrap the same function. A developer cannot send the shopper to a particular retailer ("not supported"); Instacart picks a default from location, product matches and the shopper's history.

Development keys come from a dashboard. Production keys stay pending until Instacart reviews a demo recording and checks compliance with the terms. The docs give about 30–40 days from access request to production key. The terms say the integration runs on your server, keys are confidential, and Instacart may set request limits at its discretion. Over-limit calls return HTTP 429. Affiliate commissions go through Impact and are offered only to approved IDP partners; no public commission rate was found. The decisive finding: the developer portal says "Access to IDP is currently invite only", and the company page says "We are currently not accepting new applications" with no waitlist. Neither page shows a date. Eligibility when open: adults, and either a registered business or a resident of the US or Canada. Developer cost: not confirmed (the terms allow future charges). Sources:
- https://docs.instacart.com/developer_platform_api/api/products/create_shopping_list_page
- https://docs.instacart.com/developer_platform_api/guide/concepts/shopping_list
- https://docs.instacart.com/developer_platform_api/faq/ (no store selection; separate cart per retailer)
- https://docs.instacart.com/developer_platform_api/guide/concepts/launch_activities/approval_process
- https://docs.instacart.com/developer_platform_api/guide/concepts/launch_activities/conversions_and_payments
- https://docs.instacart.com/developer_platform_api/guide/terms_and_policies/developer_terms
- https://docs.instacart.com/developer_platform_api/errors (429 handling)
- https://docs.instacart.com/developer_platform_api/guide/tutorials/mcp
- https://developers.instacart.com/ (invite only) and https://company.instacart.com/business/developers (not accepting applications)
- https://docs.instacart.com/connect/fulfillment_guide/concepts/account_linking (OAuth2 account linking; Connect partners only, via an Instacart representative)
- https://www.instacart.com/terms (no automated access without express authorization)

### Amazon Fresh / Whole Foods Market
The documented Add-to-Cart form posts `ASIN.n` and `Quantity.n` plus an `AssociateTag` to `https://www.amazon.com/gp/aws/cart/add.html`. That page belongs to the old PA-API 5.0 docs, which Amazon marks as unmaintained. PA-API 5.0 is retired (end dates of April 30 and May 15, 2026 both appear) and stopped taking new customers. Its successor, the Creators API, uses OAuth 2.0 and requires Associates enrolment plus 10 qualifying sales in the last 30 days. No official source confirmed that the Add-to-Cart form fills Fresh or Whole Foods carts. Amazon's help pages describe those carts as separate from ordinary Amazon items, and its developer forum says it cannot answer Fresh or Whole Foods questions. Associates eligibility conflicts across pages: one rate table lists Amazon Fresh at 0.50%, while the excluded-products page excludes products sold on fresh.amazon.com. Associates sites must be publicly available. Mobile apps need separate approval. Amazon deducts commission on your own purchases, so a household earns nothing ordering for itself. A Fresh API is offered only through an AWS public-sector food-insecurity programme. The Alexa List Management API was retired on 2024-07-01. The Conditions of Use exclude robots and data mining. Sources:
- https://webservices.amazon.com/paapi5/documentation/add-to-cart-form.html
- https://affiliate-program.amazon.com/creatorsapi/docs/en-us/paapiv5-deprecation and https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction
- https://affiliate-program.amazon.com/help/operating/policies, https://affiliate-program.amazon.com/help/operating/exclusions/, https://affiliate-program.amazon.com/help/node/topic/GQZMCDD9PB7CXV7N (mobile apps), https://affiliate-program.amazon.com/help/node/topic/G46FTB8KQF8NRUWG (personal use)
- https://www.amazon.com/gp/help/customer/display.html?nodeId=GQDB7EYYPKGLNG34 (separate Fresh / Whole Foods cart)
- https://developer.amazon.com/en-US/docs/alexa/ask-overviews/deprecated-features.html
- https://aws.amazon.com/blogs/publicsector/enabling-public-private-collaborations-innovate-food-insecurity/
- https://www.amazon.com/gp/help/customer/display.html?nodeId=GLSBYFE9MGKKQXXM (Conditions of Use)

### Walmart
The walmart.io Affiliate Marketing API is read-only: product search and lookup with price and availability. Setup needs a Walmart.com login, an uploaded public key (which issues a consumer ID), signed requests and an Impact publisher ID. The affiliate programme runs through Impact. Walmart approves each linking website, US sites only, with disclosure required next to links. The affiliate FAQ lists banner, department, category and item links but no add-to-cart link. The commonly cited `affil.walmart.com/cart/addToCart?items=` pattern was not found in the official docs reached (not confirmed). An "Add To Cart" service does exist under Online Pickup & Delivery and Data Ventures. It requires Impact registration and then review by a Walmart business manager, and it is listed as subscription-based, so it is partner-only. developer.walmart.com Marketplace APIs are for sellers and approved solution providers. The Walmart.com terms ban robots and scraping without written consent. Separate Agentic Access Terms require AI agents to identify themselves and respect rate limits. Sources:
- https://walmart.io/docs/affiliates/v1/affiliate-marketing-api, https://walmart.io/apidocs/affiliates/quickstart
- https://affiliates.walmart.com/faqs, https://affiliates.walmart.com/terms
- https://www.walmart.io/docs/opd/product-snapshot/grocery-introduction, https://www.walmart.io/docs/dv-certified-partners/v1/overview/
- https://developer.walmart.com/us-marketplace/docs/introduction-to-marketplace-apis
- https://www.walmart.com/help/article/walmart-com-terms-of-use/3b75080af40340d6bbd596f116fae5a0

### Safeway (Albertsons Companies)
No public developer API or affiliate programme was found. Albertsons offers recipe-to-cart and meal-plan-to-cart features inside its own sites and apps, an AI shopping assistant, and a 2026 Safeway plugin in ChatGPT that adds items to a Safeway cart before checkout on Safeway. These are first-party or negotiated partnerships, not developer programmes. Albertsons banners, Safeway included, also sell through Instacart. The terms ban robots, spiders and crawlers without prior written authorisation, except accessibility tools and search indexing that doesn't enable purchases. Sources:
- https://www.albertsonscompanies.com/newsroom/press-releases/news-details/2026/Albertsons-Companies-Expands-AI-Powered-Grocery-Shopping-with-New-Safeway-Plugin-in-ChatGPT/default.aspx
- https://www.albertsonscompanies.com/newsroom/press-releases/news-details/2023/Albertsons-Companies-Unveils-New-Digital-Innovations-to-Meal-Plans-Tool/default.aspx
- https://company.instacart.com/pressreleases/instacart-and-albertsons-companies-expand-partnership-nationwide-launching-pickup-services-and-convenience-delivery-in-as-fast-as-30-minutes
- https://www.albertsonscompanies.com/policies-and-disclosures/terms-of-use/default.aspx, https://www.safeway.com/terms-of-use/special-terms-of-use.html

### Costco
Confirmed: "Same-Day Delivery powered by Instacart" (sameday.costco.com and .ca) has run since 2017. It is members-only, prices are marked up above warehouse prices, and Costco Shop Cards can't be used. Costco also appears as a store on the Instacart marketplace. No Costco developer API or affiliate programme was found (not confirmed either way). The Costco terms ban data mining, robots and software that interacts with the site without written permission. Instacart is therefore the only sanctioned route, but IDP cannot direct the shopper to Costco; the shopper would pick it on the Instacart page. Sources:
- https://customerservice.costco.com/app/answers/answer_view/a_id/8150/~/same-day-delivery-powered-by-instacart-faqs
- https://www.instacart.com/company/pressreleases/costco-executive-members-now-get-monthly-credit-for-same-day-delivery-with-instacart
- https://www.costco.com/f/-/terms-and-conditions-of-use

### What leaves the phone
- **The list today.** The grocery list stays inside the app and may be end-to-end encrypted. Any hand-off sends that list, in plaintext, to the retailer, and possibly to the connector first. That reveals the household's diet: health, religious and other sensitive details. It needs explicit consent each time, and the privacy page would need updating.
- **Plain web link (no programme).** Item names go into a retailer URL opened on the phone, so the retailer, the browser history and any link previews see them. No account linking and no developer keys. Nothing passes through the connector.
- **Instacart IDP.** The API key must stay on a server, so item names, quantities and optional UPCs go from the phone to the connector to Instacart. The connector would see the list in plaintext, which breaks end-to-end encryption for that list; it must not log or keep it. Instacart returns a link and the shopper signs in on Instacart. No OAuth is needed for list pages. Account linking (OAuth2) is Connect-only.
- **Amazon or Walmart affiliate links.** Items must first be matched to ASINs or Walmart item IDs, either through a product API (a server-side credential, sending search terms) or a manual lookup. The associate or publisher ID ties purchases to the developer's account. Earning commission on your own household's orders isn't allowed (Amazon), so the affiliate route adds tracking without benefit.
- **Never.** Family keys, member names, health data or the household code must never go to any retailer. Shopper credentials must never be collected (Amazon's Associates policy also forbids it).

### Recommended first step if ever authorized
1. **Least commitment: copy or share the list, plus plain search links.** Export the list as text through the system share sheet, so the shopper pastes it into any retailer's own list or search. Optionally add per-item links to a retailer's public search page, item name only, with no affiliate tag, opened only on tap. No account, no key and no server path. The ciphertext model is unchanged until the user taps. Caveat: these URLs aren't a documented interface and may change.
2. **If Instacart reopens IDP: server-side "Create shopping list page".** The connector receives item names and quantities only, calls IDP and returns the link. Cache the link per list version, keep no plaintext, and set up 429 backoff. This needs an approved production key (demo review, about 30–40 days), a privacy-page update and a decision about the plaintext the connector would see. Affiliate attribution stays optional and is probably not worth adding.

### Open questions
- When, or whether, Instacart will reopen IDP applications; whether a hobby or household app qualifies; and whether developer use stays free.
- Whether Amazon's Add-to-Cart form works for Fresh or Whole Foods items, and whether it survives the PA-API retirement (not confirmed).
- Whether Walmart officially documents a public add-to-cart link outside the subscription partner service (not confirmed).
- Whether the owner accepts item names leaving the device in plaintext. Is a share-sheet hand-off enough, or is a retailer button wanted?
- Every finding above came from search excerpts, not opened pages. Re-check each cited page directly, with the provider domains allowed, before any decision.

## 👔 Look — Preview on Me (design only)

**Status: DESIGN ONLY / NOT AUTHORIZED.** The Look MVP shows each Look as a flat-lay of the person's own garment pictures and is complete without any try-on.

- **Extension point:** a Look (`js/look.js` `makeLook`) is a name, tags, item ids and an optional outfit photo; a preview would be a separate, optional rendering of that Look, never part of how Looks are chosen or ranked. Nothing in the recommender depends on an image provider.
- **Possible modes:** *Quick Preview* (fast, approximate) and *Realistic Preview* (higher quality, slower). Both would need reference photos of the person — the most sensitive data in the app — so: explicit opt-in, the person's own references only, never shared by a Fit Check unless they choose, deletable, and a clear statement of which provider sees what.
- **Providers to evaluate when authorized:** OpenAI image generation/editing, Google's virtual try-on, other production providers — through the AI gateway with a Look-preview purpose and its own allowlist; family keys never leave the phone; nothing kept by default.
- **Not decided:** whether previews are stored (and where), cost per preview, and how a preview is marked as generated.

## 👔 Look — Wishlist and shopping (design only)

**Status: DESIGN ONLY / NOT AUTHORIZED.** No Wishlist, retailer, affiliate or checkout code exists.

- **Closet vs Wishlist:** Closet = I own it. Wishlist = I'm considering it. Same item shape (`makeItem`) with a source (product link or screenshot) and no wear history; never mixed into "what to wear today" until moved to the Closet.
- **The question it answers:** *Would I actually wear this?* — e.g. "This blazer works with 6 things you already own", three Looks combining it with owned pieces (the existing recommender with the wishlist piece pinned), then Ask your partner (Fit Check) → Hit / Miss → buy externally → *Move to Closet*.
- **Retailer-neutral:** a link or screenshot from any shop (Banana Republic, Zara, Amazon…); product details read the way Add an item is (cut-out on the phone, optional Claude naming). No retailer APIs, affiliate tags or checkout; any later retailer integration needs its own research (see Grocery ordering hand-off for the approach) and authorization.
- **Privacy:** wishlist items are as private as the Closet; a Fit Check about a wishlist Look shares only that Look.

## 👔 Look — later (design only)

Casual / non-work wardrobe bulk onboarding, seasonal Closet rotation, packing lists from the calendar, and per-person cryptographic isolation of the Closet (today every grown-up holds the family key; the connector's checks keep Closets apart — see the security project below).

## 🗣️ Talk to Pawmily — whole-life command layer (design only)

**T0 and T1 built (2026-10-30: the golden bar and circle, single-domain requests that are yours); T2–T4 NOT AUTHORIZED.** The architecture review is `docs/TALK_TO_PAWMILY.md`; the checkpoint is `docs/mockups/talk/CHECKPOINT_T0.md`. Do not build voice, calendar planning, route/traffic intelligence, day-plan orchestration, external place/routing providers or background coaching without explicit authorization.

- **Model:** Understand → Plan → Capture → Coordinate, across Home, Calendar, Health/Diet, Fitness, Dogs, chores, family requests, Threads, Dates, Watch, Read, Ideas, Look and reminders. It is not built around Health.
- **Ownership:**
  - No subsystem owns the orchestration, and the assistant is not a database. Each domain stays authoritative and exposes typed, validated actions and read-only context adapters.
  - WHOOP supplies context (`dayContextForPlanning`, Health 2 Phase B) and never controls the training plan.
  - Fitness owns workout variants (`W.proposeVariant`).
  - Calendar owns time.
  - Us plans are the shared proposal.
- **Proposals:** reuse what exists. Us "Feeling like" plans for anything shared, Home requests for asking the household, preview → Apply → Undo for self-only changes. No new stored proposal type. Anything that affects another person is proposed first, never written to their calendar silently.
- **External facts:** places, hours, routing, showtimes and events come from providers with a traceable id. The LLM combines them and never invents them.

## Separate future security project

Per-person/per-area cryptographic isolation for Diet/Fitness needs its own design and audit before commercial/external-family launch. It is not authorized here and must not be bundled into Read/Discover work or the currently frozen key system.
