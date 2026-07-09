import type { FetchLike } from "./http";
import { defaultFetch } from "./http";

// GitHub signals SAML-SSO-filtered responses with:
//   X-GitHub-SSO: partial-results; organizations=21955855,20582480
// Any other value (notably `required; url=...`) is not a partial-results signal.
export function parseSsoPartialOrgs(header: string | null): string[] {
  if (!header) return [];
  const [directive, rest] = header.split(";", 2);
  if (directive.trim().toLowerCase() !== "partial-results" || !rest) return [];
  const match = /organizations=([\d,]+)/.exec(rest);
  if (!match) return [];
  return match[1].split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}

// /user/orgs is multi-org data, so (unlike /user) it can trip the SSO filter.
// Used at /connect-token time to detect unauthorized SSO orgs immediately.
export async function fetchSsoPartialOrgs(
  token: string,
  fetchImpl: FetchLike = defaultFetch
): Promise<string[]> {
  const res = await fetchImpl("https://api.github.com/user/orgs", {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
  });
  if (!res.ok) return []; // Non-fatal: never block a connection on this probe.
  return parseSsoPartialOrgs(res.headers.get("x-github-sso"));
}
