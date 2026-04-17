```markdown
# Design System Document: The Terminal Aesthetic

## 1. Overview & Creative North Star

### Creative North Star: "The Brutalist Command Center"
This design system moves away from the soft, rounded edges of modern consumer web design and embraces the rigid, high-performance world of the command line interface. It is a "High-End Editorial" interpretation of a terminal—not a literal 1980s recreation, but a sophisticated, layered environment where technical precision meets high-energy academic culture.

We break the "template" look by utilizing **intentional asymmetry**, **monolithic layouts**, and **typographic dominance**. While most websites strive for "friendliness," this system strives for **authority and energy**. We use fixed-width constraints and box-drawing logic to create a digital workspace that feels like a powerful tool in the hands of a professional hacker.

---

## 2. Colors & Surface Logic

The palette is rooted in deep obsidian tones, punctuated by high-frequency electric accents. 

### The Palette
- **Primary High-Voltage:** `primary` (#94aaff) and `primary_dim` (#3768fa) serve as our "Electric Blue" core.
- **The Warning Signal:** `secondary` (#ffd709) provides the "Yellow Accent" for high-priority alerts and CTAs.
- **Terminal Green:** `tertiary` (#9cff93) is reserved for success states, active connections, and "system ready" indicators.
- **The Void:** `background` (#0e0e0e) and `surface` (#0e0e0e) create the deep-space foundation.

### The "No-Line" Rule
Standard 1px solid CSS borders are strictly prohibited for sectioning. To define boundaries, use:
1.  **Box-Drawing Characters:** Use Unicode characters (┌ ─ ┐ │ └ ─ ┘) for decorative containers.
2.  **Tonal Shifts:** Separate a section by moving from `surface` (#0e0e0e) to `surface_container_low` (#131313).
3.  **Grid Overlays:** Use a subtle CSS repeating linear gradient to create a 24px grid pattern instead of border lines.

### Surface Hierarchy & Nesting
Treat the UI as a series of hardware modules. 
- **Base Layer:** `surface` (The terminal backdrop).
- **Secondary Module:** `surface_container` (A code block or side panel).
- **Active Component:** `surface_bright` (A floating modal or active input).

### Signature Textures
Apply a global `CRT scanline` overlay using a subtle linear gradient: `rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%`, with a background-size of 100% 2px. This adds "visual soul" to the flat dark surfaces.

---

## 3. Typography

Typography is the primary driver of the brand’s "Professional Hacker" tone. We utilize a mix of technical monospacing and high-impact grotesque.

### Typography Scale
- **Display (Space Grotesk):** Large, aggressive, and tech-forward. Use `display-lg` (3.5rem) for hero titles. Always lowercase for a "config file" feel.
- **Headlines (Space Grotesk):** `headline-md` (1.75rem) for section headers. Prepend with a `>` command prompt character.
- **Body (Inter):** While the theme is terminal-based, we use `Inter` for long-form reading to ensure "Energetic College Student" accessibility. Use `body-lg` (1rem) for general content.
- **Labels (Space Grotesk):** `label-md` (0.75rem) in all-caps for metadata, tags, and small technical readouts.

---

## 4. Elevation & Depth

We reject the "Soft Shadow" aesthetic. Depth in this system is achieved through **Tonal Layering** and **Hard Offsets**.

- **The Layering Principle:** Use `surface_container_highest` (#262626) to "lift" a component. Instead of a shadow, use a 2px hard-offset shadow using the `primary` color at 20% opacity to mimic a screen glow.
- **The "Ghost Border":** For interactive states, use the `outline_variant` (#484847) at 20% opacity. It should feel like a faint phosphor trace on a screen, not a physical border.
- **Glassmorphism:** For floating terminal windows (modals), use `surface_container` with a `backdrop-filter: blur(12px)`. This allows the "code" behind the window to bleed through, creating a sense of a complex, multi-tasking environment.

---

## 5. Components

### Buttons
- **Primary:** Solid `primary_container` (#809bff) with `on_primary_container` text. Sharp 0px corners. On hover, trigger a `primary` glow.
- **Secondary (The Prompt):** Transparent background with a `>` character prefix. Text uses `secondary` (#ffd709).
- **Tertiary:** Text-only, using `label-md` styles. All-caps.

### Terminal Inputs
- **Text Fields:** Background `surface_container_lowest`. No borders. A blinking underscore cursor `_` (`@keyframes blink`) follows the text.
- **Error State:** The entire input container flashes `error_container` (#a70138) with `on_error` text.

### Cards & Modules
- **Rule:** No divider lines. 
- **Style:** Use a "Box-Drawing" header. The title of the card should be wrapped in `[ ]` or preceded by `::`.
- **Spacing:** Use exaggerated vertical white space (32px or 48px) from our spacing scale to separate modules.

### Status Indicators (Chips)
- **Active:** `tertiary_container` (Terminal Green) text with a small "●" glyph.
- **Idle:** `outline` (#767575) text with a "○" glyph.

---

## 6. Do's and Don'ts

### Do:
- **Use Fixed-Width Layouts:** Center the main content in a 1200px container, but use `surface_container` bars that span the full viewport width to mimic terminal headers/footers.
- **Embrace Monospace:** Use monospace for any number, date, or "technical" data point.
- **Incorporate Micro-interactions:** Buttons should feel "mechanical." Use instant state changes (0ms transitions) or very fast (100ms) linear easing.

### Don't:
- **No Border Radius:** `0px` is the absolute rule. Any rounding breaks the "Terminal" immersion.
- **No Soft Gradients:** Avoid "sunset" or "organic" gradients. Use high-contrast steps or subtle tonal shifts between `surface` tokens.
- **No Standard Iconography:** Avoid rounded "Material" icons. Use ASCII-inspired icons or sharp, geometric SVG icons with a 2px stroke.

### Accessibility Note:
While we use high-contrast accents, ensure that `on_surface_variant` (#adaaaa) is only used for non-essential decorative text. All functional text must meet a 4.5:1 contrast ratio against the `background`.