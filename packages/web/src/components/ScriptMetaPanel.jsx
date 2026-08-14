function FieldTable({ title, fields }) {
  const entries = Object.entries(fields ?? {});
  if (entries.length === 0) return null;

  return (
    <div>
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide opacity-60">{title}</h3>
      <div className="overflow-x-auto">
        <table className="table table-xs">
          <thead>
            <tr>
              <th>Field</th>
              <th>Type</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([name, spec]) => {
              const field = spec && typeof spec === "object" ? spec : { description: String(spec) };
              const notes = [
                field.required ? "required" : null,
                field.default !== undefined ? `default ${JSON.stringify(field.default)}` : null,
                field.description,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <tr key={name}>
                  <td className="font-mono">{name}</td>
                  <td className="opacity-70">{field.type ?? ""}</td>
                  <td className="opacity-80">{notes}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ScriptMetaPanel({ meta, metaError, className = "" }) {
  if (metaError) {
    return <p className={`text-error text-sm ${className}`}>Meta: {metaError}</p>;
  }
  if (!meta) {
    return (
      <p className={`text-sm opacity-50 ${className}`}>
        No script.meta on the default export
      </p>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {meta.description ? <p className="text-sm">{meta.description}</p> : null}
      <div className="grid gap-3 md:grid-cols-3">
        <FieldTable title="Config" fields={meta.config} />
        <FieldTable title="Input (data)" fields={meta.input} />
        <FieldTable title="Output" fields={meta.output} />
      </div>
    </div>
  );
}
