import fs from "fs";
import path from "path";
import yaml from "yaml";
import fastify from "fastify";
import cron from "node-cron";
import { migrate, db } from "./db.js";
import { log, enableLogPersistence, flushLogs } from "./logger.js";
import * as store from "./store.js";
import { clearScriptCache, runScript } from "./script-sandbox.js";

await migrate();
enableLogPersistence();

/**
 * @typedef {{ owner: string, file: string, workflow: any }} WorkflowEntry
 */

/**
 * @type {Map<string, WorkflowEntry>}
 */
const workflows = new Map();

/**
 * @type {import("node-cron").ScheduledTask[]}
 */
const cronTasks = [];

/**
 * @type {import("node-cron").ScheduledTask | null}
 */
let pruneTask = null;

/**
 * @type {Set<string>}
 */
const registeredHttpRoutes = new Set();

function parseScriptStep(step) {
  if (typeof step === "string") return { script: step, config: null };
  if (step?.script) return { script: step.script, config: step.config ?? null };
  throw new Error(`Invalid script step: ${JSON.stringify(step)}`);
}

/**
 * Resolve an HTTP path under the owner namespace: /notify -> /u/alice/notify
 * @param {string} owner
 * @param {string} triggerPath
 */
function namespacedPath(owner, triggerPath) {
  const cleaned = String(triggerPath).replace(/^\/+/, "");
  return `/u/${owner}/${cleaned}`;
}

function registerWorkflows() {
  workflows.clear();
  clearScriptCache();

  const workflowsRoot = "workflows";
  if (!fs.existsSync(workflowsRoot)) {
    log.warn("workflows directory missing");
    return;
  }

  const owners = fs
    .readdirSync(workflowsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const owner of owners) {
    const registersPath = path.join(workflowsRoot, owner, "registers.yaml");
    if (!fs.existsSync(registersPath)) {
      log.warn(`Skipping owner "${owner}": no registers.yaml`);
      continue;
    }

    let workflowFiles = [];
    try {
      const registerData = fs.readFileSync(registersPath, "utf8");
      const parsed = yaml.parse(registerData) ?? {};
      workflowFiles = parsed.scripts ?? [];
    } catch (err) {
      log.error({ err, owner }, "failed to parse registers.yaml");
      continue;
    }

    const ownerDir = path.join(workflowsRoot, owner);
    const onDisk = fs
      .readdirSync(ownerDir)
      .filter((f) => f.endsWith(".yaml") && f !== "registers.yaml");
    for (const file of onDisk) {
      if (!workflowFiles.includes(file)) {
        log.warn(
          `Workflow file not in registers.yaml: ${owner}/${file}`,
        );
      }
    }

    for (const file of workflowFiles) {
      const key = `${owner}/${file}`;
      const filePath = path.join(ownerDir, file);
      try {
        const workflowData = fs.readFileSync(filePath, "utf8");
        const workflow = yaml.parse(workflowData);
        workflows.set(key, { owner, file, workflow });
      } catch (err) {
        log.error({ err, workflow: key }, "failed to load workflow; skipping");
      }
    }
  }

  log.debug({ count: workflows.size }, "workflows loaded");
}

function registerHttpTriggers() {
  const seen = new Set();

  for (const [key, { owner, workflow }] of workflows) {
    if (workflow.enabled === false) {
      log.debug(`Skipping disabled workflow HTTP triggers (${key})`);
      continue;
    }

    for (const trigger of workflow.triggers ?? []) {
      if (trigger.type !== "HTTP") continue;

      const method = String(trigger.method ?? "POST").toUpperCase();
      const url = namespacedPath(owner, trigger.path);
      const routeKey = `${method} ${url}`;

      if (seen.has(routeKey)) {
        log.warn(`Skipping duplicate HTTP trigger ${routeKey} (${key})`);
        continue;
      }
      seen.add(routeKey);

      if (registeredHttpRoutes.has(routeKey)) {
        continue;
      }
      registeredHttpRoutes.add(routeKey);

      server.route({
        method,
        url,
        handler: async (req, reply) => {
          const result = await runWorkflow(
            key,
            { data: req.body },
            { type: "http", detail: `${method} ${url}` },
          );
          if (result.status === "failed") {
            return reply.code(500).send({
              runId: result.runId,
              error: result.error,
            });
          }
          return reply.send({
            runId: result.runId,
            result: result.result,
          });
        },
      });
      log.debug(`Registered HTTP trigger ${routeKey} (${key})`);
    }
  }
}

