import { useMemo, useState } from "react";
import { useProfiles, useScripts } from "../../api/hooks.js";
import { ScriptIcon } from "../ScriptIcon.jsx";
import { scriptTags } from "../../lib/script.js";

export function AddScriptDialog({ open, onClose, onPick, owner }) {
  const { data: scripts = [], isLoading } = useScripts();
  const { data: profiles = [], isLoading: profilesLoading } = useProfiles(
    owner || undefined,
    { enabled: open && Boolean(owner) },
  );
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("scripts");

  const filteredScripts = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = scripts.map((s) => ({
      name: typeof s === "string" ? s : s.name,
      description: typeof s === "string" ? "" : s.meta?.description ?? "",
      meta: typeof s === "string" ? null : s.meta,
      metaError: typeof s === "string" ? null : s.metaError,
      hasIcon: typeof s === "string" ? undefined : s.hasIcon,
      tags: typeof s === "string" ? [] : scriptTags(s.meta),
    }));
    if (!term) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(term) ||
        s.description.toLowerCase().includes(term) ||
        s.tags.some((t) => t.toLowerCase().includes(term)),
    );
  }, [scripts, q]);

  const filteredProfiles = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return profiles;
    return profiles.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        String(p.script ?? "").toLowerCase().includes(term) ||
        String(p.description ?? "").toLowerCase().includes(term),
    );
  }, [profiles, q]);

  if (!open) return null;

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-lg">
        <h3 className="font-bold text-lg">Add step</h3>
        <div role="tablist" className="tabs tabs-box mt-3 w-full">
          <button
            type="button"
            role="tab"
            className={`tab ${tab === "scripts" ? "tab-active" : ""}`}
            onClick={() => setTab("scripts")}
          >
            Scripts
          </button>
          <button
            type="button"
            role="tab"
            className={`tab ${tab === "profiles" ? "tab-active" : ""}`}
            onClick={() => setTab("profiles")}
          >
            Profiles
          </button>
        </div>
        <input
          className="input input-sm w-full mt-3"
          placeholder={tab === "profiles" ? "Search profiles" : "Search scripts"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
        {tab === "scripts" ? (
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
                <span className="text-xs opacity-70">
                  JSONata over ctx; result becomes the next step’s data
                </span>
              </button>
            </li>
            {isLoading ? (
              <li className="p-4">
                <span className="loading loading-spinner loading-sm" />
              </li>
            ) : (
              filteredScripts.map((s) => (
                <li key={s.name}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick({ kind: "script", name: s.name, meta: s.meta });
                      setQ("");
                    }}
                  >
                    <ScriptIcon name={s.name} hasIcon={s.hasIcon} className="size-8 shrink-0" />
                    <span className="min-w-0">
                      <span className="font-mono">{s.name}</span>
                      <span className="text-xs opacity-70 line-clamp-2 block">
                        {s.metaError ? s.metaError : s.description || "No description"}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : (
          <ul className="menu mt-3 max-h-80 overflow-auto rounded-box border border-accent/40 p-0">
            {!owner ? (
              <li className="p-4 text-sm opacity-60">Save the workflow with an owner first.</li>
            ) : profilesLoading ? (
              <li className="p-4">
                <span className="loading loading-spinner loading-sm" />
              </li>
            ) : filteredProfiles.length === 0 ? (
              <li className="p-4 text-sm opacity-60">No profiles for this owner.</li>
            ) : (
              filteredProfiles.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick({
                        kind: "profile",
                        name: p.name,
                        script: p.script,
                      });
                      setQ("");
                    }}
                  >
                    <ScriptIcon name={p.script} className="size-8 shrink-0" />
                    <span className="min-w-0">
                      <span className="font-mono">{p.name}</span>
                      <span className="text-xs opacity-70 line-clamp-2 block">
                        {p.script}
                        {p.description ? ` · ${p.description}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
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
