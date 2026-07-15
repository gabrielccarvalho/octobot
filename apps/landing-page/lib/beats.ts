/** The page's narrative beats, in scroll order. depth is meters below surface. */
export type Beat = { id: string; label: string; depth: number }

export const BEATS: Beat[] = [
  { id: "hero", label: "Surface", depth: 0 },
  { id: "noise", label: "The noise", depth: 150 },
  { id: "how", label: "How it works", depth: 400 },
  { id: "reaches-you", label: "What reaches you", depth: 600 },
  { id: "commands", label: "Commands", depth: 700 },
  { id: "trust", label: "Trust trench", depth: 800 },
  { id: "faq", label: "FAQ", depth: 900 },
  { id: "abyss", label: "The abyss", depth: 1000 },
]

export const MAX_DEPTH = BEATS[BEATS.length - 1].depth
