export const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

export function namespacedPath(owner, triggerPath) {
  const cleaned = String(triggerPath ?? "").replace(/^\/+/, "").trim();
  return `/u/${owner}/${cleaned}`;
}

export function hasWorkflowTrigger(workflow) {
  if (!workflow || typeof workflow !== "object") return false;
  const triggers = workflow.triggers;
  if (!Array.isArray(triggers)) return false;
  return triggers.some((t) => String(t?.type ?? "").toLowerCase() === "workflow");
}
