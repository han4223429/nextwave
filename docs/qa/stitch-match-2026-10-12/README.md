# Stitch screen comparison · 2026-10-12

Reference: the two visible screens in the user's Stitch project,
https://stitch.withgoogle.com/projects/11545932921380241285 . The project still displayed
“Generating Screen…” during inspection, and the ZIP export button remained disabled.
The visible canvas at 28% zoom was captured and cropped. These crops are lower resolution
than a design export; the comparison checks composition and spacing, not pixel equality.

| Screen | Stitch visible crop | Implementation at the same 720 × 1160 output size |
| --- | --- | --- |
| Club home | [Stitch home](stitch-home-visible.png) | [Implemented home](implementation-home.png) |
| Opportunities | [Stitch portal](stitch-portal-visible.png) | [Implemented portal](implementation-portal.png) |

The Stitch crop starts at each screen's top edge. The implementation was captured at
1440 × 2320 CSS pixels, then scaled by one half. Mobile captures use a 390 px viewport:
[home](home-mobile-390.png) and [portal](portal-mobile-390.png).

Observed alignment:
- Home: slim nav; text-only hero; four metrics on a horizontal divider; next section starts
  with a heading and a wide work image; project records follow vertically.
- Portal: small nav; text header; full-width search and filters; opportunity results on the
  left and help content on the right; mobile stacks the panels.

Intentional source-of-truth differences:
- Stitch uses unverified counts, achievements, example opportunities, and an AI-generated
  maker photograph. The site uses its verified 2 projects, 6 activity records, 6 public
  opportunity sources, actual live opportunity metadata, and the club's existing RESCUE JET
  design image. It does not claim the stock photo depicts the club.
- Member sign-in, source freshness, status, category filtering, original links, MAYHEM
  browser experiment, and RESCUE JET 3D viewer remain available. They add detail beyond
  the static Stitch mockup.
- The portal has more and denser real rows than the sample design, because its current
  opportunity snapshot contains hundreds of items; the layout and sidebar are maintained.

Local design references inspected: `design-md/wired/DESIGN.md` (hairline dividers and
reading rhythm), `design-md/sanity/DESIGN.md` (technical micro labels and a consistent
blue interaction state), and `design-md/claude/DESIGN.md` (reviewed but its warm serif
and cream product identity did not fit the selected Stitch screen). The user's Stitch
screen takes priority over these supplementary references; no logos or imagery were copied.

Browser checks: 1440 px desktop and 390 px mobile, no document horizontal overflow;
project tabs and cover link, language toggle, mobile navigation, portal health filter,
search empty state, source status, and safe original links passed. The companion Python
crawler tests (38), isolated Node tests (61), and rescue model tests (4) passed.
