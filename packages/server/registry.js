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
import {
  chainCtx,
  mergeContextWave,
  normalizeContext,
  normalizeStepResult,
  storedEnvelope,
} from "./step-result.js";
import * as fsStore from "./fs-store.js";
import { resolveConfigRefs } from "./config-refs.js";
import { hasWorkflowTrigger, mergeProfileConfig } from "@jerapah-flow/shared";
import {
  createHttpTriggerHandler,
  ensureHttpWildcardRoute,
  rebuildHttpRoutes,
} from "./workflow-http-routes.js";
import { getProfilePlain } from "./profiles-store.js";
import {
  buildFailureAlertData,
  resolveFailureTriggerConfig,
} from "./trigger-failure.js";
import { enqueueWorkflowJob } from "./workflow-queue.js";
import { ensureInitialRevision } from "./workflow-history.js";

/**
 * @typedef {{ owner: string, file: string, workflow: any }} WorkflowEntry
 * @typedef {{ key: string, owner: string, trigger: any }} HttpRouteEntry
 */

const MAX_WORKFLOW_TRIGGER_DEPTH = 8;

/**
 * @param {import("fastify").FastifyInstance} server
 * @param {{
 *   queue?: import("bullmq").Queue | null,
 *   enableTriggers?: boolean,
 * }} [opts]
 * `enableTriggers` must be true only on the API (or all-in-one) process.
 * Workers reload workflow defs but must not own cron/HTTP trigger registration.
 */
