(function () {
  "use strict";

  const root = typeof window !== "undefined" ? window : globalThis;
  const ns = root.A8EAssemblerModules;

  if (!ns || typeof ns.buildOpcodeMap !== "function" || typeof ns.assembleToXex !== "function") {
    root.A8EAssemblerCore = {
      assembleToXex: function assembleToXex() {
        return { ok: false, error: "Assembler modules unavailable." };
      },
      mnemonicKeywords: [],
      directiveKeywords: [],
    };
    return;
  }

  const opcodes = ns.buildOpcodeMap();
  const mnemonicKeywords = opcodes ? Object.keys(opcodes) : [];
  const directiveKeywords = Array.isArray(ns.DIRECTIVE_KEYWORDS)
    ? ns.DIRECTIVE_KEYWORDS.slice()
    : [];
  if (ns.PREPROCESSOR_DIRECTIVES && typeof ns.PREPROCESSOR_DIRECTIVES.forEach === "function") {
    ns.PREPROCESSOR_DIRECTIVES.forEach(function (name) {
      if (directiveKeywords.indexOf(name) < 0) directiveKeywords.push(name);
    });
  }

  const context = {
    opcodes: opcodes,
    mnemonicKeywords: new Set(mnemonicKeywords),
    directiveKeywords: new Set(directiveKeywords),
  };

  root.A8EAssemblerCore = {
    assembleToXex: function assembleToXex(sourceText, options) {
      return ns.assembleToXex(sourceText, context, options || {});
    },
    mnemonicKeywords: mnemonicKeywords,
    directiveKeywords: directiveKeywords,
  };
})();
