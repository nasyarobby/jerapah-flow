# Automation Catalog & Must-Have Scripts

Research-backed catalog of workflows and scripts for **scrunner**, informed by patterns from [Huginn](https://github.com/huginn/huginn) and [n8n](https://n8n.io). Use this as a roadmap for built-in scripts, example workflows, and product direction.

## How scrunner maps to Huginn and n8n

| Concept | Huginn | n8n | scrunner today |
|--------|--------|-----|----------------|
| Unit of work | Agent | Node | Script (`.js` in `packages/server/scripts/`) |
| Orchestration | Scenario (agent graph) | Workflow (node graph) | Linear YAML workflow (`scripts:` list) |
| Triggers | Schedule, Webhook, Manual | Webhook, Cron, Manual, Poll | `cron`, `HTTP`, `manual` |
| Data passing | Events between agents | Items / JSON between nodes | `ctx` object passed step-to-step |
| Transform | Trigger Agent, Event Formatting | Set, Code, JSON, Switch | `jsonata.js`, inline `jsonata` in `fetch-html.js` |
| Notifications | Email, Slack, Pushover agents | Slack, Gmail, Telegram nodes | `ntfy.js` |
| Web fetch | Website Agent, HTTP Request Agent | HTTP Request, HTML Extract | `fetch-html.js`, `fetch-binary.js` |
| State / memory | Agent memory, deduplication | Static data, DB nodes | Not built-in yet (see `store-kv.js` below) |
| Branching | Multiple downstream agents | Switch / IF nodes | Not built-in yet (see `filter.js` below) |

scrunner is intentionally smaller than Huginn or n8n: linear scripts, sandboxed JS, and YAML workflows. Most Huginn/n8n patterns below can be expressed as **script chains** once the right building blocks exist.

---

## Current building blocks

### Triggers

| Trigger | Example | Use case |
|---------|---------|----------|
| `cron` | `*/20 * * * *` | Poll feeds, send digests, health checks |
| `HTTP` | `POST /u/{owner}/path` | Webhooks, form submissions, external callbacks |
| `manual` | UI or `POST /api/workflows/{owner}/{file}/run` | On-demand runs, debugging |

### Scripts (shipped)

| Script | Role | Huginn / n8n analogue |
|--------|------|------------------------|
| `fetch-html.js` | GET page, CSS select, optional JSONata | Website Agent + HTML Extract |
| `fetch-binary.js` | Download file to `ctx.data.file` | HTTP Request (binary) |
| `jsonata.js` | Transform `ctx.data` with JSONata | Set / Code / JSON node |
| `ntfy.js` | Push notification (text or attachment) | Pushover / custom webhook notify |
| `get-current-time.js` | Stamp `ctx.data.datetime` | Date & Time node |

### Example workflows (shipped)

| Workflow | Pattern |
|----------|---------|
| `comic-monkeyuser-to-ntfy.yaml` | Scrape → transform → fetch image → notify |
| `fetch-devto.yaml` | Scrape list → JSONata extract titles |
| `cron-example.yaml` | Scheduled notification |
| `time-to-ntfy-example.yaml` | Generate payload → notify |
| `manual-trigger.yaml` | Manual / HTTP chained scripts |

---

## Possible automations (by category)

Patterns below are common in Huginn scenarios and n8n templates. Each lists the **trigger**, **script chain**, and **priority**.

### 1. Monitoring & alerts

Inspired by Huginn’s Website Agent, RSS Agent, and API monitoring scenarios.

| Automation | Trigger | Script chain | Priority |
|------------|---------|--------------|----------|
| **Website change detection** | `cron` (e.g. every 15m) | `fetch-html` → `hash-content` → `compare-kv` → `ntfy` if changed | P0 |
| **RSS / Atom feed watcher** | `cron` | `fetch-rss` → `dedupe-kv` → `filter-keywords` → `ntfy` | P0 |
| **API health check** | `cron` (e.g. every 5m) | `http-request` → `assert-status` → `ntfy` on failure | P0 |
| **SSL certificate expiry** | `cron` (daily) | `check-ssl` → `filter-days-left` → `send-email` | P1 |
| **Uptime summary digest** | `cron` (daily) | `aggregate-runs` → `format-digest` → `ntfy` | P2 |
| **Price / deal monitor** | `cron` | `fetch-html` → `jsonata` (price) → `compare-kv` → `ntfy` | P1 |
| **Keyword alert on forum** | `cron` | `fetch-html` → `filter-regex` → `ntfy` | P1 |

**Huginn reference:** NYT-style “watch webpage and Slack on change”, OzBargain RSS → filter → Pushover.

**n8n reference:** Scheduled HTTP + IF node + Slack/Telegram alert templates.

---

### 2. Webhooks & integrations

Inspired by Huginn Webhook Agent + Trigger Agent and n8n webhook → Switch → CRM flows.

| Automation | Trigger | Script chain | Priority |
|------------|---------|--------------|----------|
| **Generic webhook → notify** | `HTTP` | `validate-payload` → `jsonata` → `ntfy` | P0 |
| **Webhook → Slack** | `HTTP` | `jsonata` → `send-slack` | P0 |
| **Webhook → email** | `HTTP` | `jsonata` → `send-email` | P1 |
| **Form submission router** | `HTTP` | `filter` (score/rules) → branch via multiple workflows or `switch` script | P1 |
| **GitHub / GitLab push notify** | `HTTP` | `jsonata` (commit message) → `send-slack` | P1 |
| **Stripe payment alert** | `HTTP` | `verify-signature` → `jsonata` → `send-slack` | P2 |
| **Inventory low-stock** | `HTTP` | `filter` (threshold) → `send-slack` | P1 |

**Huginn reference:** Marketplacer webhook → Trigger (threshold) → Slack.

**n8n reference:** Webhook lead form → AI score → Switch → CRM / Slack.

---

### 3. Content & media

| Automation | Trigger | Script chain | Priority |
|------------|---------|--------------|----------|
| **Comic / image of the day** | `cron` | `fetch-html` → `jsonata` → `fetch-binary` → `ntfy` | ✅ (shipped example) |
| **Blog / Dev.to digest** | `cron` (daily) | `fetch-html` or `fetch-rss` → `jsonata` → `format-markdown` → `ntfy` | P1 |
| **YouTube / podcast new episode** | `cron` | `fetch-rss` → `dedupe-kv` → `ntfy` | P1 |
| **Screenshot of URL** | `HTTP` or `cron` | `render-url` (external API) → `fetch-binary` → `ntfy` | P3 |
| **AI news digest** | `cron` (daily 9:00) | `fetch-rss` / `http-request` → `summarize-llm` → `send-telegram` | P2 |

**n8n reference:** AI News Digest → Telegram, RSS → AI summary templates.

---

### 4. Data sync & ETL

| Automation | Trigger | Script chain | Priority |
|------------|---------|--------------|----------|
| **Sheet row → task tracker** | `cron` (every 15m) | `fetch-google-sheet` → `filter-new-rows` → `create-clickup-task` → `mark-synced-kv` | P2 |
| **Webhook lead → spreadsheet** | `HTTP` | `jsonata` → `append-google-sheet` | P2 |
| **API poll → JSON file** | `cron` | `http-request` → `jsonata` → `write-file` | P2 |
| **Normalize webhook payload** | `HTTP` | `jsonata` → `http-request` (forward) | P1 |
| **Backup config / workflows** | `cron` (weekly) | `read-workflows` → `archive-zip` → `upload-s3` | P3 |

**n8n reference:** Google Sheets ↔ ClickUp sync, CRM upsert pipelines.

---

### 5. Notifications & messaging

| Automation | Trigger | Script chain | Priority |
|------------|---------|--------------|----------|
| **Multi-channel alert** | `HTTP` / `cron` | `jsonata` → parallel: `ntfy`, `send-slack`, `send-telegram` | P1 |
| **Escalation on repeated failure** | `cron` | `count-failed-runs` → `filter` → `send-email` | P2 |
| **Daily standup reminder** | `cron` | `get-current-time` → `send-slack` | P1 |
| **On-call rotation ping** | `cron` | `lookup-rotation` → `send-telegram` | P3 |

**Huginn reference:** Email Digest Agent, Slack Agent, Pushover Agent.

---

### 6. AI-assisted (n8n-heavy, future for scrunner)

| Automation | Trigger | Script chain | Priority |
|------------|---------|--------------|----------|
| **Lead qualification** | `HTTP` | `llm-classify` → `filter` → `send-email` / `http-request` (CRM) | P3 |
| **Support ticket triage** | `HTTP` | `llm-classify` → `jsonata` → `send-slack` + draft reply in `ctx` | P3 |
| **Document chunk → embeddings** | `cron` | `fetch-documents` → `chunk-text` → `embed-llm` → `upsert-vector` | P3 |

**n8n reference:** BANT lead scoring, AI email triage, document-to-RAG ingestion templates.

These need an `llm-request.js` script and optional vector DB script; keep behind config/credentials.

---

### 7. Operations & housekeeping

| Automation | Trigger | Script chain | Priority |
|------------|---------|--------------|----------|
| **Failed run alert** | `cron` (hourly) | `query-failed-runs` → `filter` → `ntfy` | P1 |
| **Workflow smoke test** | `cron` | Run test workflow via internal HTTP | P2 |
| **Log / metrics export** | `cron` | `http-request` (metrics endpoint) → `write-file` | P3 |
| **Prune old KV keys** | `cron` (weekly) | `kv-prune` | P2 |

Built-in run pruning already exists (`SCRUNNER_RETENTION_DAYS`); extend with explicit ops workflows.

---

## Must-have scripts

Scripts are grouped by priority. **P0** = unlocks most catalog items; **P1** = high-value integrations; **P2+** = power-user / enterprise.

### P0 — Core primitives (implement first)

| Script | Purpose | Config sketch | Replaces (Huginn / n8n) |
|--------|---------|---------------|-------------------------|
| **`http-request.js`** | Generic GET/POST/PUT with headers, body, auth | `method`, `url`, `headers`, `body`, `outputVar` | HTTP Request Agent / HTTP Request node |
| **`fetch-rss.js`** | Parse RSS/Atom → array of items | `url`, `outputVar`, `sinceHours` | RSS Agent |
| **`filter.js`** | Continue or skip based on JSONata/expression | `expression`, `mode: skip\|fail` | Trigger Agent / IF node |
| **`compare-kv.js`** | Hash or compare value; emit `changed: true/false` | `key`, `valueFrom`, `algorithm` | Website Agent memory / dedup |
| **`store-kv.js`** | Read/write/delete sandboxed key-value (SQLite or file) | `op`, `key`, `value` | Agent memory, static data |
| **`set-data.js`** | Merge static or JSONata-shaped fields into `ctx.data` | `fields` or `jsonata` | Set node |
| **`format-message.js`** | Template string → `ctx.data.message` | `template` (e.g. `{{title}}: {{url}}`) | Event Formatting Agent |

Without **`store-kv`** + **`compare-kv`**, change detection and RSS deduplication (staple Huginn flows) are awkward. Without **`filter`**, webhook routing requires separate workflows per branch.

### P1 — Integrations & quality of life

| Script | Purpose | Notes |
|--------|---------|-------|
| **`send-slack.js`** | Post to Slack incoming webhook or Bot API | `webhookUrl` or `token` + `channel` |
| **`send-telegram.js`** | `sendMessage` via Bot API | `botToken`, `chatId` |
| **`send-email.js`** | SMTP or API (Resend, SendGrid) | Requires env credentials |
| **`send-discord.js`** | Discord webhook | Simple JSON POST |
| **`dedupe-kv.js`** | Skip if `id` seen in KV (feeds) | Wraps `store-kv` |
| **`assert.js`** | Fail step if condition false (health checks) | `jsonata` or `status` |
| **`delay.js`** | Pause N ms (rate limits) | `ms` |
| **`merge-context.js`** | Pick/rename fields from prior steps | `mapping` |
| **`parse-json.js`** | Safe JSON parse string → object | `inputVar`, `outputVar` |
| **`hash-content.js`** | SHA-256 of string for change detection | `inputVar`, `outputVar` |

### P2 — Data platforms

| Script | Purpose |
|--------|---------|
| **`append-google-sheet.js`** | Append row via API |
| **`read-google-sheet.js`** | Read range → array |
| **`write-file.js`** | Write JSON/text to allowed data dir |
| **`read-file.js`** | Read from allowed data dir |
| **`webhook-respond.js`** | Set HTTP response body/status (when supported) |

### P3 — Advanced / optional

| Script | Purpose |
|--------|---------|
| **`llm-request.js`** | OpenAI-compatible chat/completion |
| **`verify-hmac.js`** | Webhook signature validation (Stripe, GitHub) |
| **`render-url.js`** | Screenshot service wrapper |
| **`upload-s3.js`** | Object storage backup |
| **`sql-query.js`** | Parameterized read against allowed SQLite views |

---

## Recommended script implementation order

```
1. http-request.js      ─┐
2. set-data.js           ├─► covers 80% of n8n "HTTP + Set" patterns
3. filter.js             ─┘
4. store-kv.js + compare-kv.js + hash-content.js  ─► Huginn-style monitoring
5. fetch-rss.js + dedupe-kv.js                    ─► feed watchers
6. send-slack.js + send-telegram.js + send-email.js
7. format-message.js                              ─► readable notifications
8. llm-request.js (optional)                      ─► AI templates
```

---

## Example workflow sketches (not yet shipped)

### RSS keyword alert (Huginn-style)

```yaml
name: rss-keyword-alert
scripts:
  - script: fetch-rss.js
    config:
      url: https://example.com/feed.xml
      outputVar: items
  - script: dedupe-kv.js
    config:
      idField: guid
      namespace: example-feed
  - script: filter.js
    config:
      expression: '$contains(title, "security") or $contains(title, "CVE")'
  - script: format-message.js
    config:
      template: "{{title}}\n{{link}}"
  - script: ntfy.js
    config:
      url: https://ntfy.sh/my-topic
triggers:
  - type: cron
    schedule: "*/10 * * * *"
```

### Webhook → Slack (n8n-style)

```yaml
name: github-push-to-slack
scripts:
  - script: jsonata.js
    config:
      expression: |
        {
          "data": {
            "text": commits[0].message & " by " & commits[0].author.name,
            "channel": "#deploys"
          }
        }
  - script: send-slack.js
    config:
      webhookUrl: ${SLACK_WEBHOOK_URL}
triggers:
  - type: HTTP
    method: POST
    path: /github
```

### API health check

```yaml
name: api-health
scripts:
  - script: http-request.js
    config:
      url: https://api.example.com/health
      outputVar: health
  - script: assert.js
    config:
      expression: health.status = 200
  - script: ntfy.js
    config:
      url: https://ntfy.sh/ops-alerts
    # run only on failure if filter supports on-error hook
triggers:
  - type: cron
    schedule: "*/5 * * * *"
```

---

## Sandbox & security notes for new scripts

- Allowed `require()` modules today: `axios`, `jsonata`, `node-html-parser`. New parsers (`fast-xml-parser` for RSS) need an allowlist update in `script-sandbox.js`.
- Outbound HTTP is screened (no private/metadata IPs). Scripts should use `$axios`, not raw `fetch`, for consistent policy.
- **KV store** should live under `packages/server/data/kv/` or a dedicated SQLite table—not arbitrary filesystem access from user scripts.
- Credentials (SMTP, Slack, API keys) should come from `ctx.config` referencing env vars, not hardcoded in workflows committed to git.

---

## Comparison summary

| Area | Huginn strength | n8n strength | scrunner opportunity |
|------|-----------------|--------------|----------------------|
| Monitoring | Mature agents, event graphs | Good templates + scheduling | Linear YAML + KV + `fetch-html` / `fetch-rss` |
| Webhooks | Webhook + Trigger combo | Rich routing (Switch) | `filter.js` + JSONata |
| Notifications | Many agents | Many SaaS nodes | Start with `ntfy`, add Slack/Telegram/email |
| AI | Limited native | Large template library | Single `llm-request.js` behind config |
| Self-host / privacy | Rails, full ownership | TypeScript, active ecosystem | Lightweight Node, sandboxed scripts |
| Branching | Multiple agents | Visual branches | Future: `switch` script or sub-workflows |

---

## References

- [Huginn GitHub](https://github.com/huginn/huginn) — agent types, scenarios, event-driven design
- [Huginn newsroom scenarios](http://albertsun.github.io/huginn-newsroom-scenarios/) — RSS, webpage watch, Slack/email patterns
- [n8n workflow templates](https://n8n.io/workflows/) — webhooks, CRM, AI, digests
- scrunner examples: `packages/server/workflows/default/`
- scrunner scripts: `packages/server/scripts/`

---

## Next steps

1. Implement **P0 scripts** (`http-request`, `filter`, `store-kv`, `compare-kv`, `fetch-rss`).
2. Add **example workflows** for RSS alert and health check under `workflows/default/`.
3. Document env vars for `send-slack` / `send-email` in root `README.md` when those scripts land.
4. Consider workflow-level `enabled: false` and step-level `onError: continue` for n8n-like resilience (already supports `enabled` on workflows).
