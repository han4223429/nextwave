# NextWave Field Desk portal

`portal.html` provides a public opportunity board and an authenticated member workspace. The public board reads `data/opportunities.json`; it does not query member collections. Google and email login use Firebase Auth; approved-member permissions remain in Firestore.

## Email login

Open **이메일로 로그인**. For a first visit or a forgotten password, choose **처음 이용 / 비밀번호 없이**, enter the email address and request a login link. Existing Google members should use the same email address. Open the link and confirm that email in the portal. A different browser can also complete the link by typing the recipient address. Then use **비밀번호 설정** to add a 12–128 character password to the authenticated account. Subsequent visits can use the email and password directly.

The portal does not implement unverified password signup or copy membership by email. Firebase must verify email ownership, and `members/{uid}` remains the sole membership authority. A new UID starts pending approval. Password setup calls `currentUser.updatePassword` on the verified user; it does not create another account or use a password-reset flow that could replace a linked provider. Restored unverified sessions are signed out before any member document is read or created.

Email links and passwords are never stored or logged by the application. Only the recipient email and a timestamp can be saved locally for 24 hours, to help complete a link in the same browser; unavailable storage falls back to manual email entry. The action code is removed from the address bar before portal initialization. Mail links return to the current site's `portal.html`, with no email, redirect parameter or existing query copied into the return URL.

Firebase **Email/Password** and **Email link** must both be enabled, the site's hostname must be authorized, and the checked-in Firestore rules must be deployed before rollout. Firebase's free Spark plan allows only **five email sign-in links per day**; this is why password setup is offered after verification. This implementation does not upgrade billing. See the official [email-link guide](https://firebase.google.com/docs/auth/web/email-link-auth) and [email quotas](https://firebase.google.com/docs/auth/limits#email_sending_limits).

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
node --check email-auth.js
node --test tests/portal.test.cjs tests/portal-auth.test.cjs tests/email-auth.test.cjs
```

The unit tests run production helpers with controlled DOM/SDK responses; they make no network requests, do not use Firebase credentials, and do not write to Firebase. They cover board behavior, listener teardown, Google credential verification, email-link handling, password setup and verified-email access gates. Real Auth Emulator integration checks and their known limitation are recorded in `tests/email-auth-emulator.test.mjs`; Firestore rules tests use a separate local emulator. Emulator checks do not prove production mail delivery or Google consent works.

For browser verification, start the existing local static server, open `portal.html`, and check search/no-results/reset, category filters, archive inclusion, load more, refresh, source status, mobile layout and the login cancel/error path. A real approved test account is needed to exercise private interactions end to end; source checks and emulator rules tests are not a substitute for that check. Do not create chat messages, notices, attendance or role changes in production simply to run a UI test.
