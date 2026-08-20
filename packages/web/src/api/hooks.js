import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, opsApi } from "./client.js";

export function useBootstrap() {
  return useQuery({
    queryKey: ["bootstrap"],
    queryFn: async () => (await api.get("/auth/bootstrap")).data,
  });
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return (await api.get("/auth/me")).data;
      } catch (err) {
        if (err.response?.status === 401) return { user: null };
        throw err;
      }
    },
    retry: false,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post("/auth/login", body)).data,
    onSuccess: (data) => {
      qc.setQueryData(["me"], data);
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post("/auth/register", body)).data,
    onSuccess: (data) => {
      qc.setQueryData(["me"], data);
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post("/auth/logout")).data,
    onSuccess: () => {
      qc.setQueryData(["me"], null);
      qc.clear();
    },
  });
}

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get("/dashboard")).data,
    refetchInterval: (query) =>
      query.state.data?.running?.length ? 4000 : 15000,
  });
}

export function useScripts() {
  return useQuery({
    queryKey: ["scripts"],
    queryFn: async () => (await api.get("/scripts")).data.scripts,
  });
}

export function useScript(name, enabled = true) {
  return useQuery({
    queryKey: ["scripts", name],
    queryFn: async () => (await api.get(`/scripts/${encodeURIComponent(name)}`)).data,
    enabled: Boolean(name) && enabled,
  });
}

export function useSaveScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, content }) =>
      (await api.put(`/scripts/${encodeURIComponent(name)}`, { content })).data,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["scripts"] });
      qc.invalidateQueries({ queryKey: ["scripts", vars.name] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["ops-status"] });
    },
  });
}

export function useCreatePlugin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content, description }) =>
      (await api.post("/plugins/create", { id, content, description })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scripts"] });
      qc.invalidateQueries({ queryKey: ["ops-status"] });
    },
  });
}

export function useForkScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, id, description }) =>
      (
        await api.post(`/scripts/${encodeURIComponent(name)}/fork`, {
          id,
          description,
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scripts"] });
      qc.invalidateQueries({ queryKey: ["ops-status"] });
    },
  });
}

export function useInstallPlugin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post("/plugins/install", body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scripts"] });
      qc.invalidateQueries({ queryKey: ["ops-status"] });
    },
  });
}

export function useDeleteScript() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name) =>
      (await api.delete(`/scripts/${encodeURIComponent(name)}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["scripts"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useDryRunScript() {
  return useMutation({
    mutationFn: async ({ name, content, data, context, config, owner }) =>
      (
        await api.post(`/scripts/${encodeURIComponent(name)}/dry-run`, {
          content,
          data,
          context,
          config,
          owner,
        })
      ).data,
  });
}

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

export function useRuns(filters = {}) {
  const { owner, workflow, status, limit } = filters;
  return useQuery({
    queryKey: ["runs", { owner, workflow, status, limit }],
    queryFn: async () => {
      const params = {};
      if (owner) params.owner = owner;
      if (workflow) params.workflow = workflow;
      if (status) params.status = status;
      if (limit) params.limit = limit;
      return (await api.get("/runs", { params })).data.runs;
    },
  });
}

export function useConsecutiveFailures(limit) {
  return useQuery({
    queryKey: ["consecutive-failures", limit ?? "all"],
    queryFn: async () => {
      const params = {};
      if (limit) params.limit = limit;
      return (await api.get("/consecutive-failures", { params })).data;
    },
  });
}

export function useRun(id) {
  return useQuery({
    queryKey: ["runs", id],
    queryFn: async () => (await api.get(`/runs/${encodeURIComponent(id)}`)).data,
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "running" || status === "queued" ? 1500 : false;
    },
  });
}

export function useUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users")).data.users,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.post("/users", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }) =>
      (await api.patch(`/users/${encodeURIComponent(id)}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) =>
      (await api.delete(`/users/${encodeURIComponent(id)}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useSecrets(owner) {
  return useQuery({
    queryKey: ["secrets", owner ?? "all"],
    queryFn: async () => {
      const params = owner ? { owner } : {};
      return (await api.get("/secrets", { params })).data.secrets;
    },
  });
}

export function useUpsertSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.put("/secrets", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["secrets"] }),
  });
}

export function useDeleteSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) =>
      (await api.delete(`/secrets/${encodeURIComponent(id)}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["secrets"] }),
  });
}

