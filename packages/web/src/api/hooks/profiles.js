import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client.js";

export function useProfiles(owner, options = {}) {
  return useQuery({
    queryKey: ["profiles", owner ?? "all"],
    queryFn: async () => {
      const params = owner ? { owner } : {};
      return (await api.get("/profiles", { params })).data.profiles;
    },
    ...options,
  });
}

export function useProfileUsage(id, enabled = true) {
  return useQuery({
    queryKey: ["profiles", "usage", id],
    queryFn: async () =>
      (await api.get(`/profiles/${encodeURIComponent(id)}/usage`)).data.usages,
    enabled: Boolean(id) && enabled,
  });
}

export function useUpsertProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => (await api.put("/profiles", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

export function useDeleteProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, force }) =>
      (
        await api.delete(`/profiles/${encodeURIComponent(id)}`, {
          params: force ? { force: "1" } : {},
        })
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["profiles"] }),
  });
}

