# JerapahFlow

![JerapahFlow](packages/web/src/theme/brand/wordmark.png)

Workflow runner with a sandboxed script engine, SQLite run history, and an admin UI.

## Packages

- `@jerapah-flow/server` (`packages/server`) — Fastify runner, HTTP/cron triggers, admin REST API
- `@jerapah-flow/web` (`packages/web`) — React admin UI (Vite, DaisyUI, React Query)

## Setup

```bash
pnpm install
# Redis required for the workflow queue
pnpm dev
```

- UI (dev): http://localhost:8500
- API: http://localhost:8700

The first account created becomes **admin**. Later accounts are created from Users.

### Process modes

| Command | Processes | Ports |
|---|---|---|
| `pnpm dev` | Monolith (`runner.js` = API + worker) + Vite | UI **8500**, API **8700** |
| `pnpm dev:pm2` | Control + PM2 HTTP + PM2 workers + Vite | UI **8500**, control **8600**, API **8700** |

`pnpm dev:pm2` is the mode for Ops (start/stop HTTP, scale workers, drain restart). Control owns SQLite migrations; HTTP/workers do not migrate.

## Scripts (core vs plugins)

| Kind | Name in YAML | Editable | Location |
|---|---|---|---|
| **Core** | `fetch-http.js`, `s3.js`, … | No (fork only) | `packages/server/scripts/` |
| **Plugin** | `plugin/<id>` | Yes | `plugins/<id>/` |

- App version is **`0.1.0`** (root `package.json`). Plugin manifests declare `jerapah: ">=0.1.0 <1.0.0"`.
- Install plugins via admin API: zip (base64), HTTPS git URL, example, or fork a core script.
- Install/update/uninstall sets **restart-needed** — drain-restart HTTP + workers under `pnpm dev:pm2`.
- Example plugin: `examples/plugins/get-current-time` → `plugin/get-current-time`.
- User plugins in this repo: `plugins/joplin-api` → `plugin/joplin-api`, `plugins/send-sms` → `plugin/send-sms`.

```bash
# Smoke
JFLOW_PLUGINS_DIR=packages/server/data/plugins-smoke-test \
JFLOW_DB_PATH=packages/server/data/plugins-smoke.db \
node packages/server/test/plugins-smoke.js
```


## Script contract

Each script is `async function main(ctx)` and **must** return:

```js
{ output, context?, skipRemaining? }
```

| Field | Meaning |
|---|---|
| `ctx.data` | This step’s input (trigger payload, previous `output`, or DAG `needs`) |
| `ctx.context` | Run clipboard (plain object, default `{}`) |
| `ctx.config` | This step’s YAML config |
| `output` | Becomes the **next** step’s `data` |
| `context` | Next snapshot of the bag. Omitted → keep incoming |
| `skipRemaining` | Stop later steps. Sibling of `output`/`context`, not inside `output` |

Returning the full `ctx` is an error. Mutating `ctx.data` or `ctx.context` does not persist unless returned.

YAML **SET** evaluates JSONata against the full `ctx`; the result is `output` (the next step’s data). `jsonata.js` does the same.

DAG `needs` assemble this step’s `data` from upstream **outputs**. Independent steps in the same wave share a context snapshot; sibling writes to the same context key fail the run.

Optional `script.meta.reads = "ctx"` documents expression hosts. `meta.input` / `meta.output` / `meta.context` describe `data`, the return pipe, and clipboard keys.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Monolith server + Vite (no PM2) |
| `pnpm dev:pm2` | Control + PM2 HTTP/workers + Vite (Ops UI) |
| `pnpm dev:server` | Monolith API/runner only |
| `pnpm dev:web` | UI only (proxies `/api` → :8700, `/ops` → :8600) |
| `pnpm build` | Production UI build |
| `pnpm start` | Monolith: API + worker + built UI |
| `pnpm start:control` | Control plane only (migrates, manages PM2 children) |
| `pnpm start:api` | HTTP API + cron enqueue (`JFLOW_ROLE=api`) |
| `pnpm start:worker` | BullMQ worker only |
| `pnpm migrate` | Apply SQLite migrations |

