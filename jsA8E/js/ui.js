(function () {
  "use strict";

  var Util = window.A8EUtil;

  function boot() {
    var canvas = document.getElementById("screen");
    canvas.tabIndex = 0;
    var ctx2d = canvas.getContext("2d", { alpha: false });

    var btnStart = document.getElementById("btnStart");
    var btnPause = document.getElementById("btnPause");
    var btnReset = document.getElementById("btnReset");
    var chkTurbo = document.getElementById("chkTurbo");
    var chkAudio = document.getElementById("chkAudio");
    var chkOptionOnStart = document.getElementById("chkOptionOnStart");

    var romOs = document.getElementById("romOs");
    var romBasic = document.getElementById("romBasic");
    var disk1 = document.getElementById("disk1");
    var romStatus = document.getElementById("romStatus");
    var diskStatus = document.getElementById("diskStatus");
    var debugEl = document.getElementById("debug");

    var app = window.A8EApp.create({
      canvas: canvas,
      ctx2d: ctx2d,
      debugEl: debugEl,
      audioEnabled: chkAudio.checked,
      turbo: chkTurbo.checked,
      optionOnStart: chkOptionOnStart.checked,
    });

    function setButtons(running) {
      btnStart.disabled = running;
      btnPause.disabled = !running;
      btnReset.disabled = !app.isReady();
    }

    function updateStatus() {
      var rs = [];
      if (app.hasOsRom()) rs.push("ATARIXL.ROM loaded");
      if (app.hasBasicRom()) rs.push("ATARIBAS.ROM loaded");
      romStatus.textContent = rs.length ? rs.join(" · ") : "No ROMs loaded yet.";
      diskStatus.textContent = app.hasDisk1() ? "Disk loaded." : "No disk loaded.";
      setButtons(app.isRunning());
    }

    btnStart.addEventListener("click", function () {
      app.start();
      setButtons(true);
      canvas.focus();
    });

    btnPause.addEventListener("click", function () {
      app.pause();
      setButtons(false);
    });

    btnReset.addEventListener("click", function () {
      app.reset();
      updateStatus();
      canvas.focus();
    });

    chkTurbo.addEventListener("change", function () {
      app.setTurbo(!!chkTurbo.checked);
    });

    chkAudio.addEventListener("change", function () {
      app.setAudioEnabled(!!chkAudio.checked);
    });

    chkOptionOnStart.addEventListener("change", function () {
      app.setOptionOnStart(!!chkOptionOnStart.checked);
    });

    function attachFileInput(inputEl, handler) {
      inputEl.addEventListener("change", function () {
        var file = inputEl.files && inputEl.files[0];
        if (!file) return;
        Util.readFileAsArrayBuffer(file).then(function (buf) {
          try {
            handler(buf, file.name);
            updateStatus();
          } catch (e) {
            debugEl.textContent = String(e && e.message ? e.message : e);
          }
        });
      });
    }

    attachFileInput(romOs, function (buf) {
      app.loadOsRom(buf);
    });

    attachFileInput(romBasic, function (buf) {
      app.loadBasicRom(buf);
    });

    attachFileInput(disk1, function (buf, name) {
      app.loadDisk1(buf, name);
    });

    // Keyboard input forwarded to emulator.
    canvas.addEventListener("keydown", function (e) {
      if (app.onKeyDown(e)) e.preventDefault();
    });
    canvas.addEventListener("keyup", function (e) {
      if (app.onKeyUp(e)) e.preventDefault();
    });

    // Attempt auto-load from repo root (works when serving repo root).
    Promise.all([
      Util.fetchOptional("../ATARIXL.ROM"),
      Util.fetchOptional("../ATARIBAS.ROM"),
    ]).then(function (res) {
      try {
        if (res[0]) app.loadOsRom(res[0]);
        if (res[1]) app.loadBasicRom(res[1]);
      } catch (e) {
        debugEl.textContent = String(e && e.message ? e.message : e);
      }
      updateStatus();
    });

    updateStatus();
  }

  window.A8EUI = { boot: boot };
})();
