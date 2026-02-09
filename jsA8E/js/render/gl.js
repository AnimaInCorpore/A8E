(function () {
  "use strict";

  function compileShader(gl, type, source) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, source);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var msg = gl.getShaderInfoLog(sh) || "shader compile failed";
      try {
        gl.deleteShader(sh);
      } catch (e) {
        // ignore
      }
      throw new Error(msg);
    }
    return sh;
  }

  function linkProgram(gl, vsSource, fsSource) {
    var vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
    var fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    try {
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    } catch (e) {
      // ignore
    }
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      var msg2 = gl.getProgramInfoLog(prog) || "program link failed";
      try {
        gl.deleteProgram(prog);
      } catch (e2) {
        // ignore
      }
      throw new Error(msg2);
    }
    return prog;
  }

  function buildPaletteRgba(paletteRgb) {
    var out = new Uint8Array(256 * 4);
    for (var i = 0; i < 256; i++) {
      var si = i * 3;
      var di = i * 4;
      out[di + 0] = paletteRgb[si + 0] & 0xff;
      out[di + 1] = paletteRgb[si + 1] & 0xff;
      out[di + 2] = paletteRgb[si + 2] & 0xff;
      out[di + 3] = 255;
    }
    return out;
  }

  function isWebGL2(gl) {
    return (
      typeof window.WebGL2RenderingContext !== "undefined" &&
      gl instanceof window.WebGL2RenderingContext
    );
  }

  function createTexture(gl, unit, minFilter, magFilter, wrapS, wrapT) {
    var tex = gl.createTexture();
    gl.activeTexture(unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
    return tex;
  }

  function setupQuad(gl, buffer, posLoc, uvLoc) {
    var stride = 4 * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    if (posLoc >= 0) {
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, stride, 0);
    }
    if (uvLoc >= 0) {
      gl.enableVertexAttribArray(uvLoc);
      gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, stride, 2 * 4);
    }
  }

  var SHADER_PATHS = {
    webgl2: {
      vs: "js/render/shaders/webgl2.vert.glsl",
      decodeFs: "js/render/shaders/webgl2.decode.frag.glsl",
      crtFs: "js/render/shaders/webgl2.crt.frag.glsl",
    },
    webgl1: {
      vs: "js/render/shaders/webgl1.vert.glsl",
      decodeFs: "js/render/shaders/webgl1.decode.frag.glsl",
      crtFs: "js/render/shaders/webgl1.crt.frag.glsl",
    },
  };

  var shaderSourceCache = null;
  var shaderSourcePromise = null;

  function fetchShaderText(url) {
    return fetch(url).then(function (resp) {
      if (!resp.ok)
        throw new Error(
          "A8EGlRenderer: failed to fetch shader: " +
            url +
            " (" +
            resp.status +
            ")",
        );
      return resp.text();
    });
  }

  function loadShaderSources() {
    if (shaderSourceCache) return Promise.resolve(shaderSourceCache);
    if (shaderSourcePromise) return shaderSourcePromise;

    var tasks = [];
    function enqueue(profile, key, url) {
      tasks.push(
        fetchShaderText(url).then(function (text) {
          return { profile: profile, key: key, text: text };
        }),
      );
    }

    enqueue("webgl2", "vs", SHADER_PATHS.webgl2.vs);
    enqueue("webgl2", "decodeFs", SHADER_PATHS.webgl2.decodeFs);
    enqueue("webgl2", "crtFs", SHADER_PATHS.webgl2.crtFs);
    enqueue("webgl1", "vs", SHADER_PATHS.webgl1.vs);
    enqueue("webgl1", "decodeFs", SHADER_PATHS.webgl1.decodeFs);
    enqueue("webgl1", "crtFs", SHADER_PATHS.webgl1.crtFs);

    shaderSourcePromise = Promise.all(tasks)
      .then(function (items) {
        var out = {
          webgl2: { vs: "", decodeFs: "", crtFs: "" },
          webgl1: { vs: "", decodeFs: "", crtFs: "" },
        };
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          out[it.profile][it.key] = it.text;
        }
        shaderSourceCache = out;
        return out;
      })
      .catch(function (err) {
        shaderSourcePromise = null;
        throw err;
      });

    return shaderSourcePromise;
  }

  function getShaderSources(gl2) {
    if (!shaderSourceCache) {
      throw new Error(
        "A8EGlRenderer: shaders not loaded (call loadShaderSources() before create())",
      );
    }
    return gl2 ? shaderSourceCache.webgl2 : shaderSourceCache.webgl1;
  }

  function create(opts) {
    var gl = opts.gl;
    var canvas = opts.canvas;
    var texW = opts.textureW | 0;
    var texH = opts.textureH | 0;
    var viewX = opts.viewX | 0;
    var viewY = opts.viewY | 0;
    var viewW = opts.viewW | 0;
    var viewH = opts.viewH | 0;
    var paletteRgb = opts.paletteRgb;

    if (!gl) throw new Error("A8EGlRenderer: missing WebGL context");
    if (!canvas) throw new Error("A8EGlRenderer: missing canvas");
    if (!paletteRgb || paletteRgb.length < 256 * 3)
      throw new Error("A8EGlRenderer: missing palette");
    // Keep CRT internal scene resolution fixed to 2x horizontal, 1x vertical.
    var sceneScaleX = 2;
    var sceneScaleY = 1;
    if (texW <= 0 || texH <= 0)
      throw new Error("A8EGlRenderer: invalid texture size");
    if (viewW <= 0 || viewH <= 0)
      throw new Error("A8EGlRenderer: invalid viewport size");

    var sceneW = viewW * sceneScaleX;
    var sceneH = viewH * sceneScaleY;

    var gl2 = isWebGL2(gl);

    var shaderSources = getShaderSources(gl2);
    var vsSource = shaderSources.vs;
    var decodeFsSource = shaderSources.decodeFs;
    var crtFsSource = shaderSources.crtFs;

    var decodeProgram = null;
    var crtProgram = null;
    var indexTex = null;
    var paletteTex = null;
    var sceneTex = null;
    var sceneFbo = null;
    var decodeBuf = null;
    var crtBuf = null;
    var decodePosLoc = -1;
    var decodeUvLoc = -1;
    var decodeIndexLoc = null;
    var decodePaletteLoc = null;
    var crtPosLoc = -1;
    var crtUvLoc = -1;
    var crtSceneLoc = null;
    var crtSourceSizeLoc = null;
    var crtScanlineSizeLoc = null;
    var crtOutputSizeLoc = null;
    var disposed = false;

    function dispose() {
      if (disposed) return;
      disposed = true;
      try {
        if (decodeBuf) gl.deleteBuffer(decodeBuf);
        if (crtBuf) gl.deleteBuffer(crtBuf);
        if (indexTex) gl.deleteTexture(indexTex);
        if (paletteTex) gl.deleteTexture(paletteTex);
        if (sceneTex) gl.deleteTexture(sceneTex);
        if (sceneFbo) gl.deleteFramebuffer(sceneFbo);
        if (decodeProgram) gl.deleteProgram(decodeProgram);
        if (crtProgram) gl.deleteProgram(crtProgram);
      } catch (e) {
        // ignore
      }
      decodeBuf = null;
      crtBuf = null;
      indexTex = null;
      paletteTex = null;
      sceneTex = null;
      sceneFbo = null;
      decodeProgram = null;
      crtProgram = null;
    }

    function paint(video) {
      if (disposed) return;

      // Upload indexed framebuffer.
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, indexTex);
      if (gl2)
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          texW,
          texH,
          gl.RED,
          gl.UNSIGNED_BYTE,
          video.pixels,
        );
      else
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          texW,
          texH,
          gl.LUMINANCE,
          gl.UNSIGNED_BYTE,
          video.pixels,
        );

      // Pass 1: index + palette -> scene texture (at internal sceneScaleX/sceneScaleY resolution).
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
      gl.viewport(0, 0, sceneW, sceneH);
      gl.useProgram(decodeProgram);
      setupQuad(gl, decodeBuf, decodePosLoc, decodeUvLoc);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, indexTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, paletteTex);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Pass 2: CRT post-process to display.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(crtProgram);
      setupQuad(gl, crtBuf, crtPosLoc, crtUvLoc);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      if (crtOutputSizeLoc !== null)
        gl.uniform2f(crtOutputSizeLoc, canvas.width | 0, canvas.height | 0);
      gl.viewport(0, 0, canvas.width | 0, canvas.height | 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    try {
      decodeProgram = linkProgram(gl, vsSource, decodeFsSource);
      crtProgram = linkProgram(gl, vsSource, crtFsSource);

      gl.disable(gl.DITHER);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 1);

      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      if (!gl2 && gl.UNPACK_COLORSPACE_CONVERSION_WEBGL) {
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      }

      // Source indexed framebuffer texture.
      indexTex = createTexture(
        gl,
        gl.TEXTURE0,
        gl.NEAREST,
        gl.NEAREST,
        gl.CLAMP_TO_EDGE,
        gl.CLAMP_TO_EDGE,
      );
      if (gl2) {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.R8,
          texW,
          texH,
          0,
          gl.RED,
          gl.UNSIGNED_BYTE,
          null,
        );
      } else {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.LUMINANCE,
          texW,
          texH,
          0,
          gl.LUMINANCE,
          gl.UNSIGNED_BYTE,
          null,
        );
      }

      // Palette lookup texture.
      paletteTex = createTexture(
        gl,
        gl.TEXTURE1,
        gl.NEAREST,
        gl.NEAREST,
        gl.CLAMP_TO_EDGE,
        gl.CLAMP_TO_EDGE,
      );
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        256,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        buildPaletteRgba(paletteRgb),
      );

      // Offscreen scene texture (RGB after palette pass, at internal sceneScaleX/sceneScaleY resolution).
      sceneTex = createTexture(
        gl,
        gl.TEXTURE2,
        gl.NEAREST,
        gl.NEAREST,
        gl.CLAMP_TO_EDGE,
        gl.CLAMP_TO_EDGE,
      );
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        sceneW,
        sceneH,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );

      sceneFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        sceneTex,
        0,
      );
      if (
        gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
      ) {
        throw new Error("A8EGlRenderer: framebuffer incomplete");
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // Quad for decode pass (full canvas quad, uv remaps to Atari viewport region).
      // Use texel edges so the viewport spans the full source width/height when scaling.
      var u0 = viewX / texW;
      var u1 = (viewX + viewW) / texW;
      var v0 = viewY / texH;
      var v1 = (viewY + viewH) / texH;
      var decodeQuad = new Float32Array([
        -1.0,
        -1.0,
        u0,
        v1,
        -1.0,
        1.0,
        u0,
        v0,
        1.0,
        -1.0,
        u1,
        v1,
        1.0,
        1.0,
        u1,
        v0,
      ]);

      decodeBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, decodeBuf);
      gl.bufferData(gl.ARRAY_BUFFER, decodeQuad, gl.STATIC_DRAW);

      // Quad for final CRT post-process pass.
      var crtQuad = new Float32Array([
        -1.0, -1.0, 0.0, 0.0, -1.0, 1.0, 0.0, 1.0, 1.0, -1.0, 1.0, 0.0, 1.0,
        1.0, 1.0, 1.0,
      ]);

      crtBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, crtBuf);
      gl.bufferData(gl.ARRAY_BUFFER, crtQuad, gl.STATIC_DRAW);

      decodePosLoc = gl.getAttribLocation(decodeProgram, "a_pos");
      decodeUvLoc = gl.getAttribLocation(decodeProgram, "a_uv");
      decodeIndexLoc = gl.getUniformLocation(decodeProgram, "u_indexTex");
      decodePaletteLoc = gl.getUniformLocation(decodeProgram, "u_paletteTex");

      crtPosLoc = gl.getAttribLocation(crtProgram, "a_pos");
      crtUvLoc = gl.getAttribLocation(crtProgram, "a_uv");
      crtSceneLoc = gl.getUniformLocation(crtProgram, "u_sceneTex");
      crtSourceSizeLoc = gl.getUniformLocation(crtProgram, "u_sourceSize");
      crtScanlineSizeLoc = gl.getUniformLocation(crtProgram, "u_scanlineSize");
      crtOutputSizeLoc = gl.getUniformLocation(crtProgram, "u_outputSize");

      gl.useProgram(decodeProgram);
      if (decodeIndexLoc !== null) gl.uniform1i(decodeIndexLoc, 0);
      if (decodePaletteLoc !== null) gl.uniform1i(decodePaletteLoc, 1);

      gl.useProgram(crtProgram);
      if (crtSceneLoc !== null) gl.uniform1i(crtSceneLoc, 2);
      if (crtSourceSizeLoc !== null)
        gl.uniform2f(crtSourceSizeLoc, sceneW, sceneH);
      if (crtScanlineSizeLoc !== null)
        gl.uniform2f(crtScanlineSizeLoc, viewW, viewH);

      return {
        paint: paint,
        dispose: dispose,
        backend: gl2 ? "webgl2" : "webgl",
      };
    } catch (err) {
      dispose();
      throw err;
    }
  }

  window.A8EGlRenderer = {
    loadShaderSources: loadShaderSources,
    create: create,
  };
})();
