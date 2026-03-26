/* global __dirname, console, process, require */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createMcpSession } = require('../mcp_server');

function makeRuntime() {
  const calls = [];
  const runtime = {
    api: {
      getCapabilities: async function () {
        calls.push(['getCapabilities']);
        return { apiVersion: '1', artifactSchemaVersion: '2', worker: false, hostfs: true };
      },
      getSystemState: async function (options) {
        calls.push(['getSystemState', options || null]);
        return { ready: true, running: false };
      },
      system: {
        start: async function () { calls.push(['system.start']); return { started: true }; },
        pause: async function () { calls.push(['system.pause']); return { paused: true }; },
        loadSnapshot: async function (data, options) {
          calls.push(['system.loadSnapshot', Buffer.from(data).toString('base64'), options || null]);
          return { resumed: false, savedRunning: false };
        },
      },
      media: {
        loadOsRom: async function (data) { calls.push(['media.loadOsRom', Buffer.from(data).toString('base64')]); return { loaded: true }; },
      },
      input: {
        typeText: async function (text, options) { calls.push(['input.typeText', text, options || null]); return { typed: String(text) }; },
      },
      debug: {
        readRange: async function (start, length, options) { calls.push(['debug.readRange', start, length, options || null]); return Uint8Array.from([1, 2, 3, 4]); },
        peek: async function (address) { calls.push(['debug.peek', address]); return 170; },
      },
      dev: {
        assembleSource: async function (spec) { calls.push(['dev.assembleSource', spec]); return { ok: true, byteLength: 4, bytes: Uint8Array.from([5, 6, 7, 8]) }; },
        writeHostFile: async function (name, data, options) {
          calls.push(['dev.writeHostFile', name, Buffer.isBuffer(data) ? Buffer.from(data).toString('base64') : data, options || null]);
          return { written: true };
        },
      },
      artifacts: {
        captureScreenshot: async function () { calls.push(['artifacts.captureScreenshot']); return { mimeType: 'image/png', width: 2, height: 1, base64: 'AAAA' }; },
      },
    },
    dispose: async function () { calls.push(['dispose']); },
  };
  return { runtime: runtime, calls: calls };
}

async function main() {
  const stub = makeRuntime();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jsa8e-mcp-'));
  fs.writeFileSync(path.join(tempDir, 'SOURCE.ASM'), '.ORG $2000\n.END\n', 'utf8');
  const session = createMcpSession(stub.runtime, { cwd: tempDir });

  try {
    const init = await session.handlePayload({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test-client', version: '1' } },
    });
    assert.equal(init.result.protocolVersion, '2025-11-25');
    assert.equal(init.result.capabilities.tools.listChanged, false);
    assert.equal(init.result.serverInfo.version, 'v1.3.0');

    const list = await session.handlePayload({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    assert.ok(list.result.tools.some(function (tool) { return tool.name === 'call_automation'; }));

    const caps = await session.handlePayload({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_capabilities' } });
    assert.equal(caps.result.structuredContent.result.hostfs, true);
    assert.equal(stub.calls[0][0], 'getCapabilities');

    const pause = await session.handlePayload({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'call_automation', arguments: { domain: 'system', action: 'pause', args: {} } } });
    assert.equal(pause.result.structuredContent.tool, 'call_automation');
    assert.equal(stub.calls[1][0], 'system.pause');

    const state = await session.handlePayload({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'get_system_state', arguments: { timeoutMs: 250 } } });
    assert.equal(state.result.structuredContent.result.ready, true);
    assert.equal(stub.calls[2][0], 'getSystemState');

    const snapshotLoad = await session.handlePayload({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'call_automation', arguments: { domain: 'system', action: 'loadSnapshot', args: { base64: Buffer.from([9, 8, 7]).toString('base64'), resume: 'saved' } } },
    });
    assert.equal(snapshotLoad.result.structuredContent.action, 'system.loadSnapshot');
    assert.equal(stub.calls[3][0], 'system.loadSnapshot');
    assert.equal(stub.calls[3][1], Buffer.from([9, 8, 7]).toString('base64'));

    const mediaLoad = await session.handlePayload({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'call_automation', arguments: { domain: 'media', action: 'loadOsRom', args: { base64: Buffer.from([1, 2, 3]).toString('base64') } } },
    });
    assert.equal(mediaLoad.result.structuredContent.action, 'media.loadOsRom');
    assert.equal(stub.calls[4][0], 'media.loadOsRom');

    const textInput = await session.handlePayload({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'call_automation', arguments: { domain: 'input', action: 'typeText', args: { text: 'HELLO' } } },
    });
    assert.equal(textInput.result.structuredContent.result.typed, 'HELLO');
    assert.equal(stub.calls[5][0], 'input.typeText');

    const debugRange = await session.handlePayload({
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: { name: 'call_automation', arguments: { domain: 'debug', action: 'readRange', args: { start: 8192, length: 4 } } },
    });
    assert.equal(debugRange.result.structuredContent.result.byteLength, 4);
    assert.equal(debugRange.result.structuredContent.result.base64, Buffer.from([1, 2, 3, 4]).toString('base64'));
    assert.equal(stub.calls[6][0], 'debug.readRange');

    const assemble = await session.handlePayload({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: { name: 'call_automation', arguments: { domain: 'dev', action: 'assembleSource', args: { path: 'SOURCE.ASM', name: 'SOURCE.ASM' } } },
    });
    assert.equal(assemble.result.structuredContent.result.ok, true);
    assert.equal(stub.calls[7][0], 'dev.assembleSource');
    assert.equal(stub.calls[7][1].text.includes('.ORG $2000'), true);

    const writeHost = await session.handlePayload({
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/call',
      params: { name: 'call_automation', arguments: { domain: 'dev', action: 'writeHostFile', args: { name: 'OUT.BIN', base64: Buffer.from([4, 5, 6]).toString('base64') } } },
    });
    assert.equal(writeHost.result.structuredContent.result.written, true);
    assert.equal(stub.calls[8][0], 'dev.writeHostFile');
    assert.equal(stub.calls[8][2], Buffer.from([4, 5, 6]).toString('base64'));

    const screenshot = await session.handlePayload({
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/call',
      params: { name: 'call_automation', arguments: { domain: 'artifacts', action: 'captureScreenshot', args: {} } },
    });
    assert.equal(screenshot.result.structuredContent.result.width, 2);
    assert.equal(screenshot.result.content[0].type, 'image');
    assert.equal(screenshot.result.content[0].mimeType, 'image/png');
    assert.equal(stub.calls[9][0], 'artifacts.captureScreenshot');

    const unknownDomain = await session.handlePayload({ jsonrpc: '2.0', id: 13, method: 'tools/call', params: { name: 'call_automation', arguments: { domain: 'missing', action: 'noop', args: {} } } });
    assert.equal(unknownDomain.error.code, -32602);

    await session.dispose();
    assert.equal(stub.calls[stub.calls.length - 1][0], 'dispose');

    console.log('mcp_server.test.js passed');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
