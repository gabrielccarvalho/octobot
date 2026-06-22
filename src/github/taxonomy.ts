export interface TaxonomyEntry {
  key: string;
  label: string;
  emoji: string;
}

// Subject types are GitHub notification `subject.type` values.
export const SUBJECT_TYPES: TaxonomyEntry[] = [
  { key: "PullRequest", label: "Pull requests", emoji: "🔀" },
  { key: "Issue", label: "Issues", emoji: "🐛" },
  { key: "Discussion", label: "Discussions", emoji: "💬" },
  { key: "Release", label: "Releases", emoji: "🚀" },
  { key: "Commit", label: "Commits", emoji: "📝" },
  { key: "CheckSuite", label: "CI / checks", emoji: "✅" },
  { key: "RepositoryVulnerabilityAlert", label: "Security alerts", emoji: "🛡️" },
];

// Reasons are GitHub notification `reason` values. The first five keep the exact
// emoji/label the previous REASON table used, so existing PR behavior is unchanged.
export const REASONS: TaxonomyEntry[] = [
  { key: "review_requested", label: "Review requested", emoji: "🔔" },
  { key: "comment", label: "New comment", emoji: "💬" },
  { key: "mention", label: "Mentioned", emoji: "📣" },
  { key: "state_change", label: "State changed", emoji: "🔀" },
  { key: "author", label: "Activity on your PR", emoji: "✍️" },
  { key: "team_mention", label: "Team mentioned", emoji: "👥" },
  { key: "assign", label: "Assigned", emoji: "📌" },
  { key: "ci_activity", label: "CI activity", emoji: "⚙️" },
  { key: "subscribed", label: "Subscribed thread", emoji: "🔖" },
  { key: "manual", label: "Manually subscribed", emoji: "✋" },
  { key: "invitation", label: "Invitation", emoji: "📨" },
  { key: "security_alert", label: "Security alert", emoji: "🛡️" },
  { key: "your_activity", label: "Your activity", emoji: "🪞" },
  { key: "push", label: "New commits pushed", emoji: "⬆️" },
];

export const DEFAULT_SUBJECT_KEYS: string[] = ["PullRequest"];
export const ALL_SUBJECT_KEYS: string[] = SUBJECT_TYPES.map((s) => s.key);
export const ALL_REASON_KEYS: string[] = REASONS.map((r) => r.key);

const REASON_FALLBACK: TaxonomyEntry = { key: "", label: "New activity", emoji: "🔔" };
const SUBJECT_FALLBACK: TaxonomyEntry = { key: "", label: "Activity", emoji: "🔔" };

const REASON_BY_KEY = new Map(REASONS.map((r) => [r.key, r]));
const SUBJECT_BY_KEY = new Map(SUBJECT_TYPES.map((s) => [s.key, s]));

export function reasonMeta(key: string): TaxonomyEntry {
  return REASON_BY_KEY.get(key) ?? REASON_FALLBACK;
}

export function subjectMeta(key: string): TaxonomyEntry {
  return SUBJECT_BY_KEY.get(key) ?? SUBJECT_FALLBACK;
}
