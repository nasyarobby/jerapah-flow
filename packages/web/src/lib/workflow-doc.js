import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const KNOWN_TOP = new Set(["name", "description", "enabled", "scripts", "triggers"]);
const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

export const NEW_WORKFLOW_YAML = `name: new workflow
scripts:
  - plugin/get-current-time
triggers:
  - type: HTTP
    method: POST
    path: /new
`;

export function ensureWorkflowFilename(file) {
  const trimmed = String(file ?? "").trim();
  if (!trimmed) return "";
  return /\.ya?ml$/i.test(trimmed) ? trimmed : `${trimmed}.yaml`;
}

/**
 * Next unused copy filename: `track.yaml` → `track-copy.yaml`,
 * `track-copy.yaml` → `track-copy-2.yaml`.
 * @param {string} file
 * @param {string[]} existingFiles
 */
export function suggestCopyFilename(file, existingFiles = []) {
  const name = ensureWorkflowFilename(file) || "workflow.yaml";
  const match = name.match(/^(.*?)(\.ya?ml)$/i);
  const base = match ? match[1] : name;
  const ext = match ? match[2] : ".yaml";
  const existing = new Set(existingFiles);

  const copyMatch = base.match(/^(.*)-copy(?:-(\d+))?$/);
  const root = copyMatch ? copyMatch[1] : base;
  const candidate = (i) =>
    i <= 1 ? `${root}-copy${ext}` : `${root}-copy-${i}${ext}`;

  let n = copyMatch ? Number(copyMatch[2] || 1) + 1 : 1;
  while (existing.has(candidate(n))) n += 1;
  return candidate(n);
}

let uidSeq = 0;

export function nextUiId(prefix = "ui") {
  uidSeq += 1;
  return `${prefix}-${uidSeq}-${Math.random().toString(36).slice(2, 8)}`;
}

export function namespacedPath(owner, triggerPath) {
  const cleaned = String(triggerPath ?? "")
    .replace(/^\/+/, "")
    .trim();
  return `/u/${owner}/${cleaned}`;
}

/**
 * @param {string} text
 * @returns {{ doc: WorkflowDoc | null, parseError: string | null }}
 */
export function parseWorkflowYaml(text) {
  let raw;
  try {
    raw = parseYaml(text ?? "");
  } catch (err) {
    return {
      doc: null,
      parseError: err instanceof Error ? err.message : String(err),
    };
  }
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return { doc: null, parseError: "workflow yaml must be an object" };
  }
  return { doc: yamlObjectToDoc(raw), parseError: null };
}

/**
 * @param {Record<string, unknown>} raw
 */
export function yamlObjectToDoc(raw) {
  /** @type {Record<string, unknown>} */
  const extra = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!KNOWN_TOP.has(key)) extra[key] = value;
  }
  return {
    name: typeof raw.name === "string" ? raw.name : "",
    description: raw.description == null ? "" : String(raw.description),
    enabled: raw.enabled !== false,
    scripts: Array.isArray(raw.scripts) ? raw.scripts.map((step) => normalizeStep(step)) : [],
    triggers: Array.isArray(raw.triggers)
      ? raw.triggers.map((t) => normalizeTrigger(t))
      : [],
    extra,
  };
}

export function stringifyWorkflowDoc(doc) {
  /** @type {Record<string, unknown>} */
  const out = {};
  if (doc?.name) out.name = doc.name;
  if (doc?.description) out.description = doc.description;
  if (doc?.enabled === false) out.enabled = false;
  Object.assign(out, doc?.extra ?? {});
  out.scripts = (doc?.scripts ?? []).map(dumpStep);
  out.triggers = (doc?.triggers ?? []).map(dumpTrigger);
  return stringifyYaml(out, { indent: 2, lineWidth: 0 });
}

export function newScriptStep(script, config = {}) {
  return {
    uiId: nextUiId("step"),
    kind: "script",
    script,
    config: config && typeof config === "object" && !Array.isArray(config) ? { ...config } : {},
    id: "",
    when: "",
    needs: null,
  };
}

export function newSetStep() {
  return {
    uiId: nextUiId("step"),
    kind: "set",
    script: "set",
    expression: "",
    id: "",
    when: "",
    needs: null,
  };
}

export function newHttpTrigger() {
  return {
    uiId: nextUiId("trig"),
    type: "HTTP",
    method: "POST",
    path: "/new",
    schedule: "",
    auth: null,
    response: "",
    unauthorized: null,
    onConsecutiveFailures: "",
    onFailureWorkflow: "",
  };
}

export function newCronTrigger() {
  return {
    uiId: nextUiId("trig"),
    type: "cron",
    method: "POST",
    path: "",
    schedule: "* * * * *",
    auth: null,
    response: "",
    unauthorized: null,
    onConsecutiveFailures: "",
    onFailureWorkflow: "",
  };
}

export function newWorkflowTrigger() {
  return {
    uiId: nextUiId("trig"),
    type: "workflow",
    method: "POST",
    path: "",
    schedule: "",
    auth: null,
    response: "",
    unauthorized: null,
    onConsecutiveFailures: "",
    onFailureWorkflow: "",
  };
}

export function hasWorkflowTrigger(workflow) {
  return (workflow?.triggers ?? []).some((t) => String(t?.type ?? "").toLowerCase() === "workflow");
}

export function triggerDestinations(workflows, { owner, excludeFile } = {}) {
  return (workflows ?? []).filter((w) => {
    if (owner && w.owner !== owner) return false;
    if (excludeFile && w.file === excludeFile && w.owner === owner) return false;
    return hasWorkflowTrigger(w);
  });
}

export { HTTP_METHODS };

function readOnFailureWorkflow(raw) {
  return typeof raw?.onFailureWorkflow === "string" ? raw.onFailureWorkflow : "";
}

