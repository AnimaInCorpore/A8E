"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const { createHeadlessAutomation } = require("./headless");
const runtimeVersion = require("./version.json").version;

const DEFAULT_WORKSPACE_CWD = path.resolve(__dirname, "..");
const DEFAULT_OS_ROM = path.resolve(DEFAULT_WORKSPACE_CWD, "ATARIXL.ROM");
const DEFAULT_BASIC_ROM = path.resolve(DEFAULT_WORKSPACE_CWD, "ATARIBAS.ROM");
const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function toBuffer(value) {
  if (value === null || value === undefined) return null;
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Buffer.from(value);
  throw new TypeError("Unsupported binary input");
}

function resolvePath(cwd, inputPath) {
  const base = cwd && typeof cwd === "string" ? cwd : DEFAULT_WORKSPACE_CWD;
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(base, inputPath);
}

function omitKeys(source, keys) {
  const out = {};
  const blocked = new Set(keys || []);
  Object.keys(source || {}).forEach(function (key) {
    if (!blocked.has(key)) out[key] = source[key];
  });
  return out;
}

function readBinaryInput(args, cwd) {
  if (!args || typeof args !== "object") return null;
  if (typeof args.path === "string" && args.path.length > 0) return fs.readFileSync(resolvePath(cwd, args.path));
  if (typeof args.file === "string" && args.file.length > 0) return fs.readFileSync(resolvePath(cwd, args.file));
  if (typeof args.base64 === "string") return Buffer.from(args.base64, "base64");
  if (typeof args.dataBase64 === "string") return Buffer.from(args.dataBase64, "base64");
  if (typeof args.bytesBase64 === "string") return Buffer.from(args.bytesBase64, "base64");
  if (args.buffer !== undefined && args.buffer !== null) return toBuffer(args.buffer);
  if (args.bytes !== undefined && args.bytes !== null) return toBuffer(args.bytes);
  if (args.data !== undefined && args.data !== null) {
    if (typeof args.data === "string") return Buffer.from(args.data, "base64");
    return toBuffer(args.data);
  }
  return null;
}

function sanitizeValue(value) {
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value)) {
    return { byteLength: value.length, base64: value.toString("base64") };
  }
  if (value instanceof ArrayBuffer) {
    const bytes = Buffer.from(value);
    return { byteLength: bytes.length, base64: bytes.toString("base64") };
  }
  if (ArrayBuffer.isView(value)) {
    const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    return { byteLength: bytes.length, base64: bytes.toString("base64") };
  }
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (isPlainObject(value)) {
    const out = {};
    Object.keys(value).forEach(function (key) {
      const next = sanitizeValue(value[key]);
      if (next !== undefined) out[key] = next;
    });
    return out;
  }
  return value;
}

function protocolError(code, message, data) {
  const err = new Error(message);
  err.code = code;
  err.data = data;
  err.isProtocolError = true;
  return err;
}

function errorToData(err) {
  return sanitizeValue({
    name: err && err.name ? String(err.name) : "Error",
    message: err && err.message ? String(err.message) : "Unknown error",
    code: err && err.code !== undefined ? err.code : undefined,
    phase: err && err.phase !== undefined ? err.phase : undefined,
    details: err && err.details !== undefined ? err.details : undefined,
  });
}

function resultText(tool, action, detail) {
  const prefix = action ? tool + "." + action : tool;
  if (!detail) return prefix + ": ok";
  if (typeof detail === "string") return prefix + ": " + detail;
  if (detail && detail.message) return prefix + ": " + String(detail.message);
  return prefix + ": ok";
}

function successResult(tool, action, rawValue, content) {
  return {
    content: content && content.length ? content : [{ type: "text", text: resultText(tool, action, rawValue) }],
    structuredContent: { tool: tool, action: action || null, result: sanitizeValue(rawValue) },
    isError: false,
  };
}

function errorResult(tool, action, err) {
  return {
    content: [{ type: "text", text: resultText(tool, action, err && err.message ? err.message : "failed") }],
    structuredContent: { tool: tool, action: action || null, error: errorToData(err) },
    isError: true,
  };
}

