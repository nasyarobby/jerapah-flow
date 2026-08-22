import { CodeEditor } from "../CodeEditor.jsx";

export function YamlTab({ content, onChange, parseError }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {parseError ? <p className="text-error text-sm shrink-0">{parseError}</p> : null}
      <div className="min-h-0 flex-1">
        <CodeEditor language="yaml" value={content} onChange={onChange} height="100%" />
      </div>
    </div>
  );
}
