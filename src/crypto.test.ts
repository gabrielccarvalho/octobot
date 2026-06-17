import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./crypto";

const KEY = "a".repeat(64); // 32 bytes in hex

describe("crypto", () => {
  it("round-trips a value", () => {
    const enc = encrypt("gho_secret-token", KEY);
    expect(enc.ciphertext).not.toContain("gho_secret-token");
    expect(decrypt(enc, KEY)).toBe("gho_secret-token");
  });

  it("produces a fresh iv each time", () => {
    expect(encrypt("x", KEY).iv).not.toBe(encrypt("x", KEY).iv);
  });

  it("fails to decrypt if the tag is tampered", () => {
    const enc = encrypt("x", KEY);
    expect(() => decrypt({ ...enc, tag: "0".repeat(enc.tag.length) }, KEY)).toThrow();
  });

  it("rejects a key that is not 32 bytes", () => {
    expect(() => encrypt("x", "abcd")).toThrow(/32 bytes/);
  });
});
