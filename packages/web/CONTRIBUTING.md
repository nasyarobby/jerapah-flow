# Contributing (web UI)

Conventions for editors, dialogs, and routing in `packages/web`.

## Entity editing patterns

### Modal + route deep-link (simple entities)

Use a list page with a route-driven editor modal for:

- Secrets (`/secrets`, `/secrets/new`, `/secrets/:owner/:name/edit`)
- Variables
- Profiles
- Auth profiles (`/auth`, …)
- Users

Prefer [`useRouteDrivenModal`](src/hooks/useRouteDrivenModal.js) to open/close the modal from the URL, keep a single `openedRouteKey` guard, and navigate back to the list path on close.

Navigate to `/…/new` or `/…/:id/edit` from list actions; do not open the editor with local state alone when a deep-link route exists.

### Full-page editors

Scripts and workflows use dedicated full-page editors (not list+modal). Keep create/edit as their own routes and leave the list page for browsing only.

### Known exception: Responses

The Responses page may keep inline editing (no modal / no full-page editor). Treat that as intentional; do not refactor it to modal+route unless product requirements change.

## Components

| Use | For |
|---|---|
| `ConfirmDialog` | Deletes and other yes/no confirmations |
| `FormInput` / `FormSelect` | Form fields in modals and pages |
| `Modal` | Custom dialog chrome when `ConfirmDialog` is not enough |

## Naming: `*Dialog` vs `*Modal`

- **`*Dialog`** — confirmations and pickers (e.g. `ConfirmDialog`, `AddTriggerDialog`, `AddScriptDialog`, `DuplicateWorkflowDialog`)
- **`*Modal`** — entity editors (e.g. `SecretEditorModal`, `ProfileEditorModal`, `AuthEditorModal`)

When adding a new overlay, pick the suffix from the table above. Do not rename existing `*EditorModal` components solely for consistency with older code.
