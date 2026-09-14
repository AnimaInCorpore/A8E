(function () {
  "use strict";

  const DRIVE_COUNT = 4;
  const SUPPORTED_EXTENSIONS = new Set(["atr", "xex"]);

  function extension(name) {
    const value = String(name || "");
    const dot = value.lastIndexOf(".");
    return dot >= 0 ? value.substring(dot + 1).toLowerCase() : "";
  }

  function formatSize(bytes) {
    const size = Math.max(0, bytes | 0);
    if (size < 1024) return size + " B";
    if (size < 1024 * 1024) return (size / 1024).toFixed(1) + " KB";
    return (size / (1024 * 1024)).toFixed(1) + " MB";
  }

  function triggerDownload(result) {
    if (!result || !result.bytes) return;
    const blob = new Blob([result.bytes], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = result.name || "disk.atr";
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function init(opts) {
    const config = opts && typeof opts === "object" ? opts : {};
    const app = config.app;
    const panel = config.panel;
    const button = config.button;
    if (!app || !panel || !button) return;
    if (panel.__a8eDiskLibraryInitialized) return;

    const library =
      typeof app.getDiskLibrary === "function"
        ? app.getDiskLibrary()
        : app.diskLibrary;
    if (!library) return;
    panel.__a8eDiskLibraryInitialized = true;

    const listEl = panel.querySelector(".disklib-list");
    const dropZone = panel.querySelector(".disklib-drop-zone");
    const uploadBtn = panel.querySelector(".disklib-upload-btn");
    const uploadInput = panel.querySelector(".disklib-upload-input");
    const masterChk = panel.querySelector(".disklib-master-chk");
    const selectAllBtn = panel.querySelector(".disklib-sel-all-btn");
    const selectNoneBtn = panel.querySelector(".disklib-sel-none-btn");
    const downloadBtn = panel.querySelector(".disklib-dl-sel-btn");
    const deleteBtn = panel.querySelector(".disklib-del-sel-btn");
    const statusEl = panel.querySelector(".disklib-status");
    const countEl = panel.querySelector(".disklib-stat-count");
    const selectedEl = panel.querySelector(".disklib-stat-sel");
    const totalEl = panel.querySelector(".disklib-stat-total");

    const selected = new Set();
    const pending = new Set();
    let files = [];

    function setStatus(message, kind) {
      if (!statusEl) return;
      statusEl.textContent = message || "";
      statusEl.className = "disklib-status" + (kind ? " " + kind : "");
    }

    function fileById(id) {
      for (let i = 0; i < files.length; i++) {
        if (files[i].id === id) return files[i];
      }
      return null;
    }

    function updateToolbar() {
      selected.forEach(function (id) {
        if (!fileById(id)) selected.delete(id);
      });
      const hasSelection = selected.size > 0;
      if (downloadBtn) downloadBtn.disabled = !hasSelection;
      if (deleteBtn) deleteBtn.disabled = !hasSelection;
      if (selectedEl) {
        selectedEl.hidden = !hasSelection;
        selectedEl.textContent = hasSelection
          ? selected.size + " selected"
          : "";
      }
      if (masterChk) {
        masterChk.checked = files.length > 0 && selected.size === files.length;
        masterChk.indeterminate = selected.size > 0 && selected.size < files.length;
      }
    }

    function createTextCell(className, text) {
      const cell = document.createElement("span");
      cell.className = "disklib-col " + className;
      cell.textContent = text;
      return cell;
    }

    function render() {
      files = typeof library.listFiles === "function" ? library.listFiles() : [];
      if (!listEl) return;
      listEl.textContent = "";
      let total = 0;

      files.forEach(function (info) {
        total += info.size | 0;
        const row = document.createElement("div");
        row.className = "disklib-row" + (selected.has(info.id) ? " selected" : "");

        const selectCell = document.createElement("span");
        selectCell.className = "disklib-col disklib-col-chk";
        const selectChk = document.createElement("input");
        selectChk.type = "checkbox";
        selectChk.className = "disklib-row-chk";
        selectChk.checked = selected.has(info.id);
        selectChk.title = "Select file";
        selectChk.addEventListener("change", function () {
          if (selectChk.checked) selected.add(info.id);
          else selected.delete(info.id);
          render();
        });
        selectCell.appendChild(selectChk);
        row.appendChild(selectCell);

        const nameCell = document.createElement("span");
        nameCell.className = "disklib-col disklib-col-name";
        const type = document.createElement("span");
        type.className = "disklib-type disklib-type-" + info.format;
        type.textContent = String(info.format || "").toUpperCase();
        nameCell.appendChild(type);
        const name = document.createElement("span");
        name.className = "disklib-name";
        name.textContent = info.name;
        nameCell.appendChild(name);
        if (info.dirty) {
          const dirty = document.createElement("span");
          dirty.className = "disklib-dirty";
          dirty.title = "Changes pending persistence";
          dirty.textContent = "*";
          nameCell.appendChild(dirty);
        }
        row.appendChild(nameCell);
        row.appendChild(createTextCell("disklib-col-size", formatSize(info.size)));

        for (let drive = 0; drive < DRIVE_COUNT; drive++) {
          const driveCell = document.createElement("span");
          driveCell.className = "disklib-col disklib-col-drive";
          const driveChk = document.createElement("input");
          driveChk.type = "checkbox";
          driveChk.className = "disklib-drive-chk";
          driveChk.checked = info.mountedSlot === drive;
          driveChk.disabled = pending.has(info.id + ":" + drive);
          driveChk.title =
            driveChk.checked ? "Unmount from D" + (drive + 1) + ":" : "Mount in D" + (drive + 1) + ":";
          driveChk.addEventListener("change", function () {
            const key = info.id + ":" + drive;
            pending.add(key);
            render();
            const operation = driveChk.checked
              ? library.mountFile(info.id, drive)
              : library.unmountFile(info.id);
            Promise.resolve(operation)
              .then(function () {
                setStatus(
                  driveChk.checked
                    ? "Mounted " + info.name + " in D" + (drive + 1) + ":"
                    : "Unmounted " + info.name,
                  "success",
                );
              })
              .catch(function (err) {
                setStatus(err && err.message ? err.message : "Unable to change drive mount", "error");
              })
              .finally(function () {
                pending.delete(key);
                render();
              });
          });
          driveCell.appendChild(driveChk);
          row.appendChild(driveCell);
        }

        const actionCell = document.createElement("span");
        actionCell.className = "disklib-col disklib-col-actions";
        const downloadOne = document.createElement("button");
        downloadOne.type = "button";
        downloadOne.className = "disklib-action-btn";
        downloadOne.title = "Download current image";
        downloadOne.innerHTML = '<i class="fa-solid fa-download"></i>';
        downloadOne.addEventListener("click", function () {
          setStatus("Saving " + info.name + "...", "busy");
          library.downloadFile(info.id)
            .then(function (result) {
              triggerDownload(result);
              setStatus("Downloaded " + (result.name || info.name), "success");
            })
            .catch(function (err) {
              setStatus(err && err.message ? err.message : "Download failed", "error");
            });
        });
        actionCell.appendChild(downloadOne);
        row.appendChild(actionCell);
        listEl.appendChild(row);
      });

      if (!files.length) {
        const empty = document.createElement("div");
        empty.className = "disklib-empty";
        empty.innerHTML = '<i class="fa-solid fa-floppy-disk"></i><br>No ATR or XEX files in the library';
        listEl.appendChild(empty);
      }

      if (countEl) countEl.textContent = files.length + (files.length === 1 ? " file" : " files");
      if (totalEl) totalEl.textContent = formatSize(total) + " stored";
      updateToolbar();
    }

    function readFiles(fileList) {
      const input = Array.from(fileList || []);
      const supported = input.filter(function (file) {
        return SUPPORTED_EXTENSIONS.has(extension(file.name));
      });
      if (supported.length !== input.length) {
        setStatus("Only ATR and XEX files can be added", "error");
      }
      return supported.reduce(function (chain, file) {
        return chain.then(function () {
          return file.arrayBuffer().then(function (buffer) {
            const existing = files.find(function (item) {
              return item.name.toUpperCase() === file.name.toUpperCase();
            });
            const operation = existing
              ? (confirm("Replace " + existing.name + "?")
                ? library.replaceFile(existing.id, file.name, buffer)
                : Promise.resolve(null))
              : library.addFile(file.name, buffer);
            return Promise.resolve(operation).then(function () {
              setStatus("Added " + file.name, "success");
            });
          });
        });
      }, Promise.resolve()).catch(function (err) {
        setStatus(err && err.message ? err.message : "Unable to add file", "error");
      });
    }

    button.addEventListener("click", function () {
      const active = button.classList.toggle("active");
      panel.hidden = !active;
      if (active) render();
    });

    if (uploadBtn && uploadInput) {
      uploadBtn.addEventListener("click", function () { uploadInput.click(); });
      uploadInput.addEventListener("change", function () {
        readFiles(uploadInput.files);
        uploadInput.value = "";
      });
    }

    if (dropZone) {
      dropZone.addEventListener("dragover", function (event) {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.add("drag-over");
      });
      dropZone.addEventListener("dragleave", function (event) {
        event.preventDefault();
        event.stopPropagation();
        if (!dropZone.contains(event.relatedTarget)) dropZone.classList.remove("drag-over");
      });
      dropZone.addEventListener("drop", function (event) {
        event.preventDefault();
        event.stopPropagation();
        dropZone.classList.remove("drag-over");
        readFiles(event.dataTransfer ? event.dataTransfer.files : []);
      });
    }

    if (selectAllBtn) {
      selectAllBtn.addEventListener("click", function () {
        files.forEach(function (file) { selected.add(file.id); });
        render();
      });
    }
    if (selectNoneBtn) {
      selectNoneBtn.addEventListener("click", function () {
        selected.clear();
        render();
      });
    }
    if (masterChk) {
      masterChk.addEventListener("change", function () {
        if (masterChk.checked) files.forEach(function (file) { selected.add(file.id); });
        else selected.clear();
        render();
      });
    }
    if (downloadBtn) {
      downloadBtn.addEventListener("click", function () {
        const ids = Array.from(selected);
        setStatus("Saving selected images...", "busy");
        ids.reduce(function (chain, id) {
          return chain.then(function () {
            return library.downloadFile(id).then(triggerDownload);
          });
        }, Promise.resolve()).then(function () {
          setStatus("Downloaded " + ids.length + " image" + (ids.length === 1 ? "" : "s"), "success");
        }).catch(function (err) {
          setStatus(err && err.message ? err.message : "Download failed", "error");
        });
      });
    }
    if (deleteBtn) {
      deleteBtn.addEventListener("click", function () {
        const ids = Array.from(selected);
        if (!ids.length) return;
        if (!confirm("Delete " + ids.length + " selected image" + (ids.length === 1 ? "" : "s") + "?")) return;
        setStatus("Deleting selected images...", "busy");
        ids.reduce(function (chain, id) {
          return chain.then(function () { return library.deleteFile(id); });
        }, Promise.resolve()).then(function () {
          selected.clear();
          setStatus("Deleted " + ids.length + " image" + (ids.length === 1 ? "" : "s"), "success");
          render();
        }).catch(function (err) {
          setStatus(err && err.message ? err.message : "Delete failed", "error");
        });
      });
    }

    if (typeof library.onChange === "function") library.onChange(render);
    render();
  }

  window.A8EDiskLibraryUI = { init: init };
})();
