import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LuTrash2 } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import { useDeleteKv, useKv, useKvNamespaces } from "../api/hooks.js";
import { ConfirmDialog } from "../components/ConfirmDialog.jsx";
import { FormSelect } from "../components/FormControls.jsx";
import { formatTime } from "../lib/format";

const PAGE_SIZE = 50;

function previewValue(value) {
  const json = JSON.stringify(value);
  if (json == null) return "—";
  if (json.length <= 120) return json;
  return `${json.slice(0, 120)}…`;
}

export function KvPage() {
  const [params, setParams] = useSearchParams();
  const namespace = params.get("namespace") || "";
  const q = params.get("q") || "";
  const offset = Math.max(Number(params.get("offset")) || 0, 0);
  const [expanded, setExpanded] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const { data: namespaces = [] } = useKvNamespaces();
  const del = useDeleteKv();
  const { data, isLoading } = useKv({
    namespace: namespace || undefined,
    q: q || undefined,
    limit: PAGE_SIZE,
    offset,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const limit = data?.limit ?? PAGE_SIZE;

  function update(key, value, resetOffset = true) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (resetOffset && key !== "offset") next.delete("offset");
    setParams(next);
    setExpanded(null);
  }

  function rowId(item) {
    return `${item.namespace}\0${item.key}`;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">KV</h1>
      <div className="flex flex-col sm:flex-row gap-2">
        <FormSelect
          className="w-full sm:max-w-xs"
          value={namespace}
          onChange={(e) => update("namespace", e.target.value)}
        >
          <option value="">all namespaces</option>
          {namespaces.map((ns) => (
            <option key={ns} value={ns}>
              {ns}
            </option>
          ))}
        </FormSelect>
        <input
          className="input input-sm w-full sm:max-w-sm"
          placeholder="search key or value"
          value={q}
          onChange={(e) => update("q", e.target.value)}
        />
      </div>
      {isLoading ? (
        <span className="loading loading-spinner" />
      ) : items.length === 0 ? (
        <p className="text-sm opacity-60">No KV entries.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Namespace</th>
                  <th>Key</th>
                  <th>Value</th>
                  <th>Updated</th>
                  <th>Expires</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const id = rowId(item);
                  const open = expanded === id;
                  return (
                    <tr
                      key={id}
                      className="hover cursor-pointer"
                      onClick={() => setExpanded(open ? null : id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setExpanded(open ? null : id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={open}
                    >
                      <td className="font-mono text-xs align-top">{item.namespace}</td>
                      <td className="font-mono text-xs align-top">{item.key}</td>
                      <td className="align-top">
                        {open ? (
                          <pre className="text-xs whitespace-pre-wrap break-all max-w-xl">
                            {JSON.stringify(item.value, null, 2)}
                          </pre>
                        ) : (
                          <span className="font-mono text-xs">{previewValue(item.value)}</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap align-top">{formatTime(item.updatedAt)}</td>
                      <td className="whitespace-nowrap align-top">
                        {item.expiresAt ? formatTime(item.expiresAt) : "—"}
                      </td>
                      <td className="text-right whitespace-nowrap align-top">
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs text-error"
                          title="Delete"
                          aria-label="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(item);
                          }}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          <LuTrash2 className="size-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
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
              disabled={offset + items.length >= total}
              onClick={() => update("offset", String(offset + limit), false)}
            >
              Next
            </button>
            <span className="opacity-60">
              {total === 0 ? "0" : `${offset + 1}–${offset + items.length}`} of {total}
            </span>
          </div>
        </>
      )}

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title={
          confirmDelete ? `Delete ${confirmDelete.namespace}/${confirmDelete.key}?` : ""
        }
        message="This cannot be undone. Scripts that read this key will get null."
        error={del.isError ? errorMessage(del.error) : null}
        loading={del.isPending}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() =>
          del.mutate(
            { namespace: confirmDelete.namespace, key: confirmDelete.key },
            {
              onSuccess: () => {
                const id = rowId(confirmDelete);
                setConfirmDelete(null);
                setExpanded((current) => (current === id ? null : current));
              },
            },
          )
        }
      />
    </div>
  );
}
