import fs from "fs";
import path from "path";
import yaml from "yaml";
import cron from "node-cron";
import { WORKFLOWS_DIR } from "./paths.js";
import { log } from "./logger.js";
import * as store from "./store.js";
import { clearScriptCache, runScript } from "./script-sandbox.js";
import {
  SET_STEP_SCRIPT,
  compileWorkflowScripts,
  evaluateJsonata,
  isJsonataTruthy,
  mergeStepData,
  namespacedPath,
  parseScriptStep,
} from "./workflow-parse.js";
import * as fsStore from "./fs-store.js";

/**
 * @typedef {{ owner: string, file: string, workflow: any }} WorkflowEntry
 */

/**
 * @param {import("fastify").FastifyInstance} server
 */
export function createRegistry(server) {
  /** @type {Map<string, WorkflowEntry>} */
  const workflows = new Map();
  /** @type {Map<string, string>} */
  const loadErrors = new Map();
  /** @type {import("node-cron").ScheduledTask[]} */
  const cronTasks = [];
  /** @type {import("node-cron").ScheduledTask | null} */
  let pruneTask = null;
  /** @type {Set<string>} */
  const registeredHttpRoutes = new Set();

  function registerWorkflows() {
    workflows.clear();
    loadErrors.clear();
    clearScriptCache();

    if (!fs.existsSync(WORKFLOWS_DIR)) {
      log.warn("workflows directory missing");
      return;
    }

    const owners = fsStore.listOwners();

    for (const owner of owners) {
      const registersPath = path.join(WORKFLOWS_DIR, owner, "registers.yaml");
      if (!fs.existsSync(registersPath)) {
        log.warn(`Skipping owner "${owner}": no registers.yaml`);
        continue;
      }

      let workflowFiles = [];
      try {
        workflowFiles = fsStore.readRegisters(owner);
      } catch (err) {
        log.error({ err, owner }, "failed to parse registers.yaml");
        continue;
      }

      const onDisk = fsStore.listOwnerYamlFiles(owner);
      for (const file of onDisk) {
        if (!workflowFiles.includes(file)) {
          log.warn(`Workflow file not in registers.yaml: ${owner}/${file}`);
        }
      }

      for (const file of workflowFiles) {
        const key = `${owner}/${file}`;
        const filePath = path.join(WORKFLOWS_DIR, owner, file);
        try {
          const workflowData = fs.readFileSync(filePath, "utf8");
          const workflow = yaml.parse(workflowData);
          compileWorkflowScripts(workflow?.scripts);
          workflows.set(key, { owner, file, workflow });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          loadErrors.set(key, message);
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
   * @param {import("./workflow-parse.js").CompiledScripts} compiled
   * @param {{ data?: unknown }} ctx
   * @param {string} runId
   * @param {import("pino").Logger} runLog
   * @param {string} key
   */
  async function runLinearSteps(compiled, ctx, runId, runLog, key) {
    let next = ctx;
    for (const index of compiled.order) {
      const parsed = compiled.steps[index];
      next = await runCompiledStep(parsed, next, index, runId, runLog, key);
    }
    return next;
  }

  /**
   * @param {import("./workflow-parse.js").CompiledScripts} compiled
   * @param {{ data?: unknown }} ctx
   * @param {string} runId
   * @param {import("pino").Logger} runLog
   * @param {string} key
   */
  async function runDagSteps(compiled, ctx, runId, runLog, key) {
    const triggerData = ctx.data;
    /** @type {Map<string, unknown>} */
    const outputsById = new Map();
    let last = ctx;

    for (const [orderIndex, stepIndex] of compiled.order.entries()) {
      const parsed = compiled.steps[stepIndex];
      const data = mergeStepData(parsed, outputsById, triggerData);
      last = await runCompiledStep(
        parsed,
        { ...ctx, data },
        orderIndex,
        runId,
        runLog,
        key,
      );
      if (parsed.id) {
        outputsById.set(parsed.id, last);
      }
    }
    return last;
  }

  /**
   * @param {import("./workflow-parse.js").CompiledStep} parsed
   * @param {{ data?: unknown, config?: unknown }} ctx
   * @param {number} index
   * @param {string} runId
   * @param {import("pino").Logger} runLog
   * @param {string} key
   */
  async function runCompiledStep(parsed, ctx, index, runId, runLog, key) {
    const script = parsed.kind === "set" ? SET_STEP_SCRIPT : parsed.script;
    const config = parsed.config;
    const step = await store.startStep({
      runId,
      index,
      script,
      config,
    });
    const stepLog = runLog.child({ stepId: step.id, script });
    try {
      if (parsed.when) {
        const whenResult = await evaluateJsonata(parsed.when, ctx);
        if (!isJsonataTruthy(whenResult)) {
          stepLog.debug({ when: parsed.when }, "step skipped");
          await store.finishStep(step.id, "skipped", ctx);
          return ctx;
        }
      }
      if (parsed.kind === "set") {
        if (ctx == null || typeof ctx !== "object" || Array.isArray(ctx)) {
          throw new Error("set requires an object context");
        }
        const value = await evaluateJsonata(parsed.expression, ctx);
        const result = { ...ctx, [parsed.as]: value };
        await store.finishStep(step.id, "success", result);
        return result;
      }
      const result = await runScript(script, { ...ctx, config }, {
        log: stepLog,
        workflowName: key,
      });
      await store.finishStep(step.id, "success", result);
      return result;
    } catch (err) {
      await store.finishStep(step.id, "failed", null, err);
      throw err;
    }
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
      const compiled = compileWorkflowScripts(workflow.scripts);
      if (compiled.dagMode) {
        ctx = await runDagSteps(compiled, ctx, run.id, runLog, key);
      } else {
        ctx = await runLinearSteps(compiled, ctx, run.id, runLog, key);
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

  function reregister() {
    registerWorkflows();
    registerHttpTriggers();
    registerCronTriggers();
  }

  function referencedScripts() {
    const refs = new Set();
    for (const { workflow } of workflows.values()) {
      for (const raw of workflow.scripts ?? []) {
        try {
          const parsed = parseScriptStep(raw);
          if (parsed.kind === "script") refs.add(parsed.script);
        } catch {
          // skip invalid steps
        }
      }
    }
    return refs;
  }

  return {
    workflows,
    loadErrors,
    registerWorkflows,
    registerHttpTriggers,
    registerCronTriggers,
    registerPruneJob,
    reregister,
    runWorkflow,
    referencedScripts,
  };
}
