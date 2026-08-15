import JsonView from "@uiw/react-json-view";
import { darkTheme } from "@uiw/react-json-view/dark";
import { lightTheme } from "@uiw/react-json-view/light";
import { useTheme } from "../theme.jsx";

/**
 * Collapsible JSON tree using @uiw/react-json-view.
 * Docs: value (JSON), keyName (root label), collapsed (depth),
 * enableClipboard, displayObjectSize, displayDataTypes, style theme vars.
 */
export function JsonViewBlock({ title, value }) {
  const { theme } = useTheme() ?? { theme: "light" };
  if (value === undefined) return null;

  const isTree = value != null && typeof value === "object";

  return (
    <details open className="collapse collapse-arrow border border-base-300 bg-base-100">
      <summary className="collapse-title min-h-0 py-2 text-sm font-semibold">{title}</summary>
      <div className="collapse-content">
        <div className="max-h-80 overflow-auto rounded-box bg-base-200 p-3 text-xs">
          <JsonView
            value={isTree ? value : { value }}
            keyName={title}
            collapsed={1}
            enableClipboard
            displayObjectSize
            displayDataTypes={false}
            highlightUpdates={false}
            shortenTextAfterLength={80}
            style={{
              ...(theme === "dark" ? darkTheme : lightTheme),
              "--w-rjv-background-color": "transparent",
              fontSize: "12px",
            }}
          />
        </div>
      </div>
    </details>
  );
}
