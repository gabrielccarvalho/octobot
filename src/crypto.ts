import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export interface Encrypted {
  ciphertext: string; // hex
  iv: string;         // hex
  tag: string;        // hex
}

function keyBuffer(keyHex: string): Buffer {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("Encryption key must be 32 bytes (64 hex characters)");
  }
  return key;
}

export function encrypt(plaintext: string, keyHex: string): Encrypted {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBuffer(keyHex), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("hex"),
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
  };
}

export function decrypt(enc: Encrypted, keyHex: string): string {
  const decipher = createDecipheriv("aes-256-gcm", keyBuffer(keyHex), Buffer.from(enc.iv, "hex"));
  decipher.setAuthTag(Buffer.from(enc.tag, "hex"));
  const out = Buffer.concat([decipher.update(Buffer.from(enc.ciphertext, "hex")), decipher.final()]);
  return out.toString("utf8");
}
