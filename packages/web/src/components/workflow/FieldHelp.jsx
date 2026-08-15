import { LuCircleHelp } from "react-icons/lu";

export function FieldHelp({ description }) {
  if (!description) return null;
  const long = String(description).length > 80;
  return (
    <div className="tooltip tooltip-top" {...(long ? {} : { "data-tip": description })}>
      {long ? (
        <div className="tooltip-content">
          <p className="max-w-xs text-left text-xs whitespace-pre-wrap">{description}</p>
        </div>
      ) : null}
      <button type="button" className="btn btn-ghost btn-xs btn-circle" aria-label={description}>
        <LuCircleHelp className="size-3.5 opacity-60" />
      </button>
    </div>
  );
}

export function FieldLabel({ name, required, description, children }) {
  return (
    <div className="flex items-center gap-1">
      <span className="font-mono text-sm">{name}</span>
      {required ? <span className="text-error text-xs">*</span> : null}
      <FieldHelp description={description} />
      {children}
    </div>
  );
}
