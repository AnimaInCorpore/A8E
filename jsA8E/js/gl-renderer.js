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
    // Keep CRT internal scene resolution fixed to 2x horizontal, 1x vertical.
    var sceneScaleX = 2;
    var sceneScaleY = 1;
    if (texW <= 0 || texH <= 0) throw new Error("A8EGlRenderer: invalid texture size");
    if (viewW <= 0 || viewH <= 0) throw new Error("A8EGlRenderer: invalid viewport size");

    var sceneW = viewW * sceneScaleX;
    var sceneH = viewH * sceneScaleY;

    var gl2 = isWebGL2(gl);

    var vsSource;
    var decodeFsSource;
    var crtFsSource;
    if (gl2) {
      vsSource =
        "#version 300 es\n" +
        "in vec2 a_pos;\n" +
        "in vec2 a_uv;\n" +
        "out vec2 v_uv;\n" +
        "void main(){ v_uv = a_uv; gl_Position = vec4(a_pos, 0.0, 1.0); }\n";

      decodeFsSource =
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

      crtFsSource =
        "#version 300 es\n" +
        "precision mediump float;\n" +
        "uniform sampler2D u_sceneTex;\n" +
        "uniform vec2 u_sourceSize;\n" +
        "uniform vec2 u_scanlineSize;\n" +
        "uniform vec2 u_outputSize;\n" +
        "in vec2 v_uv;\n" +
        "out vec4 outColor;\n" +
        "float gaus(float pos, float scale){ return exp2(scale * pos * pos); }\n" +
        "vec3 toLinear(vec3 c){ return pow(max(c, vec3(0.0)), vec3(2.2)); }\n" +
        "vec3 toSrgb(vec3 c){ return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); }\n" +
        "vec2 warp(vec2 uv){\n" +
        "  vec2 c = uv * 2.0 - 1.0;\n" +
        "  c *= vec2(1.0 + (c.y * c.y) * 0.020, 1.0 + (c.x * c.x) * 0.026);\n" +
        "  return c * 0.5 + 0.5;\n" +
        "}\n" +
        "vec3 fetchLinear(vec2 pixelPos){\n" +
        "  vec2 uv = pixelPos / u_sourceSize;\n" +
        "  return toLinear(texture(u_sceneTex, uv).rgb);\n" +
        "}\n" +
        "vec3 horz3(vec2 pos, float py){\n" +
        "  float fx = fract(pos.x) - 0.5;\n" +
        "  float px = floor(pos.x) + 0.5;\n" +
        "  vec3 a = fetchLinear(vec2(px - 1.0, py));\n" +
        "  vec3 b = fetchLinear(vec2(px, py));\n" +
        "  vec3 c = fetchLinear(vec2(px + 1.0, py));\n" +
        "  float wa = gaus(fx + 1.0, -1.15);\n" +
        "  float wb = gaus(fx, -1.15);\n" +
        "  float wc = gaus(fx - 1.0, -1.15);\n" +
        "  return (a * wa + b * wb + c * wc) / (wa + wb + wc);\n" +
        "}\n" +
        "vec3 tri(vec2 samplePos, vec2 scanPos, float vScale){\n" +
        "  float yStep = max(1.0, u_sourceSize.y / max(1.0, u_scanlineSize.y));\n" +
        "  float fy = fract(scanPos.y) - 0.5;\n" +
        "  float center = (floor(scanPos.y) + 0.5) * yStep;\n" +
        "  vec3 a = horz3(samplePos, center - yStep);\n" +
        "  vec3 b = horz3(samplePos, center);\n" +
        "  vec3 c = horz3(samplePos, center + yStep);\n" +
        "  float wa = gaus(fy + 1.0, vScale);\n" +
        "  float wb = gaus(fy, vScale);\n" +
        "  float wc = gaus(fy - 1.0, vScale);\n" +
        "  return (a * wa + b * wb + c * wc) / (wa + wb + wc);\n" +
        "}\n" +
        "vec3 shadowMask(){\n" +
        "  float sx = max(1.0, u_outputSize.x / u_sourceSize.x);\n" +
        "  float sy = max(1.0, u_outputSize.y / max(1.0, u_scanlineSize.y));\n" +
        "  float line = mod(floor(gl_FragCoord.y / sy), 2.0);\n" +
        "  float phase = mod(floor(gl_FragCoord.x / sx) + line, 3.0);\n" +
        "  vec3 mask = vec3(0.96);\n" +
        "  if (phase < 0.5) mask.r = 1.005;\n" +
        "  else if (phase < 1.5) mask.g = 1.005;\n" +
        "  else mask.b = 1.005;\n" +
        "  return mask;\n" +
        "}\n" +
        "float tubeCornerMask(vec2 uv){\n" +
        "  vec2 outPx = max(u_outputSize, vec2(1.0));\n" +
        "  float radiusPx = clamp(min(outPx.x, outPx.y) * 0.008, 3.0, 8.0);\n" +
        "  float featherPx = 1.25;\n" +
        "  vec2 p = uv * outPx - outPx * 0.5;\n" +
        "  vec2 halfRect = max(outPx * 0.5 - vec2(radiusPx + 0.5), vec2(1.0));\n" +
        "  vec2 q = abs(p) - halfRect;\n" +
        "  float dist = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - radiusPx;\n" +
        "  return 1.0 - smoothstep(-featherPx, featherPx, dist);\n" +
        "}\n" +
        "vec3 rgbToYuv(vec3 c){\n" +
        "  float y = dot(c, vec3(0.299, 0.587, 0.114));\n" +
        "  float u = dot(c, vec3(-0.14713, -0.28886, 0.436));\n" +
        "  float v = dot(c, vec3(0.615, -0.51499, -0.10001));\n" +
        "  return vec3(y, u, v);\n" +
        "}\n" +
        "vec3 yuvToRgb(vec3 c){\n" +
        "  float y = c.x;\n" +
        "  float u = c.y;\n" +
        "  float v = c.z;\n" +
        "  return vec3(\n" +
        "    y + 1.13983 * v,\n" +
        "    y - 0.39465 * u - 0.58060 * v,\n" +
        "    y + 2.03211 * u\n" +
        "  );\n" +
        "}\n" +
        "vec3 compositePal(vec2 uv, vec2 scanPos, vec3 col){\n" +
        "  vec2 tx = vec2(1.0 / u_sourceSize.x, 0.0);\n" +
        "  vec2 ty = vec2(0.0, 1.0 / u_sourceSize.y);\n" +
        "  vec3 yuv0 = rgbToYuv(toSrgb(col));\n" +
        "  vec3 yuv1 = rgbToYuv(texture(u_sceneTex, uv + tx).rgb);\n" +
        "  vec3 yuv2 = rgbToYuv(texture(u_sceneTex, uv + tx * 2.0).rgb);\n" +
        "  vec3 yuv3 = rgbToYuv(texture(u_sceneTex, uv + tx * 3.0).rgb);\n" +
        "  vec3 yuv4 = rgbToYuv(texture(u_sceneTex, uv + tx * 4.0).rgb);\n" +
        "  float y = yuv0.x * 0.86 + yuv1.x * 0.10 + yuv2.x * 0.04;\n" +
        "  float u = yuv0.y * 0.62 + yuv1.y * 0.20 + yuv2.y * 0.11 + yuv3.y * 0.05 + yuv4.y * 0.02;\n" +
        "  float v = yuv0.z * 0.62 + yuv1.z * 0.20 + yuv2.z * 0.11 + yuv3.z * 0.05 + yuv4.z * 0.02;\n" +
        "  vec3 py0 = rgbToYuv(texture(u_sceneTex, uv - ty).rgb);\n" +
        "  vec3 py1 = rgbToYuv(texture(u_sceneTex, uv - ty + tx).rgb);\n" +
        "  vec3 py2 = rgbToYuv(texture(u_sceneTex, uv - ty + tx * 2.0).rgb);\n" +
        "  float uPrev = py0.y * 0.50 + py1.y * 0.30 + py2.y * 0.20;\n" +
        "  float vPrev = py0.z * 0.50 + py1.z * 0.30 + py2.z * 0.20;\n" +
        "  u = mix(u, uPrev, 0.10);\n" +
        "  v = mix(v, vPrev, 0.10);\n" +
        "  u *= 0.94;\n" +
        "  v *= 0.94;\n" +
        "  return toLinear(clamp(yuvToRgb(vec3(y, u, v)), 0.0, 1.0));\n" +
        "}\n" +
        "float scanlinePass(float phase, float luminance, float scaleY){\n" +
        "  float strength = smoothstep(1.5, 3.5, scaleY);\n" +
        "  float beam = mix(1.20, 0.80, clamp(sqrt(max(luminance, 0.0)), 0.0, 1.0));\n" +
        "  float wave = max(0.0, 0.5 - 0.5 * cos(phase * 6.2831853));\n" +
        "  float floor = mix(0.82, 0.95, clamp(luminance, 0.0, 1.0));\n" +
        "  float shaped = floor + (1.0 - floor) * pow(wave, beam);\n" +
        "  return mix(1.0, shaped, strength);\n" +
        "}\n" +
        "void main(){\n" +
        "  vec2 uv = warp(v_uv);\n" +
        "  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) {\n" +
        "    outColor = vec4(0.0, 0.0, 0.0, 1.0);\n" +
        "    return;\n" +
        "  }\n" +
        "  float scaleY = u_outputSize.y / max(1.0, u_scanlineSize.y);\n" +
        "  float minScale = min(u_outputSize.x / u_sourceSize.x, scaleY);\n" +
        "  float vScale = mix(-1.6, -4.0, smoothstep(1.0, 3.0, scaleY));\n" +
        "  vec2 samplePos = uv * u_sourceSize;\n" +
        "  vec2 scanPos = uv * u_scanlineSize;\n" +
        "  vec3 col = tri(samplePos, scanPos, vScale);\n" +
        "  col = compositePal(uv, scanPos, col);\n" +
        "  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));\n" +
        "  col *= scanlinePass(fract(scanPos.y), lum, scaleY);\n" +
        "  col *= mix(1.0, 1.015, smoothstep(1.5, 3.5, scaleY));\n" +
        "  vec2 d = uv * 2.0 - 1.0;\n" +
        "  float vignette = 1.0 - 0.07 * dot(d, d);\n" +
        "  col *= clamp(vignette, 0.0, 1.0);\n" +
        "  float maskFade = smoothstep(4.0, 6.0, minScale);\n" +
        "  col *= mix(vec3(1.0), shadowMask(), maskFade);\n" +
        "  col *= mix(1.0, 1.005, maskFade);\n" +
        "  col *= tubeCornerMask(uv);\n" +
        "  outColor = vec4(toSrgb(col), 1.0);\n" +
        "}\n";
    } else {
      vsSource =
        "attribute vec2 a_pos;\n" +
        "attribute vec2 a_uv;\n" +
        "varying vec2 v_uv;\n" +
        "void main(){ v_uv = a_uv; gl_Position = vec4(a_pos, 0.0, 1.0); }\n";

      decodeFsSource =
        "precision mediump float;\n" +
        "uniform sampler2D u_indexTex;\n" +
        "uniform sampler2D u_paletteTex;\n" +
        "varying vec2 v_uv;\n" +
        "void main(){\n" +
        "  float idx = floor(texture2D(u_indexTex, v_uv).r * 255.0 + 0.5);\n" +
        "  float u = (idx + 0.5) / 256.0;\n" +
        "  gl_FragColor = texture2D(u_paletteTex, vec2(u, 0.5));\n" +
        "}\n";

      crtFsSource =
        "precision mediump float;\n" +
        "uniform sampler2D u_sceneTex;\n" +
        "uniform vec2 u_sourceSize;\n" +
        "uniform vec2 u_scanlineSize;\n" +
        "uniform vec2 u_outputSize;\n" +
        "varying vec2 v_uv;\n" +
        "float gaus(float pos, float scale){ return exp2(scale * pos * pos); }\n" +
        "vec3 toLinear(vec3 c){ return pow(max(c, vec3(0.0)), vec3(2.2)); }\n" +
        "vec3 toSrgb(vec3 c){ return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); }\n" +
        "vec2 warp(vec2 uv){\n" +
        "  vec2 c = uv * 2.0 - 1.0;\n" +
        "  c *= vec2(1.0 + (c.y * c.y) * 0.020, 1.0 + (c.x * c.x) * 0.026);\n" +
        "  return c * 0.5 + 0.5;\n" +
        "}\n" +
        "vec3 fetchLinear(vec2 pixelPos){\n" +
        "  vec2 uv = pixelPos / u_sourceSize;\n" +
        "  return toLinear(texture2D(u_sceneTex, uv).rgb);\n" +
        "}\n" +
        "vec3 horz3(vec2 pos, float py){\n" +
        "  float fx = fract(pos.x) - 0.5;\n" +
        "  float px = floor(pos.x) + 0.5;\n" +
        "  vec3 a = fetchLinear(vec2(px - 1.0, py));\n" +
        "  vec3 b = fetchLinear(vec2(px, py));\n" +
        "  vec3 c = fetchLinear(vec2(px + 1.0, py));\n" +
        "  float wa = gaus(fx + 1.0, -1.15);\n" +
        "  float wb = gaus(fx, -1.15);\n" +
        "  float wc = gaus(fx - 1.0, -1.15);\n" +
        "  return (a * wa + b * wb + c * wc) / (wa + wb + wc);\n" +
        "}\n" +
        "vec3 tri(vec2 samplePos, vec2 scanPos, float vScale){\n" +
        "  float yStep = max(1.0, u_sourceSize.y / max(1.0, u_scanlineSize.y));\n" +
        "  float fy = fract(scanPos.y) - 0.5;\n" +
        "  float center = (floor(scanPos.y) + 0.5) * yStep;\n" +
        "  vec3 a = horz3(samplePos, center - yStep);\n" +
        "  vec3 b = horz3(samplePos, center);\n" +
        "  vec3 c = horz3(samplePos, center + yStep);\n" +
        "  float wa = gaus(fy + 1.0, vScale);\n" +
        "  float wb = gaus(fy, vScale);\n" +
        "  float wc = gaus(fy - 1.0, vScale);\n" +
        "  return (a * wa + b * wb + c * wc) / (wa + wb + wc);\n" +
        "}\n" +
        "vec3 shadowMask(){\n" +
        "  float sx = max(1.0, u_outputSize.x / u_sourceSize.x);\n" +
        "  float sy = max(1.0, u_outputSize.y / max(1.0, u_scanlineSize.y));\n" +
        "  float line = mod(floor(gl_FragCoord.y / sy), 2.0);\n" +
        "  float phase = mod(floor(gl_FragCoord.x / sx) + line, 3.0);\n" +
        "  vec3 mask = vec3(0.96);\n" +
        "  if (phase < 0.5) mask.r = 1.005;\n" +
        "  else if (phase < 1.5) mask.g = 1.005;\n" +
        "  else mask.b = 1.005;\n" +
        "  return mask;\n" +
        "}\n" +
        "float tubeCornerMask(vec2 uv){\n" +
        "  vec2 outPx = max(u_outputSize, vec2(1.0));\n" +
        "  float radiusPx = clamp(min(outPx.x, outPx.y) * 0.008, 3.0, 8.0);\n" +
        "  float featherPx = 1.25;\n" +
        "  vec2 p = uv * outPx - outPx * 0.5;\n" +
        "  vec2 halfRect = max(outPx * 0.5 - vec2(radiusPx + 0.5), vec2(1.0));\n" +
        "  vec2 q = abs(p) - halfRect;\n" +
        "  float dist = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - radiusPx;\n" +
        "  return 1.0 - smoothstep(-featherPx, featherPx, dist);\n" +
        "}\n" +
        "vec3 rgbToYuv(vec3 c){\n" +
        "  float y = dot(c, vec3(0.299, 0.587, 0.114));\n" +
        "  float u = dot(c, vec3(-0.14713, -0.28886, 0.436));\n" +
        "  float v = dot(c, vec3(0.615, -0.51499, -0.10001));\n" +
        "  return vec3(y, u, v);\n" +
        "}\n" +
        "vec3 yuvToRgb(vec3 c){\n" +
        "  float y = c.x;\n" +
        "  float u = c.y;\n" +
        "  float v = c.z;\n" +
        "  return vec3(\n" +
        "    y + 1.13983 * v,\n" +
        "    y - 0.39465 * u - 0.58060 * v,\n" +
        "    y + 2.03211 * u\n" +
        "  );\n" +
        "}\n" +
        "vec3 compositePal(vec2 uv, vec2 scanPos, vec3 col){\n" +
        "  vec2 tx = vec2(1.0 / u_sourceSize.x, 0.0);\n" +
        "  vec2 ty = vec2(0.0, 1.0 / u_sourceSize.y);\n" +
        "  vec3 yuv0 = rgbToYuv(toSrgb(col));\n" +
        "  vec3 yuv1 = rgbToYuv(texture2D(u_sceneTex, uv + tx).rgb);\n" +
        "  vec3 yuv2 = rgbToYuv(texture2D(u_sceneTex, uv + tx * 2.0).rgb);\n" +
        "  vec3 yuv3 = rgbToYuv(texture2D(u_sceneTex, uv + tx * 3.0).rgb);\n" +
        "  vec3 yuv4 = rgbToYuv(texture2D(u_sceneTex, uv + tx * 4.0).rgb);\n" +
        "  float y = yuv0.x * 0.86 + yuv1.x * 0.10 + yuv2.x * 0.04;\n" +
        "  float u = yuv0.y * 0.62 + yuv1.y * 0.20 + yuv2.y * 0.11 + yuv3.y * 0.05 + yuv4.y * 0.02;\n" +
        "  float v = yuv0.z * 0.62 + yuv1.z * 0.20 + yuv2.z * 0.11 + yuv3.z * 0.05 + yuv4.z * 0.02;\n" +
        "  vec3 py0 = rgbToYuv(texture2D(u_sceneTex, uv - ty).rgb);\n" +
        "  vec3 py1 = rgbToYuv(texture2D(u_sceneTex, uv - ty + tx).rgb);\n" +
        "  vec3 py2 = rgbToYuv(texture2D(u_sceneTex, uv - ty + tx * 2.0).rgb);\n" +
        "  float uPrev = py0.y * 0.50 + py1.y * 0.30 + py2.y * 0.20;\n" +
        "  float vPrev = py0.z * 0.50 + py1.z * 0.30 + py2.z * 0.20;\n" +
        "  u = mix(u, uPrev, 0.10);\n" +
        "  v = mix(v, vPrev, 0.10);\n" +
        "  u *= 0.94;\n" +
        "  v *= 0.94;\n" +
        "  return toLinear(clamp(yuvToRgb(vec3(y, u, v)), 0.0, 1.0));\n" +
        "}\n" +
        "float scanlinePass(float phase, float luminance, float scaleY){\n" +
        "  float strength = smoothstep(1.5, 3.5, scaleY);\n" +
        "  float beam = mix(1.20, 0.80, clamp(sqrt(max(luminance, 0.0)), 0.0, 1.0));\n" +
        "  float wave = max(0.0, 0.5 - 0.5 * cos(phase * 6.2831853));\n" +
        "  float floor = mix(0.82, 0.95, clamp(luminance, 0.0, 1.0));\n" +
        "  float shaped = floor + (1.0 - floor) * pow(wave, beam);\n" +
        "  return mix(1.0, shaped, strength);\n" +
        "}\n" +
        "void main(){\n" +
        "  vec2 uv = warp(v_uv);\n" +
        "  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) {\n" +
        "    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);\n" +
        "    return;\n" +
        "  }\n" +
        "  float scaleY = u_outputSize.y / max(1.0, u_scanlineSize.y);\n" +
        "  float minScale = min(u_outputSize.x / u_sourceSize.x, scaleY);\n" +
        "  float vScale = mix(-1.6, -4.0, smoothstep(1.0, 3.0, scaleY));\n" +
        "  vec2 samplePos = uv * u_sourceSize;\n" +
        "  vec2 scanPos = uv * u_scanlineSize;\n" +
        "  vec3 col = tri(samplePos, scanPos, vScale);\n" +
        "  col = compositePal(uv, scanPos, col);\n" +
        "  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));\n" +
        "  col *= scanlinePass(fract(scanPos.y), lum, scaleY);\n" +
        "  col *= mix(1.0, 1.015, smoothstep(1.5, 3.5, scaleY));\n" +
        "  vec2 d = uv * 2.0 - 1.0;\n" +
        "  float vignette = 1.0 - 0.07 * dot(d, d);\n" +
        "  col *= clamp(vignette, 0.0, 1.0);\n" +
        "  float maskFade = smoothstep(4.0, 6.0, minScale);\n" +
        "  col *= mix(vec3(1.0), shadowMask(), maskFade);\n" +
        "  col *= mix(1.0, 1.005, maskFade);\n" +
        "  col *= tubeCornerMask(uv);\n" +
        "  gl_FragColor = vec4(toSrgb(col), 1.0);\n" +
        "}\n";
    }

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
      if (gl2) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texW, texH, gl.RED, gl.UNSIGNED_BYTE, video.pixels);
      else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, texW, texH, gl.LUMINANCE, gl.UNSIGNED_BYTE, video.pixels);

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
      if (crtOutputSizeLoc !== null) gl.uniform2f(crtOutputSizeLoc, canvas.width | 0, canvas.height | 0);
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
        gl.CLAMP_TO_EDGE
      );
      if (gl2) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, texW, texH, 0, gl.RED, gl.UNSIGNED_BYTE, null);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, texW, texH, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, null);
      }

      // Palette lookup texture.
      paletteTex = createTexture(
        gl,
        gl.TEXTURE1,
        gl.NEAREST,
        gl.NEAREST,
        gl.CLAMP_TO_EDGE,
        gl.CLAMP_TO_EDGE
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
        buildPaletteRgba(paletteRgb)
      );

      // Offscreen scene texture (RGB after palette pass, at internal sceneScaleX/sceneScaleY resolution).
      sceneTex = createTexture(
        gl,
        gl.TEXTURE2,
        gl.NEAREST,
        gl.NEAREST,
        gl.CLAMP_TO_EDGE,
        gl.CLAMP_TO_EDGE
      );
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, sceneW, sceneH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

      sceneFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
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
        -1.0, -1.0, u0, v1,
        -1.0, 1.0, u0, v0,
        1.0, -1.0, u1, v1,
        1.0, 1.0, u1, v0,
      ]);

      decodeBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, decodeBuf);
      gl.bufferData(gl.ARRAY_BUFFER, decodeQuad, gl.STATIC_DRAW);

      // Quad for final CRT post-process pass.
      var crtQuad = new Float32Array([
        -1.0, -1.0, 0.0, 0.0,
        -1.0, 1.0, 0.0, 1.0,
        1.0, -1.0, 1.0, 0.0,
        1.0, 1.0, 1.0, 1.0,
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
      if (crtSourceSizeLoc !== null) gl.uniform2f(crtSourceSizeLoc, sceneW, sceneH);
      if (crtScanlineSizeLoc !== null) gl.uniform2f(crtScanlineSizeLoc, viewW, viewH);

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
    create: create,
  };
})();
