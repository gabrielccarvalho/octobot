# Brag Plan: OctoBot

## What is this app?
OctoBot is a Discord bot that DMs you the moment something on GitHub needs you — review requests, mentions, CI failures, approvals — across every repository your account can touch, public and private. One click to connect, no per-repo webhooks.

## The angle
The whole product, and the whole landing page, is built on one metaphor: **GitHub never shuts up, so the noise sinks into the abyss and only what needs *you* surfaces — as a single Discord DM.** The video is that metaphor in motion. Open in a cluttered swarm of notification noise, let it sink into the dark, and let one clean, glowing DM rise to the surface. It's specific to OctoBot because it uses the site's actual copy ("GitHub never shuts up", "GitHub, in your DMs"), its real DM-stream artifact, its bioluminescent violet/cyan-on-black palette, and its glowing octopus mascot. No generic SaaS video could reuse this.

## Hook (first 2-3 seconds)
A dark, deep-water field already crowded with drifting GitHub notification pills — "Review requested", "Mentioned", "CI activity", "New comment" — overlapping, tilted, too many. The line **"GitHub never shuts up."** slams into the center. The clutter *is* the hook: everyone with a GitHub account feels this instantly.

## Key moments (the middle)
- **The sink** — the entire cloud of notification pills drops and fades into the darkness below (recreating the site's Noise section), clearing the frame.
- **The surface** — one clean DM card rises into the empty space: `OctoBot · 🔔 Review requested · acme/api · #128 Add rate limiting`. Then the live stream fills in 2–3 DMs one by one (approved, mentioned), header reading `online · watching 14 repos`. This is the site's signature artifact, shown for real.
- **The claim** — "GitHub, in your DMs." with the violet→biolume underline from the hero, plus three fast value chips: *every repo you can touch · public & private*, *PR verdicts, not pings*, *one click, no webhooks*.

## Outro / punchline
The glowing octopus mascot rises from the abyss with bubbles and a biolume halo. Line: **"Stop refreshing the notifications tab."** → `octobot.dev`. The beat before the logo lands on the track's payoff hit.

## User flow worth showing
The product's real flow, compressed: **noise everywhere → one DM surfaces → the live stream fills in.** Centerpiece is the DM stream (the actual hero artifact), not a marketing section list. Entry = the noise; key action = OctoBot filters it; result = a single, verdict-carrying DM.

## Tone
- Preset: polished (with app-store cleanliness)
- Creative direction: "the abyss goes quiet — the noise sinks, one signal surfaces"
- Interpretation: Confident and clean, not frantic. Few scenes, longer holds, restrained motion. The underwater aesthetic carries the drama; the edit stays calm and legible. Upbeat-but-composed music bed keeps it postable rather than funereal.

## Format: landscape — 1920x1080
## Duration: ~19.5 seconds

## Visual identity (from the project)
- Background: `oklch(0.141 0.005 285.823)` — near-black with a faint violet tint (site is dark-mode only)
- Accent (violet/primary): `oklch(0.432 0.232 292.759)`; brighter glow violet `oklch(0.541 0.281 293.009)`
- Accent (biolume cyan): `oklch(0.62 0.1 210)` — the bioluminescent status/highlight color
- Card surface: `oklch(0.21 0.006 285.885)`, border `oklch(1 0 0 / 10%)`
- Text: `oklch(0.985 0 0)` (near-white); muted `oklch(0.705 0.015 286.067)`
- Display font: Space Grotesk (headlines). Body font: Figtree. Mono: Geist Mono (DM cards, chips, URL).
- Strongest visual element: the DM-stream card (`OctoBot · online · watching 14 repos` + arriving DM cards), the sinking scatter of notification pills, and the glowing octopus mascot (`public/mascot/octobot.png`). Signature touches: violet→biolume underline, biolume status dot, blurred violet glow behind the card, rising bubbles.

## Share copy (draft)
GitHub never shuts up. OctoBot only taps you when it actually matters — one Discord DM, every repo you can touch, public & private. 🐙 octobot.dev

## Audio direction
- Role: composed, confident bed with restrained motion-matched accents. Music leads; SFX punctuate the sink, the surfacing DM, and the logo.
- Music: `happy-beats-business-moves-vol-11-by-ende-dot-app.mp3` (114.84 BPM, clean beat grid, well-spread strong cues).
- Music treatment: start ~0s under the hook, hold a steady confident level, gentle fade under the final mascot/logo beat so the last SFX can ring.
- Music cue guidance: bundled preset `assets/music/cues/happy-beats-business-moves-vol-11-...music-cues.json`. Strong cues to target — hook slam ~1.60s, claim/stream reveal ~9.50–12.65s, value payoff ~17.91s, logo landing ~22.65s (edit ends ~19.5s so anchor logo near a strong beat in the 17–19s range, e.g. 17.91s, and let the tail settle). Beat grid ~0.52s spacing for sequential reveals.
- Audio-reactive treatment: subtle; use music RMS/bass to make the DM-card glow and the mascot's biolume halo breathe. No waveform/equalizer visuals.
- SFX posture: moderate, motion-matched. A soft descending whoosh on the sink; a clean bell/chime + soft "pop" as the DM surfaces and each card arrives; a light interface tick per value chip; one warm impact when the mascot/logo lands.
- Audio-coupled moments: the sink (whoosh), DM cards arriving one by one (card sounds on the beat grid), value chips (light ticks), mascot/logo landing (impact ringing over the fading music).
- Restraint rule: never machine-gun SFX; sequential text chips get quiet ticks and adequate hold, not one hit every beat. Keep it calm and premium.

## Storyboard

### Scene 1 — The noise (hook) — 3.5s
Deep-water dark field already full of ~10–11 drifting GitHub notification pills (from REASONS: "🔔 Review requested", "📣 Mentioned", "💬 New comment", "⚙️ CI activity", "🔀 State changed", etc.), scattered, tilted, overlapping — visual overload. Headline **"GitHub never shuts up."** (Space Grotesk, near-white) slams into center and HOLDS. Faint marine-snow particles and a slow depth gradient sell the underwater setting.
Sequential/interaction: none (pills are already present, drifting subtly).
Audio intent: establish a composed, confident bed; a low ambient presence under the clutter.
Audio-coupled idea: hook line lands on the strong cue ~1.60s.
Music: upbeat-composed, steady.
Transition mood: dramatic (the frame is about to drop) → Scene 2

### Scene 2 — The sink — 4.0s
The whole cloud of pills drops downward and fades into the darkness below (recreating the site's Noise beat: y-translate + opacity out, staggered). As the frame clears, short line **"The noise sinks."** appears low, then one clean DM card rises into the emptied center: `OctoBot · 🔔 Review requested · acme/api · #128 — Add rate limiting`, with the biolume status dot glowing.
Sequential/interaction: yes — pills sink in a staggered fall; the single DM card rises up into place.
Audio intent: release — the clutter draining away, then one clear arrival.
Audio-coupled idea: descending whoosh over the sink; a clean chime/pop as the DM surfaces.
Music: steady; light swell as the card lands.
Transition mood: soft → Scene 3

### Scene 3 — The living DM stream (reveal) — 4.0s
Pull back slightly to the full DM-stream card from the hero: header `OctoBot · online · watching 14 repos · #direct-messages`, blurred violet glow behind it, on a `card` surface with a thin border. Two more DMs arrive one by one below the first: `✅ Your PR was approved · acme/web · #61 Dark mode` (biolume tone) and `📣 Mentioned · acme/infra · #402 Bump node to 22 in CI`. Tagline **"GitHub, in your DMs."** sits above/beside with the violet→biolume underline from the hero.
Sequential/interaction: yes — 2 DM cards arrive one by one, snapped to the beat grid (~0.52s apart), each with a soft card sound; then the full set holds.
Audio intent: momentum and clarity — the product working, calmly.
Audio-coupled idea: card-arrival sounds on consecutive beats (~9.50s, ~10.01s); tagline emphasis near strong cue ~9.50–12.65s.
Music: confident, driving gently.
Transition mood: clean → Scene 4

### Scene 4 — Why it's different (highlights) — 3.5s
Three value chips (mono, on card surfaces) reveal quickly then HOLD together: **"Every repo you can touch — public & private"**, **"PR verdicts, not pings"**, **"One click. No webhooks."** Keep them large and legible; this is the proof, not a wall of text.
Sequential/interaction: yes — 3 chips reveal in quick succession (snap to every other beat, ~0.7–0.8s apart, NOT every beat) and then hold the full set on screen ~1.2s so all three are readable.
Audio intent: three crisp confirmations.
Audio-coupled idea: a light interface tick per chip; final chip near strong cue ~17.91s.
Music: building toward the payoff.
Transition mood: soft → Scene 5

### Scene 5 — Surface / CTA (outro) — 4.5s
The glowing octopus mascot (`public/mascot/octobot.png`) rises from the abyss with a biolume halo and a few rising bubbles, bobbing gently. Line **"Stop refreshing the notifications tab."** (Space Grotesk) holds, then the wordmark/URL **`octobot.dev`** settles beneath it. Music fades a touch so the final impact rings.
Sequential/interaction: yes — mascot rises + halo glow, then headline, then URL settle in sequence.
Audio intent: arrival and calm confidence — the payoff.
Audio-coupled idea: warm impact as the mascot/logo lands on a strong beat (~17.91s), ringing over the gentle music fade.
Music: swell then gentle fade under the logo.
Transition mood: soft settle → end

**Music mood for this video:** upbeat-but-composed (polished/app-store), never frantic.
**Audio summary:** A confident, steady bed carries a calm arc — cluttered ambient noise, a releasing whoosh as the notifications sink, a clean chime as the DM surfaces, beat-matched card and chip accents through the reveal, and one warm impact ringing over a gentle fade as the octopus surfaces on octobot.dev.
