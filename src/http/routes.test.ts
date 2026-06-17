import { describe, it, expect, beforeEach } from "vitest";
import Fastify from "fastify";
import { createDatabase, type Database } from "../db";
import { encrypt, decrypt } from "../crypto";
import { registerHttpRoutes } from "./routes";

const KEY = "a".repeat(64);
let db: Database;

async function buildApp(over: Partial<{ exchangeCode: (c: string) => Promise<string>; fetchViewerLogin: (t: string) => Promise<string> }> = {}) {
  const app = Fastify();
  registerHttpRoutes(app, {
    db,
    encrypt: (token) => encrypt(token, KEY),
    exchangeCode: over.exchangeCode ?? (async () => "gho_token"),
    fetchViewerLogin: over.fetchViewerLogin ?? (async () => "octocat"),
    stateTtlMs: 60_000,
  });
  await app.ready();
  return app;
}

beforeEach(() => {
  db = createDatabase(":memory:");
});

describe("GET /health", () => {
  it("returns ok", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});

describe("GET /oauth/callback", () => {
  it("stores an encrypted token for a valid state", async () => {
    db.createState("s1", "discord-1");
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/oauth/callback?code=abc&state=s1" });
    expect(res.statusCode).toBe(200);
    const user = db.getUser("discord-1");
    expect(user?.githubLogin).toBe("octocat");
    expect(decrypt({ ciphertext: user!.tokenCiphertext, iv: user!.tokenIv, tag: user!.tokenTag }, KEY)).toBe("gho_token");
  });

  it("rejects an unknown/expired state with 400 and stores nothing", async () => {
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/oauth/callback?code=abc&state=nope" });
    expect(res.statusCode).toBe(400);
    expect(db.getAllUsers()).toHaveLength(0);
  });

  it("returns 502 when the token exchange fails", async () => {
    db.createState("s2", "discord-2");
    const app = await buildApp({ exchangeCode: async () => { throw new Error("bad code"); } });
    const res = await app.inject({ method: "GET", url: "/oauth/callback?code=abc&state=s2" });
    expect(res.statusCode).toBe(502);
    expect(db.getUser("discord-2")).toBeNull();
  });
});
