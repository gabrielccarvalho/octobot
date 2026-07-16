import { describe, it, expect } from "vitest";
import { renderEmbed } from "./render";
import { TONE } from "../messages/tone";
import type { OctoMessage } from "../notifier";

const base: OctoMessage = { tone: "celebrate", title: "Your PR was merged", body: "hello" };

describe("renderEmbed", () => {
  it("maps title, body and thumbnail from the tone", () => {
    const e = renderEmbed(base, "https://octobot.dev/mascot").toJSON();
    expect(e.title).toBe("Your PR was merged");
    expect(e.description).toBe("hello");
    expect(e.thumbnail?.url).toBe("https://octobot.dev/mascot/celebrate-v1.png");
    expect(e.footer?.text).toBe("OctoBot");
  });

  it("falls back to the tone's default colour", () => {
    expect(renderEmbed(base, "https://x.dev").toJSON().color).toBe(TONE.celebrate.color);
  });

  it("prefers an explicit colour override", () => {
    const e = renderEmbed({ ...base, color: 0x3fb950 }, "https://x.dev").toJSON();
    expect(e.color).toBe(0x3fb950);
  });

  it("never sets a timestamp — footers cannot render relative time", () => {
    expect(renderEmbed(base, "https://x.dev").toJSON().timestamp).toBeUndefined();
  });

  it("builds a valid URL for every tone", () => {
    for (const tone of Object.keys(TONE) as (keyof typeof TONE)[]) {
      const url = renderEmbed({ ...base, tone }, "https://octobot.dev/mascot").toJSON().thumbnail
        ?.url;
      expect(url).toBe(`https://octobot.dev/mascot/${TONE[tone].image}`);
      expect(url).not.toContain("//mascot//");
    }
  });
});
