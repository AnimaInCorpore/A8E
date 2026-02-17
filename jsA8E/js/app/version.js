(function () {
  "use strict";

  async function applyBuildVersion() {
    let line = document.getElementById("buildVersionLine");
    if (!line) return;

    try {
      let response = await fetch("version.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load version.json");
      let payload = await response.json();
      let version =
        payload && typeof payload.version === "string"
          ? payload.version.trim()
          : "";
      if (!version) throw new Error("Missing version field");
      line.textContent = "Build version: jsA8E " + version;
    } catch {
      line.textContent = "Build version: unavailable";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyBuildVersion);
  } else {
    applyBuildVersion();
  }
})();
