import fs from "fs";
import path from "path";
import pino from "pino";
import * as store from "./store.js";
import { LOGS_DIR } from "./paths.js";
import { redactString } from "./secret-value.js";

/**
 * @param {{ write: (line: string) => unknown }} dest
 */
function redactStream(dest) {
  return {
    write(line) {
      dest.write(redactString(typeof line === "string" ? line : String(line)));
    },
  };
}

const LEVEL_TO_NUM = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const FLUSH_MS = 200;

/** @type {Array<{ runId: string, stepId?: string | null, ts: string, level: number, msg?: string | null, payload?: unknown }>} */
let buffer = [];
let flushChain = Promise.resolve();
let ready = false;
let timer = null;

/**
 * @param {string} line
 */
function enqueueLine(line) {
  let record;
  try {
    record = JSON.parse(redactString(line));
  } catch {
    return;
  }
  if (!record.runId) return;

  const {
    runId,
    stepId = null,
    time,
    level,
    msg = null,
    ...rest
  } = record;

  const ts =
    typeof time === "number"
      ? new Date(time).toISOString()
      : typeof time === "string"
        ? time
        : new Date().toISOString();

  const levelNum =
    typeof level === "number"
      ? level
      : LEVEL_TO_NUM[level] ?? LEVEL_TO_NUM.info;

  const payload = Object.keys(rest).length ? rest : null;
  buffer.push({ runId, stepId, ts, level: levelNum, msg, payload });
}

function scheduleFlush() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, FLUSH_MS);
  timer.unref?.();
}

async function flush() {
  if (!ready || buffer.length === 0) return;
  const batch = buffer;
  buffer = [];
  flushChain = flushChain
    .then(() => store.insertLogs(batch))
    .catch((err) => {
      // Re-queue failed batch so we don't lose run-scoped logs on transient errors.
      buffer = batch.concat(buffer);
      console.error("failed to flush logs to sqlite", err);
    });
  await flushChain;
}

const sqliteStream = {
  write(line) {
    enqueueLine(typeof line === "string" ? line : String(line));
    scheduleFlush();
  },
};

fs.mkdirSync(LOGS_DIR, { recursive: true });

const rollingFile = pino.transport({
  target: "pino-roll",
  options: {
    file: path.join(LOGS_DIR, "jerapah-flow.log"),
    size: "10m",
    mkdir: true,
    limit: { count: 5 },
  },
});

export const log = pino(
  { level: process.env.JERAPAH_FLOW_LOG_LEVEL ?? process.env.SCRUNNER_LOG_LEVEL ?? "debug" },
  pino.multistream([
    { level: "debug", stream: redactStream(process.stdout) },
    { level: "debug", stream: redactStream(rollingFile) },
    { level: "debug", stream: redactStream(sqliteStream) },
  ]),
);

/** Allow the SQLite log writer to flush after migrations have completed. */
export function enableLogPersistence() {
  ready = true;
  void flush();
}

/** Flush remaining buffered log lines (call on shutdown). */
export async function flushLogs() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  await flush();
  await flushChain;
}
