import { randomBytes } from "crypto";
import Fastify from "fastify";
import { loadConfig } from "./config";
import { createDatabase } from "./db";
import { encrypt, decrypt } from "./crypto";
import { registerCommands } from "./discord/commands";
import { startDiscord } from "./discord/client";
import { buildAuthorizeUrl, exchangeCode, fetchViewerLogin } from "./github/oauth";
import { fetchNotifications } from "./github/notifications";
import {
  searchPullRequests,
  QUERY_AWAITING_MY_REVIEW,
  QUERY_MY_PRS_AWAITING_REVIEW,
} from "./github/search";
import { registerHttpRoutes } from "./http/routes";
import { createOnConnect } from "./onboarding";
import { startPoller } from "./poller";

const STATE_TTL_MS = 10 * 60 * 1000;

async function main() {
  const config = loadConfig(process.env);
  const db = createDatabase(config.databasePath);

  const linkDeps = {
    generateState: () => randomBytes(16).toString("hex"),
    authorizeUrl: (state: string) =>
      buildAuthorizeUrl({
        clientId: config.githubOAuthClientId,
        redirectUri: `${config.publicBaseUrl}/oauth/callback`,
        state,
      }),
  };

  await registerCommands(config.discordToken, config.discordClientId);
  const statusDeps = {
    listAttention: async (user: import("./db").User) => {
      const token = decrypt(
        { ciphertext: user.tokenCiphertext, iv: user.tokenIv, tag: user.tokenTag },
        config.tokenEncryptionKey
      );
      const [incoming, mine] = await Promise.all([
        searchPullRequests(token, QUERY_AWAITING_MY_REVIEW),
        searchPullRequests(token, QUERY_MY_PRS_AWAITING_REVIEW),
      ]);
      return { incoming, mine };
    },
  };

  const { client, sender } = await startDiscord(config.discordToken, db, linkDeps, statusDeps);

  const onConnect = createOnConnect({
    db,
    sender,
    fetchNotifications: (token, lastModified) => fetchNotifications(token, lastModified),
    searchPullRequests: (token, query) => searchPullRequests(token, query),
    awaitingQuery: QUERY_AWAITING_MY_REVIEW,
    minePrsQuery: QUERY_MY_PRS_AWAITING_REVIEW,
  });

  const app = Fastify({ logger: true });
  registerHttpRoutes(app, {
    db,
    encrypt: (token) => encrypt(token, config.tokenEncryptionKey),
    exchangeCode: (code) =>
      exchangeCode({
        clientId: config.githubOAuthClientId,
        clientSecret: config.githubOAuthClientSecret,
        code,
      }),
    fetchViewerLogin: (token) => fetchViewerLogin(token),
    stateTtlMs: STATE_TTL_MS,
    onConnect,
  });
  await app.listen({ host: "0.0.0.0", port: config.port });

  const poller = startPoller({
    db,
    sender,
    decryptToken: (user) =>
      decrypt(
        { ciphertext: user.tokenCiphertext, iv: user.tokenIv, tag: user.tokenTag },
        config.tokenEncryptionKey
      ),
    fetchNotifications: (token, lastModified) => fetchNotifications(token, lastModified),
  });

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    try {
      poller.stop();
      await app.close();
      await client.destroy();
      db.close();
    } catch (err) {
      console.error("Error during shutdown:", err);
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fatal startup error:", err);
  process.exit(1);
});
