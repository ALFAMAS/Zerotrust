import { beforeEach, describe, expect, it } from "vitest";
import { WebhookDeliveryLog } from "../modules/webhooks/deliveryLog";
import type { WebhookDelivery } from "../modules/webhooks/types";

function sampleDelivery(id: string, endpointId: string): WebhookDelivery {
  return {
    id,
    endpointId,
    event: "user.created",
    payload: { userId: "u1" },
    attempt: 1,
    status: "failed",
  };
}

describe("WebhookDeliveryLog replay lookup", () => {
  let log: WebhookDeliveryLog;

  beforeEach(() => {
    log = new WebhookDeliveryLog();
  });

  it("get returns a recorded delivery by id", () => {
    const d = sampleDelivery("d1", "ep1");
    log.record(d);
    expect(log.get("ep1", "d1")).toMatchObject({ event: "user.created" });
    expect(log.get("ep1", "missing")).toBeNull();
  });
});
