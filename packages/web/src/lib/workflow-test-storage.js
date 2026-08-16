const PREFIX = "jerapah-flow.workflowTestData:";

export function workflowTestStorageKey(owner, file) {
  return `${PREFIX}${owner}/${file}`;
}

function isPlainObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/** Overlay saved test JSON on the schema/YAML seed. Stored object keys win. */
export function overlayWorkflowTestData(seed, stored) {
  const base = isPlainObject(seed) ? seed : {};
  if (stored == null) return base;
  if (isPlainObject(stored)) return { ...base, ...stored };
  return stored;
}

export function readWorkflowTestData(owner, file) {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(workflowTestStorageKey(owner, file));
    if (raw == null || raw === "") return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function writeWorkflowTestData(owner, file, data) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(workflowTestStorageKey(owner, file), JSON.stringify(data));
  } catch {
    // quota / private mode
  }
}