## Ops (control plane)

Admin UI route **Ops** (`/ops`) talks to the control process.

| Action | Behavior |
|---|---|
| Pause / resume | BullMQ `queue.pause()` / `resume()` — cron/HTTP still enqueue |
| Reload workflows | Redis pub/sub → all live HTTP/worker processes re-read YAML |
| Scale workers | PM2 scale; scale-down drains active jobs unless `force` |
| Drain restart | Pause → wait active=0 → stop children → migrate → recreate → resume |
| Force restart | Same without waiting (interrupts active runs; orphans marked `worker_lost`) |

Desired state is stored in `packages/server/data/control-state.json` (generation, worker count, restart-needed). Plugin installs (later) bump generation and set restart-needed; you apply with Drain restart.

## Environment

| Variable | Default | Notes |
|---|---|---|
| `JFLOW_JWT_SECRET` | `jflow-dev-secret` (dev only) | **Required in production**. |
| `JFLOW_SECRETS_KEY` | `jflow-dev-secrets-key` (dev only) | Master key for named secrets. **Required in production**. Changing it makes existing secrets unreadable. 64 hex chars are used as a raw AES-256 key; any other string is derived with scrypt. |
| `JFLOW_DB_PATH` | `packages/server/data/jerapah-flow.db` | SQLite file. |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Redis for BullMQ workflow queue. **Required** — the server will not start if Redis is unreachable. |
| `REDIS_PASS` | — | Optional Redis AUTH password (sent via ioredis `password`). Prefer this over embedding credentials in `REDIS_URL` so logs stay clean. |
| `JFLOW_QUEUE_NAME` | `jerapah-workflows` | BullMQ queue name. |
| `JFLOW_WORKER_CONCURRENCY` | `5` | Max parallel workflow jobs per worker process. |
| `JFLOW_ROLE` | `all` | `all` (HTTP + cron + worker), `api`, or `worker`. Prefer `pnpm start:api` / `start:worker` under control. |
| `JFLOW_CONFIG_GENERATION` | `1` | Set by control/PM2 so children report config generation in heartbeats. |
| `JFLOW_CONTROL_PORT` | `8600` | Control ops API port. |
| `JFLOW_LOG_LEVEL` | `debug` | Pino level |
| `JFLOW_RETENTION_DAYS` | `30` | Run history prune |
| `JFLOW_CORS_ORIGIN` | `http://localhost:8500` | Vite origin in dev |
| `PORT` | `8700` | HTTP API port |
| `NODE_ENV` | — | Set `production` for secure cookies (unless overridden) |
| `COOKIE_SECURE` | (from `NODE_ENV`) | `true`/`false` — force Secure cookie flag. Use `false` for plain HTTP LAN access (`http://192.168.x.x`) |

Workflow runs are **queued** via BullMQ. HTTP and manual triggers return `202 { runId, status: "queued" }` immediately; poll `GET /api/runs/:id` for progress (`queued` → `running` → `success` \| `failed`). Cron remains an in-process producer that enqueues jobs on each tick.

## Production

```bash
pnpm install
pnpm build
# Redis must be reachable at REDIS_URL (set REDIS_PASS if Redis requires AUTH)
# Recommended: run control (migrates + manages PM2 HTTP/workers)
JFLOW_JWT_SECRET=... JFLOW_SECRETS_KEY=... REDIS_URL=redis://127.0.0.1:6379 REDIS_PASS=... NODE_ENV=production pnpm start:control
# Or monolith (dev-style):
# ... pnpm start
```

With control, serve the built UI from Vite preview, a reverse proxy, or set `JFLOW_SERVE_UI=1` on the HTTP process.
