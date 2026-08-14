import { useEffect, useId, useRef } from "react";
import { useNavigate } from "react-router-dom";
import mermaid from "mermaid";
import { useTheme } from "../theme.jsx";

function findNode(root, id) {
  return (
    root.querySelector(`#${CSS.escape(id)}`) ||
    root.querySelector(`[id="${CSS.escape(id)}"]`) ||
    root.querySelector(`[id*="${CSS.escape(id)}"]`)
  );
}

export function MermaidDiagram({ chart, scriptIds = {} }) {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const ref = useRef(null);
  const reactId = useId().replace(/:/g, "");

  const scriptKey = JSON.stringify(scriptIds);

  useEffect(() => {
    if (!chart || !ref.current) {
      if (ref.current) ref.current.innerHTML = "";
      return;
    }

    let cancelled = false;
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "loose",
      suppressErrorRendering: true,
      theme: theme === "dark" ? "dark" : "default",
    });

    const ids = JSON.parse(scriptKey);
    const renderId = `mmd-${reactId}-${Date.now()}`;
    mermaid
      .render(renderId, chart)
      .then(({ svg }) => {
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;
        for (const [nodeId, script] of Object.entries(ids)) {
          const el = findNode(ref.current, nodeId);
          if (!el) continue;
          el.style.cursor = "pointer";
          el.setAttribute("title", script);
          el.addEventListener("click", () => {
            navigate(`/scripts/${encodeURIComponent(script)}/edit`);
          });
        }
      })
      .catch((err) => {
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = "";
        const p = document.createElement("p");
        p.className = "text-error text-sm";
        p.textContent = "Could not render diagram";
        ref.current.appendChild(p);
      });

    return () => {
      cancelled = true;
    };
  }, [chart, scriptKey, theme, navigate, reactId]);

  if (!chart) return null;

  return (
    <div
      ref={ref}
      className="mermaid-clickable overflow-x-auto rounded-box border border-base-300 bg-base-200 p-3"
    />
  );
}
