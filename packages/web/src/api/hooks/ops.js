import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { opsApi } from "../client.js";

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

