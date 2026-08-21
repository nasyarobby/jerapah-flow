function parseStep(step) {
  if (typeof step === "string") {
    return { kind: "script", script: step, profile: null, id: null, needs: null, when: null };
  }
  if (step?.set) {
    return {
      kind: "set",
      script: null,
      profile: null,
      id: typeof step.id === "string" && step.id ? step.id : null,
      needs: step.needs ?? null,
      when: typeof step.when === "string" && step.when ? step.when : null,
    };
  }
  if (step?.script || step?.profile) {
    return {
      kind: "script",
      script: typeof step.script === "string" && step.script ? step.script : null,
      profile: typeof step.profile === "string" && step.profile ? step.profile : null,
      id: typeof step.id === "string" && step.id ? step.id : null,
      needs: step.needs ?? null,
      when: typeof step.when === "string" && step.when ? step.when : null,
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
    .replace(/[[\]]/g, " ")
    .trim() || "node";
}

function triggerLabel(t) {
  const type = String(t?.type ?? "").toLowerCase();
  if (type === "cron") return `cron ${t.schedule ?? ""}`.trim();
  if (type === "workflow") return "workflow";
  const method = t?.method ?? "POST";
  const path = t?.path ?? "";
  return `${method} ${path}`.trim();
}

function stepLabel(s) {
  if (s.kind === "set") {
    const base = s.id ? `${s.id}: set` : "set";
    return s.when ? `${base} when: ${s.when}` : base;
  }
  const target = s.profile ? `profile ${s.profile}` : s.script;
  const base = s.id ? `${s.id}: ${target}` : target;
  return s.when ? `${base} when: ${s.when}` : base;
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
    let outbound = id;
    if (t?.auth != null && t.auth !== false) {
      const authId = `${id}auth`;
      const label =
        typeof t.auth === "string"
          ? `auth ${t.auth}`
          : typeof t.auth === "object" && t.auth?.name
            ? `auth ${t.auth.name}`
            : typeof t.auth === "object" && t.auth?.type
              ? `auth ${t.auth.type}`
              : "auth";
      lines.push(`  ${authId}(["${mermaidLabel(label)}"])`);
      lines.push(`  ${id} --> ${authId}`);
      outbound = authId;
    }
    triggerIds.push(outbound);
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
    const label = mermaidLabel(stepLabel(s));
    if (s.kind === "set") {
      lines.push(`  ${s.mermaidId}(["${label}"])`);
    } else {
      scriptIds[s.mermaidId] = s.script || (s.profile ? `profile:${s.profile}` : "");
      lines.push(`  ${s.mermaidId}["${label}"]`);
    }
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
