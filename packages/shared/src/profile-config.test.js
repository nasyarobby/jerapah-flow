import { describe, expect, it } from "vitest";
import {
  configHasOverlay,
  ensureWorkflowFilename,
  isPlainObject,
  mergeProfileConfig,
  namespacedPath,
} from "./index.js";

describe("isPlainObject", () => {
  it("accepts plain objects and rejects arrays/null/primitives", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject("x")).toBe(false);
  });
});

describe("mergeProfileConfig", () => {
  it("shallow-merges step overlay over profile defaults", () => {
    expect(mergeProfileConfig({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({
      a: 1,
      b: 3,
      c: 4,
    });
    expect(mergeProfileConfig(null, { x: 1 })).toEqual({ x: 1 });
    expect(mergeProfileConfig({ x: 1 }, null)).toEqual({ x: 1 });
    expect(mergeProfileConfig({ nested: { a: 1 } }, { nested: { b: 2 } })).toEqual({
      nested: { b: 2 },
    });
  });
});

describe("configHasOverlay", () => {
  it("is true only for non-empty plain objects", () => {
    expect(configHasOverlay({ a: 1 })).toBe(true);
    expect(configHasOverlay({})).toBe(false);
    expect(configHasOverlay(null)).toBe(false);
    expect(configHasOverlay([])).toBe(false);
  });
});

describe("ensureWorkflowFilename", () => {
  it("adds .yaml when missing and preserves yaml/yml", () => {
    expect(ensureWorkflowFilename("cron")).toBe("cron.yaml");
    expect(ensureWorkflowFilename("cron.yaml")).toBe("cron.yaml");
    expect(ensureWorkflowFilename("cron.YML")).toBe("cron.YML");
    expect(ensureWorkflowFilename("  ")).toBe("");
  });
});

describe("namespacedPath", () => {
  it("builds /u/<owner>/<path> without leading slash duplication", () => {
    expect(namespacedPath("default", "hooks/run")).toBe("/u/default/hooks/run");
    expect(namespacedPath("local", "/hooks/run")).toBe("/u/local/hooks/run");
  });
});
