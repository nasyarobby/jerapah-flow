import { namespacedPath } from "./workflow-parse.js";

/**
 * @param {unknown} value
 */
function triggerTypesMatch(left, right) {
  return String(left ?? "").toLowerCase() === String(right ?? "").toLowerCase();
}

/**
 * @param {unknown} rawTrigger
 * @param {string} owner
 * @param {{ type: string, detail?: string | null }} runtimeTrigger
 */
export function findTriggerSpec(rawTrigger, owner, runtimeTrigger) {
  if (rawTrigger == null || typeof rawTrigger !== "object" || Array.isArray(rawTrigger)) {
    return null;
  }
  const trigger = /** @type {Record<string, unknown>} */ (rawTrigger);
  if (!triggerTypesMatch(trigger.type, runtimeTrigger.type)) return null;

  const type = String(runtimeTrigger.type).toLowerCase();
  if (type === "cron") {
    return trigger.schedule === runtimeTrigger.detail ? trigger : null;
  }
  if (type === "http") {
    const method = String(trigger.method ?? "POST").toUpperCase();
    const url = namespacedPath(owner, String(trigger.path ?? ""));
    const detail = `${method} ${url}`;
    return detail === runtimeTrigger.detail ? trigger : null;
  }
  return null;
}

/**
 * @param {unknown} workflow
 * @param {string} owner
 * @param {{ type: string, detail?: string | null }} runtimeTrigger
 */
export function resolveFailureTriggerConfig(workflow, owner, runtimeTrigger) {
  const type = String(runtimeTrigger.type).toLowerCase();
  if (type !== "cron" && type !== "http") return null;

  for (const raw of workflow?.triggers ?? []) {
    const spec = findTriggerSpec(raw, owner, runtimeTrigger);
    if (!spec) continue;

    const threshold = Number(spec.onConsecutiveFailures);
    const workflowName = onFailureWorkflowName(spec);
    const disableOnConsecutiveFailures = isDisableOnConsecutiveFailures(spec);
    if (
      !Number.isFinite(threshold) ||
      threshold < 1 ||
      (workflowName.length === 0 && !disableOnConsecutiveFailures)
    ) {
      return null;
    }
    return {
      threshold: Math.floor(threshold),
      workflowName: workflowName.length > 0 ? workflowName : null,
      disableOnConsecutiveFailures,
    };
  }
  return null;
}

/**
 * @param {Record<string, unknown>} trigger
 */
function onFailureWorkflowName(trigger) {
  const value = trigger?.onFailureWorkflow;
  return typeof value === "string" ? value.trim() : "";
}

/**
 * @param {Record<string, unknown>} trigger
 */
export function isDisableOnConsecutiveFailures(trigger) {
  return trigger?.disableOnConsecutiveFailures === true;
}

/**
 * @param {unknown} workflow
 */
export async function validateWorkflowFailureTriggers(workflow) {
  if (!workflow || typeof workflow !== "object") return;

  for (const raw of workflow.triggers ?? []) {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const trigger = /** @type {Record<string, unknown>} */ (raw);
    const type = String(trigger.type ?? "").toLowerCase();
    if (type !== "cron" && type !== "http") continue;

    const hasThreshold =
      trigger.onConsecutiveFailures != null && trigger.onConsecutiveFailures !== "";
    const hasWorkflow = onFailureWorkflowName(trigger).length > 0;
    const hasDisable = isDisableOnConsecutiveFailures(trigger);

    if (!hasThreshold && !hasWorkflow && !hasDisable) continue;

    if (!hasThreshold || (!hasWorkflow && !hasDisable)) {
      const err = new Error(
        "onConsecutiveFailures requires onFailureWorkflow and/or disableOnConsecutiveFailures",
      );
      err.statusCode = 400;
      throw err;
    }

    const threshold = Number(trigger.onConsecutiveFailures);
    if (!Number.isFinite(threshold) || threshold < 1) {
      const err = new Error("onConsecutiveFailures must be a positive number");
      err.statusCode = 400;
      throw err;
    }
  }
}

/**
 * @param {{
 *   sourceKey: string,
 *   sourceName?: string | null,
 *   owner: string,
 *   trigger: { type: string, detail?: string | null },
 *   consecutiveFailures: number,
 *   runId: string,
 *   error: string,
 * }} opts
 */
export function buildFailureAlertData(opts) {
  return {
    kind: "workflow-failure-alert",
    sourceWorkflow: opts.sourceKey,
    sourceWorkflowName: opts.sourceName ?? null,
    owner: opts.owner,
    triggerType: opts.trigger.type,
    triggerDetail: opts.trigger.detail ?? null,
    consecutiveFailures: opts.consecutiveFailures,
    runId: opts.runId,
    error: opts.error,
  };
}
