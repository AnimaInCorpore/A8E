const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  {
    ignores: ["**/*.min.js"],
  },
  js.configs.recommended,
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
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      "no-console": "off",
      eqeqeq: ["error", "always", { null: "ignore" }],
      curly: ["error", "multi-line"],
      "dot-notation": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-new-wrappers": "error",
      "no-octal": "error",
      "no-octal-escape": "error",
      "no-proto": "error",
      "no-self-compare": "error",
      "no-template-curly-in-string": "error",
      "no-unreachable-loop": "error",
      "no-useless-call": "error",
      "no-useless-concat": "error",
      "radix": ["error", "always"],
      "yoda": ["error", "never"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
];
