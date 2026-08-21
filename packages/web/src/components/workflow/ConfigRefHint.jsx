import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LuEye, LuEyeOff, LuExternalLink } from "react-icons/lu";
import { useVariables } from "../../api/hooks.js";

const VAR_PEEK_MAX = 48;

const CONFIG_REF_PREFIXES = [
  { prefix: "$SECRET_", label: "secret" },
  { prefix: "$CONTEXT_", label: "context" },
  { prefix: "$VAR_", label: "variable" },
];

function describeConfigRef(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  for (const { prefix, label } of CONFIG_REF_PREFIXES) {
    if (trimmed.startsWith(prefix) && trimmed.length > prefix.length) {
      return { label, name: trimmed.slice(prefix.length), kind: prefix };
    }
  }
  return null;
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

/** Edit-time lookup for `$VAR_` against workflow owner (not a runtime guarantee). */
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
  const isVar = ref?.kind === "$VAR_";
  const { data: variables = [], isPending } = useVariables(undefined, { enabled: isVar });
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setRevealed(false);
  }, [value, owner]);

  if (!ref) return null;

  if (!isVar) {
    return (
      <p className="text-xs opacity-60">
        from {ref.label} <span className="font-mono">{ref.name}</span>
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