function screenshotResult(rawValue) {
  const screenshot = sanitizeValue(rawValue);
  const content = [];
  if (screenshot && screenshot.base64) {
    content.push({ type: "image", data: String(screenshot.base64), mimeType: String(screenshot.mimeType || "image/png") });
  }
  content.push({ type: "text", text: resultText("artifacts", "captureScreenshot", screenshot) });
  return {
    content: content,
    structuredContent: { tool: "artifacts", action: "captureScreenshot", result: screenshot },
    isError: false,
  };
}

function buildTools() {
  return [
    {
      name: "get_capabilities",
      title: "Get Capabilities",
      description: "Returns jsA8E automation version and feature flags.",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
    },
    {
      name: "get_system_state",
      title: "Get System State",
      description: "Returns the structured machine summary from jsA8E.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { timeoutMs: { type: ["number", "string"], description: "Optional state-read timeout." } },
      },
    },
    {
      name: "call_automation",
      title: "Call jsA8E Automation",
      description: "Grouped bridge over the jsA8E automation API. Provide { domain, action, args }. Domains: system, media, input, debug, dev, artifacts.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          domain: { type: "string", enum: ["system", "media", "input", "debug", "dev", "artifacts"] },
          action: { type: "string" },
          args: { type: "object", additionalProperties: true, description: "Arguments forwarded to the selected jsA8E method." },
        },
        required: ["domain", "action"],
      },
    },
  ];
}

function buildInstructions() {
  return [
    "This server wraps jsA8E's headless automation runtime.",
    "Use get_capabilities first, then get_system_state if you need the current machine state.",
    "Use call_automation with { domain, action, args } to invoke grouped jsA8E methods.",
    "Binary inputs should use base64 or local file paths. Screenshot results return an MCP image block plus base64 data in structuredContent.",
  ].join(" ");
}

