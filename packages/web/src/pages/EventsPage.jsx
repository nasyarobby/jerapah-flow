import { Link, useSearchParams } from "react-router-dom";
import { useOwners, useRuns } from "../api/hooks.js";
import { formatTime, StatusBadge } from "../lib/format.jsx";

const PAGE_SIZES = [25, 50, 100];
const DEFAULT_LIMIT = 50;
const TRIGGER_TYPES = ["HTTP", "cron", "manual"];

const SORT_COLUMNS = [
  { key: "status", label: "Status" },
  { key: "workflow", label: "Workflow" },
  { key: "revision", label: "Revision" },
  { key: "trigger", label: "Trigger" },
  { key: "started_at", label: "Started" },
  { key: "duration", label: "Duration" },
];

function dateToAfterIso(date) {
  if (!date) return undefined;
  return `${date}T00:00:00.000Z`;
}

function dateToBeforeIso(date) {
  if (!date) return undefined;
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

function SortHeader({ column, label, sort, order, onSort }) {
  const active = sort === column;
  return (
    <th>
      <button
        type="button"
        className={`font-semibold hover:underline ${active ? "" : "opacity-80"}`}
        onClick={() => onSort(column)}
      >
        {label}
        {active ? (order === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </th>
  );
}

export function EventsPage() {
  const [params, setParams] = useSearchParams();
  const workflow = params.get("workflow") || "";
  const status = params.get("status") || "";
  const owner = params.get("owner") || "";
  const trigger = params.get("trigger") || "";
  const afterDate = params.get("after") || "";
  const beforeDate = params.get("before") || "";
  const offset = Math.max(Number(params.get("offset")) || 0, 0);
  const limitParam = Number(params.get("limit"));
  const limit = PAGE_SIZES.includes(limitParam) ? limitParam : DEFAULT_LIMIT;
  const sort = params.get("sort") || "started_at";
  const order = params.get("order") === "asc" ? "asc" : "desc";

  const { data: owners = [] } = useOwners();
  const { data, isLoading } = useRuns({
    workflow: workflow || undefined,
    status: status || undefined,
    owner: owner || undefined,
    trigger: trigger || undefined,
    after: dateToAfterIso(afterDate),
    before: dateToBeforeIso(beforeDate),
    limit,
    offset,
    sort,
    order,
  });

  const runs = data?.runs ?? [];
  const total = data?.total ?? 0;

  function update(key, value, resetOffset = true) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (resetOffset && key !== "offset") next.delete("offset");
    setParams(next);
  }

  function setSort(column) {
    const next = new URLSearchParams(params);
    if (sort === column) {
      next.set("order", order === "asc" ? "desc" : "asc");
    } else {
      next.set("sort", column);
      next.set("order", "desc");
    }
    next.delete("offset");
    setParams(next);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{status === "failed" ? "Failed events" : "Events"}</h1>
      <div className="flex flex-col sm:flex-row flex-wrap gap-2">
        <input
          className="input input-sm w-full sm:max-w-sm"
          placeholder="workflow key (* wildcard)"
          value={workflow}
          onChange={(e) => update("workflow", e.target.value)}
        />
        <select
          className="select select-sm w-full sm:max-w-xs"
          value={status}
          onChange={(e) => update("status", e.target.value)}
        >
          <option value="">all statuses</option>
          <option value="queued">queued</option>
          <option value="running">running</option>
          <option value="success">success</option>
          <option value="failed">failed</option>
          <option value="skipped">skipped</option>
        </select>
        <select
          className="select select-sm w-full sm:max-w-xs"
          value={owner}
          onChange={(e) => update("owner", e.target.value)}
        >
          <option value="">all owners</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <select
          className="select select-sm w-full sm:max-w-xs"
          value={trigger}
          onChange={(e) => update("trigger", e.target.value)}
        >
          <option value="">all triggers</option>
          {TRIGGER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm">
          <span className="opacity-70 whitespace-nowrap">from</span>
          <input
            type="date"
            className="input input-sm"
            value={afterDate}
            onChange={(e) => update("after", e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1 text-sm">
          <span className="opacity-70 whitespace-nowrap">to</span>
          <input
            type="date"
            className="input input-sm"
            value={beforeDate}
            onChange={(e) => update("before", e.target.value)}
          />
        </label>
        <select
          className="select select-sm w-full sm:max-w-[8rem]"
          value={String(limit)}
          onChange={(e) => update("limit", e.target.value)}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size} / page
            </option>
          ))}
        </select>
      </div>
      {isLoading ? (
        <span className="loading loading-spinner" />
      ) : runs.length === 0 ? (
        <p className="text-sm opacity-60">No events match these filters.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  {SORT_COLUMNS.map(({ key, label }) => (
                    <SortHeader
                      key={key}
                      column={key}
                      label={label}
                      sort={sort}
                      order={order}
                      onSort={setSort}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="hover">
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td>
                      <Link className="link" to={`/events/${r.id}`}>
                        {r.workflow_name || r.workflow}
                      </Link>
                    </td>
                    <td className="text-xs opacity-70">
                      {r.workflow_revision != null ? `#${r.workflow_revision}` : "unknown"}
                    </td>
                    <td className="text-xs">
                      {r.trigger_type}
                      {r.trigger_detail ? ` · ${r.trigger_detail}` : ""}
                    </td>
                    <td className="whitespace-nowrap">{formatTime(r.started_at)}</td>
                    <td>{r.duration_ms != null ? `${r.duration_ms}ms` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              className="btn btn-sm"
              disabled={offset <= 0}
              onClick={() => update("offset", String(Math.max(offset - limit, 0)), false)}
            >
              Prev
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={offset + runs.length >= total}
              onClick={() => update("offset", String(offset + limit), false)}
            >
              Next
            </button>
            <span className="opacity-60">
              {total === 0 ? "0" : `${offset + 1}–${offset + runs.length}`} of {total}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
