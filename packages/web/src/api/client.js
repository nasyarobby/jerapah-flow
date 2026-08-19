import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

/** Control-plane ops API (proxied to :8600 in `pnpm dev:pm2`). */
export const opsApi = axios.create({
  baseURL: "/ops",
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const url = err.config?.url ?? "";
    const isAuthCall =
      url.includes("/auth/login") ||
      url.includes("/auth/register") ||
      url.includes("/auth/me") ||
      url.includes("/auth/bootstrap");
    if (err.response?.status === 401 && !isAuthCall) {
      window.dispatchEvent(new Event("jerapah-flow:unauthorized"));
    }
    return Promise.reject(err);
  },
);

opsApi.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      window.dispatchEvent(new Event("jerapah-flow:unauthorized"));
    }
    return Promise.reject(err);
  },
);

export function errorMessage(err, fallback = "request failed") {
  return err?.response?.data?.error ?? err?.message ?? fallback;
}
