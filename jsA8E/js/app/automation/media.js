(function () {
  "use strict";

  const AutomationUtil = window.A8EAutomationUtil;
  if (!AutomationUtil) {
    throw new Error("A8EAutomationUtil is unavailable");
  }

  function createApi(deps) {
    const config = deps && typeof deps === "object" ? deps : {};
    const api = config.api && typeof config.api === "object" ? config.api : null;
    if (!api) {
      throw new Error("A8EAutomationMedia requires an api dependency");
    }
    const runXex =
      typeof config.runXex === "function" ? config.runXex : null;
    const emitProgress =
      typeof config.emitProgress === "function" ? config.emitProgress : function () {};
    const buildUrlWithCacheControl =
      typeof config.buildUrlWithCacheControl === "function"
        ? config.buildUrlWithCacheControl
        : AutomationUtil.buildUrlWithCacheControl;
    const buildFetchInit =
      typeof config.buildFetchInit === "function"
        ? config.buildFetchInit
        : AutomationUtil.buildFetchInit;
    const createAutomationError =
      typeof config.createAutomationError === "function"
        ? config.createAutomationError
        : AutomationUtil.createAutomationError;
    const isArrayBufferLike =
      typeof config.isArrayBufferLike === "function"
        ? config.isArrayBufferLike
        : AutomationUtil.isArrayBufferLike;
    const isDataViewLike =
      typeof config.isDataViewLike === "function"
        ? config.isDataViewLike
        : AutomationUtil.isDataViewLike;
    const isBinaryView =
      typeof config.isBinaryView === "function"
        ? config.isBinaryView
        : AutomationUtil.isBinaryView;
    const toArrayBuffer =
      typeof config.toArrayBuffer === "function"
        ? config.toArrayBuffer
        : AutomationUtil.toArrayBuffer;
    const toUint8Array =
      typeof config.toUint8Array === "function"
        ? config.toUint8Array
        : AutomationUtil.toUint8Array;
    const decodeText =
      typeof config.decodeText === "function"
        ? config.decodeText
        : AutomationUtil.decodeText;

    function fetchBinaryResource(url, options) {
      const opts = options || {};
      const operation = opts.operation ? String(opts.operation) : "fetchBinaryResource";
      const originalUrl = String(url || "");
      const requestUrl = buildUrlWithCacheControl(originalUrl, opts);
      emitProgress(operation, "resource_fetch_started", {
        url: requestUrl,
        originalUrl: originalUrl,
      });

      return Promise.resolve()
        .then(function () {
          return fetch(requestUrl, buildFetchInit(opts));
        })
        .then(function (response) {
          if (!response || !response.ok) {
            emitProgress(operation, "resource_fetch_failed", {
              url: requestUrl,
              originalUrl: originalUrl,
              status: response ? response.status | 0 : 0,
            });
            throw createAutomationError({
              operation: operation,
              phase: "resource_fetch",
              message:
                "Automation resource fetch failed with HTTP " +
                (response ? response.status | 0 : 0),
              url: requestUrl,
              status: response ? response.status | 0 : 0,
              details: {
                statusText:
                  response && response.statusText ? String(response.statusText) : "",
              },
            });
          }
          return Promise.resolve(response.arrayBuffer())
            .then(function (buffer) {
              const bytes = toUint8Array(buffer);
              emitProgress(operation, "resource_fetch_completed", {
                url: requestUrl,
                originalUrl: originalUrl,
                responseUrl: response.url ? String(response.url) : requestUrl,
                status: response.status | 0,
                byteLength: bytes.length | 0,
                contentType:
                  response.headers && typeof response.headers.get === "function"
                    ? response.headers.get("content-type") || ""
                    : "",
              });
              return {
                url: requestUrl,
                originalUrl: originalUrl,
                responseUrl: response.url ? String(response.url) : requestUrl,
                status: response.status | 0,
                contentType:
                  response.headers && typeof response.headers.get === "function"
                    ? response.headers.get("content-type") || ""
                    : "",
                bytes: bytes,
              };
            })
            .catch(function (err) {
              emitProgress(operation, "resource_read_failed", {
                url: requestUrl,
                originalUrl: originalUrl,
                status: response.status | 0,
              });
              throw createAutomationError({
                operation: operation,
                phase: "resource_fetch",
                message:
                  "Fetched automation resource could not be read as binary data",
                url: requestUrl,
                status: response.status | 0,
                cause: err,
              });
            });
        })
        .catch(function (err) {
          if (err && err.operation) throw err;
          emitProgress(operation, "resource_fetch_failed", {
            url: requestUrl,
            originalUrl: originalUrl,
          });
          throw createAutomationError({
            operation: operation,
            phase: "resource_fetch",
            message: "Failed to fetch automation resource",
            url: requestUrl,
            cause: err,
          });
        });
    }

    function normalizeRomRequest(kind, data) {
      let nextKind = kind;
      let nextData = data;
      if (kind && typeof kind === "object" && !isBinaryView(kind)) {
        nextKind = kind.kind || kind.type || kind.rom || "";
        nextData =
          kind.data !== undefined
            ? kind.data
            : kind.buffer !== undefined
              ? kind.buffer
              : kind.base64 !== undefined
                ? { base64: kind.base64 }
                : kind.bytes;
      }
      const normalizedKind = String(nextKind || "").toLowerCase();
      if (normalizedKind !== "os" && normalizedKind !== "basic") {
        throw new Error("A8EAutomation.loadRom kind must be 'os' or 'basic'");
      }
      return {
        kind: normalizedKind,
        buffer: toArrayBuffer(nextData),
      };
    }

    function normalizeRomUrlRequest(kind, url, options) {
      let nextKind = kind;
      let nextUrl = url;
      let nextOptions = options;
      if (
        kind &&
        typeof kind === "object" &&
        !isBinaryView(kind) &&
        !isDataViewLike(kind) &&
        !isArrayBufferLike(kind)
      ) {
        const spec = Object.assign({}, kind);
        nextKind = spec.kind || spec.type || spec.rom || "";
        nextUrl =
          spec.url !== undefined
            ? spec.url
            : spec.href !== undefined
              ? spec.href
              : spec.sourceUrl;
        delete spec.kind;
        delete spec.type;
        delete spec.rom;
        delete spec.url;
        delete spec.href;
        delete spec.sourceUrl;
        nextOptions = spec;
      }
      return {
        kind: nextKind,
        url: nextUrl,
        options:
          nextOptions && typeof nextOptions === "object"
            ? Object.assign({}, nextOptions)
            : {},
      };
    }

    function normalizeDiskRequest(data, nameOrOpts, slot) {
      let name = "disk.atr";
      let targetSlot = 0;
      if (nameOrOpts && typeof nameOrOpts === "object" && !isBinaryView(nameOrOpts)) {
        name = String(nameOrOpts.name || name);
        targetSlot =
          nameOrOpts.slot !== undefined && nameOrOpts.slot !== null
            ? nameOrOpts.slot | 0
            : 0;
      } else {
        if (nameOrOpts) name = String(nameOrOpts);
        if (slot !== undefined && slot !== null) targetSlot = slot | 0;
      }
      return {
        name: name,
        slot: targetSlot,
        buffer: toArrayBuffer(data),
      };
    }

    function guessNameFromUrl(url, fallbackName) {
      const fallback = String(fallbackName || "resource.bin");
      const rawUrl = String(url || "");
      if (!rawUrl.length) return fallback;
      try {
        const resolved = new URL(rawUrl, window.location.href);
        const path = resolved.pathname || "";
        const slash = path.lastIndexOf("/");
        const name = slash >= 0 ? path.substring(slash + 1) : path;
        return name || fallback;
      } catch {
        const clean = rawUrl.split(/[?#]/)[0];
        const slash = Math.max(clean.lastIndexOf("/"), clean.lastIndexOf("\\"));
        const name = slash >= 0 ? clean.substring(slash + 1) : clean;
        return name || fallback;
      }
    }

    function resolveIncludeFromHostFs(hostFs, includePath) {
      if (!hostFs || typeof hostFs.readFile !== "function") return null;
      const rawPath = String(includePath || "").trim();
      if (!rawPath.length) return null;
      const candidates = [];
      const seen = new Set();

      function addCandidate(name) {
        if (!name) return;
        const normalized =
          typeof hostFs.normalizeName === "function"
            ? hostFs.normalizeName(name)
            : String(name || "").toUpperCase();
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        candidates.push(normalized);
      }

      addCandidate(rawPath);
      const slashNorm = rawPath.replace(/\\/g, "/");
      const lastSlash = slashNorm.lastIndexOf("/");
      if (lastSlash >= 0 && lastSlash + 1 < slashNorm.length) {
        addCandidate(slashNorm.substring(lastSlash + 1));
      }
      const base = slashNorm.substring(lastSlash + 1);
      if (base.indexOf(".") < 0) {
        addCandidate(base + ".INC");
        addCandidate(base + ".ASM");
      }

      for (let i = 0; i < candidates.length; i++) {
        const data = hostFs.readFile(candidates[i]);
        if (data && data.length >= 0) return decodeText(toUint8Array(data));
      }
      return null;
    }

    function buildAssembleOptions(spec, hostFs) {
      const out = {
        sourceName: spec.name || "SOURCE.ASM",
      };
      if (typeof spec.includeResolver === "function") {
        out.includeResolver = spec.includeResolver;
      } else if (hostFs) {
        out.includeResolver = function (includePath) {
          return resolveIncludeFromHostFs(hostFs, includePath);
        };
      }
      if (spec.defines !== undefined) out.defines = spec.defines;
      if (spec.preprocessorDefines !== undefined) {
        out.preprocessorDefines = spec.preprocessorDefines;
      }
      if (spec.initialDefines !== undefined) out.initialDefines = spec.initialDefines;
      if (spec.importValues !== undefined) out.importValues = spec.importValues;
      if (spec.imports !== undefined) out.imports = spec.imports;
      if (spec.externals !== undefined) out.externals = spec.externals;
      if (spec.deferAsserts !== undefined) out.deferAsserts = !!spec.deferAsserts;
      if (spec.suppressRunAddress !== undefined)
        {out.suppressRunAddress = !!spec.suppressRunAddress;}
      return out;
    }

    async function mountDiskFromUrl(url, options) {
      const opts = options && typeof options === "object" ? Object.assign({}, options) : {};
      const resource = await fetchBinaryResource(
        url,
        Object.assign({}, opts, {
          operation: "mountDiskFromUrl",
        }),
      );
      const name = opts.name ? String(opts.name) : guessNameFromUrl(url, "disk.atr");
      const slotIndex = opts.slot !== undefined ? opts.slot | 0 : 0;
      const result = await api.mountDisk(resource.bytes, {
        name: name,
        slot: slotIndex,
      });
      return Object.assign(
        {},
        result,
        {
          sourceUrl: resource.responseUrl || resource.url,
          byteLength: resource.bytes.length | 0,
          contentType: resource.contentType || "",
        },
      );
    }

    async function loadRomFromUrl(kind, url, options) {
      const request = normalizeRomUrlRequest(kind, url, options);
      const resource = await fetchBinaryResource(
        request.url,
        Object.assign({}, request.options, {
          operation: "loadRomFromUrl",
        }),
      );
      const result = await api.loadRom(request.kind, resource.bytes);
      return Object.assign(
        {},
        result,
        {
          sourceUrl: resource.responseUrl || resource.url,
          byteLength: resource.bytes.length | 0,
          contentType: resource.contentType || "",
        },
      );
    }

    async function runXexFromUrl(url, options) {
      if (!runXex) {
        throw new Error("A8EAutomation.runXexFromUrl requires a runXex dependency");
      }
      const opts = options && typeof options === "object" ? Object.assign({}, options) : {};
      const resource = await fetchBinaryResource(
        url,
        Object.assign({}, opts, {
          operation: "runXexFromUrl",
        }),
      );
      return runXex(
        Object.assign({}, opts, {
          bytes: resource.bytes,
          name: opts.name ? String(opts.name) : guessNameFromUrl(url, "PROGRAM.XEX"),
          sourceUrl: resource.responseUrl || resource.url,
          operation: "runXexFromUrl",
        }),
      );
    }

    return {
      fetchBinaryResource: fetchBinaryResource,
      normalizeRomRequest: normalizeRomRequest,
      normalizeRomUrlRequest: normalizeRomUrlRequest,
      normalizeDiskRequest: normalizeDiskRequest,
      guessNameFromUrl: guessNameFromUrl,
      resolveIncludeFromHostFs: resolveIncludeFromHostFs,
      buildAssembleOptions: buildAssembleOptions,
      mountDiskFromUrl: mountDiskFromUrl,
      loadRomFromUrl: loadRomFromUrl,
      runXexFromUrl: runXexFromUrl,
    };
  }

  window.A8EAutomationMedia = {
    createApi: createApi,
  };
})();
