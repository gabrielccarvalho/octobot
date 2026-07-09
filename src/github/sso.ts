// GitHub signals SAML-SSO-filtered responses with:
//   X-GitHub-SSO: partial-results; organizations=21955855,20582480
// Any other value (notably `required; url=...`) is not a partial-results signal.
export function parseSsoPartialOrgs(header: string | null): string[] {
  if (!header) return [];
  const [directive, rest] = header.split(";", 2);
  if (directive.trim() !== "partial-results" || !rest) return [];
  const match = /organizations=([\d,]+)/.exec(rest);
  if (!match) return [];
  return match[1].split(",").map((s) => s.trim()).filter((s) => s.length > 0);
}
