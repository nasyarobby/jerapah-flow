import * as store from "../../store.js";

/**
 * @param {Record<string, string | undefined>} q
 */
export function parseRunQueryParams(q) {
  const limit = q.limit != null ? Number(q.limit) : undefined;
  const offset = q.offset != null ? Number(q.offset) : undefined;
  return {
    owner: q.owner || undefined,
    workflow: q.workflow || undefined,
    status: q.status || undefined,
    trigger_type: q.trigger || undefined,
    after: q.after || undefined,
    before: q.before || undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
    offset: Number.isFinite(offset) ? offset : undefined,
    sort: q.sort || undefined,
    order: q.order || undefined,
  };
}

/**
 * @param {Record<string, string | undefined>} q
 */
export async function queryRunsFromRequest(q) {
  return store.queryRuns(parseRunQueryParams(q));
}
