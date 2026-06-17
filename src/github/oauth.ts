import { type FetchLike, defaultFetch } from "./http";

export function buildAuthorizeUrl(opts: {
  clientId: string;
  redirectUri: string;
  state: string;
  scope?: string;
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    state: opts.state,
    scope: opts.scope ?? "repo",
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export async function exchangeCode(
  opts: { clientId: string; clientSecret: string; code: string },
  fetchImpl: FetchLike = defaultFetch
): Promise<string> {
  const res = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`OAuth token exchange failed: ${data.error ?? res.status}`);
  }
  return data.access_token;
}

export async function fetchViewerLogin(
  token: string,
  fetchImpl: FetchLike = defaultFetch
): Promise<string> {
  const res = await fetchImpl("https://api.github.com/user", {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`Failed to fetch GitHub user: ${res.status}`);
  const data = (await res.json()) as { login?: string };
  if (!data.login) throw new Error("GitHub user response missing login");
  return data.login;
}
