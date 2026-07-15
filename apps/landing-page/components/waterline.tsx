import { cn } from "@/lib/utils"

const WAVE_PATH =
  "M0,48 C240,80 480,16 720,48 C960,80 1200,16 1440,48 C1680,80 1920,16 2160,48 C2400,80 2640,16 2880,48 L2880,96 L0,96 Z"

/**
 * The moment the page goes under. Drifting wave crests sit on top of a
 * translucent water column that bleeds down into the next section, with
 * light rays filtering through — so what follows reads as submerged.
 */
export function Waterline({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none relative", className)} aria-hidden>
      {/* Surface crests */}
      <div className="relative h-14 overflow-hidden">
        <svg
          className="waterline-wave-slow absolute bottom-1 left-0 h-full w-[200%]"
          viewBox="0 0 2880 96"
          preserveAspectRatio="none"
        >
          <path d={WAVE_PATH} fill="color-mix(in oklch, var(--biolume) 10%, transparent)" />
        </svg>
        <svg
          className="waterline-wave absolute bottom-0 left-0 h-full w-[200%]"
          viewBox="0 0 2880 96"
          preserveAspectRatio="none"
        >
          <path d={WAVE_PATH} fill="color-mix(in oklch, var(--biolume) 18%, transparent)" />
        </svg>
      </div>

      {/* Underwater column: bleeds behind the start of the next section */}
      <div className="relative -mb-80 h-80">
        <div className="water-column absolute inset-0" />
        <div className="water-rays absolute inset-0" />
      </div>
    </div>
  )
}
