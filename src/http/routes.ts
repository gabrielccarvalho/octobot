import type { FastifyInstance } from "fastify";
import type { Database } from "../db";
import type { Encrypted } from "../crypto";

export interface HttpDeps {
  db: Database;
  encrypt(token: string): Encrypted;
  exchangeCode(code: string): Promise<string>;
  fetchViewerLogin(token: string): Promise<string>;
  stateTtlMs: number;
  onConnect(discordId: string, token: string, githubLogin: string): Promise<void>;
}

function page(title: string, body: string): string {
  return `<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:3rem"><h2>${title}</h2><p>${body}</p></body></html>`;
}

export function registerHttpRoutes(app: FastifyInstance, deps: HttpDeps): void {
  app.get("/health", async () => ({ ok: true }));

  app.get("/oauth/callback", async (req, reply) => {
    const { code, state } = req.query as { code?: string; state?: string };
    if (!code || !state) {
      return reply.code(400).type("text/html").send(page("Missing parameters", "No code or state provided."));
    }
    const discordId = deps.db.consumeState(state, deps.stateTtlMs);
    if (!discordId) {
      return reply
        .code(400)
        .type("text/html")
        .send(page("Link expired", "This link is invalid or expired. Run /link in Discord again."));
    }
    try {
      const token = await deps.exchangeCode(code);
      const login = await deps.fetchViewerLogin(token);
      deps.db.upsertUser(discordId, login, deps.encrypt(token));
      try {
        await deps.onConnect(discordId, token, login);
      } catch (err) {
        req.log.error(err);
      }
      return reply
        .type("text/html")
        .send(page("Connected", `Connected as <b>${login}</b>. You can return to Discord.`));
    } catch (err) {
      req.log.error(err);
      return reply
        .code(502)
        .type("text/html")
        .send(page("Connection failed", "Could not complete the GitHub connection. Try /link again."));
    }
  });
}
