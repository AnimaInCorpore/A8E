(function () {
  "use strict";

  const DB_NAME = "a8e_hostfs";
  const DB_VERSION = 1;
  const STORE_NAME = "files";

  /**
   * Normalize an Atari-style filename to an uppercase 8.3 key.
   * Strips any device prefix ("H:", "H1:", etc.) and path separators.
   * Returns null if the name is invalid/empty.
   */
  function normalizeName(raw) {
    if (!raw) return null;
    let s = raw;
    // Strip device prefix (e.g. "H:", "H1:", "H2:")
    const colon = s.indexOf(":");
    if (colon >= 0) s = s.substring(colon + 1);
    // Strip leading path separators
    while (s.length && (s[0] === ">" || s[0] === "/" || s[0] === "\\"))
      {s = s.substring(1);}
    s = s.toUpperCase().trim();
    if (!s.length) return null;

    // Split into name + extension
    const dot = s.indexOf(".");
    let name, ext;
    if (dot >= 0) {
      name = s.substring(0, dot);
      ext = s.substring(dot + 1);
    } else {
      name = s;
      ext = "";
    }
    // Clamp to 8.3
    if (name.length > 8) name = name.substring(0, 8);
    if (ext.length > 3) ext = ext.substring(0, 3);
    return ext.length ? name + "." + ext : name;
  }

  /**
   * Test whether a filename matches a wildcard pattern.
   * Supports * and ? wildcards in 8.3 format.
   */
  function matchesWildcard(name, pattern) {
    if (!pattern || pattern === "*.*" || pattern === "*") return true;
    const nName = normalizeName(name);
    const nPat = normalizeName(pattern);
    if (!nName || !nPat) return false;
    return _wcMatch(nName, nPat);
  }

  function _wcMatch(str, pat) {
    let si = 0,
      pi = 0;
    let starSi = -1,
      starPi = -1;
    while (si < str.length) {
      if (pi < pat.length && (pat[pi] === "?" || pat[pi] === str[si])) {
        si++;
        pi++;
      } else if (pi < pat.length && pat[pi] === "*") {
        starPi = pi;
        starSi = si;
        pi++;
      } else if (starPi >= 0) {
        pi = starPi + 1;
        starSi++;
        si = starSi;
      } else {
        return false;
      }
    }
    while (pi < pat.length && pat[pi] === "*") pi++;
    return pi === pat.length;
  }

  function createApi() {
    /**
     * Create a host filesystem instance.
     * Returns an object whose methods operate on an in-memory cache.
     * Call init() first -- it loads the IndexedDB contents into RAM.
     * Mutations are written through to IndexedDB asynchronously.
     */
    function create() {
      let db = null;
      // In-memory file map: key (normalized name) -> { name, data, locked, created, modified }
      const cache = Object.create(null);
      const changeListeners = new Set();
      let ready = false;

      function _emitChange() {
        changeListeners.forEach(function (fn) {
          try {
            fn();
          } catch (err) {
            console.error("H: device listener error:", err);
          }
        });
      }

      function onChange(fn) {
        if (typeof fn !== "function") return function () {};
        changeListeners.add(fn);
        return function () {
          changeListeners.delete(fn);
        };
      }

      function init() {
        return new Promise(function (resolve) {
          if (!window.indexedDB) {
            // No IndexedDB -- run with empty in-memory FS only.
            ready = true;
            _emitChange();
            resolve();
            return;
          }
          const req = indexedDB.open(DB_NAME, DB_VERSION);
          req.onupgradeneeded = function (e) {
            const idb = e.target.result;
            if (!idb.objectStoreNames.contains(STORE_NAME)) {
              idb.createObjectStore(STORE_NAME, { keyPath: "name" });
            }
          };
          req.onsuccess = function (e) {
            db = e.target.result;
            // Load all files into cache
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const getAll = store.getAll();
            getAll.onsuccess = function () {
              const items = getAll.result || [];
              for (let i = 0; i < items.length; i++) {
                const item = items[i];
                cache[item.name] = {
                  name: item.name,
                  data: new Uint8Array(item.data),
                  locked: !!item.locked,
                  created: item.created || Date.now(),
                  modified: item.modified || Date.now(),
                };
              }
              ready = true;
              _emitChange();
              resolve();
            };
            getAll.onerror = function () {
              ready = true;
              _emitChange();
              resolve(); // degrade gracefully
            };
          };
          req.onerror = function () {
            ready = true;
            _emitChange();
            resolve(); // degrade gracefully
          };
        });
      }

      function _persist(key) {
        if (!db) return;
        const entry = cache[key];
        if (!entry) return;
        try {
          const tx = db.transaction(STORE_NAME, "readwrite");
          const store = tx.objectStore(STORE_NAME);
          store.put({
            name: entry.name,
            data: new Uint8Array(entry.data),
            locked: entry.locked,
            created: entry.created,
            modified: entry.modified,
          });
        } catch {
          // ignore write failures
        }
      }

      function _deleteFromDb(key) {
        if (!db) return;
        try {
          const tx = db.transaction(STORE_NAME, "readwrite");
          tx.objectStore(STORE_NAME).delete(key);
        } catch {
          // ignore
        }
      }

      function isReady() {
        return ready;
      }

      function listFiles(pattern) {
        const result = [];
        const keys = Object.keys(cache);
        for (let i = 0; i < keys.length; i++) {
          const entry = cache[keys[i]];
          if (!pattern || matchesWildcard(entry.name, pattern)) {
            result.push({
              name: entry.name,
              size: entry.data.length,
              locked: entry.locked,
            });
          }
        }
        result.sort(function (a, b) {
          return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
        });
        return result;
      }

      function readFile(rawName) {
        const key = normalizeName(rawName);
        if (!key) return null;
        const entry = cache[key];
        return entry ? entry.data : null;
      }

      function writeFile(rawName, data) {
        const key = normalizeName(rawName);
        if (!key) return false;
        const existing = cache[key];
        if (existing && existing.locked) return false;
        const now = Date.now();
        cache[key] = {
          name: key,
          data: new Uint8Array(data),
          locked: existing ? existing.locked : false,
          created: existing ? existing.created : now,
          modified: now,
        };
        _persist(key);
        _emitChange();
        return true;
      }

      function deleteFile(rawName) {
        const key = normalizeName(rawName);
        if (!key) return false;
        const entry = cache[key];
        if (!entry) return false;
        if (entry.locked) return false;
        delete cache[key];
        _deleteFromDb(key);
        _emitChange();
        return true;
      }

      function renameFile(rawOld, rawNew) {
        const oldKey = normalizeName(rawOld);
        const newKey = normalizeName(rawNew);
        if (!oldKey || !newKey) return false;
        const entry = cache[oldKey];
        if (!entry) return false;
        if (entry.locked) return false;
        if (cache[newKey]) return false; // target exists
        delete cache[oldKey];
        _deleteFromDb(oldKey);
        entry.name = newKey;
        entry.modified = Date.now();
        cache[newKey] = entry;
        _persist(newKey);
        _emitChange();
        return true;
      }

      function lockFile(rawName) {
        const key = normalizeName(rawName);
        if (!key) return false;
        const entry = cache[key];
        if (!entry) return false;
        entry.locked = true;
        _persist(key);
        _emitChange();
        return true;
      }

      function unlockFile(rawName) {
        const key = normalizeName(rawName);
        if (!key) return false;
        const entry = cache[key];
        if (!entry) return false;
        entry.locked = false;
        _persist(key);
        _emitChange();
        return true;
      }

      function getStatus(rawName) {
        const key = normalizeName(rawName);
        if (!key) return null;
        const entry = cache[key];
        if (!entry) return null;
        return {
          name: entry.name,
          size: entry.data.length,
          locked: entry.locked,
        };
      }

      function fileExists(rawName) {
        const key = normalizeName(rawName);
        return !!key && !!cache[key];
      }

      return {
        init: init,
        isReady: isReady,
        listFiles: listFiles,
        readFile: readFile,
        writeFile: writeFile,
        deleteFile: deleteFile,
        renameFile: renameFile,
        lockFile: lockFile,
        unlockFile: unlockFile,
        getStatus: getStatus,
        fileExists: fileExists,
        onChange: onChange,
        normalizeName: normalizeName,
        matchesWildcard: matchesWildcard,
      };
    }

    return {
      create: create,
      normalizeName: normalizeName,
      matchesWildcard: matchesWildcard,
    };
  }

  window.A8EHostFs = {
    createApi: createApi,
  };
})();
