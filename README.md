# scrunner

Workflow runner with a sandboxed script engine, SQLite run history, and an admin UI.

## Packages

- `packages/server` — Fastify runner, HTTP/cron triggers, admin REST API
- `packages/web` — React admin UI (Vite, DaisyUI, React Query)

## Setup

```bash
pnpm install
pnpm dev
```

- API: http://localhost:9000
- UI (dev): http://localhost:5173

The first account created becomes **admin**. Later accounts are created from Users.

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
| `SCRUNNER_JWT_SECRET` | `scrunner-dev-secret` (dev only) | **Required in production** |
| `SCRUNNER_SECRETS_KEY` | `scrunner-dev-secrets-key` (dev only) | Master key for named secrets. **Required in production**. Changing it makes existing secrets unreadable. 64 hex chars are used as a raw AES-256 key; any other string is derived with scrypt. |
| `SCRUNNER_DB_PATH` | `packages/server/data/scrunner.db` | SQLite file |
| `SCRUNNER_LOG_LEVEL` | `debug` | Pino level |
| `SCRUNNER_RETENTION_DAYS` | `30` | Run history prune |
| `SCRUNNER_CORS_ORIGIN` | `http://localhost:5173` | Vite origin in dev |
| `PORT` | `9000` | HTTP port |
| `NODE_ENV` | — | Set `production` for secure cookies |

## Production

```bash
pnpm install
pnpm build
SCRUNNER_JWT_SECRET=... SCRUNNER_SECRETS_KEY=... NODE_ENV=production pnpm start
```

The server serves `packages/web/dist` when that folder exists.
