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
    return typeof window.WebGL2RenderingContext !== "undefined" && gl instanceof window.WebGL2RenderingContext;
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
    if (!paletteRgb || paletteRgb.length < 256 * 3) throw new Error("A8EGlRenderer: missing palette");
    if (texW <= 0 || texH <= 0) throw new Error("A8EGlRenderer: invalid texture size");
    if (viewW <= 0 || viewH <= 0) throw new Error("A8EGlRenderer: invalid viewport size");

    var gl2 = isWebGL2(gl);

    var vsSource;
    var fsSource;
    if (gl2) {
      vsSource =
        "#version 300 es\n" +
        "in vec2 a_pos;\n" +
        "in vec2 a_uv;\n" +
        "out vec2 v_uv;\n" +
        "void main(){ v_uv = a_uv; gl_Position = vec4(a_pos, 0.0, 1.0); }\n";
      fsSource =
        "#version 300 es\n" +
        "precision mediump float;\n" +
        "uniform sampler2D u_indexTex;\n" +
        "uniform sampler2D u_paletteTex;\n" +
        "in vec2 v_uv;\n" +
        "out vec4 outColor;\n" +
        "void main(){\n" +
        "  float idx = floor(texture(u_indexTex, v_uv).r * 255.0 + 0.5);\n" +
        "  float u = (idx + 0.5) / 256.0;\n" +
        "  outColor = texture(u_paletteTex, vec2(u, 0.5));\n" +
        "}\n";
    } else {
      vsSource =
        "attribute vec2 a_pos;\n" +
        "attribute vec2 a_uv;\n" +
        "varying vec2 v_uv;\n" +
        "void main(){ v_uv = a_uv; gl_Position = vec4(a_pos, 0.0, 1.0); }\n";
      fsSource =
        "precision mediump float;\n" +
        "uniform sampler2D u_indexTex;\n" +
        "uniform sampler2D u_paletteTex;\n" +
        "varying vec2 v_uv;\n" +
        "void main(){\n" +
        "  float idx = floor(texture2D(u_indexTex, v_uv).r * 255.0 + 0.5);\n" +
        "  float u = (idx + 0.5) / 256.0;\n" +
        "  gl_FragColor = texture2D(u_paletteTex, vec2(u, 0.5));\n" +
        "}\n";
    }

    var program = linkProgram(gl, vsSource, fsSource);
    gl.useProgram(program);

    gl.disable(gl.DITHER);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1);

    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (!gl2 && gl.UNPACK_COLORSPACE_CONVERSION_WEBGL) {
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    }

    // Textures
    var indexTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, indexTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (gl2) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, texW, texH, 0, gl.RED, gl.UNSIGNED_BYTE, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, texW, texH, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, null);
    }

    var paletteTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, paletteTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      256,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      buildPaletteRgba(paletteRgb)
    );

    // Sampler uniforms
    var uIndex = gl.getUniformLocation(program, "u_indexTex");
    var uPal = gl.getUniformLocation(program, "u_paletteTex");
    if (uIndex) gl.uniform1i(uIndex, 0);
    if (uPal) gl.uniform1i(uPal, 1);

    // Quad buffer (pos.xy, uv.xy) for TRIANGLE_STRIP:
    // bottom-left, top-left, bottom-right, top-right
    var u0 = (viewX + 0.5) / texW;
    var u1 = (viewX + viewW - 0.5) / texW;
    var v0 = (viewY + 0.5) / texH;
    var v1 = (viewY + viewH - 0.5) / texH;
    var quad = new Float32Array([
      -1.0, -1.0, u0, v1,
      -1.0, 1.0, u0, v0,
      1.0, -1.0, u1, v1,
      1.0, 1.0, u1, v0,
    ]);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

    var aPosLoc = gl.getAttribLocation(program, "a_pos");
    var aUvLoc = gl.getAttribLocation(program, "a_uv");
    var stride = 4 * 4;
    if (aPosLoc >= 0) {
      gl.enableVertexAttribArray(aPosLoc);
      gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, stride, 0);
    }
    if (aUvLoc >= 0) {
      gl.enableVertexAttribArray(aUvLoc);
      gl.vertexAttribPointer(aUvLoc, 2, gl.FLOAT, false, stride, 2 * 4);
    }

    function paint(video) {
      gl.useProgram(program);

      // Upload indexed framebuffer.
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, indexTex);
      if (gl2) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texW, texH, gl.RED, gl.UNSIGNED_BYTE, video.pixels);
      else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texW, texH, gl.LUMINANCE, gl.UNSIGNED_BYTE, video.pixels);

      // Draw.
      gl.viewport(0, 0, canvas.width | 0, canvas.height | 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    function dispose() {
      try {
        if (buf) gl.deleteBuffer(buf);
        if (indexTex) gl.deleteTexture(indexTex);
        if (paletteTex) gl.deleteTexture(paletteTex);
        if (program) gl.deleteProgram(program);
      } catch (e) {
        // ignore
      }
    }

    return {
      paint: paint,
      dispose: dispose,
      backend: gl2 ? "webgl2" : "webgl",
    };
  }

  window.A8EGlRenderer = {
    create: create,
  };
})();
