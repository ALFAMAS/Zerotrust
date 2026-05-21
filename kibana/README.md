# ZeroAuth Kibana Dashboards

Pre-built Kibana 8.x dashboards for monitoring your ZeroAuth deployment.

## Dashboards Included

| File | Dashboard | Description |
|------|-----------|-------------|
| `auth-success-failure-rates.ndjson` | Auth Success/Failure Rates | Login success %, failure trends, top failing actions |
| `mfa-adoption.ndjson` | MFA Adoption | MFA coverage %, breakdown by method, 30-day trend |
| `denied-access-patterns.ndjson` | Denied Access Patterns | Geo map, top denied IPs, denial-by-error-code breakdown |
| `rate-limit-heatmap.ndjson` | Rate Limit Heatmap | Hour×day heatmap, top offending IPs, P95 latency |
| `device-anomaly-alerts.ndjson` | Device Anomaly Alerts | Anomaly counts, affected users, risk score distribution |
| `zeroauth-overview.ndjson` | ZeroAuth Overview | All key metrics on a single combined dashboard |

## Prerequisites

- Kibana 8.x connected to your Elasticsearch cluster
- ZeroAuth audit pipeline enabled (`ELASTICSEARCH_ENABLED=true` in `.env`)
- Audit data flowing into the `zeroauth-audit-YYYY.MM.DD` index pattern

## Import Instructions

### Via Kibana UI

1. Open Kibana → **Stack Management** → **Saved Objects**
2. Click **Import**
3. Upload any `.ndjson` file from this directory
4. Select **Overwrite** if prompted
5. Click **Import**

### Via Kibana API

```bash
# Import a single dashboard
curl -X POST "http://localhost:5601/api/saved_objects/_import" \
  -H "kbn-xsrf: true" \
  -F file=@kibana/auth-success-failure-rates.ndjson

# Import all dashboards at once
for f in kibana/*.ndjson; do
  curl -X POST "http://localhost:5601/api/saved_objects/_import" \
    -H "kbn-xsrf: true" \
    -F "file=@$f"
  echo "Imported $f"
done
```

### With Authentication

```bash
curl -X POST "http://localhost:5601/api/saved_objects/_import" \
  -H "kbn-xsrf: true" \
  -H "Authorization: Basic $(echo -n 'elastic:yourpassword' | base64)" \
  -F file=@kibana/zeroauth-overview.ndjson
```

## Index Pattern

All dashboards use the index pattern **`zeroauth-audit-*`** with `timestamp` as the time field.

The ZeroAuth audit pipeline writes to daily indices: `zeroauth-audit-2026.05.21`

## Customisation

- **Refresh interval**: Each dashboard has a default refresh set (30s–5min). Adjust in the dashboard settings.
- **Time range**: Default time windows vary per dashboard (1h, 24h, 7d). Use the Kibana time picker to override.
- **Alerts**: Create Kibana Alerting rules from any visualisation by clicking **Inspect** → **Alerts**.

## Troubleshooting

**No data shown?**
1. Check `ELASTICSEARCH_ENABLED=true` in your `.env`
2. Verify the index exists: `GET zeroauth-audit-*/_count`
3. Ensure the time range includes your data
4. Confirm the index pattern matches exactly: `zeroauth-audit-*`

**Import fails with "already exists"?**
- Select **Overwrite all conflicts** in the import dialog.
