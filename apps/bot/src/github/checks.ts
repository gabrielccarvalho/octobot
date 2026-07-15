import { type FetchLike, defaultFetch } from "./http";

export type ChecksVerdict = "passed" | "failed";

interface RawPr {
  head?: { sha?: string };
}
interface RawCheckRun {
  status?: string;
  conclusion?: string | null;
}
interface RawCheckRuns {
  check_runs?: RawCheckRun[];
}

const FAILING = new Set(["failure", "timed_out", "action_required"]);
const NON_DECISIVE = new Set(["cancelled", "stale"]);

// null = still running / no checks; "failed" if any completed run failed; else "passed".
export function verdictFromRuns(runs: RawCheckRun[]): ChecksVerdict | null {
  let sawDecisive = false;
  for (const r of runs) {
    if (r.status !== "completed") continue;
    if (r.conclusion && NON_DECISIVE.has(r.conclusion)) continue; // cancelled/stale don't decide a verdict
    sawDecisive = true;
    if (r.conclusion && FAILING.has(r.conclusion)) return "failed";
  }
  return sawDecisive ? "passed" : null;
}

export async function fetchChecksVerdict(
  token: string,
  repoFullName: string,
  prNumber: number,
  fetchImpl: FetchLike = defaultFetch
): Promise<ChecksVerdict | null> {
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" };

  const prRes = await fetchImpl(`https://api.github.com/repos/${repoFullName}/pulls/${prNumber}`, { headers });
  if (prRes.status !== 200) return null;
  const sha = ((await prRes.json()) as RawPr).head?.sha;
  if (!sha) return null;

  const runsRes = await fetchImpl(
    `https://api.github.com/repos/${repoFullName}/commits/${sha}/check-runs`,
    { headers }
  );
  if (runsRes.status !== 200) return null;
  const body = (await runsRes.json()) as RawCheckRuns;
  return verdictFromRuns(body.check_runs ?? []);
}
