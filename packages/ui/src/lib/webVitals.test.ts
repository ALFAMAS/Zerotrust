import { describe, expect, it } from "vitest";
import { toWebVitalPayload } from "./webVitals";

describe("web-vital payload", () => {
  it("keeps only the approved metric fields", () => {
    const payload = toWebVitalPayload({
      name: "LCP",
      value: 1234.5,
      delta: 123.4,
      rating: "good",
      id: "v4-123",
      navigationType: "navigate",
      entries: [{ name: "https://example.com/private?token=secret" }],
      attribution: { element: "#account-email", userId: "user-secret" },
    });

    expect(payload).toEqual({
      name: "LCP",
      value: 1234.5,
      delta: 123.4,
      rating: "good",
      id: "v4-123",
      navigationType: "navigate",
    });
    expect(Object.keys(payload)).toEqual([
      "name",
      "value",
      "delta",
      "rating",
      "id",
      "navigationType",
    ]);
  });
});
