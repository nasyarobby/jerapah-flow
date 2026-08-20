# JerapahFlow plugins

This file tells agents how to add a **user plugin**. Do not put personal or site-specific scripts in `packages/server/scripts/` (core, read-only). Do not put them in `examples/plugins/` (shipped examples only).

## Where things live

| Kind | YAML `script` | Editable | Path |
|---|---|---|---|
| Core | `fetch-http.js` | No | `packages/server/scripts/` |
| User plugin | `plugin/<id>` | Yes | `plugins/<id>/` |
| Example source | install → `plugin/<id>` | After install | `examples/plugins/<id>/` |

Runtime load path is repo-root `plugins/` (`PLUGINS_DIR` in `packages/server/paths.js`). Override with `JFLOW_PLUGINS_DIR` only in tests.

Plugins are **outside** the pnpm workspace (`packages/*`). Do not add `plugins/*` to `pnpm-workspace.yaml`.

## When to create a plugin

Create a user plugin when the script is:

- Site-specific (LAN IPs, personal modems, private APIs)
- A fork of a core script the user wants to edit
- Anything that should stay in git but not ship as core

Use native `fetch` (not `$axios`) when the URL is RFC1918 / WG (`10.x`, `192.168.x`, …). `$axios` is screened and **blocks** those hosts.

## Create a new plugin

1. Pick an id: lowercase letters, numbers, hyphens; max 64 chars; `^[a-z0-9]+(?:-[a-z0-9]+)*$`.
2. Folder name **must equal** manifest `id`. Example: `plugins/joplin-api`.
3. Id **must not** collide with a core script basename (`fetch-http`, `ntfy`, …).
4. Create three files (see below). Prefer `main: "script.js"`.
5. Point workflows at `plugin/<id>`.
6. Restart the runner (`pnpm dev` / drain-restart under `pnpm dev:pm2`) so the plugin is picked up.

Copy the layout from `plugins/joplin-api`, `plugins/send-sms`, or `examples/plugins/get-current-time`.

### `plugins/<id>/jerapah-plugin.json`

```json
{
  "id": "my-plugin",
  "name": "My plugin",
  "version": "0.1.0",
  "jerapah": ">=0.1.0 <1.0.0",
  "main": "script.js",
  "description": "One-line description"
}
```

- `version` must be semver (`0.1.0`).
- `jerapah` must match the app (`0.1.0` in root `package.json`). Use `">=0.1.0 <1.0.0"` unless you know otherwise.
- `main` is a relative path; no `..`, not absolute.

### `plugins/<id>/package.json`

```json
{
  "name": "jflow-plugin-my-plugin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "description": "JerapahFlow plugin: …"
}
```

Add `dependencies` only if the script `require()`s extra npm packages. Then:

```bash
pnpm install --dir plugins/<id> --ignore-scripts --prefer-offline
```

`plugins/*/node_modules/` is gitignored. Host-allowlisted modules (`axios`, `jsonata`, …) come from the server; extra deps resolve from the plugin directory.

### `plugins/<id>/script.js`

Must `export default` a function. The sandbox rewrites ESM `import`/`export default` to CJS.

```js
function passContext(ctx) {
  if (ctx?.context != null && typeof ctx.context === "object" && !Array.isArray(ctx.context)) {
    return { ...ctx.context };
  }
  return {};
}

async function myPlugin(ctx) {
  const output = { ok: true };
  return { output, context: { ...passContext(ctx), ...output } };
}

myPlugin.meta = {
  description: "What this step does",
  previewConfigKey: "url",
  tags: ["HTTP"],
  config: {},
  input: {},
  output: { ok: { type: "boolean" } },
  context: { ok: { type: "boolean" } },
  example: { data: {}, config: {} },
};

export default myPlugin;
```

Return `{ output, context?, skipRemaining? }`. Do not return `ctx`. Mutations of `ctx.data` / `ctx.context` are discarded unless returned.

| Field | Meaning |
|---|---|
| `ctx.data` | Step input (trigger payload, previous `output`, or DAG `needs`) |
| `ctx.context` | Run clipboard (plain object) |
| `ctx.config` | YAML `config` (secrets already unwrapped from `$SECRET_name`) |
| `output` | Next step’s `data` |
| `context` | Next clipboard. Omit to keep incoming |

`fn.meta` must be JSON-serializable (UI + dry-run). Include `config` / `input` / `output` field schemas and an `example`.

## Sandbox globals (do not import these)

Injected: `log` (pino), `console`, `fetch`, `require`, `$axios`, `$kv`, `$fingerprint`, `$secrets`, `$vars`, `$responses`, `$workflows`.

- Use `log.info({ … }, "my-plugin: …")` — `log` is not an import.
- `require("axios")` is the screened `$axios` (RFC1918 blocked). Prefer `fetch` for LAN.
- Plugin `require("some-npm-dep")` uses the plugin’s `node_modules`.

## Workflow YAML

```yaml
scripts:
  - script: plugin/my-plugin
    config:
      url: http://10.8.0.6:3030/notes
      token: $SECRET_joplin_api_token
```

Canonical ref is `plugin/<id>` (`.js` suffix is optional).

## Do not

- Add user plugins under `packages/server/scripts/` or `examples/plugins/`.
- Use an id that matches a core script file (`ntfy`, `jsonata`, …).
- Mismatch folder name and `jerapah-plugin.json` `id` (plugin is disabled).
- Commit `plugins/.staging-*` or `plugins/*/node_modules/`.
- Put secrets in `script.js`; use YAML `$SECRET_name` / `$VAR_name`.
