(function () {
  "use strict";

  const DB_NAME = "a8e_disk_library";
  const DB_VERSION = 1;
  const STORE_NAME = "entries";
  const FLUSH_DELAY_MS = 350;

  function getExtension(name) {
    const value = String(name || "").trim();
    const dot = value.lastIndexOf(".");
    return dot >= 0 ? value.substring(dot + 1).toLowerCase() : "";
  }

  function normalizeName(name) {
    const value = String(name || "").trim();
    if (!value) return null;
    return value;
  }

  function logicalName(name) {
    const normalized = normalizeName(name);
    return normalized ? normalized.toUpperCase() : null;
  }

  function isSupportedName(name) {
    const ext = getExtension(name);
    return ext === "atr" || ext === "xex";
  }

  function toUint8(data) {
    if (!data) return new Uint8Array(0);
    if (data instanceof Uint8Array) return new Uint8Array(data);
    if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(
        data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
      );
    }
    if (Array.isArray(data)) return new Uint8Array(data);
    return new Uint8Array(0);
  }

  function cloneBytes(data) {
    return new Uint8Array(toUint8(data));
  }

  function makeId() {
    return (
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).substring(2, 10)
    );
  }

  function createApi() {
    function create(options) {
      const config = options && typeof options === "object" ? options : {};
      const mountDisk =
        typeof config.mountDisk === "function" ? config.mountDisk : null;
      const unmountDisk =
        typeof config.unmountDisk === "function" ? config.unmountDisk : null;
      const getDiskImageBytes =
        typeof config.getDiskImageBytes === "function"
          ? config.getDiskImageBytes
          : null;
      const getDiskImageInfo =
        typeof config.getDiskImageInfo === "function"
          ? config.getDiskImageInfo
          : null;
      const getMountedDiskForDeviceSlot =
        typeof config.getMountedDiskForDeviceSlot === "function"
          ? config.getMountedDiskForDeviceSlot
          : null;
      const entries = new Map();
      const listeners = new Set();
      let db = null;
      let ready = false;

      function emitChange() {
        listeners.forEach(function (listener) {
          try {
            listener();
          } catch (err) {
            console.error("Disk library listener error:", err);
          }
        });
      }

      function onChange(listener) {
        if (typeof listener !== "function") return function () {};
        listeners.add(listener);
        return function () {
          listeners.delete(listener);
        };
      }

      function makeEntry(name, sourceBytes, id) {
        const normalized = normalizeName(name);
        const format = getExtension(normalized);
        const bytes = cloneBytes(sourceBytes);
        return {
          id: id || makeId(),
          name: normalized,
          logicalName: logicalName(normalized),
          format: format,
          sourceBytes: bytes,
          runtimeBytes: format === "atr" ? cloneBytes(bytes) : null,
          runtimeName: format === "atr" ? normalized : null,
          imageIndex: -1,
          slot: -1,
          dirty: false,
          persisting: false,
          pendingFlush: null,
          flushTimer: 0,
          created: Date.now(),
          modified: Date.now(),
        };
      }

      function currentBytes(entry) {
        if (!entry) return new Uint8Array(0);
        return entry.runtimeBytes || entry.sourceBytes;
      }

      function currentName(entry) {
        if (!entry) return "disk.atr";
        if (entry.format === "xex" && entry.runtimeBytes) {
          const dot = entry.name.lastIndexOf(".");
          const base = dot > 0 ? entry.name.substring(0, dot) : entry.name;
          return base + ".ATR";
        }
        return entry.runtimeName || entry.name;
      }

      function clonePersistedEntry(entry) {
        return {
          id: entry.id,
          name: entry.name,
          format: entry.format,
          sourceBytes: cloneBytes(entry.sourceBytes),
          runtimeBytes: entry.runtimeBytes
            ? cloneBytes(entry.runtimeBytes)
            : null,
          runtimeName: entry.runtimeName || null,
          slot: entry.slot | 0,
          created: entry.created || Date.now(),
          modified: entry.modified || Date.now(),
        };
      }

      function persistRecord(entry) {
        if (!db || !entry) return Promise.resolve();
        let tx;
        try {
          tx = db.transaction(STORE_NAME, "readwrite");
        } catch (err) {
          return Promise.reject(err);
        }
        return new Promise(function (resolve, reject) {
          const request = tx.objectStore(STORE_NAME).put(clonePersistedEntry(entry));
          tx.oncomplete = function () { resolve(); };
          tx.onabort = function () {
            reject(tx.error || new Error("Disk library IndexedDB write aborted"));
          };
          request.onerror = function () {
            reject(request.error || new Error("Disk library IndexedDB write failed"));
          };
        });
      }

      function deleteRecord(id) {
        if (!db) return Promise.resolve();
        let tx;
        try {
          tx = db.transaction(STORE_NAME, "readwrite");
        } catch (err) {
          return Promise.reject(err);
        }
        return new Promise(function (resolve, reject) {
          const request = tx.objectStore(STORE_NAME).delete(id);
          tx.oncomplete = function () { resolve(); };
          tx.onabort = function () {
            reject(tx.error || new Error("Disk library IndexedDB delete aborted"));
          };
          request.onerror = function () {
            reject(request.error || new Error("Disk library IndexedDB delete failed"));
          };
        });
      }

      function hydrateRecord(raw) {
        if (!raw || typeof raw !== "object") return null;
        const name = normalizeName(raw.name);
        if (!name || !isSupportedName(name)) return null;
        const format = getExtension(name);
        const sourceBytes = cloneBytes(raw.sourceBytes || raw.bytes);
        const runtimeBytes = raw.runtimeBytes
          ? cloneBytes(raw.runtimeBytes)
          : format === "atr"
            ? cloneBytes(sourceBytes)
            : null;
        return {
          id: raw.id ? String(raw.id) : makeId(),
          name: name,
          logicalName: logicalName(name),
          format: format,
          sourceBytes: sourceBytes,
          runtimeBytes: runtimeBytes,
          runtimeName: raw.runtimeName ? String(raw.runtimeName) : null,
          imageIndex: -1,
          slot: typeof raw.slot === "number" ? raw.slot | 0 : -1,
          dirty: false,
          persisting: false,
          pendingFlush: null,
          flushTimer: 0,
          created: raw.created || Date.now(),
          modified: raw.modified || Date.now(),
        };
      }

      function init() {
        if (ready) return Promise.resolve();
        if (!self.indexedDB) {
          ready = true;
          emitChange();
          return Promise.resolve();
        }
        return new Promise(function (resolve) {
          let request;
          try {
            request = self.indexedDB.open(DB_NAME, DB_VERSION);
          } catch (err) {
            ready = true;
            console.error("Disk library IndexedDB init failed:", err);
            emitChange();
            resolve();
            return;
          }
          request.onupgradeneeded = function (event) {
            const database = event.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
              database.createObjectStore(STORE_NAME, { keyPath: "id" });
            }
          };
          request.onsuccess = function (event) {
            db = event.target.result;
            let tx;
            try {
              tx = db.transaction(STORE_NAME, "readonly");
            } catch (err) {
              ready = true;
              emitChange();
              resolve();
              return;
            }
            const getAll = tx.objectStore(STORE_NAME).getAll();
            getAll.onsuccess = function () {
              const rawEntries = getAll.result || [];
              for (let i = 0; i < rawEntries.length; i++) {
                const entry = hydrateRecord(rawEntries[i]);
                if (entry) entries.set(entry.id, entry);
              }
              ready = true;
              emitChange();
              resolve();
            };
            getAll.onerror = function () {
              ready = true;
              emitChange();
              resolve();
            };
          };
          request.onerror = function () {
            ready = true;
            console.error("Disk library IndexedDB init failed:", request.error);
            emitChange();
            resolve();
          };
        });
      }

      function isReady() {
        return ready;
      }

      function getEntry(id) {
        return entries.get(String(id || "")) || null;
      }

      function listFiles() {
        const result = [];
        entries.forEach(function (entry) {
          result.push({
            id: entry.id,
            name: entry.name,
            format: entry.format,
            size: currentBytes(entry).length | 0,
            sourceSize: entry.sourceBytes.length | 0,
            mountedSlot: entry.slot | 0,
            dirty: !!entry.dirty,
            converted: entry.format === "xex" && !!entry.runtimeBytes,
          });
        });
        result.sort(function (a, b) {
          return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
        });
        return result;
      }

      function findByLogicalName(name) {
        const key = logicalName(name);
        if (!key) return null;
        let result = null;
        entries.forEach(function (entry) {
          if (!result && entry.logicalName === key) result = entry;
        });
        return result;
      }

      function addFile(name, data) {
        const normalized = normalizeName(name);
        if (!normalized || !isSupportedName(normalized)) {
          return Promise.reject(new Error("Only ATR and XEX files are supported"));
        }
        if (findByLogicalName(normalized)) {
          const error = new Error("A disk library entry with that name already exists");
          error.code = "disk_library_duplicate";
          return Promise.reject(error);
        }
        const entry = makeEntry(normalized, data);
        entries.set(entry.id, entry);
        emitChange();
        return persistRecord(entry).then(function () {
          return getFileInfo(entry.id);
        });
      }

      function replaceFile(id, name, data) {
        const entry = getEntry(id);
        const normalized = normalizeName(name);
        if (!entry) return Promise.reject(new Error("Disk library entry not found"));
        if (!normalized || !isSupportedName(normalized)) {
          return Promise.reject(new Error("Only ATR and XEX files are supported"));
        }
        const duplicate = findByLogicalName(normalized);
        if (duplicate && duplicate.id !== entry.id) {
          return Promise.reject(new Error("A disk library entry with that name already exists"));
        }
        const replace = entry.slot >= 0 ? unmountFile(entry.id) : flushEntry(entry);
        return replace.then(function () {
          const format = getExtension(normalized);
          const bytes = cloneBytes(data);
          entry.name = normalized;
          entry.logicalName = logicalName(normalized);
          entry.format = format;
          entry.sourceBytes = bytes;
          entry.runtimeBytes = format === "atr" ? cloneBytes(bytes) : null;
          entry.runtimeName = format === "atr" ? normalized : null;
          entry.modified = Date.now();
          entry.dirty = false;
          return persistRecord(entry);
        }).then(function () {
          emitChange();
          return getFileInfo(entry.id);
        });
      }

      function getFileInfo(id) {
        const entry = getEntry(id);
        if (!entry) return null;
        return {
          id: entry.id,
          name: entry.name,
          format: entry.format,
          size: currentBytes(entry).length | 0,
          sourceSize: entry.sourceBytes.length | 0,
          mountedSlot: entry.slot | 0,
          dirty: !!entry.dirty,
          converted: entry.format === "xex" && !!entry.runtimeBytes,
        };
      }

      function scheduleFlush(entry) {
        if (!entry || entry.flushTimer) return;
        entry.flushTimer = setTimeout(function () {
          entry.flushTimer = 0;
          flushEntry(entry).catch(function (err) {
            console.error("Disk library persistence failed:", err);
            emitChange();
          });
        }, FLUSH_DELAY_MS);
      }

      function flushEntry(entry) {
        if (!entry) return Promise.resolve();
        if (entry.pendingFlush) return entry.pendingFlush;
        if (!entry.dirty) return Promise.resolve();

        function flushLoop() {
          if (!entry.dirty) return Promise.resolve();
          entry.dirty = false;
          const snapshot = clonePersistedEntry(entry);
          return persistRecord(snapshot)
            .catch(function (err) {
              entry.dirty = true;
              scheduleFlush(entry);
              throw err;
            })
            .then(function () {
              return flushLoop();
            });
        }

        entry.persisting = true;
        entry.pendingFlush = flushLoop()
          .finally(function () {
            entry.persisting = false;
            entry.pendingFlush = null;
            emitChange();
          });
        return entry.pendingFlush;
      }

      function markDirty(entry) {
        if (!entry) return;
        entry.modified = Date.now();
        entry.dirty = true;
        scheduleFlush(entry);
        emitChange();
      }

      function getImageBytes(entry) {
        if (!entry || entry.imageIndex < 0 || !getDiskImageBytes) return null;
        const bytes = getDiskImageBytes(entry.imageIndex);
        return bytes ? cloneBytes(bytes) : null;
      }

      function onDiskMediaChanged(imageIndex, deviceSlot) {
        const index = imageIndex | 0;
        const imageInfo = getDiskImageInfo ? getDiskImageInfo(index) : null;
        if (getDiskImageInfo && imageInfo && !imageInfo.libraryId) return;
        let changed = imageInfo && imageInfo.libraryId
          ? getEntry(imageInfo.libraryId)
          : null;
        if (!changed) {
          entries.forEach(function (entry) {
            if (!changed && entry.imageIndex === index) changed = entry;
          });
        }
        if (!changed) return;
        if (imageInfo && imageInfo.libraryId && imageInfo.libraryId !== changed.id) return;
        if (typeof deviceSlot === "number") changed.slot = deviceSlot | 0;
        changed.imageIndex = index;
        const bytes = getImageBytes(changed);
        if (!bytes) return;
        changed.runtimeBytes = bytes;
        changed.runtimeName = currentName(changed);
        markDirty(changed);
      }

      function reconcileMounts() {
        if (!getMountedDiskForDeviceSlot) return Promise.resolve();
        const mountedByLibraryId = new Map();
        for (let slot = 0; slot < 8; slot++) {
          const mounted = getMountedDiskForDeviceSlot(slot);
          if (mounted && mounted.libraryId) {
            mountedByLibraryId.set(String(mounted.libraryId), {
              slot: slot,
              imageIndex: mounted.imageIndex | 0,
            });
          }
        }
        const pending = [];
        entries.forEach(function (entry) {
          const match = mountedByLibraryId.get(entry.id) || null;
          const nextSlot = match ? match.slot | 0 : -1;
          const nextImageIndex = match ? match.imageIndex | 0 : -1;
          if (entry.slot === nextSlot && entry.imageIndex === nextImageIndex) return;
          entry.slot = nextSlot;
          entry.imageIndex = nextImageIndex;
          pending.push(persistRecord(entry));
        });
        return Promise.all(pending).then(function () {
          emitChange();
        });
      }

      function entryUsingSlot(slot) {
        const target = slot | 0;
        let result = null;
        entries.forEach(function (entry) {
          if (!result && entry.slot === target) result = entry;
        });
        return result;
      }

      function mountFile(id, slot) {
        const entry = getEntry(id);
        const targetSlot = slot | 0;
        if (!entry) return Promise.reject(new Error("Disk library entry not found"));
        if (!mountDisk) return Promise.reject(new Error("Disk mounting is unavailable"));
        if (targetSlot < 0 || targetSlot >= 8) {
          return Promise.reject(new Error("Disk drive out of range"));
        }

        const occupying = entryUsingSlot(targetSlot);
        const oldSlot = entry.slot | 0;
        let work = Promise.resolve();
        if (occupying && occupying.id !== entry.id) {
          work = flushEntry(occupying).then(function () {
            if (unmountDisk) return unmountDisk(targetSlot);
            return undefined;
          }).then(function () {
            occupying.slot = -1;
            occupying.imageIndex = -1;
            return persistRecord(occupying);
          });
        }
        if (oldSlot >= 0 && oldSlot !== targetSlot) {
          work = work.then(function () {
            if (unmountDisk) return unmountDisk(oldSlot);
            return undefined;
          }).then(function () {
            entry.slot = -1;
            entry.imageIndex = -1;
            return persistRecord(entry);
          });
        }

        const source = entry.runtimeBytes || entry.sourceBytes;
        const mountName = entry.runtimeBytes ? currentName(entry) : entry.name;
        return work.then(function () {
          return Promise.resolve(
            mountDisk(cloneBytes(source), mountName, targetSlot, {
              diskLibraryId: entry.id,
            }),
          );
        }).then(function (result) {
          const info = result || {};
          entry.slot = targetSlot;
          entry.imageIndex = info.imageIndex === undefined ? -1 : info.imageIndex | 0;
          const mountedBytes = getImageBytes(entry);
          if (mountedBytes) {
            entry.runtimeBytes = mountedBytes;
            entry.runtimeName = currentName(entry);
          }
          return persistRecord(entry).then(function () {
            emitChange();
            return getFileInfo(entry.id);
          });
        });
      }

      function unmountFile(id) {
        const entry = getEntry(id);
        if (!entry) return Promise.reject(new Error("Disk library entry not found"));
        if (entry.slot < 0) return flushEntry(entry);
        const slot = entry.slot | 0;
        return flushEntry(entry).then(function () {
          if (unmountDisk) return unmountDisk(slot);
          return undefined;
        }).then(function () {
          entry.slot = -1;
          entry.imageIndex = -1;
          return persistRecord(entry);
        }).then(function () {
          emitChange();
          return getFileInfo(entry.id);
        });
      }

      function flush(id) {
        return flushEntry(getEntry(id));
      }

      function downloadFile(id) {
        const entry = getEntry(id);
        if (!entry) return Promise.reject(new Error("Disk library entry not found"));
        return flushEntry(entry).then(function () {
          const bytes = currentBytes(entry);
          return {
            id: entry.id,
            name: currentName(entry),
            originalName: entry.name,
            format: entry.format,
            converted: entry.format === "xex" && !!entry.runtimeBytes,
            buffer: cloneBytes(bytes).buffer,
          };
        });
      }

      function deleteFile(id) {
        const entry = getEntry(id);
        if (!entry) return Promise.reject(new Error("Disk library entry not found"));
        return unmountFile(id).then(function () {
          entries.delete(entry.id);
          return deleteRecord(entry.id);
        }).then(function () {
          emitChange();
          return true;
        });
      }

      function restoreMounts() {
        let pending = Promise.resolve();
        entries.forEach(function (entry) {
          if (entry.slot >= 0) {
            const requestedSlot = entry.slot | 0;
            pending = pending.then(function () {
              entry.slot = -1;
              entry.imageIndex = -1;
              return mountFile(entry.id, requestedSlot);
            });
          }
        });
        return pending;
      }

      return {
        init: init,
        isReady: isReady,
        listFiles: listFiles,
        getFileInfo: getFileInfo,
        addFile: addFile,
        replaceFile: replaceFile,
        mountFile: mountFile,
        unmountFile: unmountFile,
        flush: flush,
        downloadFile: downloadFile,
        deleteFile: deleteFile,
        restoreMounts: restoreMounts,
        reconcileMounts: reconcileMounts,
        onDiskMediaChanged: onDiskMediaChanged,
        onChange: onChange,
      };
    }

    return { create: create };
  }

  window.A8EDiskLibrary = { createApi: createApi };
})();
