import pino from "pino";

const LEVEL_TO_NUM = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

/**
 * Pino logger that collects log lines in memory (no SQLite / process logger).
 *
 * @returns {{ log: import("pino").Logger, logs: Array<{ ts: string, level: number, msg?: string | null, payload?: unknown }> }}
 */
export function createDryRunLogger() {
  /** @type {Array<{ ts: string, level: number, msg?: string | null, payload?: unknown }>} */
  const logs = [];

  const dest = {
    write(line) {
      let record;
      try {
        record = JSON.parse(typeof line === "string" ? line : String(line));
      } catch {
        return;
      }

      const ts =
        typeof record.time === "number"
          ? new Date(record.time).toISOString()
          : typeof record.time === "string"
            ? record.time
            : new Date().toISOString();

      const level =
        typeof record.level === "number"
          ? record.level
          : LEVEL_TO_NUM[record.level] ?? LEVEL_TO_NUM.info;

      const { time: _time, level: _level, msg = null, ...rest } = record;
      logs.push({
        ts,
        level,
        msg,
        payload: Object.keys(rest).length ? rest : null,
      });
    },
  };

  const log = pino({ level: "trace" }, dest);
  return { log, logs };
}

/**
 * @param {unknown} value
 */
export function safeSerialize(value) {
  const seen = new WeakSet();
  try {
    return JSON.parse(
      JSON.stringify(value, (_key, v) => {
        if (typeof v === "bigint") return v.toString();
        if (typeof v === "object" && v !== null) {
          if (seen.has(v)) return "[Circular]";
          seen.add(v);
        }
        return v;
      }),
    );
  } catch (err) {
    return {
      error: "output could not be serialized",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}
