import yaml from "yaml";
import * as store from "../../store.js";
import * as fsStore from "../../fs-store.js";

/**
 * @param {{ workflows: Map<string, any>, loadErrors: Map<string, string> }} registry
 */
export default function dashboardPluginFactory(registry) {
  /**
   * @param {import("fastify").FastifyInstance} fastify
   */
  return async function dashboardPlugin(fastify) {
    fastify.get("/dashboard", async () => {
      const owners = fsStore.listOwners();
      let workflowCount = 0;
      let enabledCount = 0;
      let brokenCount = registry.loadErrors.size;
      const brokenWorkflows = [];

      for (const [key, message] of registry.loadErrors) {
        const [owner, ...rest] = key.split("/");
        brokenWorkflows.push({
          key,
          owner,
          file: rest.join("/"),
          loadError: message,
        });
      }

      for (const owner of owners) {
        let registered = [];
        try {
          registered = fsStore.readRegisters(owner);
        } catch {
          registered = [];
        }
        const files = [
          ...new Set([...registered, ...fsStore.listOwnerYamlFiles(owner)]),
        ];
        for (const file of files) {
          workflowCount += 1;
          const key = `${owner}/${file}`;
          const loaded = registry.workflows.get(key);
          if (loaded?.workflow && loaded.workflow.enabled !== false) {
            enabledCount += 1;
          } else if (!loaded && !registry.loadErrors.has(key)) {
            const raw = fsStore.readWorkflowYaml(owner, file);
            if (raw) {
              try {
                const parsed = yaml.parse(raw);
                if (parsed?.enabled !== false) enabledCount += 1;
              } catch (err) {
                brokenCount += 1;
                brokenWorkflows.push({
                  key,
                  owner,
                  file,
                  loadError: err instanceof Error ? err.message : String(err),
                });
              }
            }
          }
        }
      }

      const [active, failed, recent] = await Promise.all([
        store.listRuns({ status: ["queued", "running"], limit: 10 }),
        store.listRuns({ status: "failed", limit: 20 }),
        store.listRuns({ limit: 10 }),
      ]);

      return {
        workflowCount,
        scriptCount: fsStore.listScriptFiles().length,
        enabledCount,
        brokenCount,
        running: active,
        needsAttention: {
          failed,
          brokenWorkflows,
        },
        recent,
      };
    });
  };
}
