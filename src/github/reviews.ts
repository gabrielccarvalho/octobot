import { type FetchLike, defaultFetch } from "./http";

export type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED";

export interface LatestReview {
  state: ReviewState;
  submittedAt: string;
}

interface RawReview {
  state: string;
  submitted_at: string | null;
}

export async function fetchLatestReview(
  token: string,
  repoFullName: string,
  prNumber: number,
  fetchImpl: FetchLike = defaultFetch
): Promise<LatestReview | null> {
  const res = await fetchImpl(
    `https://api.github.com/repos/${repoFullName}/pulls/${prNumber}/reviews`,
    { headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" } }
  );
  if (res.status !== 200) return null;

  const reviews = (await res.json()) as RawReview[];
  let latest: RawReview | null = null;
  for (const r of reviews) {
    if (!r.submitted_at) continue; // pending review, not yet submitted
    if (!latest || r.submitted_at > latest.submitted_at!) latest = r;
  }
  if (!latest) return null;

  return { state: latest.state as ReviewState, submittedAt: latest.submitted_at! };
}
