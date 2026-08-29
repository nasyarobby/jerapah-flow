import { HTTP_METHODS, DEFAULT_OWNER } from "@jerapah-flow/shared";
import {
  checkAnyHttpAuth,
  resolveAuthMechanisms,
  resolveUnauthorizedSpec,
  sendHttpPageOrJson,
  sendSuccessPage,
} from "./http-trigger-auth.js";

/**
 * Rebuild METHOD+path → workflow map from loaded workflows.
 *
 * @param {Map<string, { owner: string, workflow: any }>} workflows
 * @param {Map<string, { key: string, owner: string, trigger: any }>} httpRoutes
 * @param {{
 *   namespacedPath: (owner: string, path: unknown) => string,
 *   log: { debug: Function, warn: Function },
 * }} deps
 */
export function rebuildHttpRoutes(workflows, httpRoutes, { namespacedPath, log }) {
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
}

/**
 * Register the /u/* Fastify wildcard once; subsequent rebuilds only refresh the map.
 *
 * @param {import("fastify").FastifyInstance} server
 * @param {(req: import("fastify").FastifyRequest, reply: import("fastify").FastifyReply) => any} handler
 * @param {{ registered: boolean }} state
 * @param {{ log: { debug: Function } }} deps
 */
export function ensureHttpWildcardRoute(server, handler, state, { log }) {
  if (state.registered) return;
  state.registered = true;
  server.route({
    method: HTTP_METHODS,
    url: "/u/*",
    handler,
  });
  log.debug("Registered HTTP trigger wildcard dispatcher /u/*");
}

/**
 * Build the HTTP trigger request handler bound to registry state.
 *
 * @param {{
 *   httpRoutes: Map<string, { key: string, owner: string, trigger: any }>,
 *   workflows: Map<string, { owner: string, workflow: any }>,
 *   namespacedPath: (owner: string, path: unknown) => string,
 *   enqueueWorkflow: (key: string, ctx: any, trigger: any) => Promise<any>,
 * }} deps
 */
export function createHttpTriggerHandler({
  httpRoutes,
  workflows,
  namespacedPath,
  enqueueWorkflow,
}) {
  /**
   * @param {import("fastify").FastifyRequest} req
   * @param {import("fastify").FastifyReply} reply
   */
  return async function dispatchHttpTrigger(req, reply) {
    const wildcard = /** @type {{ "*": string }} */ (req.params)["*"] ?? "";
    const url = `/u/${String(wildcard).replace(/^\/+/, "")}`;
    // Compat: leftover webhooks still hitting /u/default/... after owner rename.
    const compatUrl = url.startsWith("/u/default/")
      ? `/u/${DEFAULT_OWNER}/${url.slice("/u/default/".length)}`
      : url === "/u/default"
        ? `/u/${DEFAULT_OWNER}`
        : url;
    const method = String(req.method ?? "GET").toUpperCase();
    const routeKey = `${method} ${compatUrl}`;
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
        return m === method && p === compatUrl;
      }) ?? mapped.trigger;

    if (
      liveTrigger.auth != null &&
      liveTrigger.auth !== false &&
      !(Array.isArray(liveTrigger.auth) && liveTrigger.auth.length === 0)
    ) {
      const mechanisms = await resolveAuthMechanisms(liveTrigger.auth);
      if (mechanisms.length === 0) {
        const { status, pageName } = resolveUnauthorizedSpec(liveTrigger, null);
        return sendHttpPageOrJson(reply, status, pageName, {
          error: "unauthorized",
        });
      }
      const ok = await checkAnyHttpAuth(req, mechanisms, {
        owner: entry.owner,
        workflowKey: mapped.key,
      });
      if (!ok) {
        const { status, pageName } = resolveUnauthorizedSpec(
          liveTrigger,
          mechanisms[0],
        );
        return sendHttpPageOrJson(reply, status, pageName, {
          error: "unauthorized",
        });
      }
    }

    const result = await enqueueWorkflow(
      mapped.key,
      { data: req.body },
      { type: "http", detail: `${method} ${url}` },
    );
    if (result.status === "failed") {
      return reply.code(result.runId ? 500 : 404).send({
        runId: result.runId,
        status: result.status,
        error: result.error,
      });
    }

    const defaultBody = {
      runId: result.runId,
      status: result.status,
    };
    if (typeof liveTrigger.response === "string" && liveTrigger.response) {
      return sendSuccessPage(reply, liveTrigger.response, defaultBody);
    }
    return reply.code(202).send(defaultBody);
  };
}
