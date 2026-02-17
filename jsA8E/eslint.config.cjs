const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: ["**/*.min.js"],
  },
  {
    files: ["js/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.worker,
        AudioWorkletProcessor: "readonly",
        registerProcessor: "readonly",
        currentTime: "readonly",
        sampleRate: "readonly",
      },
    },
    rules: {
      "no-console": "off",
    },
  },
  js.configs.recommended,
];
