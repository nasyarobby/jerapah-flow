export function parseScriptStep(step) {
  if (typeof step === "string") return { script: step, config: null };
  if (step?.script) return { script: step.script, config: step.config ?? null };
  throw new Error(`Invalid script step: ${JSON.stringify(step)}`);
}

/**
 * Resolve an HTTP path under the owner namespace: /notify -> /u/alice/notify
 * @param {string} owner
 * @param {string} triggerPath
 */
export function namespacedPath(owner, triggerPath) {
  const cleaned = String(triggerPath).replace(/^\/+/, "");
  return `/u/${owner}/${cleaned}`;
}
