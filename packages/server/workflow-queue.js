import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { log } from "./logger.js";

const DEFAULT_REDIS_URL = "redis://127.0.0.1:6379";
const DEFAULT_QUEUE_NAME = "jerapah-workflows";
const DEFAULT_CONCURRENCY = 5;

/** @type {IORedis | null} */
let sharedConnection = null;

export function getRedisUrl() {
  return process.env.REDIS_URL || DEFAULT_REDIS_URL;
}

/**
 * Optional Redis AUTH password. Applied even when REDIS_URL has no embedded credentials.
 * @returns {string | undefined}
 */
export function getRedisPassword() {
  const pass = process.env.REDIS_PASS;
  if (typeof pass !== "string" || pass.length === 0) return undefined;
  return pass;
}

/** Redact credentials for logs. */
export function getRedisUrlForLog() {
  try {
    const url = new URL(getRedisUrl());
    if (url.password || getRedisPassword()) url.password = "***";
    if (url.username) url.username = url.username ? "***" : "";
    return url.toString();
  } catch {
    return getRedisUrl();
  }
}

export function getQueueName() {
  return process.env.JFLOW_QUEUE_NAME || DEFAULT_QUEUE_NAME;
}

export function getWorkerConcurrency() {
  const raw = Number(process.env.JFLOW_WORKER_CONCURRENCY ?? DEFAULT_CONCURRENCY);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_CONCURRENCY;
  return Math.floor(raw);
}

/**
 * BullMQ requires maxRetriesPerRequest: null for blocking commands.
 * @returns {IORedis}
 */
export function getSharedConnection() {
  if (sharedConnection) return sharedConnection;
  /** @type {import("ioredis").RedisOptions} */
  const options = {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  };
  const password = getRedisPassword();
  if (password) options.password = password;

  sharedConnection = new IORedis(getRedisUrl(), options);
  sharedConnection.on("error", (err) => {
    log.error({ err }, "redis connection error");
  });
  return sharedConnection;
}

/**
 * @returns {Queue}
 */
export function createWorkflowQueue() {
  return new Queue(getQueueName(), {
    connection: getSharedConnection(),
    defaultJobOptions: {
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
      attempts: 1,
    },
  });
}

/**
 * @param {(job: import("bullmq").Job) => Promise<unknown>} processor
 * @returns {Worker}
 */
export function createWorkflowWorker(processor) {
  const concurrency = getWorkerConcurrency();
  const worker = new Worker(getQueueName(), processor, {
    connection: getSharedConnection(),
    concurrency,
  });
  worker.on("error", (err) => {
    log.error({ err }, "workflow worker error");
  });
  log.info({ concurrency, queue: getQueueName() }, "workflow worker started");
  return worker;
}

/**
 * @param {Queue} queue
 * @param {{
 *   runId: string,
 *   key: string,
 *   depth?: number,
 * }} data
 */
export async function enqueueWorkflowJob(queue, data) {
  const job = await queue.add(
    "run",
    {
      runId: data.runId,
      key: data.key,
      depth: data.depth ?? 0,
    },
    {
      jobId: data.runId,
    },
  );
  return job;
}

/**
 * @param {IORedis | null} [connection]
 */
export async function closeRedis(connection = sharedConnection) {
  if (!connection) return;
  if (connection === sharedConnection) sharedConnection = null;
  await connection.quit().catch(() => connection.disconnect());
}
