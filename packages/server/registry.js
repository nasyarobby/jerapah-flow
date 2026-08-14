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
import {
  checkHttpAuth,
  resolveAuthMechanism,
  resolveUnauthorizedSpec,
  sendHttpPageOrJson,
  sendSuccessPage,
} from "./http-trigger-auth.js";

/**
 * @typedef {{ owner: string, file: string, workflow: any }} WorkflowEntry
 * @typedef {{ key: string, owner: string, trigger: any }} HttpRouteEntry
 */

const MAX_WORKFLOW_TRIGGER_DEPTH = 8;
const HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];

/**
 * @param {unknown} workflow
 */
function hasWorkflowTrigger(workflow) {
  if (!workflow || typeof workflow !== "object") return false;
  const triggers = /** @type {{ triggers?: Array<{ type?: string }> }} */ (workflow)
    .triggers;
  return (triggers ?? []).some((t) => t?.type === "workflow");
}

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
  /** @type {Map<string, HttpRouteEntry>} */
  const httpRoutes = new Map();
  let httpDispatcherRegistered = false;

  /**
   * Resolve a same-owner workflow that opts in with `type: workflow`.
   * Prefers YAML `name`, then filename (`name` or `name.yaml`).
   *
   * @param {string} owner
   * @param {string} name
   */
  function resolveWorkflowTriggerKey(owner, name) {
    if (typeof name !== "string" || name.length === 0) {
      throw new Error("workflow name is required");
    }

    /** @type {string[]} */
    const byName = [];
    for (const [key, entry] of workflows) {
      if (entry.owner !== owner) continue;
      if (entry.workflow?.enabled === false) continue;
      if (!hasWorkflowTrigger(entry.workflow)) continue;
      if (entry.workflow?.name === name) byName.push(key);
    }
    if (byName.length === 1) return byName[0];
    if (byName.length > 1) {
      throw new Error(`ambiguous workflow name "${name}"`);
    }

    const fileCandidates =
      name.endsWith(".yaml") || name.endsWith(".yml")
        ? [`${owner}/${name}`]
        : [`${owner}/${name}`, `${owner}/${name}.yaml`];

    for (const key of fileCandidates) {
      const entry = workflows.get(key);
      if (!entry) continue;
      if (entry.workflow?.enabled === false) continue;
      if (!hasWorkflowTrigger(entry.workflow)) continue;
      return key;
    }

    throw new Error(
      `workflow "${name}" not found or has no workflow trigger (owner "${owner}")`,
    );
  }

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

  /**
   * Rebuild in-memory METHOD+path → workflow map. Registers a single /u/*
   * Fastify route once so path/method changes apply on reregister without restart.
   */
  function registerHttpTriggers() {
    httpRoutes.clear();

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

        if (httpRoutes.has(routeKey)) {
          log.warn(`Skipping duplicate HTTP trigger ${routeKey} (${key})`);
          continue;
        }
        httpRoutes.set(routeKey, { key, owner, trigger });
        log.debug(`Mapped HTTP trigger ${routeKey} (${key})`);
      }
    }

    if (!httpDispatcherRegistered) {
      httpDispatcherRegistered = true;
      server.route({
        method: HTTP_METHODS,
        url: "/u/*",
        handler: dispatchHttpTrigger,
      });
      log.debug("Registered HTTP trigger wildcard dispatcher /u/*");
    }
  }

  /**
   * @param {import("fastify").FastifyRequest} req
   * @param {import("fastify").FastifyReply} reply
   */
  async function dispatchHttpTrigger(req, reply) {
    const wildcard = /** @type {{ "*": string }} */ (req.params)["*"] ?? "";
    const url = `/u/${String(wildcard).replace(/^\/+/, "")}`;
    const method = String(req.method ?? "GET").toUpperCase();
    const routeKey = `${method} ${url}`;
    const mapped = httpRoutes.get(routeKey);

    if (!mapped) {
      return reply.code(404).send({ error: "not found" });
    }

    const entry = workflows.get(mapped.key);
    if (!entry || entry.workflow?.enabled === false) {
      return reply.code(404).send({ error: "workflow disabled" });
    }

    // Prefer live trigger from current workflow YAML (auth/response edits)
    const liveTrigger =
      (entry.workflow.triggers ?? []).find((t) => {
        if (t?.type !== "HTTP") return false;
        const m = String(t.method ?? "POST").toUpperCase();
        const p = namespacedPath(entry.owner, t.path);
        return m === method && p === url;
      }) ?? mapped.trigger;

    if (liveTrigger.auth != null && liveTrigger.auth !== false) {
      const mechanism = await resolveAuthMechanism(liveTrigger.auth);
      if (!mechanism) {
        const { status, pageName } = resolveUnauthorizedSpec(liveTrigger, null);
        return sendHttpPageOrJson(reply, status, pageName, {
          error: "unauthorized",
        });
      }
      const ok = await checkHttpAuth(req, mechanism, {
        owner: entry.owner,
        workflowKey: mapped.key,
      });
      if (!ok) {
        const { status, pageName } = resolveUnauthorizedSpec(
          liveTrigger,
          mechanism,
        );
        return sendHttpPageOrJson(reply, status, pageName, {
          error: "unauthorized",
        });
      }
    }

    const result = await runWorkflow(
      mapped.key,
      { data: req.body },
      { type: "http", detail: `${method} ${url}` },
    );
    if (result.status === "failed") {
      return reply.code(500).send({
        runId: result.runId,
        error: result.error,
      });
    }

    const defaultBody = {
      runId: result.runId,
      result: result.result,
    };
    if (typeof liveTrigger.response === "string" && liveTrigger.response) {
      return sendSuccessPage(reply, liveTrigger.response, defaultBody);
    }
    return reply.send(defaultBody);
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

  function isSkipRemaining(result) {
    return (
      result != null &&
      typeof result === "object" &&
      !Array.isArray(result) &&
      /** @type {{ skipRemaining?: unknown }} */ (result).skipRemaining === true
    );
  }

  /**
   * @param {import("./workflow-parse.js").CompiledStep} parsed
   * @param {number} index
   * @param {unknown} ctx
   * @param {string} runId
   * @param {import("pino").Logger} runLog
   * @param {string} reason
   */
  async function markStepSkipped(parsed, index, ctx, runId, runLog, reason) {
    const script = parsed.kind === "set" ? SET_STEP_SCRIPT : parsed.script;
    const step = await store.startStep({
      runId,
      index,
      script,
      config: parsed.config,
    });
    const stepLog = runLog.child({ stepId: step.id, script });
    stepLog.debug({ reason }, "step skipped");
    await store.finishStep(step.id, "skipped", ctx, reason);
  }

  /**
   * @param {import("./workflow-parse.js").CompiledScripts} compiled
   * @param {{ data?: unknown }} ctx
   * @param {string} runId
   * @param {import("pino").Logger} runLog
   * @param {string} key
   * @param {string} owner
   * @param {number} depth
   */
  async function runLinearSteps(compiled, ctx, runId, runLog, key, owner, depth) {
    let next = ctx;
    for (let i = 0; i < compiled.order.length; i++) {
      const index = compiled.order[i];
      const parsed = compiled.steps[index];
      next = await runCompiledStep(
        parsed,
        next,
        index,
        runId,
        runLog,
        key,
        owner,
        depth,
      );
      if (isSkipRemaining(next)) {
        for (let j = i + 1; j < compiled.order.length; j++) {
          const laterIndex = compiled.order[j];
          await markStepSkipped(
            compiled.steps[laterIndex],
            laterIndex,
            next,
            runId,
            runLog,
            "skipRemaining",
          );
        }
        break;
      }
    }
    return next;
  }

  /**
   * @param {import("./workflow-parse.js").CompiledScripts} compiled
   * @param {{ data?: unknown }} ctx
   * @param {string} runId
   * @param {import("pino").Logger} runLog
   * @param {string} key
   * @param {string} owner
   * @param {number} depth
   */
  async function runDagSteps(compiled, ctx, runId, runLog, key, owner, depth) {
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
        owner,
        depth,
      );
      if (parsed.id) {
        outputsById.set(parsed.id, last);
      }
      if (isSkipRemaining(last)) {
        for (let j = orderIndex + 1; j < compiled.order.length; j++) {
          const laterParsed = compiled.steps[compiled.order[j]];
          await markStepSkipped(
            laterParsed,
            j,
            last,
            runId,
            runLog,
            "skipRemaining",
          );
        }
        break;
      }
    }
    return last;
  }

  /**
   * @param {string} owner
   * @param {string} parentKey
   * @param {string} parentRunId
   * @param {number} depth
   */
  function createWorkflowsApi(owner, parentKey, parentRunId, depth) {
    return {
      /**
       * @param {string} name
       * @param {unknown} [data]
       */
      async trigger(name, data) {
        if (depth >= MAX_WORKFLOW_TRIGGER_DEPTH) {
          throw new Error(
            `workflow trigger depth limit (${MAX_WORKFLOW_TRIGGER_DEPTH}) exceeded`,
          );
        }
        const destKey = resolveWorkflowTriggerKey(owner, name);
        return runWorkflow(
          destKey,
          { data },
          { type: "workflow", detail: parentKey },
          {
            parentRunId,
            depth: depth + 1,
            detach: true,
          },
        );
      },
    };
  }

  /**
   * @param {import("./workflow-parse.js").CompiledStep} parsed
   * @param {{ data?: unknown, config?: unknown }} ctx
   * @param {number} index
   * @param {string} runId
   * @param {import("pino").Logger} runLog
   * @param {string} key
   * @param {string} owner
   * @param {number} depth
   */
  async function runCompiledStep(
    parsed,
    ctx,
    index,
    runId,
    runLog,
    key,
    owner,
    depth,
  ) {
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
          await store.finishStep(step.id, "skipped", ctx, "when condition");
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
        owner,
        $workflows: createWorkflowsApi(owner, key, runId, depth),
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
   * @param {{
   *   parentRunId?: string | null,
   *   depth?: number,
   *   detach?: boolean,
   * }} [opts]
   */
  async function runWorkflow(key, context, trigger, opts = {}) {
    const parentRunId = opts.parentRunId ?? null;
    const depth = opts.depth ?? 0;
    const detach = opts.detach === true;

    const entry = workflows.get(key);
    if (!entry) {
      log.error({ workflow: key }, "workflow not found");
      return { runId: null, status: "failed", error: "workflow not found" };
    }

    const { owner, workflow } = entry;
    if (workflow?.enabled === false && trigger.type !== "manual") {
      log.debug({ workflow: key, trigger }, "skipping disabled workflow");
      return { runId: null, status: "failed", error: "workflow disabled" };
    }
    const run = await store.startRun({
      owner,
      workflow: key,
      workflowName: workflow?.name,
      trigger,
      input: context.data,
      parentRunId,
    });
    const runLog = log.child({ runId: run.id, owner, workflow: key });
    runLog.debug(detach ? "running workflow (detached)" : "running workflow");

    const initialCtx = {
      ...context,
      data: context.data ?? workflow.data ?? null,
    };

    const execute = async () => {
      let ctx = initialCtx;
      try {
        const compiled = compileWorkflowScripts(workflow.scripts);
        if (compiled.dagMode) {
          ctx = await runDagSteps(
            compiled,
            ctx,
            run.id,
            runLog,
            key,
            owner,
            depth,
          );
        } else {
          ctx = await runLinearSteps(
            compiled,
            ctx,
            run.id,
            runLog,
            key,
            owner,
            depth,
          );
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
    };

    if (detach) {
      execute().catch((err) => {
        runLog.error({ err }, "detached workflow failed unexpectedly");
      });
      return { runId: run.id, status: "started" };
    }

    return execute();
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