function createMcpSession(runtime, options) {
  if (!runtime || !runtime.api) throw new Error("A runtime with an attached automation API is required");
  const api = runtime.api;
  const cwd = options && typeof options.cwd === "string" ? options.cwd : DEFAULT_WORKSPACE_CWD;
  const tools = buildTools();
  const toolMap = new Map(tools.map(function (tool) { return [tool.name, tool]; }));
  let disposed = false;
  let initialized = false;

  function callDomain(domain, action, args) {
    const payload = args && isPlainObject(args) ? args : {};
    switch (domain) {
      case "system":
        switch (action) {
          case "start": return api.system.start();
          case "pause": return api.system.pause();
          case "reset": return api.system.reset(payload);
          case "boot": return api.system.boot(payload);
          case "saveSnapshot": return api.system.saveSnapshot(payload);
          case "loadSnapshot": {
            const binary = readBinaryInput(payload, cwd);
            if (!binary) throw protocolError(-32602, "system.loadSnapshot requires binary data");
            return api.system.loadSnapshot(binary, omitKeys(payload, ["path", "file", "base64", "dataBase64", "bytesBase64", "buffer", "bytes", "data"]));
          }
          case "reload": return api.system.reload(payload);
          case "waitForPause": return api.system.waitForPause(payload);
          case "waitForTime": return api.system.waitForTime(payload);
          case "waitForFrames": return api.system.waitForFrames(payload);
          case "waitForCycles": return api.system.waitForCycles(payload);
          case "dispose": return api.system.dispose(payload);
          default: throw protocolError(-32602, "Unknown system action: " + String(action), { action: action });
        }
      case "media":
        switch (action) {
          case "loadRom": {
            const kind = payload.kind;
            if (kind !== "os" && kind !== "basic") throw protocolError(-32602, 'media.loadRom requires kind = "os" or "basic"');
            const binary = readBinaryInput(payload, cwd);
            if (!binary) throw protocolError(-32602, "media.loadRom requires binary data");
            return api.media.loadRom(kind, binary);
          }
          case "loadOsRom": {
            const binary = readBinaryInput(payload, cwd);
            if (!binary) throw protocolError(-32602, "media.loadOsRom requires binary data");
            return api.media.loadOsRom(binary);
          }
          case "loadBasicRom": {
            const binary = readBinaryInput(payload, cwd);
            if (!binary) throw protocolError(-32602, "media.loadBasicRom requires binary data");
            return api.media.loadBasicRom(binary);
          }
          case "loadRomFromUrl": return api.media.loadRomFromUrl(payload.url, omitKeys(payload, ["url"]));
          case "loadOsRomFromUrl": return api.media.loadOsRomFromUrl(payload.url, omitKeys(payload, ["url"]));
          case "loadBasicRomFromUrl": return api.media.loadBasicRomFromUrl(payload.url, omitKeys(payload, ["url"]));
          case "mountDisk": {
            const binary = readBinaryInput(payload, cwd);
            if (!binary) throw protocolError(-32602, "media.mountDisk requires binary data");
            const nameOrOptions = payload.nameOrOptions !== undefined ? payload.nameOrOptions : (payload.name !== undefined || payload.slot !== undefined ? { name: payload.name, slot: payload.slot } : undefined);
            return api.media.mountDisk(binary, nameOrOptions, payload.slot);
          }
          case "mountDiskFromUrl": return api.media.mountDiskFromUrl(payload.url, omitKeys(payload, ["url"]));
          case "loadDisk": {
            const binary = readBinaryInput(payload, cwd);
            if (!binary) throw protocolError(-32602, "media.loadDisk requires binary data");
            return api.media.loadDisk(binary, omitKeys(payload, ["path", "file", "base64", "dataBase64", "bytesBase64", "buffer", "bytes", "data"]));
          }
          case "unmountDisk": return api.media.unmountDisk(payload.slot);
          case "getMountedMedia": return api.media.getMountedMedia();
          default: throw protocolError(-32602, "Unknown media action: " + String(action), { action: action });
        }
      case "input":
        switch (action) {
          case "focusDisplay": return api.input.focusDisplay();
          case "keyDown": return api.input.keyDown(payload);
          case "keyUp": return api.input.keyUp(payload);
          case "tapKey": return api.input.tapKey(payload, payload.options);
          case "typeText": return api.input.typeText(payload.text, omitKeys(payload, ["text"]));
          case "setJoystick": return api.input.setJoystick(payload);
          case "getConsoleKeyState": return api.input.getConsoleKeyState();
          case "setConsoleKeys": return api.input.setConsoleKeys(payload);
          case "pressConsoleKey": return api.input.pressConsoleKey(payload.key, omitKeys(payload, ["key"]));
          case "releaseAllInputs": return api.input.releaseAllInputs();
          default: throw protocolError(-32602, "Unknown input action: " + String(action), { action: action });
        }
      case "debug":
        switch (action) {
          case "setBreakpoints": return api.debug.setBreakpoints(payload.addresses !== undefined ? payload.addresses : payload);
          case "stepInstruction": return api.debug.stepInstruction();
          case "stepOver": return api.debug.stepOver();
          case "runUntilPc": return api.debug.runUntilPc(payload.targetPc !== undefined ? payload.targetPc : payload.pc, omitKeys(payload, ["targetPc", "pc"]));
          case "runUntilPcOrSnapshot": return api.debug.runUntilPcOrSnapshot(payload.targetPc !== undefined ? payload.targetPc : payload.pc, omitKeys(payload, ["targetPc", "pc"]));
          case "waitForPc": return api.debug.waitForPc(payload.targetPc !== undefined ? payload.targetPc : payload.pc, omitKeys(payload, ["targetPc", "pc"]));
          case "waitForBreakpoint": return api.debug.waitForBreakpoint(payload);
          case "getDebugState": return api.debug.getDebugState(payload);
          case "getCounters": return api.debug.getCounters(payload);
          case "getBankState": return api.debug.getBankState(payload);
          case "getTraceTail": return api.debug.getTraceTail(payload.limit !== undefined ? payload.limit : payload);
          case "readMemory": return api.debug.readMemory(payload.address);
          case "readRange": return api.debug.readRange(payload.start, payload.length, omitKeys(payload, ["start", "length"]));
          case "readWord": return api.debug.readWord(payload.address, omitKeys(payload, ["address"]));
          case "readWordSigned": return api.debug.readWordSigned(payload.address, omitKeys(payload, ["address"]));
          case "writeMemory": return api.debug.writeMemory(payload.address, payload.value);
          case "writeRange": {
            const binary = readBinaryInput(payload, cwd);
            if (!binary) throw protocolError(-32602, "debug.writeRange requires binary data");
            return api.debug.writeRange(payload.start, binary);
          }
          case "writeWord": return api.debug.writeWord(payload.address, payload.value, omitKeys(payload, ["address", "value"]));
          case "waitForMemory": return api.debug.waitForMemory(payload);
          case "getSourceContext": return api.debug.getSourceContext(payload);
          case "disassemble": return api.debug.disassemble(payload);
          case "sym": return api.debug.sym(payload.name, payload.fallback);
          case "peek": return api.debug.peek(payload.address);
          case "poke": return api.debug.poke(payload.address, payload.value);
          default: throw protocolError(-32602, "Unknown debug action: " + String(action), { action: action });
        }
      case "dev":
        switch (action) {
          case "listHostFiles": return api.dev.listHostFiles(payload.pattern);
          case "readHostFile": return api.dev.readHostFile(payload.name, omitKeys(payload, ["name"]));
          case "writeHostFile": {
            const options = omitKeys(payload, ["name", "text", "base64", "dataBase64", "bytesBase64", "buffer", "bytes", "data", "path", "file"]);
            if (payload.text !== undefined) return api.dev.writeHostFile(payload.name, { text: String(payload.text) }, options);
            const binary = readBinaryInput(payload, cwd);
            if (!binary) throw protocolError(-32602, "dev.writeHostFile requires text or binary data");
            return api.dev.writeHostFile(payload.name, binary, options);
          }
          case "deleteHostFile": return api.dev.deleteHostFile(payload.name);
          case "renameHostFile": return api.dev.renameHostFile(payload.oldName, payload.newName);
          case "lockHostFile": return api.dev.lockHostFile(payload.name);
          case "unlockHostFile": return api.dev.unlockHostFile(payload.name);
          case "getHostFileStatus": return api.dev.getHostFileStatus(payload.name);
          case "waitForHostFsFile": return api.dev.waitForHostFsFile(payload.name, omitKeys(payload, ["name"]));
          case "assembleSource": {
            const spec = omitKeys(payload, ["path", "file", "sourcePath"]);
            if (payload.path || payload.file || payload.sourcePath) spec.text = fs.readFileSync(resolvePath(cwd, payload.path || payload.file || payload.sourcePath), "utf8");
            return api.dev.assembleSource(spec);
          }
          case "assembleHostFile": return api.dev.assembleHostFile(payload.name, omitKeys(payload, ["name"]));
          case "getLastBuildResult": return api.dev.getLastBuildResult(payload);
          case "runXexFromUrl": return api.dev.runXexFromUrl(payload.url, omitKeys(payload, ["url"]));
          case "runXex": {
            const spec = omitKeys(payload, ["path", "file", "base64", "dataBase64", "bytesBase64", "buffer", "bytes", "data"]);
            const binary = readBinaryInput(payload, cwd);
            if (binary) spec.buffer = binary;
            return api.dev.runXex(spec);
          }
          case "buildAndRun": {
            const source = payload.text !== undefined ? String(payload.text) : payload.source;
            if (source === undefined && !(payload.path || payload.file || payload.sourcePath)) throw protocolError(-32602, "dev.buildAndRun requires source text or a path");
            const spec = omitKeys(payload, ["path", "file", "sourcePath", "text", "source"]);
            if (payload.path || payload.file || payload.sourcePath) spec.text = fs.readFileSync(resolvePath(cwd, payload.path || payload.file || payload.sourcePath), "utf8");
            return api.dev.buildAndRun(spec.text !== undefined ? spec.text : source, spec);
          }
          case "sym": return api.dev.sym(payload.name, payload.fallback);
          default: throw protocolError(-32602, "Unknown dev action: " + String(action), { action: action });
        }
      case "artifacts":
        switch (action) {
          case "captureScreenshot": return api.artifacts.captureScreenshot(payload);
          case "collectArtifacts": return api.artifacts.collectArtifacts(payload);
          case "captureFailureState": return api.artifacts.captureFailureState(payload);
          default: throw protocolError(-32602, "Unknown artifacts action: " + String(action), { action: action });
        }
      default:
        throw protocolError(-32602, "Unknown domain: " + String(domain), { domain: domain });
    }
  }

  async function handleRequest(message) {
    if (!message || typeof message !== "object") throw protocolError(-32600, "Invalid request");
    if (message.method === "initialize") {
      const params = message.params && typeof message.params === "object" ? message.params : {};
      const requestedVersion = params.protocolVersion ? String(params.protocolVersion) : "";
      if (SUPPORTED_PROTOCOL_VERSIONS.indexOf(requestedVersion) < 0) {
        throw protocolError(-32602, "Unsupported protocol version", { supported: SUPPORTED_PROTOCOL_VERSIONS.slice(), requested: requestedVersion || null });
      }
      initialized = true;
      return { jsonrpc: "2.0", id: message.id, result: { protocolVersion: requestedVersion, capabilities: { tools: { listChanged: false } }, serverInfo: { name: "jsA8E MCP", version: runtimeVersion }, instructions: buildInstructions() } };
    }
    if (message.method === "initialized") return null;
    if (message.method === "shutdown") {
      await dispose();
      return { jsonrpc: "2.0", id: message.id, result: {} };
    }
    if (!initialized) throw protocolError(-32002, "Server not initialized");
    if (message.method === "tools/list") {
      return { jsonrpc: "2.0", id: message.id, result: { tools: tools } };
    }
    if (message.method === "tools/call") {
      const params = message.params && typeof message.params === "object" ? message.params : {};
      const toolName = params.name ? String(params.name) : "";
      if (!toolName) throw protocolError(-32602, "tools/call requires a tool name");
      try {
        if (toolName === "get_capabilities") {
          return { jsonrpc: "2.0", id: message.id, result: successResult(toolName, null, await api.getCapabilities()) };
        }
        if (toolName === "get_system_state") {
          return { jsonrpc: "2.0", id: message.id, result: successResult(toolName, null, await api.getSystemState(params.arguments || {})) };
        }
        if (toolName !== "call_automation") throw protocolError(-32601, "Unknown tool: " + String(toolName));
        const callArgs = params.arguments && isPlainObject(params.arguments) ? params.arguments : {};
        const domain = callArgs.domain ? String(callArgs.domain) : "";
        const action = callArgs.action ? String(callArgs.action) : "";
        if (!domain || !action) throw protocolError(-32602, "call_automation requires domain and action");
        const raw = await callDomain(domain, action, callArgs.args);
        if (domain === "artifacts" && action === "captureScreenshot") return { jsonrpc: "2.0", id: message.id, result: screenshotResult(raw) };
        return { jsonrpc: "2.0", id: message.id, result: successResult(toolName, domain + "." + action, raw) };
      } catch (err) {
        if (err && err.isProtocolError) throw err;
        const actionName = toolName === "call_automation" && params.arguments && params.arguments.action ? String(params.arguments.action) : null;
        return { jsonrpc: "2.0", id: message.id, result: errorResult(toolName, actionName, err) };
      }
    }
    throw protocolError(-32601, "Unknown method: " + String(message.method));
  }

  async function dispose() {
    if (disposed) return;
    disposed = true;
    if (runtime && typeof runtime.dispose === "function") await runtime.dispose();
  }

  function handlePayload(payload) {
    if (Array.isArray(payload)) {
      return Promise.all(payload.map(function (item) { return handlePayload(item); })).then(function (responses) {
        return responses.filter(function (item) { return item !== null && item !== undefined; });
      });
    }
    if (!payload || typeof payload !== "object") {
      return Promise.resolve({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } });
    }
    const isRequest = Object.prototype.hasOwnProperty.call(payload, "id");
    const requestId = isRequest ? payload.id : null;
    return Promise.resolve().then(function () { return handleRequest(payload); }).then(function (response) {
      return response === null || response === undefined ? null : response;
    }).catch(function (err) {
      if (err && err.isProtocolError) {
        return { jsonrpc: "2.0", id: requestId, error: { code: err.code, message: err.message, data: sanitizeValue(err.data) } };
      }
      if (!isRequest) return null;
      return { jsonrpc: "2.0", id: requestId, result: errorResult(payload.method || "unknown", payload.params && payload.params.action ? String(payload.params.action) : null, err) };
    });
  }

  return { cwd: cwd, tools: tools, handlePayload: handlePayload, dispose: dispose, isDisposed: function () { return disposed; } };
}

