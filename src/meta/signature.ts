import { createHmac, timingSafeEqual } from "node:crypto";

const signaturePrefix = "sha256=";

export function signMetaPayload(rawBody: Buffer, appSecret: string) {
  return `${signaturePrefix}${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
}

export function verifyMetaSignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string) {
  if (!signatureHeader?.startsWith(signaturePrefix)) {
    return false;
  }

  const expected = Buffer.from(signMetaPayload(rawBody, appSecret));
  const received = Buffer.from(signatureHeader);

  return expected.length === received.length && timingSafeEqual(expected, received);
}
