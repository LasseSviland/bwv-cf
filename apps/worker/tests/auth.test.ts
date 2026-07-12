import { beforeAll, describe, expect, it } from "vitest";

import { timingSafeEqualString, verifyBearerAuthorization } from "../src/api/auth";

type WorkerSubtleCrypto = SubtleCrypto & {
  timingSafeEqual(left: ArrayBuffer, right: ArrayBuffer): boolean;
};

beforeAll(() => {
  const subtle = crypto.subtle as WorkerSubtleCrypto;
  if (typeof subtle.timingSafeEqual === "function") return;
  Object.defineProperty(subtle, "timingSafeEqual", {
    configurable: true,
    value(leftValue: ArrayBuffer, rightValue: ArrayBuffer): boolean {
      const left = new Uint8Array(leftValue);
      const right = new Uint8Array(rightValue);
      let difference = left.length ^ right.length;
      for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
        difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
      }
      return difference === 0;
    },
  });
});

describe("API bearer authentication", () => {
  it("accepts the exact bearer credential", async () => {
    await expect(verifyBearerAuthorization("Bearer secret", "secret")).resolves.toBe(true);
  });

  it.each([null, "", "secret", "Basic secret", "Bearer", "Bearer secret extra", "bearer secret"])(
    "rejects malformed authorization %j",
    async (authorization) => {
      await expect(verifyBearerAuthorization(authorization, "secret")).resolves.toBe(false);
    },
  );

  it("rejects a different same-length or different-length credential", async () => {
    await expect(timingSafeEqualString("secreu", "secret")).resolves.toBe(false);
    await expect(timingSafeEqualString("secret-long", "secret")).resolves.toBe(false);
  });
});
