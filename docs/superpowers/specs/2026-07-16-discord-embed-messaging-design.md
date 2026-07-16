# Discord Embed Messaging with Mascot Thumbnails

**Date:** 2026-07-16
**Status:** Approved in outline; one open question (see Open Questions) before planning.

## Problem

Every message OctoBot sends is a plain-text string of Discord markdown. A grep for
`EmbedBuilder|setThumbnail|setImage|setColor|setTimestamp|AttachmentBuilder` across
`apps/bot/src` returns zero hits. The bot has a strong mascot and none of it reaches
the user.

Goal: rebuild the appearance of every *pushed* message as a Discord embed carrying a
mascot thumbnail, a title, a body, and a relative timestamp.

## Non-goals

- **Command replies stay plain text.** `/status`, `/link`, `/unlink`, `/listen-to`,
  `/digest`, `/connect-token` and error replies are ephemeral and user-triggered.
  This constraint is load-bearing — see Architecture, "The shared-formatter seam".
- **OAuth HTML pages** (`http/routes.ts:14-16`) are browser-rendered, unrelated.
- **Relaxing `status.ts` clamps** is deferred (see Follow-ups).

## Layout decision

Discord embed elements render in a **fixed order**: author → title → description →
fields → image → footer. `thumbnail` is not in that flow — it floats top-right,
alongside title and description. A large image cannot sit above the title, so the
originally sketched layout (`[IMAGE]` / `[TITLE]` / `[BODY]` / `[TIMESTAMP]`) is not
literally buildable.

| Slot | Size | Verdict |
|---|---|---|
| `author.icon_url` | ~24px circle | Matches the sketch's *order*, but destroys the art at 24px |
| `image` | full-width banner | Highest impact, but lands *below* the body; stacked messages get very tall |
| **`thumbnail`** | **~80px square, top-right** | **Chosen** — 1:1 art, text beside it, compact in a busy DM feed |

## Visual model

Three independent axes, so 9 images yield ~18 distinct messages:

- **Image → tone bucket** (9 images, reused across events sharing a feeling)
- **Colour → per event** (free; no art cost)
- **Emoji + title → per event** (already exists in `notifier.ts:15-35`)

`merged` and `approved` share the confetti thumbnail but differ in colour, emoji and
title — distinct without more art.

**Known collision:** `reviewed` and `commented` share tone (`chatter`) *and* emoji
(💬, `notifier.ts:18-19`). They are separated here by colour only (see the PR table).
Their labels already differ ("New review on your PR" / "New comment on your PR").

### Art direction (validated at real size)

The thumbnail renders at ~80px. These rules come from rendering the actual set at 80px,
not from theory:

- **Silhouette + face expression + at most one oversized prop.** Nothing else survives.
- Mascot fills ~70% of the frame, **centered**. Composed as an *icon*, not an
  *illustration*. (The first Chatter attempt failed exactly here: mascot small in a
  landscape scene → a ~30px smudge at render size.)
- **Transparent background, mandatory.** See Alpha, below.
- 1:1, exported at **512×512** (80px × 2 retina = 160; 512 gives headroom, and embed
  thumbnails are clickable — they open the full image).

Two rules were tested and found **not** to matter at 80px. Recorded so they are not
re-litigated:

