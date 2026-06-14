import { createHmac, timingSafeEqual } from "crypto";
import type { FastifyInstance } from "fastify";
import { parseEvent, type NotificationEvent, type PullRequestPayload } from "./events";

declare module "fastify" {
  interface FastifyRequest {
    // The exact bytes GitHub signed, stashed before JSON parsing for HMAC verification.
    rawBody: Buffer;
  }
}

export function verifySignature(
  secret: string,
  payload: Buffer | string,
  signatureHeader: string | undefined
): boolean {
  if (!signatureHeader) return false;
  const expected =
    "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface WebhookOptions {
  secret: string;
  allowedOwners: string[] | null;
  onEvent: (event: NotificationEvent, deliveryId: string) => Promise<void>;
}

export function registerWebhookRoute(
  app: FastifyInstance,
  opts: WebhookOptions
): void {
  // Keep the raw body so we can HMAC-verify the exact bytes GitHub signed.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (req, body, done) => {
      req.rawBody = body as Buffer;
      try {
        done(null, JSON.parse((body as Buffer).toString("utf8")));
      } catch (err) {
        done(err as Error);
      }
    }
  );

  app.post("/webhook/github", async (req, reply) => {
    const raw = req.rawBody;
    const signature = req.headers["x-hub-signature-256"] as string | undefined;
    if (!verifySignature(opts.secret, raw, signature)) {
      return reply.code(401).send({ error: "invalid signature" });
    }

    if (req.headers["x-github-event"] !== "pull_request") {
      return reply.code(200).send({ ignored: true });
    }

    const payload = req.body as PullRequestPayload;
    if (
      opts.allowedOwners &&
      !opts.allowedOwners.includes(payload.repository?.owner?.login)
    ) {
      return reply.code(200).send({ ignored: true });
    }

    const event = parseEvent(payload.action, payload);
    if (!event) {
      return reply.code(200).send({ ignored: true });
    }

    const deliveryId = req.headers["x-github-delivery"] as string;
    try {
      await opts.onEvent(event, deliveryId);
    } catch (err) {
      req.log.error(err);
      return reply.code(500).send({ error: "processing failed" });
    }
    return reply.code(200).send({ ok: true });
  });
}
