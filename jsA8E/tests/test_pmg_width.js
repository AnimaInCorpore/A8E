const { api } = require("./script_runtime.js");
(async () => {
  await api.system.start();
  console.log("Check PMG priorities width");
})();
