/**
 * Rewrite legacy `$VAR_` / `$SECRET_` / `$CONTEXT_` placeholders to mustache.
 * Safe for passwordSecret-style fields (those store bare names, not $SECRET_ prefixes).
 *
 * @param {string} text
 * @returns {{ text: string, changed: boolean }}
 */
export function rewriteLegacyConfigRefsInText(text) {
  if (typeof text !== "string" || text.length === 0) {
    return { text: text ?? "", changed: false };
  }
  const next = text
    .replace(/\$VAR_([A-Za-z0-9._-]+)/g, "{{ vars.$1 }}")
    .replace(/\$SECRET_([A-Za-z0-9._-]+)/g, "{{ secrets.$1 }}")
    .replace(/\$CONTEXT_([A-Za-z0-9._-]+)/g, "{{ context.$1 }}");
  return { text: next, changed: next !== text };
}
