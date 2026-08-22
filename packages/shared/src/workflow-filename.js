export function ensureWorkflowFilename(file) {
  const trimmed = String(file ?? "").trim();
  if (!trimmed) return "";
  return /\.ya?ml$/i.test(trimmed) ? trimmed : `${trimmed}.yaml`;
}

/**
 * Legacy human-readable copy name (kept for UI hints).
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
