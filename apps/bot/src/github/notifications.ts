import { type FetchLike, defaultFetch } from "./http";
import { parseSsoPartialOrgs } from "./sso";

export interface NotificationItem {
  threadId: string;
  reason: string;
  updatedAt: string;
  repoFullName: string;
  subjectType: string;
  subjectNumber: number | null;
  subjectTitle: string;
  subjectUrl: string;
}

export interface FetchResult {
  status: number;          // 200 | 304 | 401 | 403 | ...
  items: NotificationItem[];
  lastModified: string | null;
  pollInterval: number;    // seconds
  ssoPartialOrgIds: string[];
}

interface RawNotification {
  id: string;
  reason: string;
  updated_at: string;
  repository: { full_name: string };
  subject: { title: string; url: string; type: string };
}

export function toHtmlUrl(apiUrl: string): string {
  return apiUrl
    .replace("https://api.github.com/repos/", "https://github.com/")
    .replace("/pulls/", "/pull/");
}

function resolveSubject(
  type: string,
  apiUrl: string,
  repoFullName: string
): { number: number | null; url: string } {
  // PRs and Issues have a numeric id at the end of their API url and a clean html url.
  if ((type === "PullRequest" || type === "Issue") && apiUrl) {
    const n = Number(apiUrl.split("/").pop());
    return { number: Number.isFinite(n) ? n : null, url: toHtmlUrl(apiUrl) };
  }
  // Releases, commits, discussions, CI, security: no reliable number; link to the repo.
  return { number: null, url: `https://github.com/${repoFullName}` };
}

export function parseNotifications(raw: RawNotification[]): NotificationItem[] {
  return raw.map((n) => {
    const subjectType = n.subject?.type ?? "";
    const { number, url } = resolveSubject(subjectType, n.subject?.url ?? "", n.repository.full_name);
    return {
      threadId: n.id,
      reason: n.reason,
      updatedAt: n.updated_at,
      repoFullName: n.repository.full_name,
      subjectType,
      subjectNumber: number,
      subjectTitle: n.subject?.title ?? "(no title)",
      subjectUrl: url,
    };
  });
}

export async function fetchNotifications(
  token: string,
  lastModified: string | null,
  fetchImpl: FetchLike = defaultFetch
): Promise<FetchResult> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
  };
  if (lastModified) headers["if-modified-since"] = lastModified;

  const res = await fetchImpl("https://api.github.com/notifications?all=false", { headers });
  const pollInterval = Number(res.headers.get("x-poll-interval") ?? "60");
  const newLastModified = res.headers.get("last-modified");

  if (res.status !== 200) {
    return { status: res.status, items: [], lastModified: newLastModified, pollInterval, ssoPartialOrgIds: [] };
  }
  const body = (await res.json()) as RawNotification[];
  const ssoPartialOrgIds = parseSsoPartialOrgs(res.headers.get("x-github-sso"));
  return { status: 200, items: parseNotifications(body), lastModified: newLastModified, pollInterval, ssoPartialOrgIds };
}
