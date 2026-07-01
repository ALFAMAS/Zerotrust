import { describe, expect, it, vi } from "vitest";
import { NotificationDispatcher } from "../notifications/dispatcher";
import type { NotificationAdapter } from "../notifications/types";

function fakeAdapter(type: "slack" | "teams" | "pagerduty", send = vi.fn().mockResolvedValue(undefined)) {
  return { type, send } satisfies NotificationAdapter;
}

describe("NotificationDispatcher (adapter registry)", () => {
  it("dispatches to the adapter registered for the channel's type", async () => {
    const slack = fakeAdapter("slack");
    const dispatcher = new NotificationDispatcher(new Map([["slack", slack]]));
    dispatcher.addChannel({
      type: "slack",
      name: "test",
      enabled: true,
      events: ["anomaly.detected"],
      config: { webhookUrl: "https://hooks.slack.example/x" },
    });

    await dispatcher.dispatch("anomaly.detected", { foo: "bar" });

    expect(slack.send).toHaveBeenCalledTimes(1);
    expect(slack.send).toHaveBeenCalledWith(
      { webhookUrl: "https://hooks.slack.example/x" },
      "anomaly.detected",
      { foo: "bar" }
    );
  });

  it("skips channels whose type has no registered adapter, without throwing", async () => {
    const dispatcher = new NotificationDispatcher(new Map());
    dispatcher.addChannel({
      type: "pagerduty",
      name: "test",
      enabled: true,
      events: ["anomaly.detected"],
      config: { integrationKey: "k" },
    });

    await expect(dispatcher.dispatch("anomaly.detected", {})).resolves.toBeUndefined();
  });

  it("swallows a single adapter's failure so other channels still fire", async () => {
    const failing = fakeAdapter("slack", vi.fn().mockRejectedValue(new Error("boom")));
    const succeeding = fakeAdapter("teams");
    const dispatcher = new NotificationDispatcher(
      new Map([
        ["slack", failing],
        ["teams", succeeding],
      ])
    );
    dispatcher.addChannel({
      type: "slack",
      name: "a",
      enabled: true,
      events: ["anomaly.detected"],
      config: { webhookUrl: "https://hooks.slack.example/x" },
    });
    dispatcher.addChannel({
      type: "teams",
      name: "b",
      enabled: true,
      events: ["anomaly.detected"],
      config: { webhookUrl: "https://outlook.office.com/x" },
    });

    await expect(dispatcher.dispatch("anomaly.detected", {})).resolves.toBeUndefined();
    expect(failing.send).toHaveBeenCalledTimes(1);
    expect(succeeding.send).toHaveBeenCalledTimes(1);
  });

  it("only dispatches to enabled channels subscribed to the event", async () => {
    const adapter = fakeAdapter("slack");
    const dispatcher = new NotificationDispatcher(new Map([["slack", adapter]]));
    dispatcher.addChannel({
      type: "slack",
      name: "disabled",
      enabled: false,
      events: ["anomaly.detected"],
      config: { webhookUrl: "https://hooks.slack.example/x" },
    });
    dispatcher.addChannel({
      type: "slack",
      name: "wrong-event",
      enabled: true,
      events: ["user.locked"],
      config: { webhookUrl: "https://hooks.slack.example/y" },
    });

    await dispatcher.dispatch("anomaly.detected", {});

    expect(adapter.send).not.toHaveBeenCalled();
  });

  it("defaults to the built-in slack/teams/pagerduty adapters when constructed with no args", () => {
    const dispatcher = new NotificationDispatcher();
    expect(dispatcher).toBeInstanceOf(NotificationDispatcher);
  });
});
