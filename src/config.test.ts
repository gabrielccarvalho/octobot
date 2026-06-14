import { describe, it, expect } from "vitest";
import { loadConfig } from "./config";

const base = {
  DISCORD_TOKEN: "t",
  DISCORD_CLIENT_ID: "c",
  GITHUB_WEBHOOK_SECRET: "s",
  DATABASE_PATH: "./data/bot.sqlite",
  PORT: "3000",
};

describe("loadConfig", () => {
  it("loads and types all values", () => {
    const cfg = loadConfig({ ...base, ALLOWED_OWNERS: "org, user " });
    expect(cfg.discordToken).toBe("t");
    expect(cfg.discordClientId).toBe("c");
    expect(cfg.githubWebhookSecret).toBe("s");
    expect(cfg.databasePath).toBe("./data/bot.sqlite");
    expect(cfg.port).toBe(3000);
    expect(cfg.allowedOwners).toEqual(["org", "user"]);
  });

  it("defaults allowedOwners to null when unset", () => {
    expect(loadConfig(base).allowedOwners).toBeNull();
  });

  it("throws listing every missing required var", () => {
    expect(() => loadConfig({})).toThrowError(
      /DISCORD_TOKEN.*DISCORD_CLIENT_ID.*GITHUB_WEBHOOK_SECRET.*DATABASE_PATH.*PORT/s
    );
  });

  it("throws when PORT is not a positive integer", () => {
    expect(() => loadConfig({ ...base, PORT: "abc" })).toThrowError(/PORT/);
  });
});
