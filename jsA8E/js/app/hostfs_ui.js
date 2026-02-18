(function () {
  "use strict";

  const Util = window.A8EUtil;

  // Atari 8-bit file type metadata used for icons in the file list
  const ATARI_TYPES = {
    XEX: { icon: "fa-solid fa-bolt",        label: "Executable",  color: "#ffaa40" },
    COM: { icon: "fa-solid fa-bolt",        label: "Executable",  color: "#ffaa40" },
    EXE: { icon: "fa-solid fa-bolt",        label: "Executable",  color: "#ffaa40" },
    ATR: { icon: "fa-solid fa-floppy-disk", label: "Disk Image",  color: "#5cc8ff" },
    XFD: { icon: "fa-solid fa-floppy-disk", label: "Disk Image",  color: "#5cc8ff" },
    CAS: { icon: "fa-solid fa-tape",        label: "Cassette",    color: "#80c0ff" },
    CAR: { icon: "fa-solid fa-microchip",   label: "Cartridge",   color: "#c09050" },
    ROM: { icon: "fa-solid fa-microchip",   label: "ROM",         color: "#c09050" },
    BAS: { icon: "fa-solid fa-code",        label: "BASIC",       color: "#70e070" },
    LST: { icon: "fa-solid fa-list",        label: "Listing",     color: "#70e070" },
    TXT: { icon: "fa-solid fa-file-lines",  label: "Text",        color: "#c8d0d8" },
    ASC: { icon: "fa-solid fa-file-lines",  label: "Text",        color: "#c8d0d8" },
    DAT: { icon: "fa-solid fa-database",    label: "Data",        color: "#90a0b0" },
    OBJ: { icon: "fa-solid fa-cube",        label: "Object",      color: "#909090" },
    SAV: { icon: "fa-solid fa-floppy-disk", label: "Save",        color: "#70b070" },
  };

  function _getType(name) {
    const dot = name.lastIndexOf(".");
    if (dot < 0) return null;
    return ATARI_TYPES[name.slice(dot + 1).toUpperCase()] || null;
  }

  function _formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    return (bytes / 1024).toFixed(1) + " KB";
  }

  function _totalSize(files) {
    return files.reduce(function (acc, f) { return acc + f.size; }, 0);
  }

  /**
   * Initialise the H: file manager panel.
   *
   * @param {object} opts
   * @param {object} opts.app     - The emulator app object (must expose hDevice).
   * @param {Element} opts.panel  - The #hostfsPanel container element.
   * @param {Element} opts.button - The toggle button for the panel.
   */
  function init(opts) {
    const app    = opts.app;
    const panel  = opts.panel;
    const button = opts.button;
    if (!panel || !button || !app || !app.hDevice) return;
    if (panel.__a8eHostFsInitialized) return;
    panel.__a8eHostFsInitialized = true;

    if (panel.__a8eHostFsUnsubscribe) {
      panel.__a8eHostFsUnsubscribe();
      panel.__a8eHostFsUnsubscribe = null;
    }

    const hostFs = app.hDevice.getHostFs();
    if (!hostFs) return;

    // --- Query sub-elements ---
    const listEl      = panel.querySelector(".hostfs-list");
    const dropZone    = panel.querySelector(".hostfs-drop-zone");
    const uploadBtn   = panel.querySelector(".hostfs-upload-btn");
    const uploadInput = panel.querySelector(".hostfs-upload-input");
    const folderBtn   = panel.querySelector(".hostfs-folder-btn");
    const folderInput = panel.querySelector(".hostfs-folder-input");
    const masterChk   = panel.querySelector(".hostfs-master-chk");
    const selAllBtn   = panel.querySelector(".hostfs-sel-all-btn");
    const selNoneBtn  = panel.querySelector(".hostfs-sel-none-btn");
    const dlSelBtn    = panel.querySelector(".hostfs-dl-sel-btn");
    const delSelBtn   = panel.querySelector(".hostfs-del-sel-btn");
    const statCount   = panel.querySelector(".hostfs-stat-count");
    const statSep     = panel.querySelector(".hostfs-stat-sep");
    const statSel     = panel.querySelector(".hostfs-stat-sel");
    const statTotal   = panel.querySelector(".hostfs-stat-total");

    let sortBy  = "name"; // "name" | "size" | "type"
    let sortAsc = true;
    const selected = new Set(); // selected filenames

    // --- Toggle panel ---
    button.addEventListener("click", function () {
      const active = button.classList.toggle("active");
      panel.hidden = !active;
      if (active) { refreshList(); _sizeList(); }
    });

    // --- Upload files via button ---
    if (uploadBtn && uploadInput) {
      uploadBtn.addEventListener("click", function () { uploadInput.click(); });
      uploadInput.addEventListener("change", function () {
        if (!uploadInput.files || !uploadInput.files.length) return;
        _uploadFiles(uploadInput.files).then(refreshList);
        uploadInput.value = "";
      });
    }

    // --- Upload folder via button ---
    if (folderBtn && folderInput) {
      folderBtn.addEventListener("click", function () { folderInput.click(); });
      folderInput.addEventListener("change", function () {
        if (!folderInput.files || !folderInput.files.length) return;
        _uploadFiles(folderInput.files).then(refreshList);
        folderInput.value = "";
      });
    }

    // --- Drag-and-drop with folder traversal ---
    if (dropZone) {
      dropZone.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add("drag-over");
      });
      dropZone.addEventListener("dragleave", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (!dropZone.contains(e.relatedTarget)) {
          dropZone.classList.remove("drag-over");
        }
      });
      dropZone.addEventListener("drop", function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove("drag-over");
        _handleDrop(e.dataTransfer).then(refreshList);
      });
    }

    // --- Select All / None ---
    if (selAllBtn) {
      selAllBtn.addEventListener("click", function () { _selectAll(true); });
    }
    if (selNoneBtn) {
      selNoneBtn.addEventListener("click", function () { _selectAll(false); });
    }
    if (masterChk) {
      masterChk.addEventListener("change", function () {
        _selectAll(masterChk.checked);
      });
    }

    // --- Bulk Download ---
    if (dlSelBtn) {
      dlSelBtn.addEventListener("click", function () {
        selected.forEach(function (name) { _downloadFile(name); });
      });
    }

    // --- Bulk Delete ---
    if (delSelBtn) {
      delSelBtn.addEventListener("click", function () {
        const count = selected.size;
        if (!count) return;
        if (!confirm("Delete " + count + " selected file" + (count > 1 ? "s" : "") + "?")) return;
        selected.forEach(function (name) { hostFs.deleteFile(name); });
        selected.clear();
        refreshList();
      });
    }

    // --- Sort buttons ---
    panel.querySelectorAll(".hostfs-sort-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const s = btn.dataset.sort;
        if (sortBy === s) {
          sortAsc = !sortAsc;
        } else {
          sortBy = s;
          sortAsc = true;
        }
        _updateSortUI();
        refreshList();
      });
    });

    // --- Helpers ---

    function _updateSortUI() {
      panel.querySelectorAll(".hostfs-sort-btn").forEach(function (btn) {
        const isActive = btn.dataset.sort === sortBy;
        btn.classList.toggle("active", isActive);
        const ic = btn.querySelector(".sort-icon");
        if (!ic) return;
        if (isActive) {
          ic.className = "sort-icon fa-solid " + (sortAsc ? "fa-sort-up" : "fa-sort-down");
        } else {
          ic.className = "sort-icon fa-solid fa-sort";
        }
      });
    }

    function _selectAll(doSelect) {
      const rows = listEl ? listEl.querySelectorAll(".hostfs-row") : [];
      rows.forEach(function (row) {
        const name = row.dataset.name;
        const chk  = row.querySelector(".hostfs-row-chk");
        if (doSelect) {
          selected.add(name);
          row.classList.add("selected");
          if (chk) chk.checked = true;
        } else {
          selected.delete(name);
          row.classList.remove("selected");
          if (chk) chk.checked = false;
        }
      });
      _updateSelectionUI();
    }

    function _updateSelectionUI() {
      const count    = selected.size;
      const allFiles = hostFs.listFiles();

      if (dlSelBtn)  dlSelBtn.disabled  = count === 0;
      if (delSelBtn) delSelBtn.disabled = count === 0;

      if (statSel && statSep) {
        if (count > 0) {
          statSel.textContent  = count + " selected";
          statSel.hidden       = false;
          statSep.hidden       = false;
        } else {
          statSel.hidden = true;
          statSep.hidden = true;
        }
      }

      if (masterChk) {
        masterChk.checked       = count > 0 && count === allFiles.length;
        masterChk.indeterminate = count > 0 && count < allFiles.length;
      }
    }

    function _sortFiles(files) {
      return files.slice().sort(function (a, b) {
        let cmp = 0;
        if (sortBy === "size") {
          cmp = a.size - b.size;
        } else if (sortBy === "type") {
          const ta = a.name.includes(".") ? a.name.slice(a.name.lastIndexOf(".") + 1).toUpperCase() : "";
          const tb = b.name.includes(".") ? b.name.slice(b.name.lastIndexOf(".") + 1).toUpperCase() : "";
          cmp = ta.localeCompare(tb);
          if (cmp === 0) cmp = a.name.localeCompare(b.name);
        } else {
          cmp = a.name.localeCompare(b.name);
        }
        return sortAsc ? cmp : -cmp;
      });
    }

    function refreshList() {
      if (!listEl) return;

      const allFiles = hostFs.listFiles();

      // Remove stale selections
      selected.forEach(function (name) {
        if (!allFiles.some(function (f) { return f.name === name; })) {
          selected.delete(name);
        }
      });

      const files = _sortFiles(allFiles);
      listEl.innerHTML = "";

      if (!files.length) {
        const empty = document.createElement("div");
        empty.className = "hostfs-empty";
        empty.innerHTML = '<i class="fa-solid fa-inbox" style="font-size:20px;opacity:0.4"></i><br>No files in H:';
        listEl.appendChild(empty);
      } else {
        files.forEach(function (info) {
          listEl.appendChild(_createRow(info));
        });
      }

      _updateStatus(allFiles);
      _updateSelectionUI();
      _sizeList();
    }

    function _updateStatus(files) {
      if (statCount) {
        statCount.textContent = files.length === 1 ? "1 file" : files.length + " files";
      }
      if (statTotal) {
        statTotal.textContent = files.length ? _formatSize(_totalSize(files)) : "";
      }
    }

    function _createRow(info) {
      const row = document.createElement("div");
      row.className = "hostfs-row" + (selected.has(info.name) ? " selected" : "");
      row.dataset.name = info.name;

      // Checkbox
      const chkCell = document.createElement("span");
      chkCell.className = "hostfs-col hostfs-col-chk";
      const chk = document.createElement("input");
      chk.type      = "checkbox";
      chk.className = "hostfs-row-chk";
      chk.checked   = selected.has(info.name);
      chk.title     = "Select " + info.name;
      chk.addEventListener("change", function () {
        row.classList.toggle("selected", chk.checked);
        if (chk.checked) {
          selected.add(info.name);
        } else {
          selected.delete(info.name);
        }
        _updateSelectionUI();
      });
      chkCell.appendChild(chk);
      row.appendChild(chkCell);

      // Type icon
      const iconCell = document.createElement("span");
      iconCell.className = "hostfs-col hostfs-col-icon";
      const typeInfo = _getType(info.name);
      const iconEl   = document.createElement("i");
      if (typeInfo) {
        iconEl.className  = typeInfo.icon;
        iconEl.style.color = typeInfo.color;
        iconEl.title      = typeInfo.label;
      } else {
        iconEl.className  = "fa-solid fa-file";
        iconEl.style.color = "#5a7088";
      }
      iconCell.appendChild(iconEl);
      row.appendChild(iconCell);

      // Name (split base + ext for coloring)
      const nameCell = document.createElement("span");
      nameCell.className = "hostfs-col hostfs-col-name";
      const dot = info.name.lastIndexOf(".");
      if (dot > 0) {
        const base    = document.createElement("span");
        base.className  = "hostfs-fname-base";
        base.textContent = info.name.slice(0, dot + 1);
        const ext     = document.createElement("span");
        ext.className   = "hostfs-fname-ext";
        ext.textContent = info.name.slice(dot + 1);
        nameCell.appendChild(base);
        nameCell.appendChild(ext);
      } else {
        const base    = document.createElement("span");
        base.className  = "hostfs-fname-base";
        base.textContent = info.name;
        nameCell.appendChild(base);
      }
      if (info.locked) {
        const lockIcon   = document.createElement("i");
        lockIcon.className = "fa-solid fa-lock hostfs-lock-icon";
        lockIcon.title   = "Locked";
        nameCell.appendChild(lockIcon);
      }
      row.appendChild(nameCell);

      // Size
      const sizeCell = document.createElement("span");
      sizeCell.className   = "hostfs-col hostfs-col-size";
      sizeCell.textContent = _formatSize(info.size);
      row.appendChild(sizeCell);

      // Actions
      const actCell = document.createElement("span");
      actCell.className = "hostfs-col hostfs-col-actions";

      const dlBtn   = document.createElement("button");
      dlBtn.className = "hostfs-action-btn";
      dlBtn.title   = "Download " + info.name;
      dlBtn.innerHTML = '<i class="fa-solid fa-download"></i>';
      dlBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        _downloadFile(info.name);
      });
      actCell.appendChild(dlBtn);

      const delBtn   = document.createElement("button");
      delBtn.className = "hostfs-action-btn hostfs-action-del";
      delBtn.title   = "Delete " + info.name;
      delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
      delBtn.disabled  = !!info.locked;
      delBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (confirm("Delete " + info.name + "?")) {
          hostFs.deleteFile(info.name);
          selected.delete(info.name);
          refreshList();
        }
      });
      actCell.appendChild(delBtn);

      row.appendChild(actCell);

      // Click anywhere on the row (except checkbox / action buttons) to toggle selection
      row.addEventListener("click", function (e) {
        if (e.target === chk || e.target.closest(".hostfs-action-btn")) return;
        chk.checked = !chk.checked;
        row.classList.toggle("selected", chk.checked);
        if (chk.checked) {
          selected.add(info.name);
        } else {
          selected.delete(info.name);
        }
        _updateSelectionUI();
      });

      return row;
    }

    function _downloadFile(name) {
      const data = hostFs.readFile(name);
      if (!data) return;
      const blob = new Blob([data], { type: "application/octet-stream" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function _uploadFiles(fileList) {
      const promises = [];
      for (let i = 0; i < fileList.length; i++) {
        promises.push(_uploadOne(fileList[i]));
      }
      return Promise.all(promises);
    }

    function _uploadOne(file) {
      return Util.readFileAsArrayBuffer(file).then(function (buf) {
        const name = file.name || "UNNAMED";
        hostFs.writeFile(name, new Uint8Array(buf));
      });
    }

    // Handle drop with recursive folder traversal via the webkit File System API
    function _handleDrop(dataTransfer) {
      if (!dataTransfer) return Promise.resolve();

      const items = dataTransfer.items;
      if (items && items.length > 0 && items[0].webkitGetAsEntry) {
        const promises = [];
        for (let i = 0; i < items.length; i++) {
          const entry = items[i].webkitGetAsEntry();
          if (entry) promises.push(_processEntry(entry));
        }
        return Promise.all(promises);
      }

      // Fallback: plain files (no folder support)
      const files = dataTransfer.files;
      if (files && files.length) {
        return _uploadFiles(files);
      }
      return Promise.resolve();
    }

    // Recursively process a FileSystemEntry (file or directory)
    function _processEntry(entry) {
      if (entry.isFile) {
        return new Promise(function (resolve) {
          entry.file(function (file) {
            _uploadOne(file).then(resolve, resolve);
          }, resolve);
        });
      }
      if (entry.isDirectory) {
        return new Promise(function (resolve) {
          const reader    = entry.createReader();
          const allEntries = [];
          function readBatch() {
            reader.readEntries(function (batch) {
              if (!batch.length) {
                Promise.all(allEntries.map(_processEntry)).then(resolve, resolve);
              } else {
                allEntries.push.apply(allEntries, batch);
                readBatch(); // readEntries returns at most 100 at a time
              }
            }, resolve);
          }
          readBatch();
        });
      }
      return Promise.resolve();
    }

    // --- Dynamic list height based on available client height ---
    function _sizeList() {
      if (!listEl || panel.hidden) return;
      const clientH   = document.documentElement.clientHeight;
      const rect      = listEl.getBoundingClientRect();
      // Keep at least 60 px of bottom margin (status bar + gap)
      const available = clientH - rect.top - 60;
      listEl.style.maxHeight = Math.max(80, Math.min(available, clientH * 0.6)) + "px";
    }

    let _resizeTimer = null;
    function _onResize() {
      clearTimeout(_resizeTimer);
      _resizeTimer = setTimeout(_sizeList, 60);
    }
    window.addEventListener("resize", _onResize);

    // --- Change listener: auto-refresh while panel is visible ---
    let unsubscribeChange = null;
    if (hostFs.onChange) {
      unsubscribeChange = hostFs.onChange(function () {
        if (!panel.hidden) refreshList();
      });
      panel.__a8eHostFsUnsubscribe = unsubscribeChange;
    }

    // Initial state: hidden
    panel.hidden = true;
    button.classList.remove("active");

    window.addEventListener("beforeunload", function () {
      window.removeEventListener("resize", _onResize);
      const unsub = unsubscribeChange;
      if (unsub) unsub();
      if (panel.__a8eHostFsUnsubscribe === unsub) {
        panel.__a8eHostFsUnsubscribe = null;
      }
      unsubscribeChange = null;
    });
  }

  window.A8EHostFsUI = { init: init };
})();
