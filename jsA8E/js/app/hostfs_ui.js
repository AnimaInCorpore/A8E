(function () {
  "use strict";

  const Util = window.A8EUtil;

  /**
   * Initialise the H: file manager panel.
   *
   * @param {object} opts
   * @param {object} opts.app     - The emulator app object (must expose hDevice).
   * @param {Element} opts.panel  - The #hostfsPanel container element.
   * @param {Element} opts.button - The toggle button for the panel.
   */
  function init(opts) {
    const app = opts.app;
    const panel = opts.panel;
    const button = opts.button;
    if (!panel || !button || !app || !app.hDevice) return;

    const hostFs = app.hDevice.getHostFs();
    if (!hostFs) return;

    const listEl = panel.querySelector(".hostfs-list");
    const uploadBtn = panel.querySelector(".hostfs-upload-btn");
    const uploadInput = panel.querySelector(".hostfs-upload-input");
    const dropZone = panel.querySelector(".hostfs-drop-zone");

    // Toggle panel visibility
    button.addEventListener("click", function () {
      const active = button.classList.toggle("active");
      panel.hidden = !active;
      if (active) refreshList();
    });

    // Upload via hidden file input
    if (uploadBtn && uploadInput) {
      uploadBtn.addEventListener("click", function () {
        uploadInput.click();
      });
      uploadInput.addEventListener("change", function () {
        const files = uploadInput.files;
        if (!files || !files.length) return;
        _uploadFiles(files).then(refreshList);
        uploadInput.value = "";
      });
    }

    // Drag-and-drop
    if (dropZone) {
      dropZone.addEventListener("dragover", function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add("drag-over");
      });
      dropZone.addEventListener("dragleave", function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove("drag-over");
      });
      dropZone.addEventListener("drop", function (e) {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove("drag-over");
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length) {
          _uploadFiles(files).then(refreshList);
        }
      });
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

    function refreshList() {
      if (!listEl) return;
      const files = hostFs.listFiles();
      listEl.innerHTML = "";

      if (!files.length) {
        const empty = document.createElement("div");
        empty.className = "hostfs-empty";
        empty.textContent = "No files. Upload or drag files here.";
        listEl.appendChild(empty);
        return;
      }

      for (let i = 0; i < files.length; i++) {
        listEl.appendChild(_createRow(files[i]));
      }
    }

    function _createRow(info) {
      const row = document.createElement("div");
      row.className = "hostfs-row";

      const nameSpan = document.createElement("span");
      nameSpan.className = "hostfs-name";
      nameSpan.textContent =
        (info.locked ? "*" : " ") + info.name;
      row.appendChild(nameSpan);

      const sizeSpan = document.createElement("span");
      sizeSpan.className = "hostfs-size";
      sizeSpan.textContent = _formatSize(info.size);
      row.appendChild(sizeSpan);

      const actions = document.createElement("span");
      actions.className = "hostfs-actions";

      const dlBtn = document.createElement("button");
      dlBtn.className = "hostfs-action-btn";
      dlBtn.title = "Download " + info.name;
      dlBtn.innerHTML = '<i class="fa-solid fa-download"></i>';
      dlBtn.addEventListener("click", function () {
        _downloadFile(info.name);
      });
      actions.appendChild(dlBtn);

      const delBtn = document.createElement("button");
      delBtn.className = "hostfs-action-btn";
      delBtn.title = "Delete " + info.name;
      delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
      delBtn.addEventListener("click", function () {
        if (confirm("Delete " + info.name + "?")) {
          hostFs.deleteFile(info.name);
          refreshList();
        }
      });
      actions.appendChild(delBtn);

      row.appendChild(actions);
      return row;
    }

    function _formatSize(bytes) {
      if (bytes < 1024) return bytes + " B";
      return (bytes / 1024).toFixed(1) + " KB";
    }

    function _downloadFile(name) {
      const data = hostFs.readFile(name);
      if (!data) return;
      const blob = new Blob([data], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    // Initial state: hidden
    panel.hidden = true;
    button.classList.remove("active");
  }

  window.A8EHostFsUI = { init: init };
})();
