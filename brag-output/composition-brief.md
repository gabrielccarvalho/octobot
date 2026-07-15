# Hyperframes Composition Brief: OctoBot

## Objective
Create a short, polished launch-style brag video for OctoBot — a Discord bot that DMs you when GitHub needs you. The video dramatizes the product's core metaphor: GitHub noise sinks into the abyss; one clean DM surfaces.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: ~19.5 seconds

## Source Material
- Project root: `/Users/gabe/www/personal/octobot`
- Primary files read: `apps/landing-page/lib/content.ts`, `apps/landing-page/lib/beats.ts`, `apps/landing-page/components/sections/hero.tsx`, `.../noise.tsx`, `.../cta.tsx`, `apps/landing-page/components/dm-message.tsx`, `apps/landing-page/app/globals.css`, `README.md`
- Product name: OctoBot
- Tagline / strongest claim: "GitHub, in your DMs." (hero H1) and "GitHub never shuts up." (Noise section)
- Key UI to recreate: the **DM-stream card** — a Discord-style card, header `OctoBot · online · watching 14 repos · #direct-messages`, containing DM rows. Each DM row: bot avatar + `OctoBot` + an `App` badge, then a mono line `<reason> · <repo> · <time>` and a second line `<#number> <PR title>` where the title is a violet underlined link. Plus the **sinking notification pills** and the **glowing octopus mascot**.
- Assets available: `apps/landing-page/public/mascot/octobot.png` (glowing purple octopus, use for outro), `apps/landing-page/public/logo.png` (round bot avatar for DM cards). Copy these into `composition/assets/`.
- Copy that must appear verbatim:
  - "GitHub never shuts up."
  - "The noise sinks." (short connective line; optional but preferred)
  - "GitHub, in your DMs."
  - DM row 1: `🔔 Review requested · acme/api · 5 minutes ago` / `#128  Add rate limiting`
  - DM row 2: `✅ Your PR was approved · acme/web · 2 minutes ago` / `#61  Dark mode`  (biolume/cyan tone)
  - DM row 3: `📣 Mentioned · acme/infra · just now` / `#402  Bump node to 22 in CI`
  - Value chips: "Every repo you can touch — public & private", "PR verdicts, not pings", "One click. No webhooks."
  - "Stop refreshing the notifications tab."
  - `octobot.dev`
  - Notification-noise pill labels (pull from REASONS): "🔔 Review requested", "💬 New comment", "📣 Mentioned", "🔀 State changed", "✍️ Activity on your PR", "👥 Team mentioned", "📌 Assigned", "⚙️ CI activity", "🔖 Subscribed thread", "🛡️ Security alert", "⬆️ New commits pushed"

## Creative Direction
- Tone preset: polished (with app-store cleanliness)
- Creative direction: "the abyss goes quiet — the noise sinks, one signal surfaces"
- Interpretation: Confident, clean, restrained. Few scenes, longer holds, calm motion. The underwater aesthetic (deep near-black violet field, bioluminescent cyan accents, marine-snow particles, faint light rays, rising bubbles) carries the mood; the edit stays legible and premium — not frantic, not a cinematic dirge.
- Angle: The product and its site are one metaphor — GitHub never shuts up, so the noise sinks into the deep and only what needs *you* surfaces as a single Discord DM. Open in a swarm of notification clutter, let it sink, let one glowing DM rise. Every element is OctoBot's own copy, artifact, palette, and mascot.
- Hook: A dark deep-water field already crowded with drifting notification pills; "GitHub never shuts up." slams into center.
- Outro / punchline: The glowing octopus rises from the abyss — "Stop refreshing the notifications tab." → `octobot.dev`.
- Avoid:
  - Generic SaaS language ("streamline your workflow", etc.)
  - Abstract filler visuals / generic particle systems unrelated to the underwater concept
  - Redesigning the brand — stay faithful to the site's dark violet + biolume look
  - Light mode (the site is dark-mode only)

## Visual Identity
- Background: `oklch(0.141 0.005 285.823)` near-black with faint violet tint; deepen toward pure black lower in frame for "depth"
- Text: `oklch(0.985 0 0)` near-white; muted `oklch(0.705 0.015 286.067)`
- Accent (violet/primary): `oklch(0.432 0.232 292.759)`; brighter glow violet `oklch(0.541 0.281 293.009)`
- Accent (biolume cyan): `oklch(0.62 0.1 210)` — status dots, "approved" tone, highlights, mascot halo
- Card surface: `oklch(0.21 0.006 285.885)`; borders `oklch(1 0 0 / 10%)`; violet glow behind the stream card `bg-primary/10 blur-2xl`
- Display font: Space Grotesk (headlines) — fall back to a clean geometric sans if unavailable
- Body font: Figtree; Mono: Geist Mono (DM rows, chips, URL) — fall back to system mono if unavailable
- Visual references from the project: hero DM-stream card, the violet→biolume underline under "DMs", the Noise section's sinking pills, biolume status dot, rising bubbles, the glowing octopus mascot.

