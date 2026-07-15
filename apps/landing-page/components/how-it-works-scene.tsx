"use client"

import * as React from "react"

import { OctobotMascot } from "@/components/mascot/octobot-mascot"
import { useInView } from "@/lib/use-in-view"
import { cn } from "@/lib/utils"

/** simple-icons GitHub mark (24×24 viewBox). */
const GITHUB_PATH =
  "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222 0 1.606-.014 2.898-.014 3.293 0 .322.216.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"

/** simple-icons Discord mark (24×24 viewBox). */
const DISCORD_PATH =
  "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"

/** Sets the dash length CSS var consumed by the `draw-line` keyframe. */
function lenStyle(len: number): React.CSSProperties {
  return { ["--len" as string]: String(len) } as React.CSSProperties
}

/**
 * HowItWorksScene — one of four compact, flat, diagrammatic SVG scenes for the
 * "How It Works" steps. Every color comes from design tokens so both themes
 * recolor automatically. The connecting stroke draws itself (stroke-dashoffset)
 * when the scene scrolls into view; under reduced-motion it renders fully drawn.
 */
export function HowItWorksScene({
  scene,
  className,
}: {
  scene: "connect" | "baseline" | "notify" | "digest"
  className?: string
}) {
  const { ref, inView } = useInView<HTMLDivElement>()

  return (
    <div ref={ref} className={cn("relative overflow-hidden", className)} aria-hidden>
      {scene === "connect" && <ConnectScene inView={inView} />}
      {scene === "baseline" && <BaselineScene inView={inView} />}
      {scene === "notify" && <NotifyScene inView={inView} />}
      {scene === "digest" && <DigestScene inView={inView} />}
    </div>
  )
}

const VIEWBOX = "0 0 200 112"

/** connect — a GitHub node linked to a Discord node by a drawn line; mascot waves. */
function ConnectScene({ inView }: { inView: boolean }) {
  return (
    <>
      <svg viewBox={VIEWBOX} className="h-full w-full text-foreground" role="presentation">
        {/* drawn connection line */}
        <path
          d="M50 54 C68 40 84 40 100 54"
          fill="none"
          stroke="var(--biolume)"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={cn(inView && "draw-line")}
          style={lenStyle(66)}
        />
        {/* GitHub node */}
        <circle cx="34" cy="54" r="18" fill="var(--background)" stroke="currentColor" strokeWidth="2" opacity="0.9" />
        <svg x="23" y="43" width="22" height="22" viewBox="0 0 24 24">
          <path d={GITHUB_PATH} fill="currentColor" />
        </svg>
        {/* Discord node */}
        <circle cx="116" cy="54" r="20" fill="var(--primary)" />
        <svg x="102" y="42" width="28" height="24" viewBox="0 0 24 24">
          <path d={DISCORD_PATH} fill="var(--primary-foreground)" />
        </svg>
      </svg>
      <OctobotMascot pose="wave" className="pointer-events-none absolute -right-1 bottom-0 h-24 w-24" />
    </>
  )
}

