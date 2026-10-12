# NextWave home and portal design QA — 2026-10-12

The screenshots compare the homepage and public opportunity portal at the same
desktop (1440 × 900) and mobile (390 × 844) viewports. `before-*` captures the
previous deployed layout; `after-phrase-*` captures this change. The mobile menu
and footer captures show the shared navigation and lower page treatment.

## Shared shell checks

| Check | Desktop | Mobile |
| --- | --- | --- |
| Header height on both pages | 69 px | 67 px |
| Header surface on both pages | white | white |
| Logo type, size, ink, blue dot | identical | identical |
| Navigation labels and order | identical | identical |
| Footer ink, padding, links | identical | identical |
| Document width vs. viewport | 1440 = 1440 | 390 = 390 |
| Home → portal → home `#about` | passed | passed |
| Menu open, close, Escape | — | passed |

The portal heading reads “대학생 창업가를 위한, NextWave” and fits on the mobile
viewport without horizontal scrolling. The same brand line appears in both
footers. The portal rendered 12 opportunity cards and six source summaries
during the local browser check.

## Regression checks

- Crawler: 38 Python unit tests passed.
- Existing portal, authentication, opportunity, audio, and project logic: 61
  Node tests passed in an isolated CommonJS test directory.
- JavaScript syntax: `site-shell.js`, `script.js`, `i18n.js`, and `portal.js`
  passed `node --check`; `git diff --check` passed.

The footer screenshots were taken after scrolling to the bottom. The portal
mobile capture was allowed to settle before the screenshot so its text was
painted by headless Chrome.
