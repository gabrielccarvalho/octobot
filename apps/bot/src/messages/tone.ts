// The emotional register of a message. Drives the mascot thumbnail and a default
// colour; individual events may override the colour.
export type Tone =
  | "celebrate"
  | "needs_work"
  | "summoned"
  | "chatter"
  | "alarm"
  | "all_good"
  | "working"
  | "broken"
  | "digest";

// Tone keys are snake_case, filenames are kebab-case: `image` is the only source of
// truth for the filename. Never derive a path from the tone key.
export const TONE: Record<Tone, { image: string; color: number }> = {
  celebrate: { image: "celebrate-v1.png", color: 0x8957e5 },
  needs_work: { image: "needs-work-v1.png", color: 0xd29922 },
  summoned: { image: "summoned-v1.png", color: 0x58a6ff },
  chatter: { image: "chatter-v1.png", color: 0x58a6ff },
  alarm: { image: "alarm-v1.png", color: 0xf85149 },
  all_good: { image: "all-good-v1.png", color: 0x3fb950 },
  working: { image: "working-v1.png", color: 0x8b949e },
  broken: { image: "broken-v1.png", color: 0xf85149 },
  digest: { image: "digest-v1.png", color: 0x8957e5 },
};
