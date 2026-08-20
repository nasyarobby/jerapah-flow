export function formatBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0 KB";
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatCpu(cpu) {
  const n = Number(cpu);
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(1)}%`;
}

/** Compact duration from milliseconds (e.g. `850ms`, `12s`, `5m 3s`, `2h 15m`, `3d 4h`). */
export function formatDuration(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1000) return `${Math.round(n)}ms`;
  const sec = Math.floor(n / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  if (min < 60) return s ? `${min}m ${s}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const m = min % 60;
  if (hr < 48) return m ? `${hr}h ${m}m` : `${hr}h`;
  const days = Math.floor(hr / 24);
  const h = hr % 24;
  return h ? `${days}d ${h}h` : `${days}d`;
}
