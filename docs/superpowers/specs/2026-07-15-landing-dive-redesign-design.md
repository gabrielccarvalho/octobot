# OctoBot Landing Page Redesign — "The Dive"

**Date:** 2026-07-15
**Status:** Approved
**Scope:** `apps/landing-page` only. Copy and imagery are reused from the existing site; structure, layout, and motion are rebuilt.

## Goal

Make the landing page feel hand-crafted, character-led, and distinctive — not a generic AI-SaaS/shadcn template. The redesign commits to one concept: **the page is a single descent from the ocean surface to the abyss**. Depth equals narrative progress. GitHub's noise lives at the surface; OctoBot lives in the deep and surfaces only what matters. The existing biolume cyan accent, dark starfield atmosphere, and octopus mascot artwork become load-bearing narrative elements instead of decoration.

Design decisions locked with the user:

- **Direction:** character-led & playful, mascot as narrative device.
- **Motion:** rich, library-backed — add `motion` (motion.dev). Respect `prefers-reduced-motion` everywhere.
- **Scope:** full structural freedom — merge/reorder/cut sections; copy and imagery reused.
- **Theme:** keep light/dark toggle, **dark becomes the default**. Light mode maps to a "daylight ocean" (sky-blue surface → deep teal) so it is designed, not an afterthought.
- **Guiding constraint (from devtool-landing research):** motion must serve comprehension, not decoration. Every animated sequence explains something about the product.

## Global systems

### 1. Depth background (`components/deep-background.tsx`)

One fixed, full-viewport backdrop whose color interpolates with overall scroll progress. Replaces the current static nebula/atmosphere gradients.

- Dark mode: moonlit navy at the top → near-black abyss at the bottom.
- Light mode: airy sky-blue → deep teal.
- Implemented with a `motion` scroll-linked value driving CSS custom properties (background gradient stops), transform/opacity only, no layout work.
- "Marine snow" particles: small drifting specks that fade in as depth increases. Dark mode only, lazy-mounted after first paint, GPU-friendly transforms, capped particle count. Disabled under reduced motion.

### 2. Depth gauge (`components/depth-gauge.tsx`)

A fixed mono readout on the right viewport edge, e.g. `-437m · How it works`, updating with scroll. Doubles as section navigation: each beat registers a depth; clicking a depth smooth-scrolls to it. This is the page's signature navigation and replaces the navbar's generic anchor links (the header keeps logo, theme toggle, GitHub/CTA). Hidden on small screens (mobile keeps a minimal header). Under reduced motion it stays visible but updates without animation.

### 3. Motion system

- Dependency: `motion` (motion.dev, the framer-motion successor), imported as `motion/react`.
- Spring-based section entrances via shared `variants` (staggered children) replace the CSS `Reveal` component; `components/reveal.tsx` and `lib/use-in-view.ts` are retired.
- Scroll-linked values (`useScroll`, `useTransform`) drive the depth background, the pinned how-it-works scrub, The Noise choreography, and light parallax on mascot art.
- Micro-interactions: subtle button press squash, DM cards spring in, mascot idle bob (small CSS/`motion` transform on the PNG), hover lifts kept from current design.
- **Reduced motion fallback is a first-class requirement:** scroll-scrub sections collapse to static stacked layouts; entrances become opacity-only; particles and idle loops disabled.

## Page beats (9 sections → 8)

Order: Hero → The Noise → How it works → What reaches you → Commands → Trust Trench → FAQ → Abyss CTA. Two merges: Features + Notifications → "What reaches you"; Security + Open source → "Trust Trench".

### 1. Hero — Surface (0m)

Keeps the two-column pitch + Discord DM window. Changes:

- The DM feed becomes a living loop: `HERO_MESSAGES` spring in one at a time, older messages drift down and fade, then the loop continues. Online-dot biolume pulse stays.
- Section ends with an animated SVG **waterline** (`components/waterline.tsx`) — a gentle wave divider; scrolling past it reads as "going under."

### 2. The Noise (-150m) — new beat

