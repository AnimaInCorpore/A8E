(function () {
  "use strict";

  const SOURCE_EXTS = new Set(["ASM", "S", "SRC", "TXT", "INC", "MAC"]);
  const PANEL_MIN_HEIGHT = 340;
  const PANEL_MAX_HEIGHT_RATIO = 0.9;
  const PANEL_DEFAULT_EXTRA_HEIGHT = 120;
  const DEFAULT_SOURCE_TEMPLATE = [
    "; Atari 8-bit 6502 source",
    ".ORG $2000",
    "START:",
    "  LDA #$00",
    "  RTS",
    ".RUN START",
    "",
  ].join("\n");

  const AssemblerCore = window.A8EAssemblerCore || null;
  const MNEMONIC_KEYWORDS = new Set(
    AssemblerCore && Array.isArray(AssemblerCore.mnemonicKeywords)
      ? AssemblerCore.mnemonicKeywords
      : [],
  );
  const DIRECTIVE_KEYWORDS = new Set(
    AssemblerCore && Array.isArray(AssemblerCore.directiveKeywords)
      ? AssemblerCore.directiveKeywords
      : [
        "ORG",
        "RUN",
        "DS",
        "BYTE",
        "DB",
        "WORD",
        "DW",
        "TEXT",
        "EQU",
        "SET",
      ],
  );
  const REGISTER_TOKENS = new Set(["A", "X", "Y"]);

  function isSourceFileName(name) {
    if (!name) return false;
    const dot = name.lastIndexOf(".");
    if (dot < 0) return false;
    const ext = name.substring(dot + 1).toUpperCase();
    return SOURCE_EXTS.has(ext);
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function splitCommentParts(line) {
    let inQuote = "";
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === "\\") {
          i++;
          continue;
        }
        if (ch === inQuote) inQuote = "";
        continue;
      }
      if (ch === "'" || ch === "\"") {
        inQuote = ch;
        continue;
      }
      if (ch === ";") {
        return {
          code: line.substring(0, i),
          comment: line.substring(i),
        };
      }
    }
    return {
      code: line,
      comment: "",
    };
  }

  function wrapHighlightToken(cssClass, text) {
    return "<span class=\"" + cssClass + "\">" + escapeHtml(text) + "</span>";
  }

  function isIdentStart(ch) {
    return /[A-Za-z_.@]/.test(ch);
  }

  function isIdentChar(ch) {
    return /[A-Za-z0-9_.@]/.test(ch);
  }

  function classifyHighlightWord(word) {
    if (!word.length) return "";
    if (word[0] === ".") return "asm-tok-directive";

    const upper = word.toUpperCase();
    if (MNEMONIC_KEYWORDS.has(upper)) return "asm-tok-mnemonic";
    if (DIRECTIVE_KEYWORDS.has(upper)) return "asm-tok-directive";
    if (REGISTER_TOKENS.has(upper)) return "asm-tok-register";
    return "";
  }

  function highlightCodeFragment(code) {
    let out = "";
    let i = 0;
    while (i < code.length) {
      const ch = code[i];

      if (ch === " " || ch === "\t") {
        const start = i;
        while (i < code.length && (code[i] === " " || code[i] === "\t")) i++;
        out += escapeHtml(code.substring(start, i));
        continue;
      }

      if (ch === "'" || ch === "\"") {
        const quote = ch;
        const start = i;
        i++;
        while (i < code.length) {
          const c = code[i];
          i++;
          if (c === "\\") {
            if (i < code.length) i++;
            continue;
          }
          if (c === quote) break;
        }
        out += wrapHighlightToken("asm-tok-string", code.substring(start, i));
        continue;
      }

      if (ch === "$") {
        const start = i;
        i++;
        while (i < code.length && /[0-9a-fA-F]/.test(code[i])) i++;
        out += wrapHighlightToken("asm-tok-number", code.substring(start, i));
        continue;
      }

      if (ch === "%") {
        const start = i;
        i++;
        while (i < code.length && /[01]/.test(code[i])) i++;
        out += wrapHighlightToken("asm-tok-number", code.substring(start, i));
        continue;
      }

      if (ch >= "0" && ch <= "9") {
        const start = i;
        if (
          ch === "0" &&
          i + 1 < code.length &&
          (code[i + 1] === "x" || code[i + 1] === "X")
        ) {
          i += 2;
          while (i < code.length && /[0-9a-fA-F]/.test(code[i])) i++;
        } else {
          i++;
          while (i < code.length && /[0-9]/.test(code[i])) i++;
        }
        out += wrapHighlightToken("asm-tok-number", code.substring(start, i));
        continue;
      }

      if (isIdentStart(ch)) {
        const start = i;
        i++;
        while (i < code.length && isIdentChar(code[i])) i++;
        const word = code.substring(start, i);
        if (i < code.length && code[i] === ":") {
          out += wrapHighlightToken("asm-tok-label", word);
          out += ":";
          i++;
          continue;
        }
        const tokenClass = classifyHighlightWord(word);
        if (tokenClass) out += wrapHighlightToken(tokenClass, word);
        else out += escapeHtml(word);
        continue;
      }

      out += escapeHtml(ch);
      i++;
    }
    return out;
  }

  function highlightAssemblerSource(sourceText) {
    const lines = String(sourceText || "").replace(/\r\n?/g, "\n").split("\n");
    let out = "";
    for (let i = 0; i < lines.length; i++) {
      const parts = splitCommentParts(lines[i]);
      out += highlightCodeFragment(parts.code);
      if (parts.comment.length) {
        out += wrapHighlightToken("asm-tok-comment", parts.comment);
      }
      if (i + 1 < lines.length) out += "\n";
    }
    if (!out.length) return " ";
    return out;
  }

  function assembleSourceToXex(sourceText, options) {
    if (!AssemblerCore || typeof AssemblerCore.assembleToXex !== "function") {
      return { ok: false, error: "Assembler core unavailable." };
    }
    return AssemblerCore.assembleToXex(sourceText, options || {});
  }

  function decodeBytesToText(bytes) {
    if (typeof TextDecoder !== "undefined") {
      try {
        return new TextDecoder().decode(bytes);
      } catch {
        // fallback below
      }
    }
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
      out += String.fromCharCode(bytes[i] & 0xff);
    }
    return out;
  }

  function encodeTextToBytes(text) {
    if (typeof TextEncoder !== "undefined") {
      try {
        return new TextEncoder().encode(text);
      } catch {
        // fallback below
      }
    }
    const out = new Uint8Array(text.length);
    for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
    return out;
  }

  function ensureExtension(name, ext) {
    const raw = String(name || "").trim();
    if (!raw.length) return "";
    if (raw.indexOf(".") >= 0) return raw;
    return raw + ext;
  }

  function toHex2(value) {
    return (value & 0xff).toString(16).toUpperCase().padStart(2, "0");
  }

  function toHex4(value) {
    return (value & 0xffff).toString(16).toUpperCase().padStart(4, "0");
  }

  function uint8ArrayToArrayBuffer(bytes) {
    return bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
  }

  function init(opts) {
    const app = opts.app;
    const panel = opts.panel;
    const button = opts.button;
    const onMediaChanged = typeof opts.onMediaChanged === "function"
      ? opts.onMediaChanged
      : null;
    const focusCanvas = typeof opts.focusCanvas === "function"
      ? opts.focusCanvas
      : null;
    if (!panel || !button || !app || !app.hDevice) return;
    if (panel.__a8eAssemblerInitialized) return;
    panel.__a8eAssemblerInitialized = true;

    const hostFs = app.hDevice.getHostFs && app.hDevice.getHostFs();
    if (!hostFs) return;

    const sourceNameInput = panel.querySelector(".asm-source-name");
    const sourceSelect = panel.querySelector(".asm-source-select");
    const loadBtn = panel.querySelector(".asm-load-btn");
    const saveBtn = panel.querySelector(".asm-save-btn");
    const buildBtn = panel.querySelector(".asm-build-btn");
    const runBtn = panel.querySelector(".asm-run-btn");
    const stepBtn = panel.querySelector(".asm-step-btn");
    const stepOverBtn = panel.querySelector(".asm-step-over-btn");
    const continueBtn = panel.querySelector(".asm-continue-btn");
    const breakpointGutter = panel.querySelector(".asm-breakpoints");
    const highlight = panel.querySelector(".asm-highlight");
    const editor = panel.querySelector(".asm-editor");
    const errorsWrap = panel.querySelector(".asm-errors");
    const errorList = panel.querySelector(".asm-error-list");
    const status = panel.querySelector(".asm-status");

    if (
      !sourceNameInput ||
      !sourceSelect ||
      !loadBtn ||
      !saveBtn ||
      !buildBtn ||
      !runBtn ||
      !stepBtn ||
      !stepOverBtn ||
      !continueBtn ||
      !breakpointGutter ||
      !highlight ||
      !editor ||
      !errorsWrap ||
      !errorList ||
      !status
    ) {
      return;
    }

    function normalizeFsName(raw, fallbackExt) {
      let name = String(raw || "").trim();
      if (!name.length) return "";
      if (fallbackExt) name = ensureExtension(name, fallbackExt);
      if (typeof hostFs.normalizeName === "function") {
        return hostFs.normalizeName(name) || "";
      }
      return name.toUpperCase();
    }

    function resolveIncludeFromHostFs(includePath) {
      const rawPath = String(includePath || "").trim();
      if (!rawPath.length) return null;

      const candidates = [];
      const seen = new Set();
      function addCandidate(name) {
        const normalized = normalizeFsName(name, null);
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
        try {
          const data = hostFs.readFile(candidates[i]);
          if (data && data.length >= 0) {
            return decodeBytesToText(data);
          }
        } catch {
          // Try the next candidate.
        }
      }
      return null;
    }

    const supportsBreakpoints = typeof app.setBreakpoints === "function";
    const supportsSingleStep = typeof app.stepInstruction === "function";
    const supportsStepOver = typeof app.stepOver === "function";
    const supportsDebugControls =
      supportsBreakpoints && supportsSingleStep && supportsStepOver;
    let statusMessage = "Ready.";
    let statusKind = "";
    let debugStatusMessage = "";
    let highlightQueued = false;
    let gutterQueued = false;
    let sourceLineAddressMap = Object.create(null);
    let addressLineMap = Object.create(null);
    let sourceLineBytesMap = Object.create(null);
    let hasResolvedLineAddresses = false;
    let hasResolvedLineBytes = false;
    const activeBreakpointLines = new Set();
    let lastDebugState = null;
    let currentDebugAddress = null;
    let currentDebugLine = null;
    let debugControlsMode = "hidden";

    function setContinueButtonPauseMode(pauseMode) {
      const pause = !!pauseMode;
      continueBtn.title = pause
        ? "Pause execution and keep current state for debugging"
        : "Continue execution until the next breakpoint";
      continueBtn.innerHTML = pause
        ? "<i class=\"fa-solid fa-pause\"></i> Pause"
        : "<i class=\"fa-solid fa-play\"></i> Continue";
    }

    function setDebugControlsMode(mode) {
      const next =
        mode === "paused" || mode === "running" || mode === "armed" ? mode : "hidden";
      if (debugControlsMode === next) return;
      debugControlsMode = next;

      const paused = next === "paused";
      const running = next === "running";
      const armed = next === "armed";
      stepBtn.hidden = !(paused || armed);
      stepOverBtn.hidden = !(paused || armed);
      continueBtn.hidden = !(paused || running || armed);
      runBtn.hidden = paused || running;
      setContinueButtonPauseMode(running);
    }

    function isDebugControlsActive() {
      return debugControlsMode === "paused" || debugControlsMode === "running";
    }

    function activateDebugControlsFromAssembly() {
      if (!supportsDebugControls) return;
      const runningNow = typeof app.isRunning === "function" && app.isRunning();
      setDebugControlsMode(runningNow ? "running" : "armed");
    }

    function renderStatusText() {
      const msg = String(statusMessage || "");
      const dbg = String(debugStatusMessage || "");
      status.textContent = dbg ? msg + " | " + dbg : msg;
      status.className = "asm-status";
      if (statusKind === "error" || statusKind === "success")
        {status.classList.add(statusKind);}
    }

    function setStatus(message, kind) {
      statusMessage = String(message || "");
      statusKind = kind === "error" || kind === "success" ? kind : "";
      renderStatusText();
    }

    function setDebugStatus(message) {
      debugStatusMessage = String(message || "");
      renderStatusText();
    }

    function deriveOutputName() {
      const srcName = normalizeFsName(sourceNameInput.value, ".ASM");
      if (!srcName) return "PROGRAM.XEX";
      const dot = srcName.lastIndexOf(".");
      const base = dot > 0 ? srcName.substring(0, dot) : srcName;
      return base + ".XEX";
    }

    function countEditorLines() {
      const text = String(editor.value || "");
      if (!text.length) return 1;
      let count = 1;
      for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 10) count++;
      }
      return count;
    }

    function getEditorLineHeightPx() {
      const style = window.getComputedStyle(editor);
      const value = parseFloat(style.lineHeight || "16");
      if (!isFinite(value) || value <= 0) return 16;
      return value;
    }

    function getLineAddress(lineNo) {
      const key = String(lineNo | 0);
      if (!Object.prototype.hasOwnProperty.call(sourceLineAddressMap, key))
        {return null;}
      return sourceLineAddressMap[key] & 0xffff;
    }

    function getLineBytesText(lineNo) {
      const key = String(lineNo | 0);
      if (!Object.prototype.hasOwnProperty.call(sourceLineBytesMap, key))
        {return "";}
      return sourceLineBytesMap[key] || "";
    }

    function updateCurrentDebugLine() {
      if (currentDebugAddress === null) {
        currentDebugLine = null;
        return;
      }
      const key = String(currentDebugAddress & 0xffff);
      if (!Object.prototype.hasOwnProperty.call(addressLineMap, key)) {
        currentDebugLine = null;
        return;
      }
      currentDebugLine = addressLineMap[key] | 0;
    }

    function ensureEditorLineVisible(lineNo) {
      if (!lineNo || lineNo < 1) return;
      const lineHeight = getEditorLineHeightPx();
      const targetTop = Math.max(0, (lineNo - 1) * lineHeight);
      const viewTop = editor.scrollTop | 0;
      const viewBottom = viewTop + (editor.clientHeight | 0);
      const lineBottom = targetTop + lineHeight;
      if (targetTop >= viewTop && lineBottom <= viewBottom) return;
      const nextTop = Math.max(0, Math.round(targetTop - editor.clientHeight * 0.35));
      editor.scrollTop = nextTop;
      syncHighlightScroll();
    }

    function applyBreakpointAddressesToRuntime() {
      if (!supportsBreakpoints) return;
      const map = Object.create(null);
      const addresses = [];
      activeBreakpointLines.forEach(function (lineNo) {
        const addr = getLineAddress(lineNo);
        if (addr === null) return;
        const key = String(addr & 0xffff);
        if (map[key]) return;
        map[key] = true;
        addresses.push(addr & 0xffff);
      });
      addresses.sort(function (a, b) { return a - b; });
      app.setBreakpoints(addresses);
    }

    function refreshBreakpointGutterNow() {
      const lineCount = countEditorLines();
      const lineHeight = getEditorLineHeightPx();
      const frag = document.createDocumentFragment();

      for (let lineNo = 1; lineNo <= lineCount; lineNo++) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "asm-bp-row";
        row.dataset.line = String(lineNo);
        row.style.height = lineHeight + "px";

        const dot = document.createElement("span");
        dot.className = "asm-bp-dot";
        const num = document.createElement("span");
        num.className = "asm-bp-num";
        num.textContent = String(lineNo);
        const bytes = document.createElement("span");
        bytes.className = "asm-bp-bytes";
        const bytesText = getLineBytesText(lineNo);
        if (bytesText) {
          bytes.textContent = bytesText;
          row.classList.add("has-bytes");
        } else {
          row.classList.add("no-bytes");
          bytes.textContent = "";
        }

        const addrSpan = document.createElement("span");
        addrSpan.className = "asm-bp-addr";

        row.appendChild(dot);
        row.appendChild(num);
        row.appendChild(addrSpan);
        row.appendChild(bytes);

        const addr = getLineAddress(lineNo);
        if (addr === null) {
          row.classList.add("no-addr");
          row.title = "Line " + lineNo + ": no assembled instruction address";
        } else {
          row.classList.add("has-addr");
          addrSpan.textContent = "$" + toHex4(addr);
          row.title = "Line " + lineNo + " -> $" + toHex4(addr) + " (toggle breakpoint)";
        }
        if (bytesText) row.title += " | bytes: " + bytesText;
        if (activeBreakpointLines.has(lineNo)) row.classList.add("active");
        if (currentDebugLine === lineNo) row.classList.add("current");
        frag.appendChild(row);
      }

      breakpointGutter.innerHTML = "";
      breakpointGutter.appendChild(frag);
      syncHighlightScroll();
    }

    function queueBreakpointGutterRefresh() {
      if (gutterQueued) return;
      gutterQueued = true;
      const run = function () {
        gutterQueued = false;
        refreshBreakpointGutterNow();
      };
      if (typeof window.requestAnimationFrame === "function")
        {window.requestAnimationFrame(run);}
      else setTimeout(run, 0);
    }

    function setLineAddressMaps(lineMap, reverseMap, lineBytesMap, preserveBreakpoints) {
      const nextLineMap = Object.create(null);
      const nextAddrMap = Object.create(null);
      const nextLineBytesMap = Object.create(null);

      if (lineMap && typeof lineMap === "object") {
        const lineKeys = Object.keys(lineMap);
        for (let i = 0; i < lineKeys.length; i++) {
          const lineNo = parseInt(lineKeys[i], 10);
          const addr = lineMap[lineKeys[i]] | 0;
          if (!isFinite(lineNo) || lineNo <= 0) continue;
          if (addr < 0 || addr > 0xffff) continue;
          nextLineMap[String(lineNo)] = addr & 0xffff;
        }
      }

      if (reverseMap && typeof reverseMap === "object") {
        const addrKeys = Object.keys(reverseMap);
        for (let i = 0; i < addrKeys.length; i++) {
          const addr = parseInt(addrKeys[i], 10);
          const lineNo = reverseMap[addrKeys[i]] | 0;
          if (!isFinite(addr)) continue;
          if (addr < 0 || addr > 0xffff) continue;
          if (!isFinite(lineNo) || lineNo <= 0) continue;
          nextAddrMap[String(addr & 0xffff)] = lineNo;
        }
      } else {
        const lineKeys = Object.keys(nextLineMap);
        for (let i = 0; i < lineKeys.length; i++) {
          const lineNo = lineKeys[i] | 0;
          const addr = nextLineMap[lineKeys[i]] | 0;
          if (!Object.prototype.hasOwnProperty.call(nextAddrMap, String(addr)))
            {nextAddrMap[String(addr)] = lineNo;}
        }
      }

      if (lineBytesMap && typeof lineBytesMap === "object") {
        const lineKeys = Object.keys(lineBytesMap);
        for (let i = 0; i < lineKeys.length; i++) {
          const lineNo = parseInt(lineKeys[i], 10);
          if (!isFinite(lineNo) || lineNo <= 0) continue;
          const rawBytes = lineBytesMap[lineKeys[i]];
          if (!Array.isArray(rawBytes) || !rawBytes.length) continue;
          const parts = [];
          for (let bi = 0; bi < rawBytes.length; bi++) {
            const byteValue = rawBytes[bi] | 0;
            if (byteValue < 0 || byteValue > 0xff) continue;
            parts.push(toHex2(byteValue));
          }
          if (!parts.length) continue;
          nextLineBytesMap[String(lineNo)] = parts.join(" ");
        }
      }

      sourceLineAddressMap = nextLineMap;
      addressLineMap = nextAddrMap;
      sourceLineBytesMap = nextLineBytesMap;
      hasResolvedLineAddresses = Object.keys(sourceLineAddressMap).length > 0;
      hasResolvedLineBytes = Object.keys(sourceLineBytesMap).length > 0;
      const hasBuiltOutput = hasResolvedLineAddresses || hasResolvedLineBytes;
      breakpointGutter.classList.toggle("has-build", hasBuiltOutput);

      if (!preserveBreakpoints) {
        activeBreakpointLines.clear();
      } else {
        Array.from(activeBreakpointLines).forEach(function (lineNo) {
          if (getLineAddress(lineNo) === null) activeBreakpointLines.delete(lineNo);
        });
      }

      updateCurrentDebugLine();
      applyBreakpointAddressesToRuntime();
      queueBreakpointGutterRefresh();
    }

    function clearLineAddressMaps() {
      setLineAddressMaps(null, null, null, false);
    }

    function invalidateLineAddressMaps() {
      if (
        !hasResolvedLineAddresses &&
        !hasResolvedLineBytes &&
        activeBreakpointLines.size === 0
      ) {
        return;
      }
      clearLineAddressMaps();
    }

    function toggleBreakpointForLine(lineNo) {
      if (!supportsBreakpoints) {
        setStatus("Breakpoints are unavailable in this runtime.", "error");
        return;
      }
      const addr = getLineAddress(lineNo);
      if (addr === null) {
        setStatus(
          "Line " + lineNo + " has no assembled instruction address. Assemble first.",
          "error",
        );
        return;
      }
      if (activeBreakpointLines.has(lineNo)) {
        activeBreakpointLines.delete(lineNo);
        setStatus("Breakpoint disabled at line " + lineNo + " ($" + toHex4(addr) + ").");
      } else {
        activeBreakpointLines.add(lineNo);
        setStatus("Breakpoint enabled at line " + lineNo + " ($" + toHex4(addr) + ").", "success");
      }
      applyBreakpointAddressesToRuntime();
      queueBreakpointGutterRefresh();
    }

    function formatDebugStatus(debugState) {
      if (!debugState || typeof debugState !== "object") return "";
      const pc = (debugState.pc | 0) & 0xffff;
      const a = (debugState.a | 0) & 0xff;
      const x = (debugState.x | 0) & 0xff;
      const y = (debugState.y | 0) & 0xff;
      const sp = (debugState.sp | 0) & 0xff;
      const p = (debugState.p | 0) & 0xff;
      const runState = debugState.running ? "RUN" : "PAUSE";
      let out =
        runState +
        " PC=$" + toHex4(pc) +
        " A=$" + toHex2(a) +
        " X=$" + toHex2(x) +
        " Y=$" + toHex2(y) +
        " SP=$" + toHex2(sp) +
        " P=$" + toHex2(p);
      if (typeof debugState.breakpointHit === "number") {
        out += " BRK=$" + toHex4(debugState.breakpointHit | 0);
      }
      return out;
    }

    function applyDebugState(debugState) {
      if (!debugState || typeof debugState !== "object") return;
      lastDebugState = debugState;
      const previousDebugLine = currentDebugLine;
      if (typeof debugState.pc === "number")
        {currentDebugAddress = debugState.pc & 0xffff;}
      else currentDebugAddress = null;
      updateCurrentDebugLine();
      setDebugStatus(formatDebugStatus(debugState));
      queueBreakpointGutterRefresh();

      const debugReason = String(debugState.reason || "").toLowerCase();
      if (
        !debugState.running &&
        debugReason === "step" &&
        currentDebugLine &&
        currentDebugLine > 0 &&
        currentDebugLine !== previousDebugLine
      ) {
        ensureEditorLineVisible(currentDebugLine);
      }

      if (supportsDebugControls) {
        if (debugState.running) {
          setDebugControlsMode("running");
        } else if (
          debugReason === "breakpoint" ||
          debugReason === "step" ||
          debugReason === "stepover" ||
          debugReason === "pause"
        ) {
          setDebugControlsMode("paused");
        } else if (debugReason !== "breakpoints") {
          setDebugControlsMode("hidden");
        }
      } else {
        setDebugControlsMode("hidden");
      }

      if (
        debugState.reason === "breakpoint" &&
        typeof debugState.breakpointHit === "number"
      ) {
        const hitAddr = debugState.breakpointHit & 0xffff;
        const key = String(hitAddr);
        const lineNo = Object.prototype.hasOwnProperty.call(addressLineMap, key)
          ? (addressLineMap[key] | 0)
          : 0;
        if (lineNo > 0) {
          jumpEditorToLine(lineNo);
        }
        const lineText = lineNo > 0 ? " (line " + lineNo + ")" : "";
        setStatus("Paused at breakpoint $" + toHex4(hitAddr) + lineText + ".", "success");
      }
    }

    function syncHighlightScroll() {
      highlight.scrollTop = editor.scrollTop;
      highlight.scrollLeft = editor.scrollLeft;
      breakpointGutter.scrollTop = editor.scrollTop;
    }

    function refreshHighlightNow() {
      highlight.innerHTML = highlightAssemblerSource(editor.value);
      syncHighlightScroll();
      queueBreakpointGutterRefresh();
    }

    function queueHighlightRefresh() {
      if (highlightQueued) return;
      highlightQueued = true;
      const run = function () {
        highlightQueued = false;
        refreshHighlightNow();
      };
      if (typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(run);
      } else {
        setTimeout(run, 0);
      }
    }

    function lineStartOffset(text, lineNo) {
      let line = 1;
      let i = 0;
      while (i < text.length && line < lineNo) {
        if (text.charCodeAt(i) === 10) line++;
        i++;
      }
      return i;
    }

    function jumpEditorToLine(lineNo) {
      if (!lineNo || lineNo < 1) return;
      const text = editor.value || "";
      const pos = lineStartOffset(text, lineNo);
      const style = window.getComputedStyle(editor);
      const lineHeight = parseFloat(style.lineHeight || "16");
      editor.focus();
      editor.selectionStart = pos;
      editor.selectionEnd = pos;
      if (isFinite(lineHeight) && lineHeight > 0) {
        editor.scrollTop = Math.max(0, (lineNo - 2) * lineHeight);
      }
      syncHighlightScroll();
    }

    function clearErrorList() {
      errorList.innerHTML = "";
      errorsWrap.hidden = true;
    }

    function displayErrorText(entry) {
      if (!entry) return "";
      const message = entry.message ? String(entry.message) : String(entry);
      let lineNo = null;
      if (typeof entry.lineNo === "number" && entry.lineNo > 0) {
        lineNo = entry.lineNo;
      } else {
        lineNo = parseLineNumber(message);
      }
      if (!lineNo) return message;
      if (/^Line\s+\d+\s*:/i.test(message)) return message;
      return "Line " + lineNo + ": " + message;
    }

    function renderErrorList(errors) {
      const list = Array.isArray(errors) ? errors : [];
      if (!list.length) {
        clearErrorList();
        return;
      }

      errorList.innerHTML = "";
      const visibleCount = Math.min(list.length, 20);
      for (let i = 0; i < visibleCount; i++) {
        const item = list[i];
        const message = displayErrorText(item);
        const lineNo = item && typeof item.lineNo === "number"
          ? item.lineNo
          : parseLineNumber(message);

        const li = document.createElement("li");
        li.className = "asm-error-item";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "asm-error-btn";
        btn.textContent = message;
        if (lineNo && lineNo > 0) {
          btn.dataset.line = String(lineNo);
          btn.title = "Jump to line " + lineNo;
        } else {
          btn.disabled = true;
        }
        li.appendChild(btn);
        errorList.appendChild(li);
      }

      if (list.length > visibleCount) {
        const li = document.createElement("li");
        li.className = "asm-error-item";
        li.textContent = "... " + (list.length - visibleCount) + " more errors";
        errorList.appendChild(li);
      }

      errorsWrap.hidden = false;
    }

    function refreshSourceList() {
      const files = hostFs.listFiles().filter(function (f) {
        return isSourceFileName(f.name);
      });

      const selectedBefore = sourceSelect.value;
      sourceSelect.innerHTML = "";

      if (!files.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "(no source files)";
        sourceSelect.appendChild(opt);
      } else {
        for (let i = 0; i < files.length; i++) {
          const opt = document.createElement("option");
          opt.value = files[i].name;
          opt.textContent = files[i].name;
          sourceSelect.appendChild(opt);
        }
      }

      const normalizedInput = normalizeFsName(sourceNameInput.value, ".ASM");
      if (normalizedInput && files.some(function (f) { return f.name === normalizedInput; })) {
        sourceSelect.value = normalizedInput;
      } else if (selectedBefore && files.some(function (f) { return f.name === selectedBefore; })) {
        sourceSelect.value = selectedBefore;
      } else if (sourceSelect.options.length) {
        sourceSelect.selectedIndex = 0;
      }
    }

    function loadFromHostFs() {
      const selected = sourceSelect.value || normalizeFsName(sourceNameInput.value, ".ASM");
      if (!selected) {
        setStatus("No source file selected.", "error");
        return;
      }
      const data = hostFs.readFile(selected);
      if (!data) {
        setStatus("Source file not found on HostFS: " + selected, "error");
        return;
      }
      editor.value = decodeBytesToText(data);
      editor.selectionStart = 0;
      editor.selectionEnd = 0;
      editor.scrollTop = 0;
      editor.scrollLeft = 0;
      sourceNameInput.value = selected;
      clearLineAddressMaps();
      queueHighlightRefresh();
      clearErrorList();
      setStatus("Loaded " + selected + " from HostFS.", "success");
    }

    function saveToHostFs() {
      const name = normalizeFsName(sourceNameInput.value, ".ASM");
      if (!name) {
        setStatus("Enter a source filename.", "error");
        return;
      }
      const text = editor.value.replace(/\r\n?/g, "\n");
      const bytes = encodeTextToBytes(text);
      if (!hostFs.writeFile(name, bytes)) {
        setStatus("Unable to write source file (locked or invalid name): " + name, "error");
        return;
      }
      sourceNameInput.value = name;
      refreshSourceList();
      sourceSelect.value = name;
      clearErrorList();
      setStatus("Saved " + name + " to HostFS.", "success");
    }

    function assembleAndStoreExecutable() {
      const outputName = deriveOutputName();

      const sourceName = normalizeFsName(sourceNameInput.value, ".ASM");
      const result = assembleSourceToXex(editor.value, {
        sourceName: sourceName || "SOURCE.ASM",
        includeResolver: resolveIncludeFromHostFs,
      });
      if (!result.ok) {
        renderErrorList(result.errors);
        setStatus("Assemble failed: " + result.error, "error");
        return null;
      }

      if (!hostFs.writeFile(outputName, result.bytes)) {
        setStatus("Unable to write executable (locked or invalid name): " + outputName, "error");
        return null;
      }

      setLineAddressMaps(
        result.lineAddressMap,
        result.addressLineMap,
        result.lineBytesMap,
        true,
      );
      if (lastDebugState) applyDebugState(lastDebugState);
      activateDebugControlsFromAssembly();
      clearErrorList();
      return {
        outputName: outputName,
        result: result,
      };
    }

    function assembleAndWriteExecutable() {
      const built = assembleAndStoreExecutable();
      if (!built) return;

      const runText = built.result.runAddr === null
        ? ""
        : " RUN=$" + (built.result.runAddr & 0xffff).toString(16).toUpperCase().padStart(4, "0");
      setStatus(
        "Assembled " + built.outputName + " (" + built.result.bytes.length + " bytes)." + runText,
        "success",
      );
    }

    function assembleRunExecutable() {
      saveToHostFs();
      const built = assembleAndStoreExecutable();
      if (!built) return;

      try {
        const diskBuffer = uint8ArrayToArrayBuffer(built.result.bytes);
        app.loadDiskToDeviceSlot(diskBuffer, built.outputName, 0);
      } catch (err) {
        const msg = err && err.message ? err.message : String(err);
        setStatus("Unable to load into D1: " + msg, "error");
        return;
      }

      if (typeof app.reset === "function") app.reset();
      if (typeof app.start === "function") app.start();
      if (onMediaChanged) onMediaChanged();
      if (focusCanvas) focusCanvas(false);

      const runText = built.result.runAddr === null
        ? ""
        : " RUN=$" + (built.result.runAddr & 0xffff).toString(16).toUpperCase().padStart(4, "0");
      const running = typeof app.isRunning === "function" ? app.isRunning() : true;
      const suffix = running
        ? " Loaded into D1: and started."
        : " Loaded into D1:. Press Start when ROMs are ready.";
      setStatus(
        "Assembled " + built.outputName + " (" + built.result.bytes.length + " bytes)." + runText + suffix,
        "success",
      );
    }

    function onEditorKeyDown(e) {
      // Ctrl+S  -> Save
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "s") {
        e.preventDefault();
        saveToHostFs();
        return;
      }
      // Ctrl+Shift+B  -> Assemble
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "B" || e.key === "b")) {
        e.preventDefault();
        assembleAndWriteExecutable();
        return;
      }
      // Ctrl+Enter  -> Run
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (isDebugControlsActive()) onContinueClicked();
        else assembleRunExecutable();
        return;
      }
      if (e.key !== "Tab") return;
      e.preventDefault();
      const start = editor.selectionStart | 0;
      const end = editor.selectionEnd | 0;
      const before = editor.value.substring(0, start);
      const after = editor.value.substring(end);
      editor.value = before + "  " + after;
      const nextPos = start + 2;
      editor.selectionStart = nextPos;
      editor.selectionEnd = nextPos;
      queueHighlightRefresh();
      invalidateLineAddressMaps();
    }

    function onEditorInput() {
      queueHighlightRefresh();
      invalidateLineAddressMaps();
    }

    function onStepClicked() {
      if (!supportsDebugControls) {
        setStatus("Stepping is unavailable in this runtime.", "error");
        return;
      }
      const ok = app.stepInstruction();
      if (!ok) {
        setStatus("Unable to step. Pause at a breakpoint first.", "error");
        return;
      }
      setStatus("Single-step executed.", "success");
    }

    function onStepOverClicked() {
      if (!supportsDebugControls) {
        setStatus("Step-over is unavailable in this runtime.", "error");
        return;
      }
      const ok = app.stepOver();
      if (!ok) {
        setStatus("Unable to step over. Pause at a breakpoint first.", "error");
        return;
      }
      const runningNow = typeof app.isRunning === "function" && app.isRunning();
      setDebugControlsMode(runningNow ? "running" : "paused");
      setStatus(runningNow ? "Step-over running." : "Step-over executed.", "success");
    }

    function onContinueClicked() {
      if (!supportsDebugControls) {
        setStatus("Continue is unavailable in this runtime.", "error");
        return;
      }
      if (debugControlsMode === "running") {
        if (typeof app.pause === "function") app.pause();
        setDebugControlsMode("paused");
        setStatus("Execution paused.", "success");
        return;
      }
      setDebugControlsMode("running");
      if (typeof app.start === "function") app.start();
      setStatus("Continuing execution.", "success");
    }

    function sizePanelToViewport() {
      const screenEl = document.querySelector(".screenPanel");
      let h = screenEl ? screenEl.getBoundingClientRect().height : 0;
      const clientH = document.documentElement.clientHeight || window.innerHeight || 0;
      const maxH = Math.floor(clientH * PANEL_MAX_HEIGHT_RATIO);
      h += PANEL_DEFAULT_EXTRA_HEIGHT;
      if (maxH > 0 && h > maxH) h = maxH;
      if (h < PANEL_MIN_HEIGHT) h = PANEL_MIN_HEIGHT;
      panel.style.height = h + "px";
    }

    function focusEditorNoScroll() {
      if (!editor || typeof editor.focus !== "function") return;
      try {
        editor.focus({ preventScroll: true });
      } catch {
        editor.focus();
      }
    }

    button.addEventListener("click", function () {
      const active = button.classList.toggle("active");
      panel.hidden = !active;
      if (active) {
        refreshSourceList();
        /* Auto-load the first ASM file, or clear editor if none exist */
        if (!editor.value && sourceSelect.value) {
          loadFromHostFs();
        } else if (!editor.value) {
          clearErrorList();
        }
        sizePanelToViewport();
        queueHighlightRefresh();
        queueBreakpointGutterRefresh();
        focusEditorNoScroll();
      }
    });

    sourceSelect.addEventListener("change", function () {
      if (sourceSelect.value) sourceNameInput.value = sourceSelect.value;
    });

    loadBtn.addEventListener("click", loadFromHostFs);
    saveBtn.addEventListener("click", saveToHostFs);
    buildBtn.addEventListener("click", assembleAndWriteExecutable);
    runBtn.addEventListener("click", assembleRunExecutable);
    stepBtn.addEventListener("click", onStepClicked);
    stepOverBtn.addEventListener("click", onStepOverClicked);
    continueBtn.addEventListener("click", onContinueClicked);
    editor.addEventListener("keydown", onEditorKeyDown);
    editor.addEventListener("input", onEditorInput);
    editor.addEventListener("scroll", syncHighlightScroll);
    breakpointGutter.addEventListener("click", function (e) {
      const row = e.target && e.target.closest
        ? e.target.closest(".asm-bp-row")
        : null;
      if (!row) return;
      const lineNo = parseInt(row.dataset.line || "0", 10);
      if (lineNo > 0) toggleBreakpointForLine(lineNo);
      focusEditorNoScroll();
    });
    errorList.addEventListener("click", function (e) {
      const target = e.target && e.target.closest
        ? e.target.closest(".asm-error-btn")
        : null;
      if (!target || target.disabled) return;
      const lineNo = parseInt(target.dataset.line || "0", 10);
      if (lineNo > 0) jumpEditorToLine(lineNo);
    });

    /* ---- Resize handle (drag to change panel height) ---- */
    const resizeHandle = panel.querySelector(".asm-resize-handle");
    if (resizeHandle) {
      let dragStartY = 0;
      let dragStartH = 0;

      function onResizeMove(e) {
        const dy = (e.clientY || e.touches && e.touches[0].clientY || 0) - dragStartY;
        const clientH = document.documentElement.clientHeight || window.innerHeight;
        const newH = Math.max(PANEL_MIN_HEIGHT, Math.min(clientH * PANEL_MAX_HEIGHT_RATIO, dragStartH + dy));
        panel.style.height = newH + "px";
      }

      function onResizeEnd() {
        document.removeEventListener("mousemove", onResizeMove);
        document.removeEventListener("mouseup", onResizeEnd);
        document.removeEventListener("touchmove", onResizeMove);
        document.removeEventListener("touchend", onResizeEnd);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }

      function onResizeStart(e) {
        e.preventDefault();
        dragStartY = e.clientY || e.touches && e.touches[0].clientY || 0;
        dragStartH = panel.getBoundingClientRect().height;
        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", onResizeMove);
        document.addEventListener("mouseup", onResizeEnd);
        document.addEventListener("touchmove", onResizeMove);
        document.addEventListener("touchend", onResizeEnd);
      }

      resizeHandle.addEventListener("mousedown", onResizeStart);
      resizeHandle.addEventListener("touchstart", onResizeStart, { passive: false });
    }

    if (typeof hostFs.onChange === "function") {
      panel.__a8eAssemblerUnsub = hostFs.onChange(function () {
        if (!panel.hidden) refreshSourceList();
      });
    }

    if (typeof app.onDebugStateChange === "function") {
      panel.__a8eAssemblerDebugUnsub = app.onDebugStateChange(function (state) {
        applyDebugState(state);
      });
    }
    if (typeof app.getDebugState === "function") {
      applyDebugState(app.getDebugState());
    }

    window.addEventListener("beforeunload", function () {
      if (panel.__a8eAssemblerUnsub) {
        panel.__a8eAssemblerUnsub();
        panel.__a8eAssemblerUnsub = null;
      }
      if (panel.__a8eAssemblerDebugUnsub) {
        panel.__a8eAssemblerDebugUnsub();
        panel.__a8eAssemblerDebugUnsub = null;
      }
    });

    if (!editor.value.trim().length) editor.value = DEFAULT_SOURCE_TEMPLATE;
    clearLineAddressMaps();
    refreshHighlightNow();
    setDebugControlsMode("hidden");
    if (!supportsBreakpoints) {
      breakpointGutter.classList.add("unsupported");
      stepBtn.disabled = true;
      stepOverBtn.disabled = true;
      continueBtn.disabled = true;
      setStatus("Ready. Breakpoints are unavailable in this runtime.");
    } else if (!supportsDebugControls) {
      stepBtn.disabled = true;
      stepOverBtn.disabled = true;
      continueBtn.disabled = true;
      applyBreakpointAddressesToRuntime();
      setStatus("Ready. Breakpoints available; stepping controls unavailable in this runtime.");
    } else {
      applyBreakpointAddressesToRuntime();
      setStatus("Ready.");
    }
    if (lastDebugState) applyDebugState(lastDebugState);
    panel.hidden = true;
    button.classList.remove("active");
    clearErrorList();
  }

  window.A8EAssemblerUI = {
    init: init,
    assembleToXex: assembleSourceToXex,
  };
})();

