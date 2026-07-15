import * as React from "react"

import { cn } from "@/lib/utils"

export type MascotPose = "idle" | "wave" | "peek" | "hold-dm"

/**
 * OctobotMascot — a soft, shaded, themeable octopus mascot.
 *
 * An on-brand riff on the OctoBot logo: a friendly violet octopus with a
 * rounded two-horned head, large glowing biolume eyes, a small smile, and
 * curling tentacles with biolume suckers. Depth comes from token-derived
 * gradients (via `color-mix` over `--primary`/`--biolume`) plus a soft eye
 * glow, so the whole mascot recolors automatically for light/dark themes.
 */
export function OctobotMascot({
  pose = "idle",
  className,
  animate = true,
  title,
}: {
  /** Which pose to render. Defaults to `idle`. */
  pose?: MascotPose
  /** Sizing via width/height utilities, e.g. `size-40`. */
  className?: string
  /** When false, disables the idle float + blink motion. Defaults to true. */
  animate?: boolean
  /** Accessible label. When omitted the SVG is `aria-hidden`. */
  title?: string
}) {
  const a11y = title
    ? ({ role: "img", "aria-label": title } as const)
    : ({ "aria-hidden": true } as const)

  // Stable-per-instance id so multiple mascots on a page don't share <defs>.
  const uid = React.useId().replace(/:/g, "")
  const bodyGrad = `octo-body-${uid}`
  const eyeGrad = `octo-eye-${uid}`
  const glow = `octo-glow-${uid}`

  // `peek` sits lower so the head/eyes peek up from the bottom edge.
  const poseShift = pose === "peek" ? "translate(0 60)" : undefined

  return (
    <svg
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-foreground", className)}
      {...a11y}
    >
      <defs>
        <linearGradient id={bodyGrad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="color-mix(in oklab, var(--primary) 68%, white)" />
          <stop offset="0.5" stopColor="var(--primary)" />
          <stop offset="1" stopColor="color-mix(in oklab, var(--primary) 78%, black)" />
        </linearGradient>
        <radialGradient id={eyeGrad} cx="0.42" cy="0.36" r="0.75">
          <stop offset="0" stopColor="color-mix(in oklab, var(--biolume) 35%, white)" />
          <stop offset="0.55" stopColor="var(--biolume)" />
          <stop offset="1" stopColor="color-mix(in oklab, var(--biolume) 72%, black)" />
        </radialGradient>
        <filter id={glow} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3.4" />
        </filter>
      </defs>

      <g className={animate ? "mascot-float" : undefined}>
        <g transform={poseShift}>
          <Tentacles pose={pose} bodyGrad={bodyGrad} />

          {/* Head + horns silhouette (drawn as one merged fill) */}
          <g>
            {/* left horn */}
            <path
              d="M74 66 C68 52 70 36 82 32 C92 29 98 40 98 54 C89 51 80 55 74 66 Z"
              fill={`url(#${bodyGrad})`}
            />
            {/* right horn */}
            <path
              d="M126 66 C132 52 130 36 118 32 C108 29 102 40 102 54 C111 51 120 55 126 66 Z"
              fill={`url(#${bodyGrad})`}
            />
            {/* main head */}
            <path
              d="M100 50
                 C128 50 150 66 150 90
                 C150 112 130 128 100 128
                 C70 128 50 112 50 90
                 C50 66 72 50 100 50 Z"
              fill={`url(#${bodyGrad})`}
            />
          </g>

          {/* Rim light hugging the crown + outer horn edges */}
          <path
            d="M72 40 C70 35 76 32 82 32 C88 32 92 38 94 47 M128 40 C130 35 124 32 118 32 C112 32 108 38 106 47 M58 78 C64 62 80 53 100 53 C120 53 136 62 142 78"
            fill="none"
            stroke="var(--biolume)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.4"
          />

          {/* Specular highlight, upper-left of head */}
          <ellipse cx="80" cy="74" rx="16" ry="11" fill="white" opacity="0.16" transform="rotate(-24 80 74)" />

          {/* Eyes */}
          <g className={animate ? "mascot-blink" : undefined}>
            {/* soft glow behind each eye */}
            <ellipse cx="84" cy="92" rx="11" ry="13" fill="var(--biolume)" opacity="0.4" filter={`url(#${glow})`} />
            <ellipse cx="116" cy="92" rx="11" ry="13" fill="var(--biolume)" opacity="0.4" filter={`url(#${glow})`} />
            {/* eyeballs */}
            <ellipse cx="84" cy="92" rx="8.4" ry="10.6" fill={`url(#${eyeGrad})`} />
            <ellipse cx="116" cy="92" rx="8.4" ry="10.6" fill={`url(#${eyeGrad})`} />
            {/* sparkle highlights */}
            <circle cx="81" cy="88" r="2.6" fill="white" opacity="0.9" />
            <circle cx="113" cy="88" r="2.6" fill="white" opacity="0.9" />
            <circle cx="86.5" cy="97" r="1.3" fill="white" opacity="0.6" />
            <circle cx="118.5" cy="97" r="1.3" fill="white" opacity="0.6" />
          </g>

          {/* Smile */}
          <path
            d="M91 110 Q100 117 109 110"
            fill="none"
            stroke="color-mix(in oklab, var(--primary) 60%, black)"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.55"
          />

          {pose === "hold-dm" && <DmBubble />}
        </g>
      </g>
    </svg>
  )
}

/** Curling filled tentacle set, varied by pose. */
function Tentacles({ pose, bodyGrad }: { pose: MascotPose; bodyGrad: string }) {
  const fill = `url(#${bodyGrad})`
  const raised = pose === "wave" || pose === "hold-dm"

  return (
    <g>
      {/* far-left tentacle, sweeping out then curling up */}
      <path
        fill={fill}
        d="M72 116 C52 120 38 134 37 150 C36 160 46 163 52 156 C56 151 50 147 54 142 C60 135 70 130 80 126 C78 119 75 115 72 116 Z"
      />
      {/* far-right tentacle OR raised waving arm */}
      {raised ? (
        <path
          fill={fill}
          d="M128 118 C146 108 160 92 158 74 C157 63 145 62 143 72 C142 80 148 86 141 92 C133 98 124 104 120 112 C123 118 126 120 128 118 Z"
        />
      ) : (
        <path
          fill={fill}
          d="M128 116 C148 120 162 134 163 150 C164 160 154 163 148 156 C144 151 150 147 146 142 C140 135 130 130 120 126 C122 119 125 115 128 116 Z"
        />
      )}
      {/* left-mid */}
      <path
        fill={fill}
        d="M82 124 C70 132 62 148 66 162 C69 171 79 170 82 161 C84 154 78 150 80 144 C82 137 88 132 92 128 C90 123 86 122 82 124 Z"
      />
      {/* right-mid */}
      <path
        fill={fill}
        d="M118 124 C130 132 138 148 134 162 C131 171 121 170 118 161 C116 154 122 150 120 144 C118 137 112 132 108 128 C110 123 114 122 118 124 Z"
      />
      {/* center-left */}
      <path
        fill={fill}
        d="M96 126 C90 138 88 152 92 164 C95 172 103 171 103 162 C103 154 98 152 98 145 C98 138 101 132 104 128 C102 124 99 124 96 126 Z"
      />

      {/* biolume suckers */}
      <g fill="var(--biolume)">
        <circle cx="58" cy="140" r="2.2" opacity="0.9" />
        <circle cx="52" cy="150" r="1.7" opacity="0.75" />
        <circle cx={raised ? 150 : 142} cy="140" r="2.2" opacity="0.9" />
        <circle cx="80" cy="150" r="2.1" opacity="0.85" />
        <circle cx="120" cy="150" r="2.1" opacity="0.85" />
        <circle cx="98" cy="152" r="2" opacity="0.85" />
      </g>
    </g>
  )
}

/** Small biolume "DM" chat bubble held aloft in the `hold-dm` pose. */
function DmBubble() {
  return (
    <g>
      <rect x="136" y="30" width="40" height="28" rx="10" fill="var(--biolume)" />
      <path d="M146 56 L150 66 L156 57 Z" fill="var(--biolume)" />
      <circle cx="148" cy="44" r="2.8" fill="color-mix(in oklab, var(--biolume) 60%, black)" />
      <circle cx="156" cy="44" r="2.8" fill="color-mix(in oklab, var(--biolume) 60%, black)" />
      <circle cx="164" cy="44" r="2.8" fill="color-mix(in oklab, var(--biolume) 60%, black)" />
    </g>
  )
}