async function createMcpServer(options) {
  const opts = options && typeof options === "object" ? options : {};
  if (opts.runtime) return createMcpSession(opts.runtime, opts);
  const roms = opts.roms || {};
  const runtime = await createHeadlessAutomation({
    cwd: opts.cwd || DEFAULT_WORKSPACE_CWD,
    turbo: opts.turbo !== false,
    skipRendering: opts.skipRendering !== false,
    frameDelayMs: Number.isFinite(opts.frameDelayMs) ? opts.frameDelayMs : 0,
    audioEnabled: !!opts.audioEnabled,
    sioTurbo: opts.sioTurbo !== false,
    optionOnStart: !!opts.optionOnStart,
    keyboardMappingMode: opts.keyboardMappingMode === "original" ? "original" : "translated",
    roms: Object.keys(roms).length ? roms : undefined,
  });
  return createMcpSession(runtime, opts);
}

function parseArgs(argv) {
  const args = { cwd: DEFAULT_WORKSPACE_CWD, turbo: true, skipRendering: true, frameDelayMs: 0, audioEnabled: false, sioTurbo: true, optionOnStart: false, keyboardMappingMode: "translated" };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === "--cwd" && i + 1 < argv.length) args.cwd = path.resolve(argv[++i]);
    else if (token === "--os-rom" && i + 1 < argv.length) args.osRom = path.resolve(argv[++i]);
    else if (token === "--basic-rom" && i + 1 < argv.length) args.basicRom = path.resolve(argv[++i]);
    else if (token === "--turbo") args.turbo = true;
    else if (token === "--no-turbo") args.turbo = false;
    else if (token === "--skip-rendering") args.skipRendering = true;
    else if (token === "--rendering") args.skipRendering = false;
    else if (token === "--audio-enabled") args.audioEnabled = true;
    else if (token === "--no-audio") args.audioEnabled = false;
    else if (token === "--no-sio-turbo") args.sioTurbo = false;
    else if (token === "--option-on-start") args.optionOnStart = true;
    else if (token === "--keyboard-mapping-mode" && i + 1 < argv.length) args.keyboardMappingMode = String(argv[++i]);
    else if (token === "--frame-delay-ms" && i + 1 < argv.length) args.frameDelayMs = Number(argv[++i]);
  }
  return args;
}

