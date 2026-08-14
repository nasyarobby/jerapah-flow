function sanitize(label) {
  const cleaned = String(label ?? "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return cleaned || "node";
}

function parseStep(step) {
  if (typeof step === "string") return step;
  if (step?.script) return step.script;
  return null;
}

export function workflowToArchitecture(parsed) {
  /** @type {Record<string, string>} */
  const scriptIds = {};
  if (!parsed || typeof parsed !== "object") {
    return { chart: "", scriptIds };
  }

  const groupId = "wf";
  const name = sanitize(parsed.name || "workflow");
  const lines = ["architecture-beta", `    group ${groupId}[${name}]`];

  const triggerIds = [];
  const triggers = Array.isArray(parsed.triggers) ? parsed.triggers : [];
  triggers.forEach((t, i) => {
    const id = `t${i}`;
    const icon = t?.type === "cron" ? "cloud" : "internet";
    const label =
      t?.type === "cron"
        ? `cron ${t.schedule ?? ""}`
        : `${t?.method ?? "POST"} ${t?.path ?? ""}`;
    lines.push(`    service ${id}(${icon})[${sanitize(label)}] in ${groupId}`);
    triggerIds.push(id);
  });

  const scripts = Array.isArray(parsed.scripts) ? parsed.scripts : [];
  let prev = null;
  let firstScript = null;
  scripts.forEach((step, i) => {
    const script = parseStep(step);
    if (!script) return;
    const id = `s${i}`;
    scriptIds[id] = script;
    lines.push(`    service ${id}(server)[${sanitize(script)}] in ${groupId}`);
    if (!firstScript) firstScript = id;
    if (prev) lines.push(`    ${prev}:R -- L:${id}`);
    prev = id;
  });

  // All triggers point at the first script (not chained to each other).
  if (firstScript) {
    for (const tid of triggerIds) {
      lines.push(`    ${tid}:R -- L:${firstScript}`);
    }
  }

  // Keep multiple triggers in one column so they don't overlap.
  if (triggerIds.length >= 2) {
    lines.push(`    align column ${triggerIds.join(" ")}`);
  }

  return { chart: lines.join("\n"), scriptIds };
}
