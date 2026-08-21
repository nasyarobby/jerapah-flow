import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client.js";

export function useWorkflows(owner) {
  return useQuery({
    queryKey: ["workflows", owner ?? "all"],
    queryFn: async () => {
      const params = owner ? { owner } : {};
      return (await api.get("/workflows", { params })).data.workflows;
    },
  });
}

export function useWorkflow(owner, file, enabled = true) {
  return useQuery({
    queryKey: ["workflows", owner, file],
    queryFn: async () =>
      (await api.get(`/workflows/${encodeURIComponent(owner)}/${encodeURIComponent(file)}`))
        .data,
    enabled: Boolean(owner && file) && enabled,
  });
}

export function useOwners() {
  return useQuery({
    queryKey: ["owners"],
    queryFn: async () => (await api.get("/owners")).data.owners,
  });
}

export function useSaveWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ owner, file, content, saveAnyway }) =>
      (
        await api.put(
          `/workflows/${encodeURIComponent(owner)}/${encodeURIComponent(file)}`,
          { content, ...(saveAnyway ? { saveAnyway: true } : {}) },
        )
      ).data,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["workflows"] });
      qc.invalidateQueries({ queryKey: ["owners"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({
        queryKey: ["workflows", vars.owner, vars.file, "revisions"],
      });
      qc.invalidateQueries({ queryKey: ["workflows", vars.owner, vars.file] });
    },
  });
}

export function useSetWorkflowEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ owner, file, enabled }) =>
      (
        await api.patch(
          `/workflows/${encodeURIComponent(owner)}/${encodeURIComponent(file)}`,
          { enabled },
        )
      ).data,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["workflows"] });
      qc.invalidateQueries({ queryKey: ["workflows", vars.owner, vars.file] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ owner, file }) =>
      (
        await api.delete(
          `/workflows/${encodeURIComponent(owner)}/${encodeURIComponent(file)}`,
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflows"] });
      qc.invalidateQueries({ queryKey: ["workflows", "trash"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDuplicateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ owner, file, destOwner, destFile }) =>
      (
        await api.post(
          `/workflows/${encodeURIComponent(owner)}/${encodeURIComponent(file)}/duplicate`,
          {
            ...(destOwner ? { owner: destOwner } : {}),
            ...(destFile ? { file: destFile } : {}),
          },
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflows"] });
      qc.invalidateQueries({ queryKey: ["owners"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useRunWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ owner, file, data }) =>
      (
        await api.post(
          `/workflows/${encodeURIComponent(owner)}/${encodeURIComponent(file)}/run`,
          data !== undefined ? { data } : {},
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflows"] });
      qc.invalidateQueries({ queryKey: ["runs"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useReregisterWorkflows() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post("/workflows/reregister")).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflows"] });
      qc.invalidateQueries({ queryKey: ["scripts"] });
      qc.invalidateQueries({ queryKey: ["owners"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useWorkflowTrash() {
  return useQuery({
    queryKey: ["workflows", "trash"],
    queryFn: async () => (await api.get("/workflows/trash")).data.items,
  });
}

export function useRestoreWorkflowTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) =>
      (await api.post(`/workflows/trash/${encodeURIComponent(id)}/restore`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflows"] });
      qc.invalidateQueries({ queryKey: ["workflows", "trash"] });
      qc.invalidateQueries({ queryKey: ["owners"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function usePurgeWorkflowTrash() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) =>
      (await api.delete(`/workflows/trash/${encodeURIComponent(id)}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflows", "trash"] });
    },
  });
}

export function useWorkflowRevisions(owner, file, enabled = true) {
  return useQuery({
    queryKey: ["workflows", owner, file, "revisions"],
    queryFn: async () =>
      (
        await api.get(
          `/workflows/${encodeURIComponent(owner)}/${encodeURIComponent(file)}/revisions`,
        )
      ).data,
    enabled: Boolean(owner && file) && enabled,
  });
}

export function useWorkflowRevision(owner, file, revision) {
  return useQuery({
    queryKey: ["workflows", owner, file, "revisions", revision],
    queryFn: async () =>
      (
        await api.get(
          `/workflows/${encodeURIComponent(owner)}/${encodeURIComponent(file)}/revisions/${revision}`,
        )
      ).data,
    enabled: Boolean(owner && file && revision != null),
  });
}

export function useRevertWorkflowRevision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ owner, file, revision, saveAnyway }) =>
      (
        await api.post(
          `/workflows/${encodeURIComponent(owner)}/${encodeURIComponent(file)}/revisions/${revision}/revert`,
          saveAnyway ? { saveAnyway: true } : {},
        )
      ).data,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["workflows"] });
      qc.invalidateQueries({ queryKey: ["workflows", vars.owner, vars.file] });
      qc.invalidateQueries({
        queryKey: ["workflows", vars.owner, vars.file, "revisions"],
      });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ owner, content, file, saveAnyway }) =>
      (
        await api.post(`/workflows/${encodeURIComponent(owner)}`, {
          content,
          ...(file ? { file } : {}),
          ...(saveAnyway ? { saveAnyway: true } : {}),
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflows"] });
      qc.invalidateQueries({ queryKey: ["owners"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDownloadWorkflowBackup() {
  return useMutation({
    mutationFn: async () => {
      const res = await api.get("/workflows/backup", { responseType: "blob" });
      const disposition = res.headers["content-disposition"] ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? "jerapah-flow-backup.zip";
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return { ok: true };
    },
  });
}

export function useRestoreWorkflowBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, mode }) => {
      const buffer = await file.arrayBuffer();
      const zipBase64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      return (await api.post("/workflows/backup/restore", { zipBase64, mode })).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflows"] });
      qc.invalidateQueries({ queryKey: ["owners"] });
      qc.invalidateQueries({ queryKey: ["scripts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["ops-status"] });
    },
  });
}

