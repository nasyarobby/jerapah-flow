import { jsonPreviewReplacer, summarizeBinary } from "../json-preview.js";
import { serialize, toDisplayValue } from "../store.js";
import { safeSerialize } from "../src/api/dry-run-logger.js";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const summary = summarizeBinary(png);
if (summary.length !== png.length || summary.preview !== "89504e470d0a1a0a010203" || summary.truncated !== false) {
  throw new Error(`summarizeBinary: ${JSON.stringify(summary)}`);
}

const long = Buffer.alloc(32, 0xff);
const longSummary = summarizeBinary(long);
if (longSummary.length !== 32 || longSummary.preview.length !== 32 || longSummary.truncated !== true) {
  throw new Error(`long summarizeBinary: ${JSON.stringify(longSummary)}`);
}

const dumped = JSON.stringify({ file: png });
if (!dumped.includes('"data":[')) {
  throw new Error("expected default Buffer JSON to include data array");
}

const previewed = JSON.stringify({ file: png }, jsonPreviewReplacer);
if (previewed.includes('"data":[')) {
  throw new Error(`replacer still dumped bytes: ${previewed}`);
}
if (!previewed.includes('"preview":"89504e470d0a1a0a010203"')) {
  throw new Error(`replacer missing hex preview: ${previewed}`);
}

const stored = serialize({ output: { file: png, filename: "test.png" } });
if (stored.includes('"data":[')) {
  throw new Error(`serialize dumped bytes: ${stored.slice(0, 200)}`);
}

const display = toDisplayValue({
  output: { file: png },
  context: { file: png },
});
if (display.output.file.length !== png.length || display.context.file.truncated !== false) {
  throw new Error(`toDisplayValue: ${JSON.stringify(display)}`);
}
if (Array.isArray(display.output.file.data)) {
  throw new Error("toDisplayValue should not keep Buffer.data");
}

const dry = safeSerialize({ file: png, n: 1n });
if (dry.n !== "1" || Array.isArray(dry.file.data)) {
  throw new Error(`safeSerialize: ${JSON.stringify(dry)}`);
}

const typed = safeSerialize({ file: new Uint8Array(png) });
if (typed.file.length !== png.length || typed.file.type !== "Buffer") {
  throw new Error(`Uint8Array: ${JSON.stringify(typed)}`);
}

console.log("json-preview-smoke: ok");
