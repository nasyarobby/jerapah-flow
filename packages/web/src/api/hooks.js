import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client.js";

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
    mutationFn: async ({ owner, file, content }) =>
      (
        await api.put(
          `/workflows/${encodeURIComponent(owner)}/${encodeURIComponent(file)}`,
          { content },
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workflows"] });
      qc.invalidateQueries({ queryKey: ["owners"] });
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

export function useRun(id) {
  return useQuery({
    queryKey: ["runs", id],
    queryFn: async () => (await api.get(`/runs/${encodeURIComponent(id)}`)).data,
    enabled: Boolean(id),
    refetchInterval: (query) =>
      query.state.data?.status === "running" ? 2000 : false,
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
