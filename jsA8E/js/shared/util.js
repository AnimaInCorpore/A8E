(function () {
  "use strict";

  const clampU8 = x => x & 0xff;

  const toHex2 = x => {
    const s = (x & 0xff).toString(16).toUpperCase();
    return s.length === 1 ? "0" + s : s;
  };

  const toHex4 = x => {
    let s = (x & 0xffff).toString(16).toUpperCase();
    while (s.length < 4) s = "0" + s;
    return s;
  };

  const fixedAdd = (address, bits, value) => (address & ~bits) | ((address + value) & bits);

  const readFileAsArrayBuffer = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(reader.error || new Error("FileReader error"));
    };
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.readAsArrayBuffer(file);
  });

  function fetchOptional(url) {
    return fetch(url)
      .then(function (r) {
        if (!r.ok) return null;
        return r.arrayBuffer();
      })
      .catch(function () {
        return null;
      });
  }

  window.A8EUtil = {
    clampU8: clampU8,
    toHex2: toHex2,
    toHex4: toHex4,
    fixedAdd: fixedAdd,
    readFileAsArrayBuffer: readFileAsArrayBuffer,
    fetchOptional: fetchOptional,
  };
})();
