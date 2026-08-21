/**
 * Shallow merge: step overlay keys replace profile defaults (including "").
 * Nested objects/arrays are replaced, not deep-merged.
 *
 * @param {unknown} profileConfig
 * @param {unknown} stepConfig
 * @returns {Record<string, unknown>}
 */
export function mergeProfileConfig(profileConfig, stepConfig) {
  const base =
    profileConfig != null && typeof profileConfig === "object" && !Array.isArray(profileConfig)
      ? { ...profileConfig }
      : {};
  if (stepConfig == null || typeof stepConfig !== "object" || Array.isArray(stepConfig)) {
    return base;
  }
  return { ...base, ...stepConfig };
}

/**
 * @param {unknown} config
 * @returns {boolean}
 */
export function configHasOverlay(config) {
  return (
    config != null &&
    typeof config === "object" &&
    !Array.isArray(config) &&
    Object.keys(config).length > 0
  );
}
