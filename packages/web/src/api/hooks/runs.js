import { useQuery } from "@tanstack/react-query";
import { api } from "../client.js";

export function useDashboard() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => (await api.get("/dashboard")).data,
    refetchInterval: (query) =>
      query.state.data?.running?.length ? 4000 : 15000,
  });
}

export function useRuns(filters = {}) {
  const { owner, workflow, status, trigger, after, before, limit, offset, sort, order } = filters;
  return useQuery({
    queryKey: ["runs", { owner, workflow, status, trigger, after, before, limit, offset, sort, order }],
    queryFn: async () => {
      const params = {};
      if (owner) params.owner = owner;
      if (workflow) params.workflow = workflow;
      if (status) params.status = status;
      if (trigger) params.trigger = trigger;
      if (after) params.after = after;
      if (before) params.before = before;
      if (limit != null) params.limit = limit;
      if (offset != null) params.offset = offset;
      if (sort) params.sort = sort;
      if (order) params.order = order;
      return (await api.get("/runs", { params })).data;
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