- *Baked-in text* (Summoned's "@OctoBot you've been mentioned!", Digest's "DAILY
  DIGEST" / "6:00 AM") turns to illegible grey noise — but the surrounding shapes carry
  the meaning. Both ship as-is.
- *Render-style drift* on Alarm/All Good (thinner outlines, gloss, blush cheeks, radial
  glow) is invisible at 80px. Both ship as-is. The coloured glow actively **helps** —
  it makes the tone readable at a glance.

### Alpha: the load-bearing detail

The source renders split into two groups. This — not style — was the real
inconsistency:

- **Transparent** (`alpha=Blend`): alarm, all_good, working, digest. Their "coloured
  backgrounds" are radial glows fading to alpha; they bloom against Discord's dark grey.
- **Opaque black** (`alpha=Undefined`): celebrate, needs_work, summoned, chatter,
  broken. These render as **hard black squares** on Discord's `#2B2D31` embed
  background.

All nine must be transparent. Baking any background colour is wrong: Discord's embed
background differs between dark (`#2B2D31`) and light themes, so a baked background
breaks in one of them. Transparent art works in both — the mascot is light purple with
a dark navy outline and reads against either.

## Asset pipeline

**The nine assets are already produced and committed** to
`apps/landing-page/public/mascot/<name>-v1.png` (512×512, transparent, **503 KB**
total). This section documents how, for future regeneration. It is not implementation
work.

**Caveat: not reproducible as-is.** The sources are ChatGPT renders in `~/Downloads`,
not in the repo. Anyone regenerating must supply equivalent sources.

**Step 1 — background removal (the five opaque sources only):**

```sh
magick "$SRC" -alpha set -channel RGBA -fuzz "$FUZZ" -fill none \
  -floodfill +1+1 "$(magick "$SRC" -format '%[pixel:p{1,1}]' info:)" +channel \
  -resize 512x512 -colors 256 -define png:compression-level=9 -strip "$OUT"
```

**Step 2 — the four already-transparent sources skip floodfill entirely:**

```sh
magick "$SRC" -alpha set -resize 512x512 -colors 256 \
  -define png:compression-level=9 -strip "$OUT"
```

Two details matter:

- **Corner floodfill, not global colour replace.** Floodfill removes only *connected*
  background black, so the black *inside* the mascot (eyes, pupils) survives. A global
  `-transparent black` would blind the mascot.
- **Fuzz is per-image** (see manifest). The mascot outline is `#21195C` — dark navy,
  distinct from `#000000` — which is what makes the separation possible at all.

**On choosing fuzz.** Sweep fuzz *for one image* and watch that image's own opaque
fraction: it plateaus while only background is being removed, then drops sharply once
the outline starts being eaten. The **drop relative to that image's plateau** is the
signal. The absolute number is meaningless across images — `broken-v1.png` ships at
**32.3% mean alpha and is completely intact**, the same figure that indicates damage on
a denser image. Opaque fraction tracks *composition*, not damage. Always confirm by eye.

**256-colour quantisation is free.** Flat vector art with a limited palette quantises
with no perceptible loss: 2.2 MB → 503 KB across the nine (−78%), at RMSE 1.4%
(alarm) / 1.7% (all_good) — the two worst cases, both radial-glow gradients, verified
by eye at 100% zoom with no banding.

### Asset manifest

| Tone | `image` | Source file (`~/Downloads`) | Source alpha | Fuzz |
|---|---|---|---|---|
| `celebrate` | `celebrate-v1.png` | `ChatGPT Image Jul 16, 2026, 04_09_09 PM.png` | opaque | 10% |
| `needs_work` | `needs-work-v1.png` | `ChatGPT Image Jul 16, 2026, 04_15_18 PM.png` | opaque | 10% |
| `summoned` | `summoned-v1.png` | `ChatGPT Image Jul 16, 2026, 04_18_49 PM.png` | opaque | 18% |
| `chatter` | `chatter-v1.png` | `ChatGPT Image Jul 16, 2026, 04_37_01 PM.png` | opaque | 10% |
| `broken` | `broken-v1.png` | `ChatGPT Image Jul 16, 2026, 04_20_45 PM.png` | opaque | 18% |
| `alarm` | `alarm-v1.png` | `ChatGPT Image Jul 16, 2026, 04_27_09 PM.png` | transparent | — |
| `all_good` | `all-good-v1.png` | `ChatGPT Image Jul 16, 2026, 04_30_06 PM.png` | transparent | — |
| `working` | `working-v1.png` | `ChatGPT Image Jul 15, 2026, 02_40_53 AM.png` | transparent | — |
| `digest` | `digest-v1.png` | `ChatGPT Image Jul 15, 2026, 02_57_59 AM.png` | transparent | — |

The existing `public/mascot/` images (`octobot`, `notify`, `digest`, `connect`,
`baseline`, `open-source`) are **landing-page hero art** — right character, wrong
density for an 80px thumbnail. Not reused; left untouched. Note `digest.png` (hero) and
`digest-v1.png` (thumbnail) coexist and are different assets.

## Tone registry

New module `src/messages/tone.ts`. Tone **keys are snake_case**; **filenames are
kebab-case**. The `image` field is the single source of truth for the filename — never
derive the path from the tone key.

```ts
export type Tone =
  | "celebrate" | "needs_work" | "summoned" | "chatter"
  | "alarm" | "all_good" | "working" | "broken" | "digest";

export const TONE: Record<Tone, { image: string; color: number }> = {
  celebrate:  { image: "celebrate-v1.png",  color: 0x8957e5 },
  needs_work: { image: "needs-work-v1.png", color: 0xd29922 },
  summoned:   { image: "summoned-v1.png",   color: 0x58a6ff },
  chatter:    { image: "chatter-v1.png",    color: 0x58a6ff },
  alarm:      { image: "alarm-v1.png",      color: 0xf85149 },
  all_good:   { image: "all-good-v1.png",   color: 0x3fb950 },
  working:    { image: "working-v1.png",    color: 0x8b949e },
  broken:     { image: "broken-v1.png",     color: 0xf85149 },
  digest:     { image: "digest-v1.png",     color: 0x8957e5 },
};
```

These defaults are **real, not decorative**: most PR events override `color`, so the
defaults are what the ~13 reason fallbacks and the unknown-reason path actually use.

| Tone | Art | Covers |
|---|---|---|
| `celebrate` | confetti | merged, approved, **onboarding/welcome** |
| `needs_work` | hammer + screwdriver | changes_requested |
| `summoned` | mention bubble | review_requested, assigned, mentioned, team_mention, invitation, ready_for_review |
| `chatter` | empty speech bubble | commented, reviewed |
| `alarm` | red X, panicked | ci_failed, security_alert (+ `closed` — see Open Questions) |
| `all_good` | green check, thumbs-up | ci_passed |
| `working` | plain mascot | committed, push, labeled, reopened, converted_to_draft, all generic + unknown fallbacks |
| `broken` | worried + warning triangle | token expired, SSO warning |
| `digest` | clipboard + clock | daily 06:00 digest |

**`celebrate` intentionally serves both merged/approved and welcome.** Onboarding is
celebratory and fires exactly once per user, so the overlap is effectively never seen.

**`broken` vs `alarm` are distinct on purpose.** `broken` is sad/apologetic ("your
token expired" — our fault); `alarm` is urgent ("CI failed" — act now).

## Event → tone → colour

Tone resolution **mirrors `resolveMeta` (`notifier.ts:42-47`) exactly**, in order:
event kind → checks verdict → generic PR fallback → reason → unknown fallback.

Colours follow GitHub's semantics where GitHub has one; exceptions are called out.

### PR timeline events (`timeline.ts:3-17`, labelled at `notifier.ts:15-30`)

| Kind | Tone | Colour | Note |
|---|---|---|---|
| `merged` | celebrate | `#8957E5` | GitHub merged purple |
| `approved` | celebrate | `#3FB950` | green |
| `changes_requested` | needs_work | `#D29922` | **amber, not red** — healthy review, not failure |
| `reviewed` | chatter | `#A371F7` | purple — **only axis separating it from `commented`** |
| `commented` | chatter | `#58A6FF` | blue |
| `committed` | working | `#8B949E` | grey |
| `closed` | alarm | `#848D97` | grey — **see Open Questions** |
| `reopened` | working | `#3FB950` | green |
| `ready_for_review` | summoned | `#58A6FF` | |
| `converted_to_draft` | working | `#848D97` | grey |
| `assigned` | summoned | `#58A6FF` | |
| `labeled` | working | `#8B949E` | grey |
| `review_requested` | summoned | `#58A6FF` | |
| `mentioned` | summoned | `#D29922` | matches the `mention` reason below |

Two greys are used deliberately and are distinguishable in intent, not hue:
`#8B949E` = routine activity, `#848D97` = a stopped/inactive state. They are 7/255
apart and will read identically; this is accepted, since tone art and label carry the
distinction.

### CI checks (`ChecksVerdict` at `checks.ts:3`; verdict computed `checks.ts:20-29`)

| Verdict | Tone | Colour |
|---|---|---|
| `passed` | all_good | `#3FB950` |
| `failed` | alarm | `#F85149` |

`verdictFromRuns` can also return **`null`** ("still running / no checks",
`checks.ts:19-28`), but null never needs a tone: `poller.ts:89` guards with
`if (verdict) outcome = ...`, so a null verdict leaves `outcome` null and falls through
to `PR_FALLBACK` / `reasonMeta`. The `PrOutcome` union (`notifier.ts:11-13`) only ever
carries a non-null `ChecksVerdict`. Mapping the two variants is exhaustive.

### Reason fallbacks (`taxonomy.ts:20-35`)

Reached for non-PR subjects, and for PR subjects whose reason is not in
`GENERIC_PR_REASONS`. All use their tone's default colour except where noted.

| Reason | Tone | Colour |
|---|---|---|
| `comment` | chatter | default |
| `review_requested`, `mention`, `team_mention`, `assign`, `invitation` | summoned | default |
| `security_alert` | alarm | `#F85149` |
| `state_change`, `author`, `ci_activity`, `subscribed`, `manual`, `your_activity`, `push` | working | default |

**Unknown reasons → `working`, default colour.** `reasonMeta` (`taxonomy.ts:47-49`)
falls back to `REASON_FALLBACK` ("New activity", `taxonomy.ts:41`) for any key not in
`REASONS`; GitHub adds reason values over time. The tone resolver must mirror this
fallback rather than assume the 14 known keys are total.

**`SUBJECT_TYPES` needs no tone mapping.** `subjectMeta` (`taxonomy.ts:51`) is
unreferenced in production code (only `taxonomy.ts` and its test); `resolveMeta` routes
non-PR subjects purely by reason. `SUBJECT_TYPES` drives the `/listen-to` picker
(`handlers.ts:30-46`) only.

### Lifecycle

| Message | Tone | Colour | Site |
|---|---|---|---|
| Token expired/revoked | broken | `#F85149` | `poller.ts:34-37` |
| SAML SSO warning | broken | `#D29922` | `poller.ts:56-60` |
| Onboarding summary | celebrate | `#8957E5` | `onboarding.ts:58-61` |
| Daily digest | digest | `#8957E5` | `digest.ts:39` |

## Architecture

### Widen the seam without leaking Discord into the domain

`DmSender.sendDm` (`notifier.ts:6-8`) is hard-typed to `string`, and that type
propagates through `poller.ts`, `digest.ts`, `onboarding.ts`, and `CommandContext.reply`
(`handlers.ts:9`). It must widen first — the single biggest structural constraint.

The payload is a **domain type that knows nothing about discord.js**:

```ts
export interface OctoMessage {
  tone: Tone;        // → thumbnail + default colour
  title: string;
  body: string;      // Discord markdown; includes the trailing <t:unix:R>
  color?: number;    // per-event override of the tone default
}

export interface DmSender {
  sendDm(discordId: string, message: OctoMessage): Promise<void>;
}
```

A **single renderer at the edge** (`discord/client.ts`) turns `OctoMessage` into an
`EmbedBuilder`. Domain logic stays testable without discord.js, and
`notifier.test.ts` / `status.test.ts` move from string-scraping to plain object
assertions — easier, not harder.

Boundary check: `notifier.ts` answers "what should this message say and feel like";
`client.ts` answers "how does Discord render that". Neither needs the other's internals.

### The shared-formatter seam (the constraint that shapes this design)

Two formatters serve **both** a DM path (in scope) and a command reply (a non-goal).
A naive "`status.ts` now returns `OctoMessage`" breaks both command paths:

| Formatter | DM path (→ embed) | Command path (**must stay string**) |
|---|---|---|
| `formatAttention` (`status.ts:90`) | `onboarding.ts:60` → `sendDm` | `handlers.ts:143` → `ctx.reply` (`/status`) |
| `buildDigest` (`digest.ts:19`) → `formatDigest` (`status.ts:101`) | `digest.ts:38` → `sendDm` | `client.ts:158` → `editReply` (`/digest` "Preview now") |

**Resolution: compose from the existing shared primitive, don't convert the wrappers.**
`renderBody(list)` (`status.ts:76-88`) is *already* the shared core; `formatAttention`
and `formatDigest` merely prepend a header and clamp. So:

- **Leave `formatAttention` / `formatDigest` returning `string`, untouched.** Command
  paths keep working with zero changes.
- **Add** `attentionMessage(login, list): OctoMessage` and
  `digestMessage(login, list): OctoMessage`, each composing `renderBody(list)` as
  `body` and its header text as `title`. The header stops being body text and becomes
  the embed title — which is what an embed wants anyway.
- **Extract** `buildDigestData(deps, user): Promise<AttentionList | null>` from
  `buildDigest` (the fetch + emptiness check). Then `buildDigest` (string, for
  `client.ts:158`) and the new digest DM path both compose from it, sharing the fetch
  without sharing the rendering.

This keeps `handlers.ts` and `client.ts` command paths genuinely out of scope, as the
non-goals promise.

### Message decomposition

Today one string carries everything (`notifier.ts:49-59`):

```
${emoji} **${label}** · ${repoFullName} · <t:unix:R>
[#188 subjectTitle](subjectUrl)
```

It splits as:

- **`title`** ← `` `${emoji} ${label}` `` (e.g. "🎉 Your PR was merged")
- **`body`** ← masked link line, then repo + relative timestamp:
  ```
  [#188 subjectTitle](subjectUrl)
  ${repoFullName} · <t:unix:R>
  ```
- **`footer`** ← hardcoded `"OctoBot"` in the renderer; carries no data.

**This changes ordering** — the timestamp moves from the end of line 1 to the end of the
body. That is intentional (it matches the target layout), but it is a behaviour change,
not a preservation. Existing tests asserting the old single-line shape will fail and
must be rewritten, not patched.

For `attentionMessage` / `digestMessage`, `title` is the existing header text
(`✅ Connected as \`x\`` / `☀️ Daily PR digest for \`x\``) with its markdown stripped —
embed titles render no markdown.

### Rendering

```ts
new EmbedBuilder()
  .setColor(msg.color ?? TONE[msg.tone].color)
  .setTitle(msg.title)
  .setDescription(msg.body)
  .setThumbnail(`${config.mascotBaseUrl}/${TONE[msg.tone].image}`)
  .setFooter({ text: "OctoBot" })
```

### Timestamp: must live in the description

The target is relative time ("1 second ago"), which the bot already produces via
Discord's `<t:unix:R>` token (`notifier.ts:52-58`, `status.ts:33-34`).

- `setTimestamp()` renders as *"Today at 4:32 PM"* — absolute, not relative.
- The `<t:unix:R>` token is parsed in **descriptions and field values**. It is **not**
  parsed in footers (which render no markdown at all), titles, or author names.

Relative time therefore lives at the **end of the description**. `setTimestamp()` is
not used. (A field-based layout remains possible later, since fields parse the token.)

### The masked link: keep it, but the comment's rationale is dead

`notifier.ts:53` explains the masked link (`[#188 title](url)`) as suppressing
Discord's bulky link preview. Inside an embed description **links never auto-expand at
all** — so there is nothing left to suppress and the stated rationale becomes **moot**,
not "still true". Keep the masked link for readability and compactness, and **update or
delete that comment**; leaving it would assert a reason that no longer applies.

## Asset hosting

Files live in `apps/landing-page/public/mascot/`, already served by Vercel's CDN at
`https://octobot.dev/mascot/` (`landing-page/app/sitemap.ts:3`, `apps/bot/DEPLOY.md:39-45`).
Zero new infrastructure — `apps/bot` serves no static files and registers only
`/health` and `/oauth/callback` (`http/routes.ts:19-21`).

- **Versioned filenames** (`celebrate-v1.png`). Discord's image proxy caches
  aggressively and will serve stale art for days; a new filename is the only reliable
  bust.
- **`MASCOT_BASE_URL`**, default `https://octobot.dev/mascot`. **This needs new
  machinery**: every entry in `REQUIRED` (`config.ts:12-21`) throws when absent, and
  there is currently no optional-with-default path. It must also strip trailing slashes
  the way `publicBaseUrl` does (`config.ts:48`, `.replace(/\/+$/, "")`) — otherwise
  `${base}/${image}` double-slashes.

Do **not** use `AttachmentBuilder`: it re-uploads ~56 KB (mean asset size) per DM on
every notification, where a hosted URL is fetched and cached once by Discord's proxy.

## Testing

The widening breaks more tests than the three obvious ones. All of these string-scrape
and must be rewritten:

- `notifier.test.ts`, `digest.test.ts`, `status.test.ts` — assert on formatted strings.
- `poller.test.ts` (`:85`, `:117`, `:125`, `:136-138`, `:147`, `:188-189`) and
  `onboarding.test.ts` (`:76`, `:97`, `:104`) — scrape `sent[0].message`.
- `handlers.test.ts:134` — asserts on `formatAttention` output. This one must keep
  passing **unchanged**, since `/status` stays plain text; it is the regression guard
  for the non-goal.

New tests:

- **Compile-time exhaustiveness** is available only for `PrEventKind` and
  `ChecksVerdict` (both true unions) via `Record<>`.
- **Runtime exhaustiveness for reasons**: `REASONS` is `TaxonomyEntry[]` with
  `key: string` (`taxonomy.ts:1-5`), *not* a union, so `Record<>` cannot enforce it.
  Iterate `ALL_REASON_KEYS` (`taxonomy.ts:39`) and assert each resolves to a valid tone;
  separately assert an unknown key resolves to `working`.
- **Renderer**: `OctoMessage` → embed sets thumbnail URL, colour, title, description.

Existing `selectPrEvent` / `PRIORITY` tests (`timeline.ts:37-52`) are untouched.

## Open Questions

**`closed` → `alarm` needs a decision.** The approved bucket put `closed` with
`ci_failed` under `alarm`, whose art is a panicking octopus behind a red X. For "your
PR was closed" that is melodramatic — and the grey `#848D97` assigned to it is an
admission that the art is too loud, compensating with colour. GitHub itself renders
closed PRs red, so the grey is also the one place "colours follow GitHub's semantics"
is untrue.

Recommendation: move `closed` → `working` (grey), leaving `alarm` for genuine
act-now events (`ci_failed`, `security_alert`). Requires no new art.

## Follow-ups (deliberately out of scope)

- `status.ts:9-11` clamps (`MAX_PER_SECTION = 10`, `MAX_TITLE = 59`,
  `MAX_MESSAGE = 2000`) assume plain-text DM limits. Embed descriptions allow 4096, so
  the digest can breathe — a separate, deliberate change. Note `clampMessage`
  (`status.ts:28-30`) is shared with the command paths, so relaxing it affects both.
- **Lifecycle DMs are formatted inline at their call sites** (`poller.ts:36`,
  `poller.ts:58-59`) rather than via any formatter. The `OctoMessage` migration must
  touch these two; a proper formatter module for them is a follow-up.
- The inline strings at `handlers.ts:106-107` (`/digest`), `handlers.ts:119` (`/link`)
  and `handlers.ts:196` (`/connect-token`) are **command replies, not lifecycle DMs**.
  They are out of scope entirely and stay as they are.
