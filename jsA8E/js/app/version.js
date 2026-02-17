(function () {
  "use strict";

  async function applyBuildVersion() {
    const line = document.getElementById("buildVersionLine");
    if (!line) return;

    try {
      const response = await fetch("version.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load version.json");
      const payload = await response.json();
      const version =
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
