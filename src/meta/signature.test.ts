import { describe, expect, it } from "vitest";

import { signMetaPayload, verifyMetaSignature } from "./signature.js";

describe("Meta signature helpers", () => {
  const appSecret = "super-secret-app-secret-trocar";
  const rawBody = Buffer.from(JSON.stringify({ message: "hello" }));

  it("accepts a valid HMAC-SHA256 signature", () => {
    const signature = signMetaPayload(rawBody, appSecret);

    expect(verifyMetaSignature(rawBody, signature, appSecret)).toBe(true);
  });

  it("rejects a signature generated from a different payload", () => {
    const signature = signMetaPayload(rawBody, appSecret);
    const tamperedBody = Buffer.from(JSON.stringify({ message: "changed" }));

    expect(verifyMetaSignature(tamperedBody, signature, appSecret)).toBe(false);
  });

  it("rejects missing or malformed signature headers", () => {
    expect(verifyMetaSignature(rawBody, undefined, appSecret)).toBe(false);
    expect(verifyMetaSignature(rawBody, "invalid-prefix", appSecret)).toBe(false);
  });
});
