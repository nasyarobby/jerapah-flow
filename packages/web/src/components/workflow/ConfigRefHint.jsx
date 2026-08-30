import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LuEye, LuEyeOff, LuExternalLink } from "react-icons/lu";
import { useVariables } from "../../api/hooks.js";

const VAR_PEEK_MAX = 48;
const MUSTACHE_RE =
  /\{\{\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)\s*\}\}/g;

/**
 * @param {unknown} value
 * @returns {{
 *   kind: "mustache",
 *   path?: string,
 *   root?: string,
 *   name?: string,
 * } | null}
 */
function describeConfigRef(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  MUSTACHE_RE.lastIndex = 0;
  const match = MUSTACHE_RE.exec(trimmed);
  if (!match) return null;
  const path = match[1];
  const root = path.split(".")[0];
  return { kind: "mustache", path, root, name: path.slice(root.length + 1) };
}

function formatVarDisplay(value) {
  if (typeof value === "string") return value === "" ? '""' : value;
  return String(value);
}

function truncatePeek(text, maxLen = VAR_PEEK_MAX) {
  if (!text) return "";
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1))}…`;
}

/** Edit-time lookup for `{{ vars.name }}` against workflow owner (not a runtime guarantee). */
function lookupVariable(variables, owner, name) {
  const list = Array.isArray(variables) ? variables : [];
  const match = list.find((v) => v.owner === owner && v.name === name);
  if (match) {
    return { status: "found", value: match.value, type: match.type };
  }
  const otherOwners = [
    ...new Set(list.filter((v) => v.name === name && v.owner !== owner).map((v) => v.owner)),
  ];
  if (otherOwners.length > 0) {
    return { status: "other_owner", otherOwners };
  }
  return { status: "missing" };
}

function variablesDeepLink({ owner, name, missing }) {
  if (missing) {
    const params = new URLSearchParams();
    if (owner) params.set("owner", owner);
    if (name) params.set("name", name);
    const q = params.toString();
    return q ? `/variables/new?${q}` : "/variables/new";
  }
  return `/variables/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/edit`;
}

export function ConfigRefHint({ value, owner }) {
  const ref = describeConfigRef(value);
  const isVar = ref?.kind === "mustache" && ref.root === "vars" && Boolean(ref.name);
  const { data: variables = [], isPending } = useVariables(undefined, { enabled: isVar });
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(false);
  }, [value, owner]);

  if (!ref) return null;

  if (!isVar) {
    const label =
      ref.root === "secrets"
        ? "secret"
        : ref.root === "context"
          ? "context"
          : ref.root === "data"
            ? "data"
            : "expression";
    return (
      <p className="text-xs opacity-60">
        from {label} <span className="font-mono">{ref.path}</span>
      </p>
    );
  }

  const lookup = !owner
    ? { status: "missing" }
    : isPending
      ? { status: "loading" }
      : lookupVariable(variables, owner, ref.name);
  const linkTo = variablesDeepLink({
    owner: owner || "",
    name: ref.name,
    missing: lookup.status !== "found",
  });

  let statusNote = null;
  if (lookup.status === "missing") {
    statusNote = <span className="text-warning">(missing)</span>;
  } else if (lookup.status === "other_owner") {
    statusNote = (
      <span className="text-warning">
        (missing · other owner: {lookup.otherOwners.join(", ")})
      </span>
    );
  }

  const fullText = lookup.status === "found" ? formatVarDisplay(lookup.value) : "";
  const peek = truncatePeek(fullText);
  const masked = lookup.status === "found" ? "******" : null;

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs opacity-60">
      <span>
        from variable <span className="font-mono">{ref.name}</span>
        {lookup.status === "found" ? ":" : null}
      </span>
      {lookup.status === "found" ? (
        <>
          <span className="font-mono" title={revealed ? fullText : undefined}>
            {revealed ? peek : masked}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-xs btn-square h-5 min-h-0 w-5"
            aria-label={revealed ? "Hide value" : "Show value"}
            title={revealed ? "Hide value" : "Show value"}
            onClick={() => setRevealed((v) => !v)}
          >
            {revealed ? <LuEyeOff className="size-3" /> : <LuEye className="size-3" />}
          </button>
        </>
      ) : null}
      {statusNote}
      {lookup.status === "loading" ? null : (
        <Link
          to={linkTo}
          target="_blank"
          rel="noopener noreferrer"
          className="link link-hover inline-flex items-center gap-0.5"
        >
          {lookup.status === "found" ? "Open Variables" : "Create on Variables"}
          <LuExternalLink className="size-3" aria-hidden />
        </Link>
      )}
    </div>
  );
}
