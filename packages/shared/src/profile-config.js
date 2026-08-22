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
 * Inverse of merge for Apply-to-card: keep only keys whose values differ from the profile.
 * No profile → return the merged object as-is (full step config).
 *
 * @param {unknown} profileConfig
 * @param {unknown} mergedConfig
 * @returns {Record<string, unknown>}
 */
export function overlayFromMerged(profileConfig, mergedConfig) {
  const merged =
    mergedConfig != null && typeof mergedConfig === "object" && !Array.isArray(mergedConfig)
      ? { ...mergedConfig }
      : {};
  const base =
    profileConfig != null && typeof profileConfig === "object" && !Array.isArray(profileConfig)
      ? profileConfig
      : null;
  if (!base) return merged;

  const overlay = {};
  for (const [key, value] of Object.entries(merged)) {
    if (!Object.prototype.hasOwnProperty.call(base, key) || !sameConfigValue(base[key], value)) {
      overlay[key] = value;
    }
  }
  return overlay;
}

function sameConfigValue(a, b) {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== "object" || typeof b !== "object") return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
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
