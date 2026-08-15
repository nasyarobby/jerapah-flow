import { useMemo, useState } from "react";
import { useScripts } from "../../api/hooks.js";

export function AddScriptDialog({ open, onClose, onPick }) {
  const { data: scripts = [], isLoading } = useScripts();
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = scripts.map((s) => ({
      name: typeof s === "string" ? s : s.name,
      description: typeof s === "string" ? "" : s.meta?.description ?? "",
      meta: typeof s === "string" ? null : s.meta,
      metaError: typeof s === "string" ? null : s.metaError,
    }));
    if (!term) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        s.description.toLowerCase().includes(term),
    );
  }, [scripts, q]);

  if (!open) return null;

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-lg">
        <h3 className="font-bold text-lg">Add script</h3>
        <input
          className="input input-sm w-full mt-3"
          placeholder="Search scripts"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        <ul className="menu mt-3 max-h-80 overflow-auto rounded-box border border-base-300 p-0">
          <li>
            <button
              type="button"
              onClick={() => {
                onPick({ kind: "set" });
                setQ("");
              }}
            >
              <span className="font-semibold">Set (JSONata)</span>
              <span className="text-xs opacity-70">Assign a JSONata result to a variable</span>
            </button>
          </li>
          {isLoading ? (
            <li className="p-4">
              <span className="loading loading-spinner loading-sm" />
            </li>
          ) : (
            filtered.map((s) => (
              <li key={s.name}>
                <button
                  type="button"
                  onClick={() => {
                    onPick({ kind: "script", name: s.name, meta: s.meta });
                    setQ("");
                  }}
                >
                  <span className="font-mono">{s.name}</span>
                  <span className="text-xs opacity-70 line-clamp-2">
                    {s.metaError ? s.metaError : s.description || "No description"}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="modal-action">
          <button
            type="button"
            className="btn"
            onClick={() => {
              setQ("");
              onClose();
            }}
          >
            Cancel
          </button>
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button
          type="button"
          onClick={() => {
            setQ("");
            onClose();
          }}
        >
          close
        </button>
      </form>
    </dialog>
  );
}
