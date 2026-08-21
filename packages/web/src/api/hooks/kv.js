import { useQuery } from "@tanstack/react-query";
import { api } from "../client.js";

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

