import { describe, it, expect, vi } from "vitest";
import { createHmac } from "crypto";
import Fastify from "fastify";
import { verifySignature, registerWebhookRoute } from "./webhook";
import type { NotificationEvent } from "./events";

const SECRET = "shhh";
const sign = (body: string) =>
  "sha256=" + createHmac("sha256", SECRET).update(body).digest("hex");

const reviewRequested = JSON.stringify({
  action: "review_requested",
  pull_request: {
    node_id: "PR_1",
    number: 7,
    title: "Fix bug",
    html_url: "https://github.com/acme/repo/pull/7",
    user: { login: "author1" },
    requested_reviewers: [],
  },
  repository: { full_name: "acme/repo", owner: { login: "acme" } },
  requested_reviewer: { login: "rev1" },
});

async function buildApp(opts: {
  allowedOwners?: string[] | null;
  onEvent?: (e: NotificationEvent, id: string) => Promise<void>;
}) {
  const app = Fastify();
  const onEvent = opts.onEvent ?? (async () => {});
  registerWebhookRoute(app, {
    secret: SECRET,
    allowedOwners: opts.allowedOwners ?? null,
    onEvent,
  });
  await app.ready();
  return app;
}

describe("verifySignature", () => {
  it("accepts a valid signature", () => {
    expect(verifySignature(SECRET, reviewRequested, sign(reviewRequested))).toBe(true);
  });
  it("rejects a wrong signature", () => {
    expect(verifySignature(SECRET, reviewRequested, "sha256=deadbeef")).toBe(false);
  });
  it("rejects a missing signature", () => {
    expect(verifySignature(SECRET, reviewRequested, undefined)).toBe(false);
  });
});

describe("POST /webhook/github", () => {
  const headers = (body: string) => ({
    "content-type": "application/json",
    "x-github-event": "pull_request",
    "x-github-delivery": "delivery-1",
    "x-hub-signature-256": sign(body),
  });

  it("401s on a bad signature without calling onEvent", async () => {
    const onEvent = vi.fn();
    const app = await buildApp({ onEvent });
    const res = await app.inject({
      method: "POST",
      url: "/webhook/github",
      headers: { ...headers(reviewRequested), "x-hub-signature-256": "sha256=bad" },
      payload: reviewRequested,
    });
    expect(res.statusCode).toBe(401);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("dispatches a valid event with the delivery id", async () => {
    const onEvent = vi.fn(async () => {});
    const app = await buildApp({ onEvent });
    const res = await app.inject({
      method: "POST",
      url: "/webhook/github",
      headers: headers(reviewRequested),
      payload: reviewRequested,
    });
    expect(res.statusCode).toBe(200);
    expect(onEvent).toHaveBeenCalledTimes(1);
    const [event, deliveryId] = onEvent.mock.calls[0];
    expect(event.recipients).toEqual(["rev1"]);
    expect(deliveryId).toBe("delivery-1");
  });

  it("ignores non pull_request events with 200", async () => {
    const onEvent = vi.fn();
    const app = await buildApp({ onEvent });
    const res = await app.inject({
      method: "POST",
      url: "/webhook/github",
      headers: { ...headers(reviewRequested), "x-github-event": "ping" },
      payload: reviewRequested,
    });
    expect(res.statusCode).toBe(200);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("ignores owners not on the allowlist with 200", async () => {
    const onEvent = vi.fn();
    const app = await buildApp({ allowedOwners: ["other"], onEvent });
    const res = await app.inject({
      method: "POST",
      url: "/webhook/github",
      headers: headers(reviewRequested),
      payload: reviewRequested,
    });
    expect(res.statusCode).toBe(200);
    expect(onEvent).not.toHaveBeenCalled();
  });

  it("500s when onEvent throws so GitHub retries", async () => {
    const onEvent = vi.fn(async () => {
      throw new Error("db down");
    });
    const app = await buildApp({ onEvent });
    const res = await app.inject({
      method: "POST",
      url: "/webhook/github",
      headers: headers(reviewRequested),
      payload: reviewRequested,
    });
    expect(res.statusCode).toBe(500);
  });
});