async function main() {
  const cli = parseArgs(process.argv);
  const roms = {};
  const osRom = cli.osRom || process.env.JSA8E_OS_ROM || (fs.existsSync(DEFAULT_OS_ROM) ? DEFAULT_OS_ROM : null);
  const basicRom = cli.basicRom || process.env.JSA8E_BASIC_ROM || (fs.existsSync(DEFAULT_BASIC_ROM) ? DEFAULT_BASIC_ROM : null);
  if (osRom) roms.os = osRom;
  if (basicRom) roms.basic = basicRom;
  const runtime = await createMcpServer({ cwd: cli.cwd, turbo: cli.turbo, skipRendering: cli.skipRendering, frameDelayMs: cli.frameDelayMs, audioEnabled: cli.audioEnabled, sioTurbo: cli.sioTurbo, optionOnStart: cli.optionOnStart, keyboardMappingMode: cli.keyboardMappingMode, roms: Object.keys(roms).length ? roms : undefined });
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

  async function writeResponse(payload) {
    if (payload === null || payload === undefined) return;
    const items = Array.isArray(payload) ? payload : [payload];
    items.forEach(function (item) {
      if (item !== null && item !== undefined) process.stdout.write(JSON.stringify(item) + "\n");
    });
  }

  rl.on("line", function (line) {
    const trimmed = line.trim();
    if (!trimmed) return;
    let payload;
    try {
      payload = JSON.parse(trimmed);
    } catch (err) {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }) + "\n");
      return;
    }
    runtime.handlePayload(payload).then(writeResponse).catch(function (err) {
      process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: payload && Object.prototype.hasOwnProperty.call(payload, "id") ? payload.id : null, error: { code: -32603, message: err && err.message ? String(err.message) : "Internal error" } }) + "\n");
    });
  });

  async function shutdown() {
    rl.close();
    await runtime.dispose();
  }

  rl.on("close", function () {
    runtime.dispose().finally(function () {
      if (!process.env.JSA8E_MCP_NO_EXIT) process.exit(0);
    });
  });

  process.on("SIGINT", function () {
    shutdown().finally(function () {
      if (!process.env.JSA8E_MCP_NO_EXIT) process.exit(0);
    });
  });

  process.on("SIGTERM", function () {
    shutdown().finally(function () {
      if (!process.env.JSA8E_MCP_NO_EXIT) process.exit(0);
    });
  });
}

if (require.main === module) {
  main().catch(function (err) {
    process.stderr.write((err && err.stack ? err.stack : String(err)) + "\n");
    process.exit(1);
  });
}

module.exports = { createMcpServer: createMcpServer, createMcpSession: createMcpSession, parseArgs: parseArgs, sanitizeValue: sanitizeValue, supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS.slice() };

