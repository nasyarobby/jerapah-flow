import fs from "fs";
import path from "path";
import yaml from "yaml";
import { SCRIPTS_DIR, WORKFLOWS_DIR } from "./paths.js";

export function assertScriptName(name) {
  if (typeof name !== "string" || !/^[A-Za-z0-9._-]+\.js$/.test(name)) {
    const err = new Error("invalid script name");
    err.statusCode = 400;
    throw err;
  }
  return name;
}

export function assertOwner(name) {
  if (typeof name !== "string" || !/^[A-Za-z0-9_-]+$/.test(name)) {
    const err = new Error("invalid owner");
    err.statusCode = 400;
    throw err;
  }
  return name;
}

export function assertWorkflowFile(name) {
  if (
    typeof name !== "string" ||
    !/^[A-Za-z0-9._-]+\.ya?ml$/.test(name) ||
    name === "registers.yaml"
  ) {
    const err = new Error("invalid workflow file");
    err.statusCode = 400;
    throw err;
  }
  return name;
}

export function listScriptFiles() {
  if (!fs.existsSync(SCRIPTS_DIR)) return [];
  return fs
    .readdirSync(SCRIPTS_DIR)
    .filter((f) => f.endsWith(".js"))
    .sort();
}

export function readScript(name) {
  assertScriptName(name);
  const filePath = path.join(SCRIPTS_DIR, name);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

export function writeScript(name, content) {
  assertScriptName(name);
  fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
  fs.writeFileSync(path.join(SCRIPTS_DIR, name), content, "utf8");
}

export function deleteScript(name) {
  assertScriptName(name);
  const filePath = path.join(SCRIPTS_DIR, name);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

export function listOwners() {
  if (!fs.existsSync(WORKFLOWS_DIR)) return [];
  return fs
    .readdirSync(WORKFLOWS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

function registersPath(owner) {
  return path.join(WORKFLOWS_DIR, owner, "registers.yaml");
}

export function readRegisters(owner) {
  const filePath = registersPath(owner);
  if (!fs.existsSync(filePath)) return [];
  const parsed = yaml.parse(fs.readFileSync(filePath, "utf8")) ?? {};
  return Array.isArray(parsed.scripts) ? parsed.scripts : [];
}

export function writeRegisters(owner, files) {
  const ownerDir = path.join(WORKFLOWS_DIR, owner);
  fs.mkdirSync(ownerDir, { recursive: true });
  fs.writeFileSync(
    registersPath(owner),
    yaml.stringify({ scripts: files }),
    "utf8",
  );
}

export function readWorkflowYaml(owner, file) {
  assertOwner(owner);
  assertWorkflowFile(file);
  const filePath = path.join(WORKFLOWS_DIR, owner, file);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, "utf8");
}

export function writeWorkflowYaml(owner, file, content) {
  assertOwner(owner);
  assertWorkflowFile(file);
  const ownerDir = path.join(WORKFLOWS_DIR, owner);
  fs.mkdirSync(ownerDir, { recursive: true });
  fs.writeFileSync(path.join(ownerDir, file), content, "utf8");
}

export function deleteWorkflowYaml(owner, file) {
  assertOwner(owner);
  assertWorkflowFile(file);
  const filePath = path.join(WORKFLOWS_DIR, owner, file);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

export function listOwnerYamlFiles(owner) {
  const ownerDir = path.join(WORKFLOWS_DIR, owner);
  if (!fs.existsSync(ownerDir)) return [];
  return fs
    .readdirSync(ownerDir)
    .filter((f) => f.endsWith(".yaml") && f !== "registers.yaml")
    .sort();
}
