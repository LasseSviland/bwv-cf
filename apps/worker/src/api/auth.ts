const encoder = new TextEncoder();

interface WorkerSubtleCrypto extends SubtleCrypto {
  timingSafeEqual(left: ArrayBuffer, right: ArrayBuffer): boolean;
}

function supportsTimingSafeEqual(value: SubtleCrypto): value is WorkerSubtleCrypto {
  return "timingSafeEqual" in value && typeof value.timingSafeEqual === "function";
}

export async function timingSafeEqualString(provided: string, expected: string): Promise<boolean> {
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);

  if (!supportsTimingSafeEqual(crypto.subtle)) {
    throw new Error("The runtime does not support timing-safe credential comparison");
  }
  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}

export async function verifyBearerAuthorization(
  authorization: string | null,
  expectedApiKey: string,
): Promise<boolean> {
  if (authorization === null) return false;

  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  if (match === null) return false;
  const token = match[1];
  if (token === undefined) return false;

  return timingSafeEqualString(token, expectedApiKey);
}
