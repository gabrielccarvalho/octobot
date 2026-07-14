import { describe, it, expect } from "vitest";
import { verdictFromRuns, fetchChecksVerdict } from "./checks";
import type { FetchLike } from "./http";

const run = (status: string, conclusion: string | null) => ({ status, conclusion });

describe("verdictFromRuns", () => {
  it("returns failed when any completed run failed", () => {
    expect(verdictFromRuns([run("completed", "success"), run("completed", "failure")])).toBe("failed");
    expect(verdictFromRuns([run("completed", "timed_out")])).toBe("failed");
  });

  it("returns passed when all completed runs succeeded (or neutral/skipped)", () => {
    expect(verdictFromRuns([run("completed", "success"), run("completed", "skipped")])).toBe("passed");
  });

  it("returns null when nothing has completed yet", () => {
    expect(verdictFromRuns([run("in_progress", null), run("queued", null)])).toBeNull();
  });

  it("returns null for no runs", () => {
    expect(verdictFromRuns([])).toBeNull();
  });
});

function seq(responses: { status: number; body: unknown }[]): FetchLike {
  let i = 0;
  return async () => {
    const r = responses[Math.min(i++, responses.length - 1)];
    return { status: r.status, ok: r.status < 400, headers: { get: () => null }, json: async () => r.body, text: async () => JSON.stringify(r.body) };
  };
}

describe("fetchChecksVerdict", () => {
  it("resolves the PR head sha then reads its check-runs", async () => {
    const f = seq([
      { status: 200, body: { head: { sha: "abc123" } } },
      { status: 200, body: { check_runs: [run("completed", "failure")] } },
    ]);
    expect(await fetchChecksVerdict("tok", "acme/repo", 42, f)).toBe("failed");
  });

  it("returns null when the PR fetch fails", async () => {
    expect(await fetchChecksVerdict("tok", "acme/repo", 42, seq([{ status: 404, body: null }]))).toBeNull();
  });

  it("returns null when the PR has no head sha", async () => {
    expect(await fetchChecksVerdict("tok", "acme/repo", 42, seq([{ status: 200, body: {} }]))).toBeNull();
  });

  it("hits the pulls and check-runs endpoints with the sha", async () => {
    const urls: string[] = [];
    const f: FetchLike = async (u) => {
      urls.push(u);
      const body = urls.length === 1 ? { head: { sha: "deadbeef" } } : { check_runs: [run("completed", "success")] };
      return { status: 200, ok: true, headers: { get: () => null }, json: async () => body, text: async () => "" };
    };
    await fetchChecksVerdict("tok", "acme/repo", 42, f);
    expect(urls[0]).toBe("https://api.github.com/repos/acme/repo/pulls/42");
    expect(urls[1]).toBe("https://api.github.com/repos/acme/repo/commits/deadbeef/check-runs");
  });
});
