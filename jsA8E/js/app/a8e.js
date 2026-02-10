(function () {
  "use strict";

  function main() {
    const p = window.A8EUI.boot();
    if (p && typeof p.then === "function") {
      p.catch(function (err) {
        window.setTimeout(function () {
          throw err;
        }, 0);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
