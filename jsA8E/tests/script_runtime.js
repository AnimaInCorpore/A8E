"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { createHeadlessAutomation } = require("../headless");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DISKS_DIR = path.join(PROJECT_ROOT, "disks");
const BUILD_DIR = path.join(PROJECT_ROOT, "build");

function resolveProjectPath(...parts) {
  return path.resolve(PROJECT_ROOT, ...parts);
}

function resolveExistingPath(candidates, description) {
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    if (fs.existsSync(resolved)) return resolved;
  }
  throw new Error(
    `Missing ${description}. Checked:\n` +
      candidates
        .filter(Boolean)
        .map(function (item) {
          return `  - ${path.resolve(item)}`;
        })
        .join("\n"),
  );
}

function resolveRomPath(filename) {
  return resolveExistingPath(
    [
      resolveProjectPath(filename),
      path.join(DISKS_DIR, filename),
    ],
    `ROM ${filename}`,
  );
}

function resolveRoms() {
  return {
    os: resolveRomPath("ATARIXL.ROM"),
  };
}

async function createRuntime(options) {
  const opts = options && typeof options === "object" ? options : {};
  const defaults = {
    turbo: true,
    sioTurbo: false,
    frameDelayMs: 0,
  };
  const runtimeOptions = Object.assign({}, defaults, opts);
  runtimeOptions.roms = Object.assign({}, resolveRoms(), opts.roms || {});
  return createHeadlessAutomation(runtimeOptions);
}

function resolveDiskPath(nameCandidates, cliArgIndex) {
  const names = Array.isArray(nameCandidates) ? nameCandidates.slice(0) : [];
  const argIndex = Number.isInteger(cliArgIndex) ? cliArgIndex : 2;
  const cliArg =
    process.argv[argIndex] && process.argv[argIndex].trim()
      ? path.resolve(process.cwd(), process.argv[argIndex])
      : "";
  const candidates = [cliArg];
  for (let i = 0; i < names.length; i++) {
    const name = String(names[i] || "").trim();
    if (!name) continue;
    candidates.push(resolveProjectPath(name));
    candidates.push(path.join(DISKS_DIR, name));
  }
  const description =
    names.length > 0 ? `disk image (${names.join(", ")})` : "disk image";
  return resolveExistingPath(candidates, description);
}

function resolveBuildPath(filename) {
  const target = resolveProjectPath("build", String(filename || ""));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  return target;
}

module.exports = {
  PROJECT_ROOT,
  resolveProjectPath,
  resolveExistingPath,
  createRuntime,
  resolveDiskPath,
  resolveBuildPath,
};
