import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client.js";

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

