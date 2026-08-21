import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../client.js";

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

/** Fetch plaintext literals only (not encrypted secrets). */
export async function fetchHttpAuthLiterals(id) {
  return (await api.get(`/http-auths/${encodeURIComponent(id)}/reveal`)).data;
}

