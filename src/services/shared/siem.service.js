"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isSiemEnabled = isSiemEnabled;
exports.streamToSiem = streamToSiem;
/**
 * SIEM streaming — fan out audit events to an external collector.
 *
 * Generic HTTP sink that works with Datadog (HTTP intake), Splunk HEC, an S3
 * upload proxy, or any log collector that accepts JSON over POST. Configured via
 * env; a no-op when unset (mirrors the optional Elasticsearch / web-push setup).
 * Fire-and-forget and fully guarded — SIEM delivery must never block or fail a
 * request, and never throws.
 *
 *   SIEM_ENABLED=true
 *   SIEM_ENDPOINT=https://http-intake.logs.datadoghq.com/api/v2/logs
 *   SIEM_AUTH_HEADER=DD-API-KEY        # header name carrying the key (optional)
 *   SIEM_API_KEY=...                   # value for SIEM_AUTH_HEADER (optional)
 *   SIEM_SOURCE=zerotrust               # tag added to each event (optional)
 */
// NB: intentionally no logger import — this module is called from auditLog()
// inside the logger, so importing the logger back would be circular.
const safeFetch_1 = require("../../shared/safeFetch");
function isSiemEnabled() {
    return process.env.SIEM_ENABLED === "true" && Boolean(process.env.SIEM_ENDPOINT);
}
/**
 * Send one audit/security event to the configured SIEM. Returns true if a
 * delivery was attempted (endpoint configured), false if SIEM is disabled.
 */
async function streamToSiem(event) {
    if (!isSiemEnabled())
        return false;
    const endpoint = process.env.SIEM_ENDPOINT;
    const headers = {
        "Content-Type": "application/json",
    };
    const authHeader = process.env.SIEM_AUTH_HEADER;
    const apiKey = process.env.SIEM_API_KEY;
    if (authHeader && apiKey)
        headers[authHeader] = apiKey;
    const payload = {
        source: process.env.SIEM_SOURCE ?? "zerotrust",
        ddsource: process.env.SIEM_SOURCE ?? "zerotrust",
        "@timestamp": new Date().toISOString(),
        ...event,
    };
    try {
        // SIEM endpoint is operator-controlled env config and may legitimately be
        // an internal collector, so do not apply the public-host SSRF guard here;
        // still fail fast and refuse redirects.
        await (0, safeFetch_1.fetchFixedUrl)(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });
        return true;
    }
    catch (err) {
        // Never let SIEM delivery failures surface — just record locally.
        console.warn("[siem] delivery failed:", String(err));
        return false;
    }
}
//# sourceMappingURL=siem.service.js.map