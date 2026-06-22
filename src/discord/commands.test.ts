import { describe, it, expect } from "vitest";
import { commands } from "./commands";

describe("commands", () => {
  it("defines link, unlink and status", () => {
    const names = commands.map((c) => c.name).sort();
    expect(names).toEqual(["link", "listen-to", "status", "unlink"]);
  });

  it("link takes no options (OAuth flow, not username entry)", () => {
    const link = commands.find((c) => c.name === "link")!;
    expect(link.options ?? []).toHaveLength(0);
  });
});
