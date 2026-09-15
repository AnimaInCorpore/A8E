(function () {
  "use strict";

  const DISPLAY_MS = 900;

  function init(opts) {
    const config = opts && typeof opts === "object" ? opts : {};
    const app = config.app;
    const element = config.element;
    if (!app || !element || typeof app.onDiskActivity !== "function") return;
    if (element.__a8eDiskActivityInitialized) return;
    element.__a8eDiskActivityInitialized = true;

    let hideTimer = 0;
    let pulsePhase = 0;

    function hide() {
      element.classList.remove("visible");
      element.textContent = "";
    }

    function show(activity) {
      if (!activity || typeof activity !== "object") return;
      const slot = activity.deviceSlot | 0;
      if (slot < 0 || slot > 7) return;

      const operation = String(activity.operation || "access").toLowerCase();
      const isWrite = operation === "write" || operation === "format";
      element.textContent = "D" + (slot + 1) + ":";
      element.className =
        "disk-activity visible " +
        (isWrite ? "disk-activity-write" : "disk-activity-read") +
        " disk-activity-pulse-" + (pulsePhase++ & 1);
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(hide, DISPLAY_MS);
    }

    element.className = "disk-activity";
    app.onDiskActivity(show);
  }

  window.A8EDiskActivityUI = { init: init };
})();
