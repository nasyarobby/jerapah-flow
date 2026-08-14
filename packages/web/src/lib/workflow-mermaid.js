function sanitize(label) {
  const cleaned = String(label ?? "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
  return cleaned || "node";
}

function parseStep(step) {
  if (typeof step === "string") {
    return { script: step, id: null, needs: null };
  }
  if (step?.script) {
    return {
      script: step.script,
      id: typeof step.id === "string" && step.id ? step.id : null,
      needs: step.needs ?? null,
    };
  }
  return null;
}

function parentIdsFromNeeds(needs) {
  if (needs == null) return null;
  if (Array.isArray(needs)) {
    return needs.filter((x) => typeof x === "string" && x.length > 0);
  }
  if (typeof needs === "object") {
    return Object.values(needs).filter((x) => typeof x === "string" && x.length > 0);
  }
  return [];
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
  const parsedSteps = [];
  scripts.forEach((step, i) => {
    const parsedStep = parseStep(step);
    if (!parsedStep) return;
    parsedSteps.push({ ...parsedStep, mermaidId: `s${i}` });
  });

  const dagMode = parsedSteps.some((s) => s.needs != null);

  /** @type {Record<string, string>} */
  const idToMermaid = {};
  for (const s of parsedSteps) {
    if (s.id) idToMermaid[s.id] = s.mermaidId;
  }

  for (const s of parsedSteps) {
    scriptIds[s.mermaidId] = s.script;
    lines.push(
      `    service ${s.mermaidId}(server)[${sanitize(s.id || s.script)}] in ${groupId}`,
    );
  }

  if (dagMode) {
    const roots = [];
    for (const s of parsedSteps) {
      const parents = parentIdsFromNeeds(s.needs);
      if (!parents || parents.length === 0) {
        roots.push(s.mermaidId);
        continue;
      }
      for (const pid of parents) {
        const from = idToMermaid[pid];
        if (from) lines.push(`    ${from}:R -- L:${s.mermaidId}`);
      }
    }
    for (const tid of triggerIds) {
      for (const rid of roots) {
        lines.push(`    ${tid}:R -- L:${rid}`);
      }
    }
  } else {
    let prev = null;
    let firstScript = null;
    for (const s of parsedSteps) {
      if (!firstScript) firstScript = s.mermaidId;
      if (prev) lines.push(`    ${prev}:R -- L:${s.mermaidId}`);
      prev = s.mermaidId;
    }
    if (firstScript) {
      for (const tid of triggerIds) {
        lines.push(`    ${tid}:R -- L:${firstScript}`);
      }
    }
  }

  if (triggerIds.length >= 2) {
    lines.push(`    align column ${triggerIds.join(" ")}`);
  }

  return { chart: lines.join("\n"), scriptIds };
}
