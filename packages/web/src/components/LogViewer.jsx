import { useState } from "react";
import { levelName } from "../lib/format.jsx";

export function LogViewer({ logs = [], className = "" }) {
  const [wordWrap, setWordWrap] = useState(true);

  return (
    <section className={`flex min-h-0 flex-col ${className}`}>
      <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
        <h2 className="font-semibold text-sm">Logs</h2>
        <label className="label cursor-pointer gap-2 py-0">
          <span className="label-text text-sm">Word wrap</span>
          <input
            type="checkbox"
            className="checkbox checkbox-sm"
            checked={wordWrap}
            onChange={(e) => setWordWrap(e.target.checked)}
          />
        </label>
      </div>
      <div className="mockup-code min-h-0 flex-1 overflow-auto text-xs">
        {logs.length === 0 ? (
          <div className="flex gap-3 px-5 py-0.5 font-mono opacity-50">
            <span className="w-12 shrink-0 text-right">—</span>
            <span>no logs</span>
          </div>
        ) : (
          logs.map((l, i) => (
            <div key={l.id ?? i} className="flex gap-3 px-5 py-0.5 font-mono">
              <span className="w-12 shrink-0 text-right opacity-50">
                {levelName(l.level)}
              </span>
              <span
                className={
                  wordWrap
                    ? "min-w-0 flex-1 whitespace-pre-wrap break-words"
                    : "whitespace-pre"
                }
              >
                {l.ts} {l.msg ?? ""}
                {l.payload ? ` ${JSON.stringify(l.payload)}` : ""}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