function normalizeStep(step) {
  const uiId = nextUiId("step");
  if (typeof step === "string") {
    return {
      uiId,
      kind: "script",
      script: step,
      config: {},
      id: "",
      when: "",
      needs: null,
    };
  }
  if (step == null || typeof step !== "object" || Array.isArray(step)) {
    return {
      uiId,
      kind: "script",
      script: "",
      config: {},
      id: "",
      when: "",
      needs: null,
    };
  }
  if (step.set != null) {
    const spec = step.set && typeof step.set === "object" ? step.set : {};
    return {
      uiId,
      kind: "set",
      script: "set",
      expression: typeof spec.expression === "string" ? spec.expression : "",
      id: typeof step.id === "string" ? step.id : "",
      when: typeof step.when === "string" ? step.when : "",
      needs: step.needs ?? null,
    };
  }
  const known = new Set(["script", "config", "id", "when", "needs", "set"]);
  /** @type {Record<string, unknown>} */
  const extra = {};
  for (const [key, value] of Object.entries(step)) {
    if (!known.has(key)) extra[key] = value;
  }
  const config =
    step.config && typeof step.config === "object" && !Array.isArray(step.config)
      ? { ...step.config }
      : {};
  return {
    uiId,
    kind: "script",
    script: typeof step.script === "string" ? step.script : "",
    config,
    id: typeof step.id === "string" ? step.id : "",
    when: typeof step.when === "string" ? step.when : "",
    needs: step.needs ?? null,
    extra: Object.keys(extra).length ? extra : undefined,
  };
}

function normalizeTrigger(raw) {
  const uiId = nextUiId("trig");
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    return newHttpTrigger();
  }
  let type = raw.type ?? "HTTP";
  if (String(type).toLowerCase() === "http") type = "HTTP";
  const known =
    type === "HTTP"
      ? new Set([
          "type",
          "method",
          "path",
          "auth",
          "response",
          "unauthorized",
          "onConsecutiveFailures",
          "onFailureWorkflow",
        ])
      : type === "cron"
        ? new Set(["type", "schedule", "onConsecutiveFailures", "onFailureWorkflow"])
        : new Set(["type"]);
  /** @type {Record<string, unknown>} */
  const extra = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!known.has(key)) extra[key] = value;
  }
  return {
    uiId,
    type,
    method: typeof raw.method === "string" && raw.method ? raw.method : "POST",
    path: typeof raw.path === "string" ? raw.path : "",
    schedule: typeof raw.schedule === "string" ? raw.schedule : "",
    onConsecutiveFailures:
      raw.onConsecutiveFailures == null || raw.onConsecutiveFailures === ""
        ? ""
        : String(raw.onConsecutiveFailures),
    onFailureWorkflow: readOnFailureWorkflow(raw),
    auth: Array.isArray(raw.auth) ? raw.auth : null,
    response: typeof raw.response === "string" ? raw.response : "",
    unauthorized: raw.unauthorized ?? null,
    extra: Object.keys(extra).length ? extra : undefined,
  };
}

function dumpStep(step) {
  if (step.kind === "set") {
    /** @type {Record<string, unknown>} */
    const out = {};
    if (step.id) out.id = step.id;
    out.set = {
      expression: step.expression ?? "",
    };
    if (step.when) out.when = step.when;
    if (step.needs != null && !isEmptyNeeds(step.needs)) out.needs = step.needs;
    return out;
  }
  /** @type {Record<string, unknown>} */
  const out = {};
  if (step.id) out.id = step.id;
  out.script = step.script ?? "";
  const config = step.config;
  if (config && typeof config === "object" && !Array.isArray(config) && Object.keys(config).length) {
    out.config = config;
  }
  if (step.when) out.when = step.when;
  if (step.needs != null && !isEmptyNeeds(step.needs)) out.needs = step.needs;
  Object.assign(out, step.extra ?? {});
  return out;
}

function dumpFailureTriggerFields(t, out) {
  if (t.onConsecutiveFailures !== "" && t.onConsecutiveFailures != null) {
    const threshold = Number(t.onConsecutiveFailures);
    if (Number.isFinite(threshold) && threshold > 0) {
      out.onConsecutiveFailures = Math.floor(threshold);
    }
  }
  if (typeof t.onFailureWorkflow === "string" && t.onFailureWorkflow.trim()) {
    out.onFailureWorkflow = t.onFailureWorkflow.trim();
  }
}

function dumpTrigger(t) {
  const type = String(t?.type ?? "").toLowerCase() === "http" ? "HTTP" : t?.type;
  if (type === "HTTP") {
    /** @type {Record<string, unknown>} */
    const out = {
      type: "HTTP",
      method: t.method || "POST",
      path: t.path || "/",
    };
    if (Array.isArray(t.auth) && t.auth.length > 0) out.auth = t.auth;
    if (t.response) out.response = t.response;
    if (t.unauthorized != null && t.unauthorized !== "") out.unauthorized = t.unauthorized;
    dumpFailureTriggerFields(t, out);
    Object.assign(out, t.extra ?? {});
    return out;
  }
  if (type === "cron") {
    /** @type {Record<string, unknown>} */
    const out = { type: "cron", schedule: t.schedule || "" };
    dumpFailureTriggerFields(t, out);
    Object.assign(out, t.extra ?? {});
    return out;
  }
  if (type === "workflow") {
    return { type: "workflow", ...(t.extra ?? {}) };
  }
  return { type: t?.type ?? "HTTP", ...(t.extra ?? {}) };
}

function isEmptyNeeds(needs) {
  if (needs == null) return true;
  if (Array.isArray(needs)) return needs.length === 0;
  if (typeof needs === "object") return Object.keys(needs).length === 0;
  return false;
}