## Storyboard
Use `brag-output/brag-plan.md` as the creative contract. Scene summary:
1. **The noise (hook)** — 3.5s — cluttered drifting notification pills on a deep-water field; "GitHub never shuts up." slams in and holds.
2. **The sink** — 4.0s — pills drop and fade into the dark (staggered); "The noise sinks."; one clean DM card (`#128 Add rate limiting`, Review requested) rises into the cleared center.
3. **The living DM stream** — 4.0s — full DM-stream card with header `online · watching 14 repos`; two more DMs (`#61 approved`, `#402 mentioned`) arrive one by one on the beat grid; "GitHub, in your DMs." with the violet→biolume underline.
4. **Why it's different** — 3.5s — three value chips reveal quickly (every-other-beat) then hold together, all legible.
5. **Surface / CTA** — 4.5s — glowing octopus mascot rises from the abyss with halo + bubbles; "Stop refreshing the notifications tab." → `octobot.dev`; warm impact on the logo, music fades.

## Audio
- Audio role: composed, confident bed with restrained, motion-matched accents. Music leads; SFX punctuate the sink, the surfacing DM, card arrivals, chips, and the logo.
- Audio arc: cluttered low ambient → releasing whoosh as the noise sinks → clean chime as the DM surfaces → beat-matched card/chip accents → one warm impact ringing over a gentle music fade on the mascot/logo.
- Music: `happy-beats-business-moves-vol-11-by-ende-dot-app.mp3` (114.84 BPM).
- Music treatment: start ~0s at a steady confident level; hold; gentle fade under the final mascot/logo beat so the last SFX rings.
- Music cue guidance: bundled preset at `assets/music/cues/happy-beats-business-moves-vol-11-by-ende-dot-app.music-cues.json` (copy alongside the track, or read from the skill assets). Target strong cues: hook slam ~1.60s; stream/tagline reveal ~9.50–12.65s; value payoff / logo landing ~17.91s. Beat grid ~0.52s spacing for sequential reveals (e.g. card arrivals ~9.50s & ~10.01s). Since the edit ends ~19.5s, anchor the logo impact near the 17.91s strong cue and let the tail settle. Treat cues as optional hints — readability first.
- Audio-reactive treatment: subtle; drive the DM-card violet glow and the mascot's biolume halo from music RMS/bass so they breathe. No waveform/equalizer/notes visuals, no strobing.
- Audio-coupled moments:
  - Scene 2 sink — descending whoosh; chime/pop as the DM surfaces
  - Scene 3 DM cards — soft card sounds on consecutive beats (~9.50s, ~10.01s); tagline emphasis near a strong cue
  - Scene 4 chips — light interface tick per chip (every-other-beat), not machine-gunned
  - Scene 5 mascot/logo — one warm impact landing on ~17.91s, ringing over the music fade
- SFX selection guidance: soft/rounded interface + impact sounds fit the calm premium tone; card-like reveals get card/pop sounds, the payoff gets one warm bell/impact. Prefer low high-frequency-risk files for repeated ticks. Choose exact files after the animation exists.
- SFX analysis guidance: use the skill's `assets/sfx/sfx-analysis.md` / `.json` to pick lower-harshness sounds for repeated and polished moments.
- Exact SFX choice: Hyperframes chooses filenames, timestamps, density, and volume based on the implemented animation.
- Audio files: copy the chosen music (and its cue JSON) plus any selected SFX into `brag-output/composition/assets/`.

## Hyperframes Instructions
Use the current `hyperframes` skill and CLI workflow; prefer native Hyperframes conventions over anything in `/brag`.

Requirements:
- Show real OctoBot UI: the DM-stream card and DM rows must be recognizably the site's artifact, using the verbatim copy above.
- Keep all text readable in the final render (respect the reading-time floors; hold sequential chips).
- Keep total duration ~19.5s (within 15–25s).
- Include the music + SFX layer; wire at least one subtle audio-reactive element (card glow or mascot halo), or document extraction failure.
- Beat-lock 1–3 major moments to strong cues within ±0.15s (mark `// beat-locked`); snap sequential card/chip reveals to the beat grid within ±0.10s (mark `// beat-grid`), or use natural timing where beats hurt readability.
- Use the underwater visual language (deep violet-black gradient, biolume-cyan accents, marine snow, faint rays, rising bubbles) — but keep motion calm and premium.
- Copy `apps/landing-page/public/mascot/octobot.png` and `apps/landing-page/public/logo.png` into `composition/assets/` and reference them locally.
- Run `npx hyperframes lint` and validate before render; render to `brag-output/brag.mp4`.
