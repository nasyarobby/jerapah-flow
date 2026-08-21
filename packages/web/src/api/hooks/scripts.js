import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client.js";

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

