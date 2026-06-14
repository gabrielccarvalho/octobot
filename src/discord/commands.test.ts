import { describe, it, expect } from "vitest";
import { commands } from "./commands";

describe("commands", () => {
  it("defines link, unlink and status", () => {
    const names = commands.map((c) => c.name).sort();
    expect(names).toEqual(["link", "status", "unlink"]);
  });

  it("link takes a required username string option", () => {
    const link = commands.find((c) => c.name === "link")!;
    const option = link.options?.[0] as { name: string; required: boolean; type: number };
    expect(option.name).toBe("username");
    expect(option.required).toBe(true);
  });
});
