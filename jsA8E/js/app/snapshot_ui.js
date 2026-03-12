(function () {
  "use strict";

  const DB_NAME = "a8e_snapshots";
  const DB_VERSION = 1;
  const STORE_NAME = "slots";
  const QUICK_SLOT_KEY = "quick";
  const SNAPSHOT_EXTENSION = ".a8esnap";

  function createStorage() {
    let dbPromise = null;

    function openDb() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise(function (resolve, reject) {
        if (!window.indexedDB) {
          reject(new Error("IndexedDB is unavailable"));
          return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = function (event) {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "id" });
          }
        };
        request.onsuccess = function () {
          resolve(request.result);
        };
        request.onerror = function () {
          reject(request.error || new Error("Failed to open snapshot storage"));
        };
      });
      return dbPromise;
    }

    function get(key) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          const tx = db.transaction(STORE_NAME, "readonly");
          const store = tx.objectStore(STORE_NAME);
          const request = store.get(String(key || ""));
          request.onsuccess = function () {
            resolve(request.result || null);
          };
          request.onerror = function () {
            reject(request.error || new Error("Failed to read snapshot slot"));
          };
        });
      });
    }

    function put(entry) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          const tx = db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          const request = store.put(entry);
          request.onsuccess = function () {
            resolve(entry);
          };
          request.onerror = function () {
            reject(request.error || new Error("Failed to write snapshot slot"));
          };
        });
      });
    }

    return {
      get: get,
      put: put,
    };
  }

  function formatDateTime(value) {
    const time = typeof value === "number" ? value : Date.now();
    const date = new Date(time);
    if (Number.isNaN(date.getTime())) return "Unknown time";
    return date.toLocaleString();
  }

  function makeExportName(timestamp) {
    const date = new Date(typeof timestamp === "number" ? timestamp : Date.now());
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    const hh = String(date.getHours()).padStart(2, "0");
    const mi = String(date.getMinutes()).padStart(2, "0");
    const ss = String(date.getSeconds()).padStart(2, "0");
    return "jsA8E-" + yyyy + mm + dd + "-" + hh + mi + ss + SNAPSHOT_EXTENSION;
  }

  function downloadBytes(bytes, name, mimeType) {
    const blob = new Blob([bytes], {
      type: mimeType || "application/x-a8e-snapshot",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name || makeExportName(Date.now());
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 0);
  }

  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        resolve(reader.result || new ArrayBuffer(0));
      };
      reader.onerror = function () {
        reject(reader.error || new Error("Failed to read snapshot file"));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  function init(opts) {
    const app = opts && opts.app ? opts.app : null;
    const panel = opts && opts.panel ? opts.panel : null;
    const button = opts && opts.button ? opts.button : null;
    const focusCanvas =
      opts && typeof opts.focusCanvas === "function" ? opts.focusCanvas : null;
    const onMediaChanged =
      opts && typeof opts.onMediaChanged === "function" ? opts.onMediaChanged : null;
    if (!app || !panel || !button) return;
    if (panel.__a8eSnapshotInitialized) return;
    panel.__a8eSnapshotInitialized = true;

    const saveBtn = panel.querySelector(".snapshot-save-btn");
    const loadBtn = panel.querySelector(".snapshot-load-btn");
    const exportBtn = panel.querySelector(".snapshot-export-btn");
    const importBtn = panel.querySelector(".snapshot-import-btn");
    const importInput = panel.querySelector(".snapshot-import-input");
    const statusEl = panel.querySelector(".snapshot-status");
    const slotStateEl = panel.querySelector(".snapshot-slot-state");
    const slotMetaEl = panel.querySelector(".snapshot-slot-meta");
    const storage = createStorage();
    let currentQuickEntry = null;
    let busy = false;

    function setBusy(nextBusy) {
      busy = !!nextBusy;
      if (saveBtn) saveBtn.disabled = busy;
      if (exportBtn) exportBtn.disabled = busy;
      if (importBtn) importBtn.disabled = busy;
      if (loadBtn) loadBtn.disabled = busy || !currentQuickEntry;
    }

    function setStatus(message, tone) {
      if (!statusEl) return;
      statusEl.textContent = String(message || "Ready.");
      statusEl.classList.remove("error", "success");
      if (tone === "error" || tone === "success") {
        statusEl.classList.add(tone);
      }
    }

    function updateQuickSlotUi(entry) {
      currentQuickEntry = entry || null;
      if (slotStateEl) {
        slotStateEl.classList.toggle("is-empty", !currentQuickEntry);
        slotStateEl.classList.toggle("is-ready", !!currentQuickEntry);
        slotStateEl.textContent = currentQuickEntry ? "Saved" : "Empty";
      }
      if (slotMetaEl) {
        if (!currentQuickEntry) {
          slotMetaEl.textContent = "No browser snapshot saved yet.";
        } else {
          slotMetaEl.textContent =
            "Saved " +
            formatDateTime(currentQuickEntry.savedAt) +
            " · " +
            ((currentQuickEntry.byteLength | 0) || 0) +
            " bytes";
        }
      }
      setBusy(busy);
    }

    function refreshQuickSlot() {
      return storage
        .get(QUICK_SLOT_KEY)
        .then(function (entry) {
          updateQuickSlotUi(entry);
          return entry;
        })
        .catch(function (err) {
          console.error("Snapshot UI storage read error:", err);
          updateQuickSlotUi(null);
          setStatus("Snapshot storage unavailable.", "error");
          return null;
        });
    }

    async function saveSnapshotToQuickSlot() {
      setBusy(true);
      setStatus("Saving snapshot...");
      try {
        const automation = window.A8EAutomation;
        const result = automation && automation.system
          ? await automation.system.saveSnapshot()
          : await app.saveSnapshot({ savedRunning: !!app.isRunning() });
        const bytes = result && result.buffer
          ? new Uint8Array(result.buffer)
          : result && result.bytes
            ? new Uint8Array(result.bytes)
            : new Uint8Array(0);
        const entry = {
          id: QUICK_SLOT_KEY,
          savedAt:
            result && typeof result.savedAt === "number" ? result.savedAt : Date.now(),
          byteLength:
            result && typeof result.byteLength === "number"
              ? result.byteLength | 0
              : bytes.length | 0,
          mimeType:
            result && result.mimeType
              ? String(result.mimeType)
              : "application/x-a8e-snapshot",
          buffer: bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength,
          ),
        };
        await storage.put(entry);
        if (result && result.savedRunning) {
          if (automation && automation.system) {
            await automation.system.start();
          } else {
            app.start();
          }
        }
        updateQuickSlotUi(entry);
        setStatus("Quick snapshot saved.", "success");
        if (typeof onMediaChanged === "function") onMediaChanged();
        if (typeof focusCanvas === "function") focusCanvas(true);
      } catch (err) {
        console.error("Snapshot save failed:", err);
        setStatus(
          err && err.message ? err.message : "Snapshot save failed.",
          "error",
        );
      } finally {
        setBusy(false);
      }
    }

    async function loadSnapshotBuffer(buffer, statusMessage) {
      setBusy(true);
      setStatus(statusMessage || "Loading snapshot...");
      try {
        const automation = window.A8EAutomation;
        if (automation && automation.system) {
          await automation.system.loadSnapshot(buffer, {
            resume: "saved",
          });
        } else {
          await app.loadSnapshot(buffer, {
            resume: "saved",
          });
        }
        setStatus("Snapshot restored.", "success");
        if (typeof onMediaChanged === "function") onMediaChanged();
        if (typeof focusCanvas === "function") focusCanvas(false);
      } catch (err) {
        console.error("Snapshot load failed:", err);
        setStatus(
          err && err.message ? err.message : "Snapshot load failed.",
          "error",
        );
      } finally {
        setBusy(false);
      }
    }

    async function loadQuickSlot() {
      if (!currentQuickEntry || !currentQuickEntry.buffer) return;
      return loadSnapshotBuffer(currentQuickEntry.buffer, "Loading quick snapshot...");
    }

    async function exportSnapshot() {
      setBusy(true);
      setStatus("Exporting snapshot...");
      try {
        const automation = window.A8EAutomation;
        const result = automation && automation.system
          ? await automation.system.saveSnapshot()
          : await app.saveSnapshot({ savedRunning: !!app.isRunning() });
        const bytes = result && result.buffer
          ? new Uint8Array(result.buffer)
          : result && result.bytes
            ? new Uint8Array(result.bytes)
            : new Uint8Array(0);
        downloadBytes(
          bytes,
          makeExportName(result && result.savedAt),
          result && result.mimeType ? result.mimeType : "application/x-a8e-snapshot",
        );
        if (result && result.savedRunning) {
          if (automation && automation.system) {
            await automation.system.start();
          } else {
            app.start();
          }
        }
        setStatus("Snapshot exported.", "success");
        if (typeof focusCanvas === "function") focusCanvas(true);
      } catch (err) {
        console.error("Snapshot export failed:", err);
        setStatus(
          err && err.message ? err.message : "Snapshot export failed.",
          "error",
        );
      } finally {
        setBusy(false);
      }
    }

    button.addEventListener("click", function () {
      const active = button.classList.toggle("active");
      panel.hidden = !active;
      if (active) refreshQuickSlot();
    });

    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        saveSnapshotToQuickSlot();
      });
    }

    if (loadBtn) {
      loadBtn.addEventListener("click", function () {
        loadQuickSlot();
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener("click", function () {
        exportSnapshot();
      });
    }

    if (importBtn && importInput) {
      importBtn.addEventListener("click", function () {
        importInput.click();
      });
      importInput.addEventListener("change", function () {
        const file = importInput.files && importInput.files[0];
        if (!file) return;
        readFileAsArrayBuffer(file)
          .then(function (buffer) {
            return loadSnapshotBuffer(buffer, "Importing snapshot...");
          })
          .finally(function () {
            importInput.value = "";
          });
      });
    }

    updateQuickSlotUi(null);
    refreshQuickSlot();
  }

  window.A8ESnapshotUI = {
    init: init,
  };
})();
