export function mergeProfileConfig(base, overlay) {
  const a = base && typeof base === "object" && !Array.isArray(base) ? { ...base } : {};
  if (overlay == null || typeof overlay !== "object" || Array.isArray(overlay)) {
    return a;
  }
  return { ...a, ...overlay };
}

export function configHasOverlay(config) {
  return (
    config != null &&
    typeof config === "object" &&
    !Array.isArray(config) &&
    Object.keys(config).length > 0
  );
}