function registerCronTriggers() {
  for (const task of cronTasks) {
    task.destroy();
  }
  cronTasks.length = 0;

  for (const [key, { workflow }] of workflows) {
    if (workflow.enabled === false) {
      log.debug(`Skipping disabled workflow cron triggers (${key})`);
      continue;
    }

    for (const trigger of workflow.triggers ?? []) {
      if (trigger.type !== "cron") continue;

      const schedule = trigger.schedule;
      if (!schedule || !cron.validate(schedule)) {
        log.warn(`Skipping invalid cron schedule "${schedule}" (${key})`);
        continue;
      }

      const task = cron.schedule(
        schedule,
        () => {
          log.debug(`cron firing ${key} (${schedule})`);
          return runWorkflow(
            key,
            { data: workflow.data ?? null },
            { type: "cron", detail: schedule },
          );
        },
        { name: `${key}:${schedule}`, noOverlap: true },
      );
      cronTasks.push(task);
      log.debug(`Registered cron trigger ${schedule} (${key})`);
    }
  }
}

function registerPruneJob() {
  if (pruneTask) {
    pruneTask.destroy();
    pruneTask = null;
  }
  const days = Number(process.env.SCRUNNER_RETENTION_DAYS ?? 30);
  pruneTask = cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        const deleted = await store.pruneOlderThan(days);
        log.info({ deleted, days }, "pruned old workflow runs");
      } catch (err) {
        log.error({ err }, "failed to prune old workflow runs");
      }
    },
    { name: "prune-runs" },
  );
}

/**
 * @param {string} key
 * @param {{ data?: unknown }} context
 * @param {{ type: string, detail?: string | null }} trigger
 */
async function runWorkflow(key, context, trigger) {
  const entry = workflows.get(key);
  if (!entry) {
    log.error({ workflow: key }, "workflow not found");
    return { runId: null, status: "failed", error: "workflow not found" };
  }

  const { owner, workflow } = entry;
  const run = await store.startRun({
    owner,
    workflow: key,
    workflowName: workflow?.name,
    trigger,
    input: context.data,
  });
  const runLog = log.child({ runId: run.id, owner, workflow: key });
  runLog.debug("running workflow");

  let ctx = {
    ...context,
    data: context.data ?? workflow.data ?? null,
  };

  try {
    for (const [index, rawStep] of (workflow.scripts ?? []).entries()) {
      const { script, config } = parseScriptStep(rawStep);
      const step = await store.startStep({
        runId: run.id,
        index,
        script,
        config,
      });
      const stepLog = runLog.child({ stepId: step.id, script });
      try {
        ctx = await runScript(script, { ...ctx, config }, {
          log: stepLog,
          workflowName: key,
        });
        await store.finishStep(step.id, "success", ctx);
      } catch (err) {
        await store.finishStep(step.id, "failed", null, err);
        throw err;
      }
    }
    await store.finishRun(run.id, "success", ctx);
    return { runId: run.id, status: "success", result: ctx };
  } catch (err) {
    runLog.error({ err }, "workflow failed");
    await store.finishRun(run.id, "failed", null, err);
    return {
      runId: run.id,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

registerWorkflows();

const server = fastify({ loggerInstance: log });

registerHttpTriggers();
registerCronTriggers();
registerPruneJob();

server.post("/admin/workflows/reregister", async (_req, reply) => {
  registerWorkflows();
  // Fastify cannot remove routes; new routes are added, cron is rebuilt.
  registerHttpTriggers();
  registerCronTriggers();
  return reply.send({ message: "Workflows refreshed" });
});

server.get("/admin/runs", async (req, reply) => {
  const q = /** @type {Record<string, string | undefined>} */ (req.query);
  const limit = q.limit ? Number(q.limit) : undefined;
  const runs = await store.listRuns({
    owner: q.owner,
    workflow: q.workflow,
    status: q.status,
    limit: Number.isFinite(limit) ? limit : undefined,
    before: q.before,
  });
  return reply.send({ runs });
});

server.get("/admin/runs/:id", async (req, reply) => {
  const { id } = /** @type {{ id: string }} */ (req.params);
  const run = await store.getRun(id);
  if (!run) {
    return reply.code(404).send({ error: "run not found" });
  }
  return reply.send(run);
});

async function shutdown() {
  try {
    await flushLogs();
    await db.destroy();
  } catch (err) {
    log.error({ err }, "shutdown error");
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server
  .listen({
    host: "0.0.0.0",
    port: 9000,
  })
  .then(() => {
    log.info("Server is running on port 9000");
  })
  .catch((err) => {
    log.error({ err }, "failed to start server");
    process.exit(1);
  });