/** baseline — a feed of notification rows, most greyed "seen", one biolume welcome row. */
function BaselineScene({ inView }: { inView: boolean }) {
  const rows = ["seen", "seen", "seen", "welcome"] as const
  return (
    <svg viewBox={VIEWBOX} className="h-full w-full text-foreground" role="presentation">
      {/* left feed rail (drawn) */}
      <path
        d="M9 14 V90"
        fill="none"
        stroke="var(--biolume)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
        className={cn(inView && "draw-line")}
        style={lenStyle(80)}
      />
      {rows.map((kind, i) => {
        const y = 12 + i * 22
        const welcome = kind === "welcome"
        return (
          <g key={i}>
            {/* rail node */}
            <circle
              cx="9"
              cy={y + 9}
              r={welcome ? 3.4 : 2.4}
              fill={welcome ? "var(--biolume)" : "var(--border)"}
            />
            {/* row card */}
            <rect
              x="20"
              y={y}
              width="164"
              height="18"
              rx="5"
              fill={welcome ? "color-mix(in oklch, var(--biolume) 16%, var(--card))" : "var(--secondary)"}
              stroke={welcome ? "var(--biolume)" : "var(--border)"}
              strokeWidth={welcome ? 1.4 : 1}
            />
            {/* message bar */}
            <rect
              x="30"
              y={y + 6.5}
              width={welcome ? 96 : 84}
              height="5"
              rx="2.5"
              fill={welcome ? "var(--biolume)" : "var(--muted-foreground)"}
              opacity={welcome ? 0.7 : 0.32}
            />
            {/* trailing glyph: check for seen, dot for welcome */}
            {welcome ? (
              <circle cx="174" cy={y + 9} r="3" fill="var(--biolume)" />
            ) : (
              <path
                d={`M168 ${y + 9} l2.4 2.6 l5 -6`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.4"
              />
            )}
          </g>
        )
      })}
    </svg>
  )
}

/** notify — GitHub activity flows into an arriving biolume DM; mascot holds the DM. */
function NotifyScene({ inView }: { inView: boolean }) {
  return (
    <>
      <svg viewBox={VIEWBOX} className="h-full w-full text-foreground" role="presentation">
        {/* GitHub activity source */}
        <circle cx="30" cy="46" r="16" fill="var(--background)" stroke="currentColor" strokeWidth="2" opacity="0.9" />
        <svg x="20" y="36" width="20" height="20" viewBox="0 0 24 24">
          <path d={GITHUB_PATH} fill="currentColor" />
        </svg>
        {/* small activity ticks near the source */}
        <circle cx="30" cy="72" r="2.2" fill="var(--biolume)" opacity="0.8" />
        <rect x="38" y="70.5" width="20" height="3.5" rx="1.75" fill="var(--muted-foreground)" opacity="0.3" />
        {/* drawn flow line toward the mascot's DM bubble (upper right) */}
        <path
          d="M48 44 C78 34 100 30 132 32"
          fill="none"
          stroke="var(--biolume)"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={cn(inView && "draw-line")}
          style={lenStyle(92)}
        />
      </svg>
      <OctobotMascot pose="hold-dm" className="pointer-events-none absolute -right-2 bottom-0 h-28 w-28" />
    </>
  )
}

/** digest — a single summary card with a 6am clock accent and a few PR lines. */
function DigestScene({ inView }: { inView: boolean }) {
  const lines = ["var(--biolume)", "var(--primary)", "var(--muted-foreground)"]
  return (
    <svg viewBox={VIEWBOX} className="h-full w-full text-foreground" role="presentation">
      {/* card */}
      <rect x="18" y="10" width="164" height="92" rx="10" fill="var(--card)" stroke="var(--border)" strokeWidth="1.4" />
      {/* clock accent */}
      <circle cx="34" cy="30" r="8" fill="none" stroke="var(--biolume)" strokeWidth="2" />
      <path d="M34 30 V25 M34 30 L37.5 30" fill="none" stroke="var(--biolume)" strokeWidth="1.8" strokeLinecap="round" />
      <text x="47" y="34" className="font-mono" fontSize="11" fontWeight="600" fill="var(--biolume)">
        6:00 AM
      </text>
      {/* header divider (drawn) */}
      <path
        d="M28 44 H172"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.6"
        strokeLinecap="round"
        className={cn(inView && "draw-line")}
        style={lenStyle(144)}
      />
      {/* PR lines */}
      {lines.map((dot, i) => {
        const y = 58 + i * 14
        return (
          <g key={i}>
            <circle cx="32" cy={y} r="3" fill={dot} />
            <rect x="42" y={y - 3} width={120 - i * 22} height="6" rx="3" fill="var(--muted-foreground)" opacity="0.3" />
          </g>
        )
      })}
    </svg>
  )
}