export function useVariables(owner, options = {}) {
  return useQuery({
    queryKey: ["variables", owner ?? "all"],
    queryFn: async () => {
      const params = owner ? { owner } : {};
      return (await api.get("/variables", { params })).data.variables;
    },
    ...options,
  });
}

export function useUpsertVariable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.put("/variables", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["variables"] }),
  });
}

export function useDeleteVariable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) =>
      (await api.delete(`/variables/${encodeURIComponent(id)}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["variables"] }),
  });
}

export function useKvNamespaces() {
  return useQuery({
    queryKey: ["kv", "namespaces"],
    queryFn: async () => (await api.get("/kv/namespaces")).data.namespaces,
  });
}

export function useKv(filters = {}) {
  const { namespace, q, limit, offset } = filters;
  return useQuery({
    queryKey: ["kv", { namespace, q, limit, offset }],
    queryFn: async () => {
      const params = {};
      if (namespace) params.namespace = namespace;
      if (q) params.q = q;
      if (limit != null) params.limit = limit;
      if (offset != null) params.offset = offset;
      return (await api.get("/kv", { params })).data;
    },
  });
}

export function useHttpPages() {
  return useQuery({
    queryKey: ["http-pages"],
    queryFn: async () => (await api.get("/http-pages")).data.pages,
  });
}

export function useUpsertHttpPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.put("/http-pages", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["http-pages"] }),
  });
}

export function useDeleteHttpPage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) =>
      (await api.delete(`/http-pages/${encodeURIComponent(id)}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["http-pages"] }),
  });
}

export function useHttpAuths() {
  return useQuery({
    queryKey: ["http-auths"],
    queryFn: async () => (await api.get("/http-auths")).data.auths,
  });
}

export function useUpsertHttpAuth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.put("/http-auths", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["http-auths"] }),
  });
}

export function useDeleteHttpAuth() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) =>
      (await api.delete(`/http-auths/${encodeURIComponent(id)}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["http-auths"] }),
  });
}

/** Fetch plaintext literals only (not encrypted secrets). */
export async function fetchHttpAuthLiterals(id) {
  return (await api.get(`/http-auths/${encodeURIComponent(id)}/reveal`)).data;
}

export function useOpsStatus(enabled = true) {
  return useQuery({
    queryKey: ["ops-status"],
    queryFn: async () => (await opsApi.get("/status")).data,
    enabled,
    retry: false,
    refetchInterval: enabled ? 3000 : false,
  });
}

export function useOpsPause() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await opsApi.post("/pause")).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-status"] }),
  });
}

export function useOpsResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await opsApi.post("/resume")).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-status"] }),
  });
}

export function useOpsReload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await opsApi.post("/reload")).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ops-status"] });
      qc.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

export function useOpsRestart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ force = false } = {}) =>
      (await opsApi.post("/restart", { force })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-status"] }),
  });
}

export function useOpsScale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ workers, force = false }) =>
      (await opsApi.post("/scale", { workers, force })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-status"] }),
  });
}

export function useOpsHttpStart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await opsApi.post("/http/start")).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-status"] }),
  });
}

export function useOpsHttpStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await opsApi.post("/http/stop")).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-status"] }),
  });
}

export function useOpsProcessRestart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ pmId }) =>
      (await opsApi.post("/restart", { pmId: Number(pmId) })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-status"] }),
  });
}

export function useOpsBumpGeneration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (reason) =>
      (await opsApi.post("/generation/bump", { reason })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-status"] }),
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

