import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client.js";

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

