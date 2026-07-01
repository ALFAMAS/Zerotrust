import { afterEach, describe, expect, it, vi } from "vitest";
import { pagerDutyAdapter } from "../notifications/adapters/pagerduty";
import { slackAdapter } from "../notifications/adapters/slack";
import { teamsAdapter } from "../notifications/adapters/teams";

afterEach(() => vi.restoreAllMocks());

describe("slackAdapter", () => {
  it("declares its channel type", () => {
    expect(slackAdapter.type).toBe("slack");
  });

  it("POSTs a formatted payload to the configured webhook URL", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));

    await slackAdapter.send(
      { webhookUrl: "https://hooks.slack.example/T000/B000/xxx", channel: "#alerts" },
      "anomaly.detected",
      { userId: "u1" }
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://hooks.slack.example/T000/B000/xxx");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.channel).toBe("#alerts");
    expect(body.attachments[0].title).toContain("Anomaly Detected");
  });

  it("throws when the webhook responds with a non-2xx status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    await expect(
      slackAdapter.send({ webhookUrl: "https://hooks.slack.example/x" }, "anomaly.detected", {})
    ).rejects.toThrow(/Slack webhook returned 500/);
  });

  it("rejects a webhook URL pointing at a private/internal host (CWE-918)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      slackAdapter.send({ webhookUrl: "http://127.0.0.1/hook" }, "anomaly.detected", {})
    ).rejects.toThrow(/SSRF guard/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("teamsAdapter", () => {
  it("declares its channel type", () => {
    expect(teamsAdapter.type).toBe("teams");
  });

  it("POSTs a MessageCard payload to the configured webhook URL", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("1", { status: 200 }));

    await teamsAdapter.send(
      { webhookUrl: "https://outlook.office.com/webhook/abc" },
      "auth.brute_force",
      { ip: "1.2.3.4" }
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://outlook.office.com/webhook/abc");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body["@type"]).toBe("MessageCard");
  });

  it("throws when the webhook responds with a non-2xx status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 404 }));
    await expect(
      teamsAdapter.send({ webhookUrl: "https://outlook.office.com/webhook/x" }, "user.locked", {})
    ).rejects.toThrow(/Teams webhook returned 404/);
  });

  it("rejects a webhook URL pointing at a private/internal host (CWE-918)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(
      teamsAdapter.send({ webhookUrl: "http://169.254.169.254/hook" }, "user.locked", {})
    ).rejects.toThrow(/SSRF guard/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("pagerDutyAdapter", () => {
  it("declares its channel type", () => {
    expect(pagerDutyAdapter.type).toBe("pagerduty");
  });

  it("POSTs an Events API v2 payload to the fixed PagerDuty endpoint", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 202 }));

    await pagerDutyAdapter.send(
      { integrationKey: "abc123", severity: "critical" },
      "session.mass_revocation",
      { count: 42 }
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://events.pagerduty.com/v2/enqueue");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.routing_key).toBe("abc123");
    expect(body.payload.severity).toBe("critical");
  });

  it("throws when the API responds with a non-2xx status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("bad", { status: 400 }));
    await expect(
      pagerDutyAdapter.send({ integrationKey: "abc123" }, "session.mass_revocation", {})
    ).rejects.toThrow(/PagerDuty API returned 400/);
  });
});
