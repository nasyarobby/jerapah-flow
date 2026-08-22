import { useEffect, useMemo, useRef, useState } from "react";
import { LuChevronDown, LuX } from "react-icons/lu";
import { FormInput } from "../FormControls.jsx";

/**
 * Searchable dropdown: pick an auth to add; chips with X to remove.
 * YAML stores profile UUIDs; UI shows names.
 */
export function AuthPicker({ auths, selectedIds, inlineCount, disabled, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const byId = useMemo(() => new Map(auths.map((a) => [a.id, a])), [auths]);

  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return auths
      .filter((a) => !selectedSet.has(a.id))
      .filter((a) => {
        if (!q) return true;
        return (
          a.name.toLowerCase().includes(q) ||
          String(a.type).toLowerCase().includes(q) ||
          a.id.toLowerCase().includes(q)
        );
      });
  }, [auths, selectedSet, query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function addAuth(id) {
    if (selectedSet.has(id)) return;
    onChange([...selectedIds, id]);
    setQuery("");
    setOpen(false);
  }

  function removeAuth(id) {
    onChange(selectedIds.filter((x) => x !== id));
  }

  return (
    <div className="flex w-full flex-col gap-1" ref={rootRef}>
      <span className="text-sm font-medium opacity-80">Auth (any of)</span>

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedIds.map((id) => {
            const auth = byId.get(id);
            return (
              <span
                key={id}
                className="badge badge-outline gap-1 h-7 px-2 font-normal"
                title={id}
              >
                <span className="max-w-[10rem] truncate">
                  {auth ? (
                    <>
                      {auth.name}
                      <span className="opacity-60"> · {auth.type}</span>
                    </>
                  ) : (
                    <span className="opacity-60">missing</span>
                  )}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs btn-square -mr-1"
                  title="Remove"
                  aria-label={`Remove ${auth?.name ?? id}`}
                  disabled={disabled}
                  onClick={() => removeAuth(id)}
                >
                  <LuX className="size-3.5" />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="relative w-full">
        <div className="join w-full">
          <FormInput
            ref={inputRef}
            type="search"
            className="join-item w-full min-w-0"
            placeholder={auths.length === 0 ? "No auth profiles yet" : "Add auth…"}
            value={query}
            disabled={disabled || auths.length === 0}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                setQuery("");
                inputRef.current?.blur();
              }
              if (e.key === "Enter") {
                e.preventDefault();
                if (available[0]) addAuth(available[0].id);
              }
            }}
          />
          <button
            type="button"
            className="btn btn-sm join-item btn-square"
            disabled={disabled || auths.length === 0}
            aria-label="Open auth list"
            onClick={() => {
              setOpen((v) => !v);
              if (!open) inputRef.current?.focus();
            }}
          >
            <LuChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
        {open && !disabled && auths.length > 0 ? (
          <ul className="menu menu-sm absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-box border border-base-300 bg-base-100 shadow-lg p-1">
            {available.length === 0 ? (
              <li className="disabled">
                <span className="opacity-60">
                  {query.trim() ? "No matches" : "All profiles selected"}
                </span>
              </li>
            ) : (
              available.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => addAuth(a.id)}>
                    <span className="font-mono text-sm">{a.name}</span>
                    <span className="opacity-60 text-xs">{a.type}</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>

      {inlineCount > 0 ? (
        <span className="text-xs opacity-60">
          + {inlineCount} inline auth{inlineCount === 1 ? "" : "s"} (edit in YAML)
        </span>
      ) : null}
    </div>
  );
}
