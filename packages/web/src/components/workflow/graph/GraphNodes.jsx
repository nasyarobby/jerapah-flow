import { Handle, Position } from "@xyflow/react";
import { ScriptIcon } from "../../ScriptIcon.jsx";

export function TriggerGraphNode({ data, selected }) {
  return (
    <div
      className={`relative min-w-44 max-w-56 rounded-box border bg-base-100 px-3 py-2 shadow-sm ${
        selected ? "border-primary ring-2 ring-primary/40" : "border-base-300"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wide opacity-60">Trigger</p>
      <p className="font-semibold text-sm leading-tight">{data.triggerType || "HTTP"}</p>
      <p className="font-mono text-[11px] opacity-70 truncate" title={data.label}>
        {data.label}
      </p>
      <Handle type="source" position={Position.Right} isConnectable={false} className="!h-3 !w-3 opacity-40" />
    </div>
  );
}

export function StepGraphNode({ data, selected }) {
  const kindLabel = data.kind === "set" ? "set" : data.profile ? "profile" : "script";
  const iconScript = data.iconScript || "";
  return (
    <div
      className={`relative min-w-48 max-w-60 rounded-box border bg-base-100 px-3 py-2 shadow-sm ${
        data.kind === "set"
          ? "border-secondary"
          : data.profile
            ? "border-accent"
            : "border-primary"
      } ${selected ? "ring-2 ring-primary/40" : ""}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="nodrag nopan !h-3.5 !w-3.5 !bg-primary"
        isConnectable
      />
      <div className="flex items-start gap-2 min-w-0">
        {data.kind !== "set" && iconScript ? (
          <ScriptIcon
            name={iconScript}
            hasIcon={data.hasIcon}
            className="size-7 shrink-0"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="text-[10px] uppercase tracking-wide opacity-60">{kindLabel}</p>
            {data.stepId ? (
              <span className="badge badge-ghost badge-xs font-mono">{data.stepId}</span>
            ) : null}
            {data.when ? (
              <span className="badge badge-warning badge-xs" title={data.when}>
                when
              </span>
            ) : null}
            {data.needsMode === "map" ? (
              <span className="badge badge-info badge-xs" title="Named needs — edit in inspector">
                map
              </span>
            ) : null}
          </div>
          <p
            className={`text-sm leading-tight truncate ${data.named ? "font-semibold" : "font-mono"}`}
            title={data.label}
          >
            {data.label}
          </p>
          {data.missingNeeds?.length ? (
            <p className="text-error text-[11px] mt-0.5">Unknown needs: {data.missingNeeds.join(", ")}</p>
          ) : null}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="nodrag nopan !h-3.5 !w-3.5 !bg-primary"
        isConnectable
      />
    </div>
  );
}
