import Editor from "@monaco-editor/react";
import { useTheme } from "../theme.jsx";

export function CodeEditor({ language, value, onChange, height = "50vh", readOnly = false }) {
  const { theme } = useTheme();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <div className="overflow-hidden rounded-box border border-base-300 h-full min-h-0">
      <Editor
        height={height}
        language={language}
        value={value}
        onChange={readOnly ? undefined : (v) => onChange(v ?? "")}
        theme={theme === "dark" ? "vs-dark" : "light"}
        options={{
          readOnly,
          minimap: { enabled: !isMobile },
          lineNumbers: "on",
          tabSize: 2,
          insertSpaces: true,
          autoIndent: "full",
          automaticLayout: true,
          wordWrap: "on",
          scrollBeyondLastLine: false,
          fontSize: 13,
        }}
      />
    </div>
  );
}
