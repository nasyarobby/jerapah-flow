import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LuPencil, LuPlus, LuSave, LuTrash2, LuX } from "react-icons/lu";
import { errorMessage } from "../api/client.js";
import {
  useDeleteScript,
  useSaveScript,
  useScript,
  useScripts,
} from "../api/hooks.js";
import { CodeEditor } from "../components/CodeEditor.jsx";

const NEW_TEMPLATE = `export default async function main(ctx) {
  return ctx;
}
`;

export function ScriptsPage() {
  const [params, setParams] = useSearchParams();
  const editName = params.get("edit");
  const { data: scripts = [], isLoading } = useScripts();
  const [mode, setMode] = useState(null);
  const [name, setName] = useState("");
  const [content, setContent] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  const existing = useScript(mode === "edit" ? name : null, mode === "edit");
  const save = useSaveScript();
  const del = useDeleteScript();

  useEffect(() => {
    if (editName) {
      setMode("edit");
      setName(editName);
    }
  }, [editName]);

  useEffect(() => {
    if (mode === "edit" && existing.data?.content != null) {
      setContent(existing.data.content);
    }
  }, [mode, existing.data]);

  function openAdd() {
    setMode("add");
    setName("");
    setContent(NEW_TEMPLATE);
    setParams({});
  }

  function openEdit(script) {
    setMode("edit");
    setName(script);
    setParams({ edit: script });
  }

  function closeForm() {
    setMode(null);
    setName("");
    setContent("");
    setParams({});
  }

  function onSave(e) {
    e.preventDefault();
    const file = name.endsWith(".js") ? name : `${name}.js`;
    save.mutate(
      { name: file, content },
      {
        onSuccess: () => {
          setMode("edit");
          setName(file);
          setParams({ edit: file });
        },
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Scripts</h1>
        <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
          <LuPlus className="size-4" />
          Add
        </button>
      </div>

      {isLoading ? (
        <span className="loading loading-spinner" />
      ) : (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {scripts.map((s) => (
                <tr key={s} className="hover">
                  <td className="font-mono">{s}</td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title="Edit"
                      onClick={() => openEdit(s)}
                    >
                      <LuPencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      title="Delete"
                      onClick={() => setConfirmDelete(s)}
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
            <h2 className="font-semibold">{mode === "add" ? "New script" : name}</h2>
            <button type="button" className="btn btn-ghost btn-sm btn-square" onClick={closeForm} aria-label="Close">
              <LuX className="size-4" />
            </button>
          </div>
          {mode === "add" ? (
            <input
              className="input input-sm w-full max-w-md"
              placeholder="name.js"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          ) : null}
          {mode === "edit" && existing.isLoading ? (
            <span className="loading loading-spinner" />
          ) : (
            <CodeEditor language="javascript" value={content} onChange={setContent} />
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
            <h3 className="font-bold">Delete {confirmDelete}?</h3>
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
                  del.mutate(confirmDelete, {
                    onSuccess: () => {
                      if (name === confirmDelete) closeForm();
                      setConfirmDelete(null);
                    },
                  })
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
