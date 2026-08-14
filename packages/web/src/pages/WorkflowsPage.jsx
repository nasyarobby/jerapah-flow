import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { parse as parseYaml } from "yaml";
import {
  LuActivity,
  LuPencil,
  LuPlay,
  LuPlus,
  LuRefreshCw,
  LuSave,
  LuTrash2,
  LuX,
} from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  useDeleteWorkflow,
  useOwners,
  useReregisterWorkflows,
  useRunWorkflow,
  useSaveWorkflow,
  useWorkflow,
  useWorkflows,
} from "../api/hooks.js";
import { CodeEditor } from "../components/CodeEditor.jsx";
import { MermaidDiagram } from "../components/MermaidDiagram.jsx";
import { formatTime, WorkflowStatusBadge } from "../lib/format.jsx";
import { workflowToArchitecture } from "../lib/workflow-mermaid.js";

const NEW_YAML = `name: new workflow
scripts:
  - get-current-time.js
triggers:
  - type: HTTP
    method: POST
    path: /new
`;

export function WorkflowsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const editParam = params.get("edit");
  const { data: workflows = [], isLoading } = useWorkflows();
  const { data: owners = [] } = useOwners();
  const [mode, setMode] = useState(null);
  const [owner, setOwner] = useState("default");
  const [file, setFile] = useState("");
  const [content, setContent] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [runError, setRunError] = useState(null);

  const existing = useWorkflow(
    mode === "edit" ? owner : null,
    mode === "edit" ? file : null,
    mode === "edit",
  );
  const save = useSaveWorkflow();
  const del = useDeleteWorkflow();
  const run = useRunWorkflow();
  const reregister = useReregisterWorkflows();

  useEffect(() => {
    if (!editParam) return;
    const slash = editParam.indexOf("/");
    if (slash === -1) return;
    setMode("edit");
    setOwner(editParam.slice(0, slash));
    setFile(editParam.slice(slash + 1));
  }, [editParam]);

  useEffect(() => {
    if (mode === "edit" && existing.data?.content != null) {
      setContent(existing.data.content);
    }
  }, [mode, existing.data]);

  const { parsed, parseError, mermaid } = useMemo(() => {
    try {
      const parsedYaml = parseYaml(content);
      const arch = workflowToArchitecture(parsedYaml);
      return { parsed: parsedYaml, parseError: null, mermaid: arch };
    } catch (err) {
      return {
        parsed: null,
        parseError: err instanceof Error ? err.message : String(err),
        mermaid: { chart: "", scriptIds: {} },
      };
    }
  }, [content]);

  function openAdd() {
    setMode("add");
    setOwner(owners[0] || "default");
    setFile("");
    setContent(NEW_YAML);
    setParams({});
  }

  function openEdit(w) {
    setMode("edit");
    setOwner(w.owner);
    setFile(w.file);
    setParams({ edit: `${w.owner}/${w.file}` });
  }

  function closeForm() {
    setMode(null);
    setFile("");
    setContent("");
    setParams({});
  }

  function onSave(e) {
    e.preventDefault();
    const yamlFile = file.endsWith(".yaml") || file.endsWith(".yml") ? file : `${file}.yaml`;
    save.mutate(
      { owner, file: yamlFile, content },
      {
        onSuccess: () => {
          setMode("edit");
          setFile(yamlFile);
          setParams({ edit: `${owner}/${yamlFile}` });
        },
      },
    );
  }

  function onRun(w) {
    setRunError(null);
    run.mutate(
      { owner: w.owner, file: w.file },
      {
        onSuccess: (data) => {
          if (data?.runId) navigate(`/events/${data.runId}`);
        },
        onError: (err) => {
          const runId = err?.response?.data?.runId;
          if (runId) {
            navigate(`/events/${runId}`);
            return;
          }
          setRunError(`${w.key}: ${errorMessage(err)}`);
        },
      },
    );
  }

  const runningKey =
    run.isPending && run.variables
      ? `${run.variables.owner}/${run.variables.file}`
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Workflows</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            title="Reregister workflows"
            disabled={reregister.isPending}
            onClick={() => reregister.mutate()}
          >
            {reregister.isPending ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <LuRefreshCw className="size-4" />
            )}
            Reregister
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
            <LuPlus className="size-4" />
            Add
          </button>
        </div>
      </div>

      {reregister.isError ? (
        <p className="text-error text-sm">{errorMessage(reregister.error)}</p>
      ) : null}

      {runError ? <p className="text-error text-sm">{runError}</p> : null}

      {isLoading ? (
        <span className="loading loading-spinner" />
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Triggers</th>
                <th>Last run</th>
                <th>Runs</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {workflows.map((w) => (
                <tr key={w.key} className="hover">
                  <td>{w.name}</td>
                  <td className="font-mono text-xs">{w.owner}</td>
                  <td>
                    <WorkflowStatusBadge workflow={w} />
                  </td>
                  <td>
                    <TriggerList triggers={w.triggers} />
                  </td>
                  <td className="whitespace-nowrap">{formatTime(w.lastInvokedAt)}</td>
                  <td>{w.invocationCount}</td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title="Run"
                      disabled={Boolean(w.loadError) || runningKey === w.key}
                      onClick={() => onRun(w)}
                    >
                      {runningKey === w.key ? (
                        <span className="loading loading-spinner loading-xs" />
                      ) : (
                        <LuPlay className="size-4" />
                      )}
                    </button>
                    <Link
                      className="btn btn-ghost btn-xs"
                      title="Events"
                      to={`/events?workflow=${encodeURIComponent(w.key)}`}
                    >
                      <LuActivity className="size-4" />
                    </Link>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title="Edit"
                      onClick={() => openEdit(w)}
                    >
                      <LuPencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      title="Delete"
                      onClick={() => setConfirmDelete(w)}
                    >
                      <LuTrash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {mode ? (
        <form onSubmit={onSave} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">
              {mode === "add" ? "New workflow" : `${owner}/${file}`}
            </h2>
            <button type="button" className="btn btn-ghost btn-sm btn-square" onClick={closeForm} aria-label="Close">
              <LuX className="size-4" />
            </button>
          </div>
          {mode === "add" ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                className="input input-sm w-full sm:max-w-xs"
                placeholder="owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                required
              />
              <input
                className="input input-sm w-full sm:max-w-xs"
                placeholder="file.yaml"
                value={file}
                onChange={(e) => setFile(e.target.value)}
                required
              />
            </div>
          ) : null}
          {mode === "edit" && existing.isLoading ? (
            <span className="loading loading-spinner" />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              <CodeEditor language="yaml" value={content} onChange={setContent} />
              <div>
                {parseError ? (
                  <p className="text-error text-sm">{parseError}</p>
                ) : (
                  <MermaidDiagram
                    chart={mermaid.chart}
                    scriptIds={mermaid.scriptIds}
                  />
                )}
                {parsed?.name ? (
                  <p className="text-sm opacity-70 mt-2">{parsed.name}</p>
                ) : null}
              </div>
            </div>
          )}
          {save.isError ? (
            <p className="text-error text-sm">{errorMessage(save.error)}</p>
          ) : null}
          <button type="submit" className="btn btn-primary btn-sm" disabled={save.isPending}>
            <LuSave className="size-4" />
            Save
          </button>
        </form>
      ) : null}

      {confirmDelete ? (
        <dialog className="modal modal-open">
          <div className="modal-box">
            <h3 className="font-bold">Delete {confirmDelete.key}?</h3>
            {del.isError ? (
              <p className="text-error text-sm mt-2">{errorMessage(del.error)}</p>
            ) : null}
            <div className="modal-action">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-error"
                disabled={del.isPending}
                onClick={() =>
                  del.mutate(
                    { owner: confirmDelete.owner, file: confirmDelete.file },
                    {
                      onSuccess: () => {
                        if (owner === confirmDelete.owner && file === confirmDelete.file) {
                          closeForm();
                        }
                        setConfirmDelete(null);
                      },
                    },
                  )
                }
              >
                Delete
              </button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button type="button" onClick={() => setConfirmDelete(null)}>
              close
            </button>
          </form>
        </dialog>
      ) : null}
    </div>
  );
}

function triggerLabel(t) {
  const type = String(t?.type ?? "").toLowerCase();
  if (type === "cron") return t.schedule || "cron";
  if (type === "http") return t.path || "/";
  return t?.type ?? "—";
}

function triggerKind(t) {
  const type = String(t?.type ?? "").toLowerCase();
  if (type === "http") return t.method || "POST";
  return t?.type ?? "—";
}

function TriggerList({ triggers }) {
  if (!triggers?.length) return <span className="opacity-50">—</span>;
  return (
    <ul className="space-y-0.5">
      {triggers.map((t, i) => (
        <li key={i} className="font-mono text-xs whitespace-nowrap">
          <span className="opacity-60">{triggerKind(t)}</span> {triggerLabel(t)}
        </li>
      ))}
    </ul>
  );
}
