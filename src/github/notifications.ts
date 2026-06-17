import { type FetchLike, defaultFetch } from "./http";

export interface NotificationItem {
  threadId: string;
  reason: string;
  updatedAt: string;
  repoFullName: string;
  prTitle: string;
  prUrl: string;
}

export interface FetchResult {
  status: number;          // 200 | 304 | 401 | 403 | ...
  items: NotificationItem[];
  lastModified: string | null;
  pollInterval: number;    // seconds
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

export function parseNotifications(raw: RawNotification[]): NotificationItem[] {
  return raw
    .filter((n) => n.subject?.type === "PullRequest")
    .map((n) => ({
      threadId: n.id,
      reason: n.reason,
      updatedAt: n.updated_at,
      repoFullName: n.repository.full_name,
      prTitle: n.subject.title,
      prUrl: toHtmlUrl(n.subject.url),
    }));
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
    return { status: res.status, items: [], lastModified: newLastModified, pollInterval };
  }
  const body = (await res.json()) as RawNotification[];
  return { status: 200, items: parseNotifications(body), lastModified: newLastModified, pollInterval };
}