Built entirely from existing copy (`VALUE_POINTS` + the `REASONS` list). A wall of notification pills floats chaotically at the top of the beat; as the user scrolls, irrelevant pills sink into the dark and fade while the few that matter settle into one clean DM card. Visualizes filtering — the product's core value — in a couple seconds of scroll. Connective headline copy may be added to `content.ts` (facts only, no invented capabilities).

### 3. How it works (-400m)

Pinned scroll-scrub sequence. The section wrapper is tall; inner content is `position: sticky`. Scroll progress crossfades through the four existing scene illustrations (`public/mascot/connect|baseline|notify|digest.png`) with the matching `STEPS` copy and an `01–04` progress rail. Slight parallax drift on the artwork. Reduced-motion/mobile fallback: plain stacked list of the four scenes.

### 4. What reaches you (-600m) — merges Features + Notifications

An interactive filter panel showing `/listen-to` instead of describing it: subject-type chips and reason pills are toggleable; a preview DM card updates live to reflect what would get through. The six `FEATURES` blurbs flank the panel as annotated stanzas in an asymmetric editorial layout — explicitly **not** a 3-col icon-card grid. Interaction is client-side illustrative state only (no backend).

### 5. Commands (-700m)

Rendered as a Discord slash-command autocomplete mock: an input types `/`, a menu spring-opens listing the six `COMMANDS`, and the highlight cycles through them, surfacing each description. Auto-plays on scroll into view; hover/focus pauses the cycle and lets the user highlight manually. Replaces the 2-col card list.

### 6. Trust Trench (-800m) — merges Security + Open source

One wide trench panel under the existing headline "Don't trust it — read it." The five `SECURITY` points appear as plaques along the trench wall; the open-source block (mascot `open-source.png`, MIT/read-only/self-auditable points, GitHub star CTA) anchors the panel.

### 7. FAQ (-900m)

Kept as a compact, narrow accordion (right pattern for the content), restyled to match the depth aesthetic.

### 8. Abyss CTA (-1000m)

Near-black canvas, biolume particles, glowing mascot (`octobot.png` with glow treatment), one big "Add to Discord" button plus community-server link. Footer sits below as the ocean floor.

## Engineering shape

- **New components:** `deep-background.tsx`, `depth-gauge.tsx`, `waterline.tsx`.
- **Rewritten sections:** all of `components/sections/*` except FAQ (restyled) — hero, noise (new), how-it-works, reaches-you (new, replaces features + notifications), commands, trust (replaces security + open-source), cta.
- **Removed:** `components/reveal.tsx`, `lib/use-in-view.ts`, the static atmosphere styles in `globals.css`, `components/sections/features.tsx`, `notifications.tsx`, `security.tsx`, `open-source.tsx` (content absorbed).
- **content.ts:** unchanged except connective headlines for The Noise; no invented capabilities (file's own rule).
- **Theme:** `theme-provider` default flips to dark; toggle kept; `NAV_LINKS` anchors updated to the new section ids.
- **Dependency added:** `motion`.
- **Performance guardrails:** transform/opacity-only animation; particles lazy-mounted and capped; `next/image` kept for all mascot art; no scroll listeners outside `motion`'s rAF-batched values.
- **Accessibility:** semantic `<section>` landmarks preserved; all information conveyed by motion also present statically (reduced-motion layouts); accordion and interactive filter panel keyboard-operable.

## Error handling

Purely presentational client-side work; no new data flows. Failure modes are graceful degradation: JS disabled or `motion` failing to hydrate must still render all copy in document order (sections render content server-side; motion enhances).

## Testing / verification

- `pnpm build` + typecheck + lint pass in `apps/landing-page`.
- Visual verification in Chrome at desktop and mobile widths: each beat renders, scrub sections pin/release correctly, no horizontal overflow.
- Verify `prefers-reduced-motion` fallback via DevTools emulation: no pinned scrub, no particles, content fully readable.
- Verify both themes: dark (default) and light "daylight ocean."
- Lighthouse spot-check: no CLS regressions from pinned sections; LCP remains the hero heading/DM window.

## Out of scope

- New copy or new mascot artwork (existing PNG poses only; "travel" effects are crossfade/parallax, not rigged animation).
- Legal pages, README, bot app.
- Analytics/SEO metadata (already tuned).
