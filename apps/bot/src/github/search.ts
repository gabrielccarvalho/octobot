import { type FetchLike, defaultFetch } from "./http";
import { parseSsoPartialOrgs } from "./sso";

export interface PrSummary {
  repoFullName: string;
  number: number;
  title: string;
  url: string;
  updatedAt: string;
  requestedReviewers?: string[];
}

export interface SearchResult {
  prs: PrSummary[];
  ssoPartialOrgIds: string[];
}

export const QUERY_AWAITING_MY_REVIEW = "is:open is:pr review-requested:@me";
export const QUERY_MY_OPEN_PRS = "is:open is:pr author:@me draft:false";

interface RawSearchItem {
  number: number;
  title: string;
  html_url: string;
  updated_at: string;
  repository_url: string;
}

export async function searchPullRequests(
  token: string,
  query: string,
  fetchImpl: FetchLike = defaultFetch
): Promise<SearchResult> {
  const url =
    "https://api.github.com/search/issues?q=" +
    encodeURIComponent(query) +
    "&sort=updated&order=desc&per_page=30";
  const res = await fetchImpl(url, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
  });
  if (!res.ok) {
    throw Object.assign(new Error(`GitHub search failed: ${res.status}`), { status: res.status });
  }
  const body = (await res.json()) as { items?: RawSearchItem[] };
  const prs = (body.items ?? []).map((it) => ({
    repoFullName: it.repository_url.replace("https://api.github.com/repos/", ""),
    number: it.number,
    title: it.title,
    url: it.html_url,
    updatedAt: it.updated_at,
  }));
  return { prs, ssoPartialOrgIds: parseSsoPartialOrgs(res.headers.get("x-github-sso")) };
}

interface RawPullDetail {
  requested_reviewers?: { login: string }[];
  requested_teams?: { slug: string }[];
}

export async function fetchRequestedReviewers(
  token: string,
  pr: PrSummary,
  fetchImpl: FetchLike = defaultFetch
): Promise<string[] | undefined> {
  const url = `https://api.github.com/repos/${pr.repoFullName}/pulls/${pr.number}`;
  try {
    const res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
    });
    if (!res.ok) {
      console.warn(
        `fetchRequestedReviewers: non-ok response (${res.status}) for ${pr.repoFullName}#${pr.number}`
      );
      return undefined;
    }
    const body = (await res.json()) as RawPullDetail;
    return [
      ...(body.requested_reviewers ?? []).map((r) => `@${r.login}`),
      ...(body.requested_teams ?? []).map((t) => `@${t.slug}`),
    ];
  } catch (err) {
    console.warn(`fetchRequestedReviewers: fetch failed for ${pr.repoFullName}#${pr.number}`, err);
    return undefined;
  }
}

export async function searchMyPrsAwaitingReview(
  token: string,
  fetchImpl: FetchLike = defaultFetch
): Promise<SearchResult> {
  const candidates = await searchPullRequests(token, QUERY_MY_OPEN_PRS, fetchImpl);
  const prs = await Promise.all(
    candidates.prs.map(async (pr) => ({
      ...pr,
      requestedReviewers: await fetchRequestedReviewers(token, pr, fetchImpl),
    }))
  );
  return { prs, ssoPartialOrgIds: candidates.ssoPartialOrgIds };
}