export function createRegistry(server, opts = {}) {
  const queue = opts.queue ?? null;
  const enableTriggers = opts.enableTriggers ?? true;
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
  const httpDispatcherState = { registered: false };
  const dispatchHttpTrigger = createHttpTriggerHandler({
    httpRoutes,
    workflows,
    namespacedPath,
    enqueueWorkflow: (...args) => enqueueWorkflow(...args),
  });


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
        if (workflowFiles.includes(file)) continue;
        if (file.startsWith("dev-")) {
          workflowFiles.push(file);
          continue;
        }
        log.warn(`Workflow file not in registers.yaml: ${owner}/${file}`);
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
    rebuildHttpRoutes(workflows, httpRoutes, { namespacedPath, log });
    ensureHttpWildcardRoute(server, dispatchHttpTrigger, httpDispatcherState, {
      log,
    });
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
            return enqueueWorkflow(
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
    const days = Number(process.env.JFLOW_RETENTION_DAYS ?? 30);
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
   * @param {import("./workflow-parse.js").CompiledStep} parsed
   * @param {number} index
   * @param {import("./step-result.js").StepResult} last
   * @param {string} runId
   * @param {import("pino").Logger} runLog
   * @param {string} reason
   */
  async function markStepSkipped(parsed, index, last, runId, runLog, reason) {
    const script = parsed.kind === "set" ? SET_STEP_SCRIPT : parsed.script;
    const step = await store.startStep({
      runId,
      index,
      script,
      config: parsed.config,
    });
    const stepLog = runLog.child({ stepId: step.id, script });
    stepLog.debug({ reason }, "step skipped");
    await store.finishStep(step.id, "skipped", storedEnvelope(last), reason);
  }

  /**
   * @param {import("./workflow-parse.js").CompiledScripts} compiled
   * @param {{ data?: unknown, context?: Record<string, unknown> }} ctx
   * @param {string} runId
   * @param {import("pino").Logger} runLog
   * @param {string} key
   * @param {string} owner
   * @param {number} depth
   */
  async function runLinearSteps(compiled, ctx, runId, runLog, key, owner, depth) {
    /** @type {import("./step-result.js").StepResult} */
    let last = {
      output: ctx.data,
      context: normalizeContext(ctx.context),
      skipRemaining: false,
    };
    let next = { data: ctx.data, context: last.context };
    for (let i = 0; i < compiled.order.length; i++) {
      const index = compiled.order[i];
      const parsed = compiled.steps[index];
      last = await runCompiledStep(
        parsed,
        next,
        index,
        runId,
        runLog,
        key,
        owner,
        depth,
      );
      next = chainCtx(last);
      if (last.skipRemaining) {
        for (let j = i + 1; j < compiled.order.length; j++) {
          const laterIndex = compiled.order[j];
          await markStepSkipped(
            compiled.steps[laterIndex],
            laterIndex,
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
   * @param {import("./workflow-parse.js").CompiledScripts} compiled
   * @param {{ data?: unknown, context?: Record<string, unknown> }} ctx
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
    /** @type {Map<string, number>} */
    const idToIndex = new Map();
    for (const step of compiled.steps) {
      if (step.id) idToIndex.set(step.id, step.index);
    }

    const remaining = new Set(compiled.steps.map((s) => s.index));
    const completed = new Set();
    let context = normalizeContext(ctx.context);
    /** @type {import("./step-result.js").StepResult} */
    let last = {
      output: ctx.data,
      context,
      skipRemaining: false,
    };
    let execIndex = 0;

    /**
     * @param {import("./workflow-parse.js").CompiledStep} step
     */
    function needsMet(step) {
      if (step.needsKind === "none" || step.needs.length === 0) return true;
      return step.needs.every((edge) => completed.has(idToIndex.get(edge.from)));
    }

    while (remaining.size) {
      const wave = compiled.steps
        .filter((s) => remaining.has(s.index) && needsMet(s))
        .sort((a, b) => a.index - b.index);
      if (wave.length === 0) {
        throw new Error("Workflow has a cycle");
      }

      const snapshot = { ...context };
      /** @type {Array<{ id: string, context: unknown }>} */
      const patches = [];
      let skipRest = false;

      for (const parsed of wave) {
        remaining.delete(parsed.index);
        const index = execIndex;
        execIndex += 1;
        if (skipRest) {
          await markStepSkipped(
            parsed,
            index,
            last,
            runId,
            runLog,
            "skipRemaining",
          );
          continue;
        }
        const data = mergeStepData(parsed, outputsById, triggerData);
        last = await runCompiledStep(
          parsed,
          { data, context: { ...snapshot } },
          index,
          runId,
          runLog,
          key,
          owner,
          depth,
        );
        if (parsed.id) {
          outputsById.set(parsed.id, last.output);
        }
        patches.push({
          id: parsed.id ?? String(parsed.index),
          context: last.context,
        });
        if (last.skipRemaining) skipRest = true;
      }

      context = mergeContextWave(snapshot, patches);
      last = { ...last, context };

      if (skipRest) {
        for (const later of compiled.steps.filter((s) => remaining.has(s.index))) {
          remaining.delete(later.index);
          const index = execIndex;
          execIndex += 1;
          await markStepSkipped(
            later,
            index,
            last,
            runId,
            runLog,
            "skipRemaining",
          );
        }
        break;
      }

      for (const parsed of wave) completed.add(parsed.index);
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
        return enqueueWorkflow(
          destKey,
          { data },
          { type: "workflow", detail: parentKey },
          {
            parentRunId,
            depth: depth + 1,
          },
        );
      },
    };
  }

  /**
   * @param {import("./workflow-parse.js").CompiledStep} parsed
   * @param {{ data?: unknown, context?: unknown, config?: unknown }} ctx
   * @param {number} index
   * @param {string} runId
   * @param {import("pino").Logger} runLog
   * @param {string} key
   * @param {string} owner
   * @param {number} depth
   * @returns {Promise<import("./step-result.js").StepResult>}
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
    let script = parsed.kind === "set" ? SET_STEP_SCRIPT : parsed.script;
    let unresolvedConfig = parsed.config;
    if (parsed.kind === "script" && parsed.profile) {
      const profile = await getProfilePlain(owner, parsed.profile);
      if (!profile) {
        throw new Error(`profile "${parsed.profile}" not found`);
      }
      if (parsed.script && parsed.script !== profile.script) {
        throw new Error(
          `step script "${parsed.script}" does not match profile "${parsed.profile}" script "${profile.script}"`,
        );
      }
      script = profile.script;
      unresolvedConfig = mergeProfileConfig(profile.config, parsed.config);
    }
    const incomingContext = normalizeContext(ctx.context);
    const step = await store.startStep({
      runId,
      index,
      script,
      config: unresolvedConfig,
    });
    const stepLog = runLog.child({ stepId: step.id, script });
    try {
      const config = await resolveConfigRefs(unresolvedConfig, {
        owner,
        workflowKey: key,
        context: incomingContext,
      });
      const stepCtx = {
        data: ctx.data,
        context: incomingContext,
        config,
      };
      if (parsed.when) {
        const whenResult = await evaluateJsonata(parsed.when, stepCtx);
        if (!isJsonataTruthy(whenResult)) {
          stepLog.debug({ when: parsed.when }, "step skipped");
          const skipped = {
            output: stepCtx.data,
            context: incomingContext,
            skipRemaining: false,
          };
          await store.finishStep(step.id, "skipped", storedEnvelope(skipped), "when condition");
          return skipped;
        }
      }
      if (parsed.kind === "set") {
        const value = await evaluateJsonata(parsed.expression, stepCtx);
        const result = {
          output: value,
          context: incomingContext,
          skipRemaining: false,
        };
        await store.finishStep(step.id, "success", storedEnvelope(result));
        return result;
      }
      const raw = await runScript(script, stepCtx, {
        log: stepLog,
        workflowName: key,
        owner,
        $workflows: createWorkflowsApi(owner, key, runId, depth),
      });
      const result = normalizeStepResult(raw, incomingContext, script);
      await store.finishStep(step.id, "success", storedEnvelope(result));
      return result;
    } catch (err) {
      await store.finishStep(step.id, "failed", null, err);
      throw err;
    }
  }

  /**
   * @param {{
   *   key: string,
   *   owner: string,
   *   workflow: Record<string, unknown>,
   *   runId: string,
   *   trigger: { type: string, detail?: string | null },
   *   error: string,
   *   depth: number,
   * }} opts
   */
  async function maybeTriggerFailureWorkflow(opts) {
    const failureConfig = resolveFailureTriggerConfig(
      opts.workflow,
      opts.owner,
      opts.trigger,
    );
    if (!failureConfig) return;

    const consecutiveFailures = await store.countConsecutiveFailures(
      opts.key,
      opts.trigger.type,
      opts.trigger.detail,
    );
    if (consecutiveFailures !== failureConfig.threshold) {
      log.debug(
        {
          workflow: opts.key,
          consecutiveFailures,
          threshold: failureConfig.threshold,
        },
        "failure alert threshold not reached",
      );
      return;
    }

    const destKey = resolveWorkflowTriggerKey(opts.owner, failureConfig.workflowName);
    const alertData = buildFailureAlertData({
      sourceKey: opts.key,
      sourceName:
        typeof opts.workflow.name === "string" ? opts.workflow.name : null,
      owner: opts.owner,
      trigger: opts.trigger,
      consecutiveFailures,
      runId: opts.runId,
      error: opts.error,
    });

    log.warn(
      {
        workflow: opts.key,
        consecutiveFailures,
        onFailureWorkflow: failureConfig.workflowName,
        destination: destKey,
      },
      "triggering failure alert workflow",
    );

    await enqueueWorkflow(
      destKey,
      { data: alertData },
      { type: "workflow", detail: `failure:${opts.key}` },
      {
        parentRunId: opts.runId,
        depth: opts.depth + 1,
      },
    );
  }

  /**
   * Create a queued run and push a BullMQ job. Returns immediately.
   *
   * @param {string} key
   * @param {{ data?: unknown, context?: unknown }} context
   * @param {{ type: string, detail?: string | null }} trigger
   * @param {{
   *   parentRunId?: string | null,
   *   depth?: number,
   * }} [opts]
   */
  async function enqueueWorkflow(key, context, trigger, opts = {}) {
    const parentRunId = opts.parentRunId ?? null;
    const depth = opts.depth ?? 0;

    if (!queue) {
      log.error({ workflow: key }, "workflow queue is not configured");
      return { runId: null, status: "failed", error: "workflow queue is not configured" };
    }

    const entry = workflows.get(key);
    if (!entry) {
      log.error({ workflow: key }, "workflow not found");
      return { runId: null, status: "failed", error: "workflow not found" };
    }

    const { owner, file, workflow } = entry;
    if (workflow?.enabled === false && trigger.type !== "manual") {
      log.debug({ workflow: key, trigger }, "skipping disabled workflow");
      return { runId: null, status: "failed", error: "workflow disabled" };
    }

    const input = context.data ?? workflow.data ?? null;
    const ensured = await ensureInitialRevision({ owner, file });
    const run = await store.startRun({
      owner,
      workflow: key,
      workflowName: workflow?.name,
      trigger,
      input,
      parentRunId,
      status: "queued",
      workflowRevision: ensured?.revision ?? null,
    });
    const runLog = log.child({ runId: run.id, owner, workflow: key });

    try {
      const job = await enqueueWorkflowJob(queue, {
        runId: run.id,
        key,
        depth,
      });
      await store.setRunJobId(run.id, String(job.id));
      runLog.debug({ jobId: job.id }, "workflow queued");
      return { runId: run.id, status: "queued", jobId: String(job.id) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      runLog.error({ err }, "failed to enqueue workflow");
      await store.finishRun(run.id, "failed", null, err);
      return { runId: run.id, status: "failed", error: message };
    }
  }

  /**
   * Execute a previously queued run (BullMQ worker entrypoint).
   *
   * @param {{ runId: string, key: string, depth?: number }} jobData
   */
  async function executeQueuedRun(jobData) {
    const runId = jobData.runId;
    const key = jobData.key;
    const depth = jobData.depth ?? 0;

    const entry = workflows.get(key);
    if (!entry) {
      await store.finishRun(runId, "failed", null, new Error("workflow not found"));
      return { runId, status: "failed", error: "workflow not found" };
    }

    const existing = await store.getRun(runId);
    if (!existing) {
      return { runId, status: "failed", error: "run not found" };
    }
    if (existing.status === "success" || existing.status === "failed") {
      return { runId, status: existing.status };
    }

    const marked = await store.markRunRunning(runId);
    if (!marked.updated && existing.status !== "running") {
      return { runId, status: existing.status };
    }

    const { owner, workflow } = entry;
    const runLog = log.child({ runId, owner, workflow: key });
    runLog.debug("running queued workflow");

    const trigger = {
      type: existing.trigger_type,
      detail: existing.trigger_detail,
    };
    // jobId is BullMQ's id; enqueue uses runId as jobId, so they match today.
    const jobId =
      existing.job_id != null && String(existing.job_id).length > 0
        ? String(existing.job_id)
        : runId;
    const initialCtx = {
      data: existing.input ?? workflow.data ?? null,
      context: {
        runId,
        jobId,
      },
    };

    try {
      const compiled = compileWorkflowScripts(workflow.scripts);
      let ctx;
      if (compiled.dagMode) {
        ctx = await runDagSteps(
          compiled,
          initialCtx,
          runId,
          runLog,
          key,
          owner,
          depth,
        );
      } else {
        ctx = await runLinearSteps(
          compiled,
          initialCtx,
          runId,
          runLog,
          key,
          owner,
          depth,
        );
      }
      await store.finishRun(runId, "success", storedEnvelope(ctx));
      return { runId, status: "success", result: storedEnvelope(ctx) };
    } catch (err) {
      runLog.error({ err }, "workflow failed");
      const error = err instanceof Error ? err.message : String(err);
      await store.finishRun(runId, "failed", null, err);
      try {
        await maybeTriggerFailureWorkflow({
          key,
          owner,
          workflow,
          runId,
          trigger,
          error,
          depth,
        });
      } catch (alertErr) {
        runLog.error({ err: alertErr }, "failed to trigger failure alert workflow");
      }
      return { runId, status: "failed", error };
    }
  }

  /**
   * @deprecated Prefer enqueueWorkflow; kept as alias for callers.
   */
  async function runWorkflow(key, context, trigger, opts = {}) {
    return enqueueWorkflow(key, context, trigger, opts);
  }

  function reregister() {
    registerWorkflows();
    // Cron/HTTP triggers are API-owned. Workers also subscribe to reload and
    // must only refresh the in-memory workflow map — otherwise N workers each
    // schedule the same cron and enqueue N duplicate jobs.
    if (!enableTriggers) return;
    registerHttpTriggers();
    registerCronTriggers();
  }

  function referencedScripts() {
    const refs = new Set();
    for (const { workflow } of workflows.values()) {
      for (const raw of workflow.scripts ?? []) {
        try {
          const parsed = parseScriptStep(raw);
          if (parsed.kind === "script") {
            if (parsed.script) refs.add(parsed.script);
            if (parsed.profile) refs.add(`profile:${parsed.profile}`);
          }
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
    enqueueWorkflow,
    executeQueuedRun,
    referencedScripts,
  };
}
