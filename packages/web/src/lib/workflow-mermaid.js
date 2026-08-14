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

function mermaidLabel(text) {
  return String(text ?? "")
    .replace(/"/g, "#quot;")
    .replace(/[\[\]]/g, " ")
    .trim() || "node";
}

function triggerLabel(t) {
  const type = String(t?.type ?? "").toLowerCase();
  if (type === "cron") return `cron ${t.schedule ?? ""}`.trim();
  const method = t?.method ?? "POST";
  const path = t?.path ?? "";
  return `${method} ${path}`.trim();
}

export function workflowToFlowchart(parsed) {
  /** @type {Record<string, string>} */
  const scriptIds = {};
  if (!parsed || typeof parsed !== "object") {
    return { chart: "", scriptIds };
  }

  const lines = ["flowchart LR"];

  const triggerIds = [];
  const triggers = Array.isArray(parsed.triggers) ? parsed.triggers : [];
  triggers.forEach((t, i) => {
    const id = `t${i}`;
    lines.push(`  ${id}(["${mermaidLabel(triggerLabel(t))}"])`);
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
    const label = s.id ? `${s.id}: ${s.script}` : s.script;
    lines.push(`  ${s.mermaidId}["${mermaidLabel(label)}"]`);
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
        if (from) lines.push(`  ${from} --> ${s.mermaidId}`);
      }
    }
    for (const tid of triggerIds) {
      for (const rid of roots) {
        lines.push(`  ${tid} --> ${rid}`);
      }
    }
  } else {
    let prev = null;
    let firstScript = null;
    for (const s of parsedSteps) {
      if (!firstScript) firstScript = s.mermaidId;
      if (prev) lines.push(`  ${prev} --> ${s.mermaidId}`);
      prev = s.mermaidId;
    }
    if (firstScript) {
      for (const tid of triggerIds) {
        lines.push(`  ${tid} --> ${firstScript}`);
      }
    }
  }

  if (lines.length === 1) {
    return { chart: "", scriptIds };
  }

  return { chart: lines.join("\n"), scriptIds };
}
