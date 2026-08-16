import { randomUUID } from "node:crypto";
import { db } from "./db.js";

const MAX_NAME_LENGTH = 128;
const NAME_RE = /^[A-Za-z0-9._-]+$/;
const ALLOWED_MIME = new Set(["html", "json"]);
const ALLOWED_KIND = new Set(["response", "template"]);

export const DEFAULT_EMAIL_TEMPLATE_NAME = "email-default";

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {unknown} name
 * @returns {string}
 */
export function assertPageName(name) {
  if (typeof name !== "string" || !NAME_RE.test(name)) {
    const err = new Error("invalid page name");
    err.statusCode = 400;
    throw err;
  }
  if (name.length > MAX_NAME_LENGTH) {
    const err = new Error(`page name must be at most ${MAX_NAME_LENGTH} characters`);
    err.statusCode = 400;
    throw err;
  }
  return name;
}

/**
 * @param {unknown} mime
 * @returns {"html" | "json"}
 */
export function assertMime(mime) {
  const m = String(mime ?? "");
  if (!ALLOWED_MIME.has(m)) {
    const err = new Error('mime must be "html" or "json"');
    err.statusCode = 400;
    throw err;
  }
  return /** @type {"html" | "json"} */ (m);
}

/**
 * @param {unknown} kind
 * @returns {"response" | "template"}
 */
export function assertPageKind(kind, fallback = "response") {
  const k = String(kind ?? fallback);
  if (!ALLOWED_KIND.has(k)) {
    const err = new Error('kind must be "response" or "template"');
    err.statusCode = 400;
    throw err;
  }
  return /** @type {"response" | "template"} */ (k);
}

/**
 * @param {unknown} status
 * @returns {number}
 */
export function assertHttpStatus(status, fallback = 200) {
  if (status == null || status === "") return fallback;
  const n = Number(status);
  if (!Number.isInteger(n) || n < 100 || n > 599) {
    const err = new Error("status must be an HTTP status code (100-599)");
    err.statusCode = 400;
    throw err;
  }
  return n;
}

function publicPage(row) {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    mime: row.mime,
    status: row.status,
    kind: row.kind ?? "response",
    system: Boolean(row.system),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listHttpPages() {
  const rows = await db("http_pages")
    .select("*")
    .orderBy("name", "asc");
  return rows.map(publicPage);
}

/**
 * @param {string} name
 */
export async function getHttpPageByName(name) {
  const row = await db("http_pages").where({ name: assertPageName(name) }).first();
  return row ? publicPage(row) : null;
}

/**
 * @param {string} id
 */
export async function getHttpPageById(id) {
  const row = await db("http_pages").where({ id }).first();
  return row ? publicPage(row) : null;
}

/**
 * @param {string} name
 */
export async function getHttpTemplateByName(name) {
  const page = await getHttpPageByName(name);
  if (!page) return null;
  if (page.kind !== "template") return null;
  return page;
}

/**
 * @param {{
 *   name: string,
 *   content: string,
 *   mime: string,
 *   status?: number,
 *   kind?: string,
 * }} opts
 */
export async function upsertHttpPage({ name, content, mime, status, kind }) {
  const pageName = assertPageName(name);
  const pageMime = assertMime(mime);
  const pageKind = assertPageKind(kind, "response");
  const pageStatus = assertHttpStatus(status, 200);
  if (typeof content !== "string") {
    const err = new Error("content must be a string");
    err.statusCode = 400;
    throw err;
  }
  if (pageKind === "template" && pageMime !== "html") {
    const err = new Error('template pages must use mime "html"');
    err.statusCode = 400;
    throw err;
  }

  const now = nowIso();
  const existing = await db("http_pages").where({ name: pageName }).first();

  if (existing) {
    if (Boolean(existing.system) && pageKind !== "template" && existing.kind === "template") {
      const err = new Error("system template pages cannot be changed to HTTP responses");
      err.statusCode = 400;
      throw err;
    }
    await db("http_pages")
      .where({ id: existing.id })
      .update({
        content,
        mime: pageMime,
        status: pageStatus,
        kind: Boolean(existing.system) ? existing.kind : pageKind,
        updated_at: now,
      });
    return getHttpPageById(existing.id);
  }

  const id = randomUUID();
  await db("http_pages").insert({
    id,
    name: pageName,
    content,
    mime: pageMime,
    status: pageStatus,
    kind: pageKind,
    system: 0,
    created_at: now,
    updated_at: now,
  });
  return getHttpPageById(id);
}

/**
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteHttpPage(id) {
  const existing = await db("http_pages").where({ id }).first();
  if (!existing) return false;
  if (Boolean(existing.system)) {
    const err = new Error("system pages cannot be deleted");
    err.statusCode = 409;
    throw err;
  }
  const n = await db("http_pages").where({ id }).del();
  return n > 0;
}

/**
 * Content-Type for a page mime.
 * @param {"html" | "json" | string} mime
 */
export function contentTypeForMime(mime) {
  if (mime === "html") return "text/html; charset=utf-8";
  return "application/json; charset=utf-8";
}

/**
 * Ensure a page referenced by HTTP triggers is a response page, not a template.
 * @param {{ kind?: string } | null} page
 * @param {string} pageName
 * @param {string} label
 */
export function assertHttpResponsePage(page, pageName, label) {
  if (!page) {
    const err = new Error(`unknown response page "${pageName}"`);
    err.statusCode = 400;
    throw err;
  }
  if (page.kind === "template") {
    const err = new Error(
      `"${pageName}" is an HTML template; ${label} must reference a response page`,
    );
    err.statusCode = 400;
    throw err;
  }
}
