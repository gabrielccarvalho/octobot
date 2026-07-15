// Minimal structural type so tests can supply a fake without constructing a real Response.
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export const defaultFetch: FetchLike = (url, init) =>
  (globalThis.fetch as unknown as FetchLike)(url, init);
