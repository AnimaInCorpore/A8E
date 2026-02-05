(function () {
  "use strict";

  function main() {
    window.A8EUI.boot();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();

