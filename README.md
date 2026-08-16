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

- API: http://localhost:9000
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
| `pnpm dev:web` | UI only (proxies `/api` to :9000) |
| `pnpm build` | Production UI build |
| `pnpm start` | Serve API and built UI from :9000 |
| `pnpm migrate` | Apply SQLite migrations |

## Environment

| Variable | Default | Notes |
|---|---|---|
| `JFLOW_JWT_SECRET` | `jflow-dev-secret` (dev only) | **Required in production**. |
| `JFLOW_SECRETS_KEY` | `jflow-dev-secrets-key` (dev only) | Master key for named secrets. **Required in production**. Changing it makes existing secrets unreadable. 64 hex chars are used as a raw AES-256 key; any other string is derived with scrypt. |
| `JFLOW_DB_PATH` | `packages/server/data/jerapah-flow.db` | SQLite file. |
| `JFLOW_LOG_LEVEL` | `debug` | Pino level |
| `JFLOW_RETENTION_DAYS` | `30` | Run history prune |
| `JFLOW_CORS_ORIGIN` | `http://localhost:5173` | Vite origin in dev |
| `PORT` | `9000` | HTTP port |
| `NODE_ENV` | — | Set `production` for secure cookies |

## Production

```bash
pnpm install
pnpm build
JFLOW_JWT_SECRET=... JFLOW_SECRETS_KEY=... NODE_ENV=production pnpm start
```

The server serves `packages/web/dist` when that folder exists.
