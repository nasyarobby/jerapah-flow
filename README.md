# JerapahFlow

![JerapahFlow](packages/web/src/theme/brand/wordmark.png)

Workflow runner with a sandboxed script engine, SQLite run history, and an admin UI.

## Packages

- `@jerapah-flow/server` (`packages/server`) — Fastify runner, HTTP/cron triggers, admin REST API
- `@jerapah-flow/web` (`packages/web`) — React admin UI (Vite, DaisyUI, React Query)

## Setup

```bash
pnpm install
pnpm dev
```

- API: http://localhost:8700
- UI (dev): http://localhost:5173

The first account created becomes **admin**. Later accounts are created from Users.

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
| `pnpm dev` | Server + Vite together |
| `pnpm dev:server` | API/runner only |
| `pnpm dev:web` | UI only (proxies `/api` to :8700) |
| `pnpm build` | Production UI build |
| `pnpm start` | Serve API and built UI from :8700 |
| `pnpm migrate` | Apply SQLite migrations |

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
| `JFLOW_ROLE` | `all` | Which duties this process performs: `all` (HTTP/admin + cron producer + worker), `api` (HTTP/admin + cron enqueue only), or `worker` (consume queue only). Use separate processes in production when you want to scale workers independently. |
| `JFLOW_LOG_LEVEL` | `debug` | Pino level |
| `JFLOW_RETENTION_DAYS` | `30` | Run history prune |
| `JFLOW_CORS_ORIGIN` | `http://localhost:5173` | Vite origin in dev |
| `PORT` | `8700` | HTTP port |
| `NODE_ENV` | — | Set `production` for secure cookies |

Workflow runs are **queued** via BullMQ. HTTP and manual triggers return `202 { runId, status: "queued" }` immediately; poll `GET /api/runs/:id` for progress (`queued` → `running` → `success` \| `failed`). Cron remains an in-process producer that enqueues jobs on each tick.

## Production

```bash
pnpm install
pnpm build
# Redis must be reachable at REDIS_URL (set REDIS_PASS if Redis requires AUTH)
JFLOW_JWT_SECRET=... JFLOW_SECRETS_KEY=... REDIS_URL=redis://127.0.0.1:6379 REDIS_PASS=... NODE_ENV=production pnpm start
```

The server serves `packages/web/dist` when that folder exists.
