import { describe, it, expect } from "vitest";
import { TONE, type Tone } from "./tone";

const ALL: Tone[] = [
  "celebrate", "needs_work", "summoned", "chatter",
  "alarm", "all_good", "working", "broken", "digest",
];

describe("TONE", () => {
  it("has an entry for every tone", () => {
    for (const t of ALL) expect(TONE[t]).toBeDefined();
    expect(Object.keys(TONE).sort()).toEqual([...ALL].sort());
  });

  it("uses kebab-case v1 filenames, never the snake_case tone key", () => {
    for (const t of ALL) {
      expect(TONE[t].image).toMatch(/^[a-z]+(-[a-z]+)*-v1\.png$/);
      expect(TONE[t].image).not.toContain("_");
    }
    expect(TONE.needs_work.image).toBe("needs-work-v1.png");
    expect(TONE.all_good.image).toBe("all-good-v1.png");
  });

  it("gives every tone a colour in valid 24-bit range", () => {
    for (const t of ALL) {
      expect(TONE[t].color).toBeGreaterThanOrEqual(0);
      expect(TONE[t].color).toBeLessThanOrEqual(0xffffff);
    }
  });
});
