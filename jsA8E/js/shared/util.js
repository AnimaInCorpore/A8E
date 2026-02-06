(function () {
  "use strict";

  function clampU8(x) {
    return x & 0xff;
  }

  function toHex2(x) {
    var s = (x & 0xff).toString(16).toUpperCase();
    return s.length === 1 ? "0" + s : s;
  }

  function toHex4(x) {
    var s = (x & 0xffff).toString(16).toUpperCase();
    while (s.length < 4) s = "0" + s;
    return s;
  }

  function fixedAdd(address, bits, value) {
    return (address & ~bits) | ((address + value) & bits);
  }

  function readFileAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () {
        reject(reader.error || new Error("FileReader error"));
      };
      reader.onload = function () {
        resolve(reader.result);
      };
      reader.readAsArrayBuffer(file);
    });
  }

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
