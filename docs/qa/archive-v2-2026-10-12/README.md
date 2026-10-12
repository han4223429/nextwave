# Project archive redesign QA — 2026-10-12

Google Stitch draft: https://stitch.withgoogle.com/projects/11545932921380241285. See `docs/stitch-design-brief-2026-10-12.md` for the design audit and fabricated draft content that was rejected.

The screenshots show the local site at 1440 px desktop and 390 px mobile. The portal captures use the health filter so its three actual matching records, status and original-link controls are visible. The six-source feed displayed 326 active records at capture time; the number changes with scheduled collection and deadlines.

- `home-desktop.png`, `home-mobile.png`: project-led first fold with the existing RESCUE JET image.
- `portal-desktop.png`, `portal-mobile.png`: public opportunity index and compact member entry.
- `projects-mobile.png`, `activities-mobile.png`, `team-mobile.png`: lower-page responsive checks.

Browser checks: no horizontal overflow at 1440 or 390 px; project tabs, featured RESCUE JET link, English/Korean toggle, mobile menu, portal category filter, search empty state, original links, and public six-source status worked. The headless mobile browser could not initialize WebGL; the existing readable water-study fallback displayed. The 3D rescue model's geometry tests passed separately.

Verification: 38 crawler Python tests, 61 isolated Node interaction/auth/data tests, 4 rescue-model tests. The three homepage external project references returned HTTP 200. Member-only features were checked through auth tests; no real member account was used during visual QA.
