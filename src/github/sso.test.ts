import { describe, it, expect } from "vitest";
import { parseSsoPartialOrgs } from "./sso";

describe("parseSsoPartialOrgs", () => {
  it("returns [] for null", () => {
    expect(parseSsoPartialOrgs(null)).toEqual([]);
  });

  it("returns [] for an empty string", () => {
    expect(parseSsoPartialOrgs("")).toEqual([]);
  });

  it("returns [] for the required (403) form, not partial results", () => {
    expect(parseSsoPartialOrgs("required; url=https://github.com/orgs/acme/sso")).toEqual([]);
  });

  it("returns the org IDs for a partial-results header", () => {
    expect(parseSsoPartialOrgs("partial-results; organizations=21955855,20582480")).toEqual([
      "21955855",
      "20582480",
    ]);
  });
});
