# NextWave Field Guide — 2026-10-12

## Club design

The redesigned home follows the actual NextWave journey: club → activities → playable projects → open calls → awards → people → joining. The portal uses the same paper, ink and teal system, with a search/filter rail beside the results on desktop and a compact filter stack on mobile. Existing project demos, member login, approvals and private workspace remain in place.

The design study used the local `awesome-design-md` notes for Airtable (clear information hierarchy), Linear (dense but legible tools) and WIRED (editorial typography). Public club references were [Depromeet](https://www.depromeet.com/), [DND](https://dnd.ac/) and [UMC](https://umc.makeus.in/). Their project-first storytelling and clear membership paths informed the structure; the visual language and content are NextWave's own.

Desktop and mobile before/after captures are in [`qa/field-guide-2026-10-12/`](qa/field-guide-2026-10-12/). The static water art remains visible if WebGL is unavailable.

## Opportunity source review

The hourly public snapshot remains the only automatic data feed. It stores titles, canonical source links, dates, organizer and application state when the public listing supplies them. Each fetch checks `robots.txt`, uses a named bot, enforces HTTPS and a host allowlist, throttles requests and reports partial failures. Missing dates are never inferred from relative D-day labels. Expired imported records are removed after the confirmed Korean deadline, while manually authored member records stay separate.

| Source | Decision | Reason |
| --- | --- | --- |
| [Wevity](https://www.wevity.com/?c=find&s=1) | Expand from page 1 to three public pages, with a 45-detail ceiling | The old crawler read only one 15-item page; pages 2 and 3 contain distinct records. `robots.txt` allows the public list and detail paths. |
| [Thinkyou](https://thinkyou.co.kr/contest/) | Add three public 45-row listing pages | Public listing supplies exact period, title, organizer, status and a stable link without detail requests. Its `robots.txt` has no rule blocking the named NextWave bot; the GPTBot training-crawler rule is unrelated to this bot. |
| [DACON](https://dacon.io/competitions) | Keep the official competition list | Inspection showed one current `참가신청중` card; the other visible official cards were marked `마감` or `연습`. The crawler does not represent practice rounds as open applications. |
| [Linkareer](https://linkareer.com/list/contest) | Hold | Its listing provides relative D-day rather than a full deadline; detail requests would be required. Its [terms](https://linkareer.com/terms) prohibit automated access that burdens service, so no additional recurring traffic was added. |
| Allcon | Hold | HTTPS certificate validation failed during inspection; certificate checks are not bypassed. |

Exact title + confirmed deadline + archive state duplicates across public sources are shown once in the portal, with links to the other source listings preserved. Member-authored records are never folded into public records.

## Verification

The 2026-10-12 local run loaded all six sources without errors: K-Startup 45, Wevity 39, Thinkyou 135, Hola IT 80, DACON 10 and the National Medical Center 1. The snapshot has 367 stored records, including 357 active source records; the public board shows 326 distinct active cards after grouping exact duplicates. It contains no confirmed expired public imports. Representative original links from all six sources returned HTTP 200.

Static pages have no build step. The parser/ownership suite passed 38 tests and the browser logic suite passed 61 tests. Headless Chrome at 1440px and 390px confirmed no horizontal overflow, a clear hero/stage boundary, working desktop anchors, mobile menu, project tabs, English switch, category filter, search and external link attributes. Login cancellation and permission transitions are covered by the existing browser logic tests; no real member account was used in visual QA.
