import * as fsStore from "../../fs-store.js";
import {
  assertProfileName,
  deleteProfile,
  getProfileById,
  getProfilePlain,
  listProfileUsages,
  listProfiles,
  upsertProfile,
} from "../../profiles-store.js";

/**
 * @param {import("fastify").FastifyInstance} fastify
 */
export default async function profilesPlugin(fastify) {
  fastify.get("/profiles", async (req, reply) => {
    const q = /** @type {{ owner?: string }} */ (req.query ?? {});
    try {
      const owner = q.owner ? fsStore.assertOwner(q.owner) : undefined;
      const profiles = await listProfiles({ owner });
      const withUsage = profiles.map((profile) => ({
        ...profile,
        usageCount: listProfileUsages(profile.owner, profile.name).length,
      }));
      return { profiles: withUsage };
    } catch (err) {
      return reply.code(err.statusCode ?? 500).send({ error: err.message });
    }
  });

  fastify.get("/profiles/:id/usage", async (req, reply) => {
    const { id } = /** @type {{ id: string }} */ (req.params);
    const existing = await getProfileById(id);
    if (!existing) {
      return reply.code(404).send({ error: "profile not found" });
    }
    return { usages: listProfileUsages(existing.owner, existing.name) };
  });

  fastify.put("/profiles", async (req, reply) => {
    const body = /** @type {{
      owner?: string,
      name?: string,
      script?: unknown,
      config?: unknown,
      description?: unknown,
    }} */ (req.body ?? {});
    try {
      fsStore.assertOwner(String(body.owner ?? ""));
      assertProfileName(String(body.name ?? ""));
      const profile = await upsertProfile({
        owner: String(body.owner),
        name: String(body.name),
        script: body.script,
        config: body.config,
        description: body.description,
      });
      return reply.send({ profile });
    } catch (err) {
      return reply.code(err.statusCode ?? 400).send({ error: err.message });
    }
  });

  fastify.delete("/profiles/:id", async (req, reply) => {
    const { id } = /** @type {{ id: string }} */ (req.params);
    const q = /** @type {{ force?: string }} */ (req.query ?? {});
    const existing = await getProfileById(id);
    if (!existing) {
      return reply.code(404).send({ error: "profile not found" });
    }
    const usages = listProfileUsages(existing.owner, existing.name);
    const force = q.force === "1" || q.force === "true";
    if (usages.length > 0 && !force) {
      return reply.code(409).send({
        error: "profile is used by workflows",
        usages,
      });
    }
    await deleteProfile(id);
    return { ok: true, forced: force && usages.length > 0, usages };
  });
}
