import { type FetchLike, defaultFetch } from "./http";

export type PrEventKind =
  | "approved"
  | "changes_requested"
  | "reviewed"
  | "commented"
  | "committed"
  | "merged"
  | "closed"
  | "reopened"
  | "assigned"
  | "labeled"
  | "ready_for_review"
  | "converted_to_draft"
  | "review_requested"
  | "mentioned";

export interface PrEvent {
  kind: PrEventKind;
  at: string;
  by?: string; // login of who performed the event, when GitHub attributes one
}

interface RawTimelineEvent {
  event?: string;
  state?: string;
  created_at?: string;
  submitted_at?: string;
  committer?: { date?: string };
  author?: { date?: string };
  actor?: { login?: string };
  user?: { login?: string }; // review events carry the reviewer here, not in `actor`
}

// Absorb clock drift between GitHub's notification timestamp and the event timestamp.
const SKEW_MS = 5_000;

// When several events share the trigger timestamp, the highest-signal one wins.
const PRIORITY: Record<PrEventKind, number> = {
  approved: 100,
  changes_requested: 100,
  reviewed: 100,
  merged: 90,
  closed: 80,
  reopened: 70,
  ready_for_review: 60,
  converted_to_draft: 55,
  committed: 50,
  commented: 40,
  review_requested: 30,
  assigned: 20,
  labeled: 10,
  mentioned: 5,
};

function eventTime(raw: RawTimelineEvent): number | null {
  const t = raw.submitted_at ?? raw.created_at ?? raw.committer?.date ?? raw.author?.date;
  return t ? Date.parse(t) : null;
}

// Who performed the event. Reviews put the reviewer in `user`; most other events
// use `actor`. Commits carry only git identities (no login), so they resolve to null.
function eventActor(raw: RawTimelineEvent): string | null {
  return raw.actor?.login ?? raw.user?.login ?? null;
}

function toKind(raw: RawTimelineEvent): PrEventKind | null {
  switch (raw.event) {
    case "reviewed":
      switch ((raw.state ?? "").toUpperCase()) {
        case "APPROVED":
          return "approved";
        case "CHANGES_REQUESTED":
          return "changes_requested";
        case "COMMENTED":
          return "reviewed";
        default:
          return null; // dismissed / unknown
      }
    case "commented":
    case "line-commented":
    case "commit-commented":
      return "commented";
    case "committed":
    case "head_ref_force_pushed":
      return "committed";
    case "merged":
      return "merged";
    case "closed":
      return "closed";
    case "reopened":
      return "reopened";
    case "assigned":
      return "assigned";
    case "labeled":
    case "unlabeled":
      return "labeled";
    case "ready_for_review":
      return "ready_for_review";
    case "convert_to_draft":
      return "converted_to_draft";
    case "review_requested":
      return "review_requested";
    case "mentioned":
      return "mentioned";
    default:
      return null;
  }
}

// Pick the event that triggered a notification updated at `at`: the highest-priority
// selectable event whose timestamp is the latest at or before `at` (+ skew).
export function selectPrEvent(raw: RawTimelineEvent[], at: string): PrEvent | null {
  const cutoff = Date.parse(at) + SKEW_MS;
  let best: { kind: PrEventKind; ms: number; ts: string; by: string | null } | null = null;
  for (const e of raw) {
    const kind = toKind(e);
    if (!kind) continue;
    const ms = eventTime(e);
    if (ms == null || ms > cutoff) continue;
    const ts = e.submitted_at ?? e.created_at ?? e.committer?.date ?? e.author?.date ?? "";
    if (!best || ms > best.ms || (ms === best.ms && PRIORITY[kind] > PRIORITY[best.kind])) {
      best = { kind, ms, ts, by: eventActor(e) };
    }
  }
  if (!best) return null;
  // Only surface `by` when known, so callers (and existing exact-match tests) see a
  // clean { kind, at } when GitHub attributes no actor.
  return best.by ? { kind: best.kind, at: best.ts, by: best.by } : { kind: best.kind, at: best.ts };
}

function lastPageUrl(link: string | null): string | null {
  if (!link) return null;
  const part = link.split(",").find((s) => s.includes('rel="last"'));
  const m = part?.match(/<([^>]+)>/);
  return m ? m[1] : null;
}

export async function fetchPrEvent(
  token: string,
  repoFullName: string,
  prNumber: number,
  at: string,
  fetchImpl: FetchLike = defaultFetch
): Promise<PrEvent | null> {
  const headers = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" };
  const url = `https://api.github.com/repos/${repoFullName}/issues/${prNumber}/timeline?per_page=100`;
  const first = await fetchImpl(url, { headers });
  if (first.status !== 200) return null;

  const last = lastPageUrl(first.headers.get("link"));
  const page = last ? await fetchImpl(last, { headers }) : first;
  if (page.status !== 200) return null;

  const events = (await page.json()) as RawTimelineEvent[];
  return selectPrEvent(events, at);
}
