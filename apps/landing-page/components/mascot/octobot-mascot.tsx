import { cn } from "@/lib/utils"

export type MascotPose = "idle" | "wave" | "peek" | "hold-dm"

/**
 * OctobotMascot — a flat, geometric, themeable octopus mascot.
 *
 * The character is an on-brand riff on the OctoBot logo: a friendly violet
 * octopus whose head is a Discord "Clyde"-style silhouette (rounded head with
 * two soft ear bumps), two large glowing biolume eyes, a small smile, and a
 * few curling tentacles with biolume accent dots.
 *
 * All colors come from CSS custom properties (`--primary`, `--biolume`,
 * `--background`) plus `currentColor`, so the mascot recolors automatically
 * for light/dark themes.
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

  // `peek` sits lower in the frame so the head/eyes peek up from the bottom
  // edge (the outer <svg> clips everything below the viewBox).
  const poseShift = pose === "peek" ? "translate(0 50)" : undefined

  return (
    <svg
      viewBox="0 0 160 160"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-foreground", className)}
      {...a11y}
    >
      <g className={animate ? "mascot-float" : undefined}>
        <g transform={poseShift}>
          {/* Tentacles are drawn first so they sit behind the head. */}
          <Tentacles pose={pose} />

          {/* Head + ears silhouette */}
          <path
            d="M80 40
               C85 33 90 30 100 30
               C112 30 117 40 116 52
               C116 64 114 72 108 78
               C102 86 92 90 80 90
               C68 90 58 86 52 78
               C46 72 44 64 44 52
               C43 40 48 30 60 30
               C70 30 75 33 80 40 Z"
            fill="var(--primary)"
          />

          {/* Face */}
          <g className={animate ? "mascot-blink" : undefined}>
            <ellipse cx="68" cy="60" rx="6.6" ry="8.6" fill="var(--biolume)" />
            <ellipse cx="92" cy="60" rx="6.6" ry="8.6" fill="var(--biolume)" />
            <circle cx="65.4" cy="56.6" r="2.3" fill="var(--background)" />
            <circle cx="89.4" cy="56.6" r="2.3" fill="var(--background)" />
          </g>
          <path
            d="M71 74 Q80 82 89 74"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.85"
          />

          {pose === "hold-dm" && <DmBubble />}
        </g>
      </g>
    </svg>
  )
}

/** Curling tentacle set, varied by pose. */
function Tentacles({ pose }: { pose: MascotPose }) {
  const stroke = {
    fill: "none" as const,
    stroke: "var(--primary)",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  }

  // The far-right tentacle becomes a raised "arm" for wave / hold-dm.
  const rightRaised =
    pose === "wave"
      ? "M104 80 C122 68 131 50 126 40 C123 33 116 34 116 42"
      : pose === "hold-dm"
        ? "M104 80 C118 70 125 58 122 49"
        : "M102 84 C114 92 119 110 113 122 C109 130 102 128 104 120"

  return (
    <g>
      {/* left outer */}
      <path
        {...stroke}
        strokeWidth="11"
        opacity="0.82"
        d="M58 84 C46 92 41 110 47 122 C51 130 58 128 56 120"
      />
      {/* right outer / raised arm */}
      <path
        {...stroke}
        strokeWidth={pose === "wave" || pose === "hold-dm" ? 11 : 11}
        opacity={pose === "wave" || pose === "hold-dm" ? 1 : 0.82}
        d={rightRaised}
      />
      {/* left mid */}
      <path
        {...stroke}
        strokeWidth="12"
        opacity="0.92"
        d="M69 88 C62 100 60 116 66 126 C71 132 77 129 74 122"
      />
      {/* right mid */}
      <path
        {...stroke}
        strokeWidth="12"
        opacity="0.92"
        d="M91 88 C98 100 100 116 94 126 C89 132 83 129 86 122"
      />
      {/* center */}
      <path
        {...stroke}
        strokeWidth="13"
        opacity="1"
        d="M80 86 C80 100 79 112 81 122 C82 128 88 128 86 121"
      />

      {/* biolume accent dots */}
      <circle cx="52" cy="110" r="2.1" fill="var(--biolume)" />
      <circle cx="108" cy="110" r="2.1" fill="var(--biolume)" opacity={pose === "wave" || pose === "hold-dm" ? 0 : 1} />
      <circle cx="80" cy="112" r="2.1" fill="var(--biolume)" />
      <circle cx="70" cy="122" r="1.8" fill="var(--biolume)" />
      <circle cx="90" cy="122" r="1.8" fill="var(--biolume)" />
    </g>
  )
}

/** Small biolume "DM" chat bubble held aloft in the `hold-dm` pose. */
function DmBubble() {
  return (
    <g>
      <rect x="108" y="26" width="34" height="24" rx="9" fill="var(--biolume)" />
      {/* little tail pointing down toward the tentacle */}
      <path d="M116 48 L120 56 L124 49 Z" fill="var(--biolume)" />
      {/* message dots */}
      <circle cx="118" cy="38" r="2.4" fill="var(--background)" />
      <circle cx="125" cy="38" r="2.4" fill="var(--background)" />
      <circle cx="132" cy="38" r="2.4" fill="var(--background)" />
    </g>
  )
}
