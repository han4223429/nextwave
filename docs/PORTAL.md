# NextWave Field Desk portal

`portal.html` provides a public opportunity board and an authenticated member workspace. The public board reads `data/opportunities.json`; it does not query member collections. Google login and approved-member permissions are provided by Firebase Auth and Firestore.

## Public board

- Source records are authoritative from the checked-in crawler snapshot. Legacy Firestore crawler records are not merged over them. Admin-created member opportunities are merged only after membership approval.
- Search, category filtering, archive inclusion, pagination and manual refresh work without signing in. Homepage deep links can use `portal.html?category=dev`, `gamedev`, `hackathon`, or `marketing` (other defined categories also work).
- Archived records and past deadlines are hidden by default. Unknown or invalid deadlines are labeled `마감일 미확인`, never as always open. Date comparisons use the Korean calendar.
- While visible, the page checks for a newer snapshot once per minute. Unchanged snapshots do not replace focused cards; when refreshed content is replaced, surviving opportunity and source links retain keyboard focus without scrolling. Manual refresh downloads the latest snapshot; it **does not start a crawler**.
- The expected freshness window comes from `refreshIntervalMinutes`; a source's last successful collection, errors, partial collection and stale data are visible. The page checks for newly published snapshots every minute without claiming the source crawler is already scheduled. Source scraping and scheduled deployment are described in [CRAWLER.md](CRAWLER.md).
- Public fetching starts independently of the Firebase SDK download, so a slow or blocked authentication CDN does not block the opportunity list.

## Member workspace

The original chat, announcements, attendance, member directory, opportunity submission and administrative account actions are retained. Profile approval and revocation are observed in real time. Logging out, switching accounts or changing rights cancels private listeners and clears private content and form drafts. Both account and listener generations reject stale asynchronous callbacks. Google login does not overwrite an administrator's saved display name.

All document fields and action identifiers are rendered with DOM properties and event listeners; there are no HTML-string or inline-JavaScript sinks. Avatars require HTTPS. Outbound links accept absolute HTTP(S) URLs without embedded credentials. Attendance IDs and dates use `Asia/Seoul`, matching the Firestore server rules.

## Local checks

From the repository root:

```sh
node --check portal.js
node --test tests/portal.test.cjs
```

The ten regression tests run the production helpers in a Node VM with a fixed clock; they make no network requests, do not use Firebase credentials, and do not write to Firebase. They cover date-boundary behavior, malformed dates, archive visibility, unsafe links, member/public data separation, stale crawler records, listener teardown, category deep links, keyboard focus during periodic refreshes, and the absence of the previous HTML/inline-handler rendering sinks.

For browser verification, start the existing local static server, open `portal.html`, and check search/no-results/reset, category filters, archive inclusion, load more, refresh, source status, mobile layout and the login cancel/error path. A real approved test account is needed to exercise private interactions end to end; source checks and emulator rules tests are not a substitute for that check. Do not create chat messages, notices, attendance or role changes in production simply to run a UI test.
