import type { PrSummary } from "./github/search";

export interface AttentionList {
  incoming: PrSummary[];
  mine: PrSummary[];
  ssoPartialOrgIds: string[];
}

const MAX_PER_SECTION = 10;
const MAX_TITLE = 59;
const MAX_MESSAGE = 2000;
const TOKEN_SETTINGS_URL = "https://github.com/settings/tokens";

function ssoWarning(orgIds: string[]): string {
  if (orgIds.length === 0) return "";
  const n = orgIds.length;
  return (
    `\n\n⚠️ Results are incomplete — your token isn't authorized for ${n} ` +
    `SAML SSO organization${n > 1 ? "s" : ""}. ` +
    `Authorize it at <${TOKEN_SETTINGS_URL}> → **Configure SSO**, then re-run.`
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function clampMessage(message: string): string {
  return message.length > MAX_MESSAGE ? `${message.slice(0, MAX_MESSAGE - 1)}…` : message;
}

// Discord renders <t:UNIX:R> as a localized, auto-updating "5 minutes ago".
function relativeTime(iso: string): string {
  return `<t:${Math.floor(new Date(iso).getTime() / 1000)}:R>`;
}

// Group PRs by repo, preserving first-seen order of both repos and PRs.
function groupByRepo(prs: PrSummary[]): { repo: string; prs: PrSummary[] }[] {
  const groups: { repo: string; prs: PrSummary[] }[] = [];
  const index = new Map<string, PrSummary[]>();
  for (const pr of prs) {
    let bucket = index.get(pr.repoFullName);
    if (!bucket) {
      bucket = [];
      index.set(pr.repoFullName, bucket);
      groups.push({ repo: pr.repoFullName, prs: bucket });
    }
    bucket.push(pr);
  }
  return groups;
}

function renderSection(label: string, prs: PrSummary[], emptyLine: string): string {
  if (prs.length === 0) return `${label}\n${emptyLine}`;
  const blocks = groupByRepo(prs.slice(0, MAX_PER_SECTION)).map((group) => {
    const lines = group.prs
      .map(
        (p) => `#${p.number} [${truncate(p.title, MAX_TITLE)}](${p.url}) · ${relativeTime(p.updatedAt)}`
      )
      .join("\n");
    return `**${group.repo}**\n${lines}`;
  });
  const more = prs.length > MAX_PER_SECTION ? `\n…and ${prs.length - MAX_PER_SECTION} more` : "";
  return `${label} (${prs.length})\n${blocks.join("\n")}${more}`;
}

function renderBody(list: AttentionList): string {
  const incoming = renderSection(
    "🔍 Awaiting your review",
    list.incoming,
    "Nothing awaiting your review. 🎉"
  );
  const mine = renderSection(
    "📝 Your PRs awaiting review",
    list.mine,
    "No open PRs of yours are waiting on a review."
  );
  return `${incoming}\n\n${mine}${ssoWarning(list.ssoPartialOrgIds)}`;
}

export function formatAttention(githubLogin: string, list: AttentionList): string {
  const header = `✅ Connected as \`${githubLogin}\``;
  return clampMessage(`${header}\n\n${renderBody(list)}`);
}

export function reconnectHint(authSource: string): string {
  return authSource === "pat"
    ? "Run `/connect-token` with a fresh token to reconnect."
    : "Run `/link` to reconnect.";
}

export function formatDigest(githubLogin: string, list: AttentionList): string {
  const header = `☀️ **Daily PR digest** for \`${githubLogin}\``;
  return clampMessage(`${header}\n\n${renderBody(list)}`);
}
