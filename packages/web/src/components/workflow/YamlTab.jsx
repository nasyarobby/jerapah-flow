import { CodeEditor } from "../CodeEditor.jsx";
import { MermaidDiagram } from "../MermaidDiagram.jsx";

export function YamlTab({ content, onChange, parseError, mermaid, parsed }) {
  return (
    <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
      <div className="min-h-0">
        <CodeEditor language="yaml" value={content} onChange={onChange} height="100%" />
      </div>
      <div className="min-h-0 overflow-auto">
        {parseError ? (
          <p className="text-error text-sm">{parseError}</p>
        ) : (
          <MermaidDiagram chart={mermaid.chart} scriptIds={mermaid.scriptIds} />
        )}
        {parsed?.name ? <p className="text-sm opacity-70 mt-2">{parsed.name}</p> : null}
      </div>
    </div>
  );
}
