import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const monitoringDir = join(process.cwd(), "monitoring");

function readYaml(path: string): string {
  return readFileSync(join(monitoringDir, path), "utf8");
}

describe("monitoring OBS-1 config", () => {
  it("prometheus.yml wires Alertmanager and loads SLO rules", () => {
    const prometheus = readYaml("prometheus.yml");
    expect(prometheus).toContain("alerting:");
    expect(prometheus).toContain("alertmanager:9093");
    expect(prometheus).toContain("/etc/prometheus/alerts.yml");
  });

  it("alertmanager.yml defines default receiver and page route", () => {
    const alertmanager = readYaml("alertmanager.yml");
    expect(alertmanager).toContain('receiver: default');
    expect(alertmanager).toContain("severity: page");
    expect(alertmanager).toContain("inhibit_rules:");
  });

  it("alertmanager.production.example.yml documents PagerDuty and Slack receivers", () => {
    const production = readYaml("alertmanager.production.example.yml");
    expect(production).toContain("pagerduty_configs:");
    expect(production).toContain("slack_configs:");
    expect(production).toContain("REPLACE_WITH_PAGERDUTY_EVENTS_API_V2_KEY");
    expect(production).toContain("REPLACE_WITH_SLACK_INCOMING_WEBHOOK_URL");
  });

  it("alerts.yml defines zerotrust-slo page alerts", () => {
    const alerts = readYaml("alerts.yml");
    expect(alerts).toContain("name: zerotrust-slo");
    expect(alerts).toContain("ZerotrustHighErrorRate");
    expect(alerts).toContain('severity: page');
  });
});
