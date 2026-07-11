import { beforeEach, describe, expect, it } from "vitest";
import {
  getStatusHistory,
  recordStatusSnapshot,
  resetStatusHistoryForTests,
} from "../services/ops/statusHistory.service";

describe("statusHistory.service", () => {
  beforeEach(() => {
    resetStatusHistoryForTests();
  });

  it("records and returns daily snapshots", async () => {
    await recordStatusSnapshot({ api: "operational", database: "operational" });
    const history = await getStatusHistory(7);
    expect(history.length).toBe(1);
    expect(history[0]!.status).toBe("operational");
  });

  it("escalates to down when a component is down", async () => {
    await recordStatusSnapshot({ api: "operational", database: "down" });
    const history = await getStatusHistory(7);
    expect(history[0]!.status).toBe("down");
  });
});
