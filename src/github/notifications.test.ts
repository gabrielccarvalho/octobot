import { describe, it, expect } from "vitest";
import { parseNotifications, toHtmlUrl, fetchNotifications } from "./notifications";
import type { FetchLike } from "./http";

const prRaw = {
  id: "t1",
  reason: "review_requested",
  updated_at: "2026-06-17T10:00:00Z",
  repository: { full_name: "acme/repo" },
  subject: { title: "Fix bug", url: "https://api.github.com/repos/acme/repo/pulls/42", type: "PullRequest" },
};
const issueRaw = {
  ...prRaw,
  id: "t2",
  subject: { title: "Fix bug", url: "https://api.github.com/repos/acme/repo/issues/42", type: "Issue" },
};

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}): FetchLike {
  return async () => ({
    status,
    ok: status < 400,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

describe("toHtmlUrl", () => {
  it("converts a pulls API url to an html url", () => {
    expect(toHtmlUrl("https://api.github.com/repos/acme/repo/pulls/42")).toBe(
      "https://github.com/acme/repo/pull/42"
    );
  });
});

describe("parseNotifications", () => {
  it("maps a pull request to subject-generic fields", () => {
    expect(parseNotifications([prRaw] as any)).toEqual([
      {
        threadId: "t1",
        reason: "review_requested",
        updatedAt: "2026-06-17T10:00:00Z",
        repoFullName: "acme/repo",
        subjectType: "PullRequest",
        subjectNumber: 42,
        subjectTitle: "Fix bug",
        subjectUrl: "https://github.com/acme/repo/pull/42",
      },
    ]);
  });

  it("keeps non-PR subjects (issues) instead of dropping them", () => {
    const items = parseNotifications([issueRaw] as any);
    expect(items).toHaveLength(1);
    expect(items[0].subjectType).toBe("Issue");
    expect(items[0].subjectNumber).toBe(42);
    expect(items[0].subjectUrl).toBe("https://github.com/acme/repo/issues/42");
  });

  it("uses the repo url and a null number for numberless subjects", () => {
    const releaseRaw = {
      ...prRaw,
      id: "t3",
      subject: { title: "v1.2.0", url: "https://api.github.com/repos/acme/repo/releases/9", type: "Release" },
    };
    const items = parseNotifications([releaseRaw] as any);
    expect(items[0].subjectType).toBe("Release");
    expect(items[0].subjectNumber).toBeNull();
    expect(items[0].subjectUrl).toBe("https://github.com/acme/repo");
  });
});

describe("fetchNotifications", () => {
  it("returns parsed items, last-modified and poll interval on 200", async () => {
    const f = fakeFetch(200, [prRaw], { "last-modified": "Mon, 01 Jan 2026 00:00:00 GMT", "x-poll-interval": "90" });
    const res = await fetchNotifications("tok", null, f);
    expect(res.status).toBe(200);
    expect(res.items).toHaveLength(1);
    expect(res.lastModified).toBe("Mon, 01 Jan 2026 00:00:00 GMT");
    expect(res.pollInterval).toBe(90);
  });

  it("returns empty items and the status on 304", async () => {
    const res = await fetchNotifications("tok", "Mon, 01 Jan 2026 00:00:00 GMT", fakeFetch(304, null));
    expect(res.status).toBe(304);
    expect(res.items).toEqual([]);
  });

  it("surfaces a 401 status without throwing", async () => {
    const res = await fetchNotifications("tok", null, fakeFetch(401, null));
    expect(res.status).toBe(401);
    expect(res.items).toEqual([]);
  });
});
