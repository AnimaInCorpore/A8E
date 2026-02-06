#version 300 es
precision mediump float;
uniform sampler2D u_sceneTex;
uniform vec2 u_sourceSize;
uniform vec2 u_scanlineSize;
uniform vec2 u_outputSize;
in vec2 v_uv;
out vec4 outColor;
float gaus(float pos, float scale){ return exp2(scale * pos * pos); }
vec3 toLinear(vec3 c){ return pow(max(c, vec3(0.0)), vec3(2.2)); }
vec3 toSrgb(vec3 c){ return pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)); }
vec2 warp(vec2 uv){
  vec2 c = uv * 2.0 - 1.0;
  c *= vec2(1.0 + (c.y * c.y) * 0.020, 1.0 + (c.x * c.x) * 0.026);
  return c * 0.5 + 0.5;
}
vec3 fetchLinear(vec2 pixelPos){
  vec2 uv = pixelPos / u_sourceSize;
  return toLinear(texture(u_sceneTex, uv).rgb);
}
vec3 horz3(vec2 pos, float py){
  float fx = fract(pos.x) - 0.5;
  float px = floor(pos.x) + 0.5;
  vec3 a = fetchLinear(vec2(px - 1.0, py));
  vec3 b = fetchLinear(vec2(px, py));
  vec3 c = fetchLinear(vec2(px + 1.0, py));
  float wa = gaus(fx + 1.0, -1.15);
  float wb = gaus(fx, -1.15);
  float wc = gaus(fx - 1.0, -1.15);
  return (a * wa + b * wb + c * wc) / (wa + wb + wc);
}
vec3 tri(vec2 samplePos, vec2 scanPos, float vScale){
  float yStep = max(1.0, u_sourceSize.y / max(1.0, u_scanlineSize.y));
  float fy = fract(scanPos.y) - 0.5;
  float center = (floor(scanPos.y) + 0.5) * yStep;
  vec3 a = horz3(samplePos, center - yStep);
  vec3 b = horz3(samplePos, center);
  vec3 c = horz3(samplePos, center + yStep);
  float wa = gaus(fy + 1.0, vScale);
  float wb = gaus(fy, vScale);
  float wc = gaus(fy - 1.0, vScale);
  return (a * wa + b * wb + c * wc) / (wa + wb + wc);
}
vec3 shadowMask(){
  float sx = max(1.0, u_outputSize.x / u_sourceSize.x);
  float sy = max(1.0, u_outputSize.y / max(1.0, u_scanlineSize.y));
  float line = mod(floor(gl_FragCoord.y / sy), 2.0);
  float phase = mod(floor(gl_FragCoord.x / sx) + line, 3.0);
  vec3 mask = vec3(0.96);
  if (phase < 0.5) mask.r = 1.005;
  else if (phase < 1.5) mask.g = 1.005;
  else mask.b = 1.005;
  return mask;
}
float tubeCornerMask(vec2 uv){
  vec2 outPx = max(u_outputSize, vec2(1.0));
  float radiusPx = clamp(min(outPx.x, outPx.y) * 0.07, 16.0, 90.0);
  float featherPx = clamp(radiusPx * 0.35, 3.0, 12.0);
  vec2 p = uv * outPx - outPx * 0.5;
  vec2 halfRect = max(outPx * 0.5 - vec2(radiusPx + 0.5), vec2(1.0));
  vec2 q = abs(p) - halfRect;
  float dist = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - radiusPx;
  return 1.0 - smoothstep(-featherPx, featherPx, dist);
}
vec3 rgbToYuv(vec3 c){
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  float u = dot(c, vec3(-0.14713, -0.28886, 0.436));
  float v = dot(c, vec3(0.615, -0.51499, -0.10001));
  return vec3(y, u, v);
}
vec3 yuvToRgb(vec3 c){
  float y = c.x;
  float u = c.y;
  float v = c.z;
  return vec3(
    y + 1.13983 * v,
    y - 0.39465 * u - 0.58060 * v,
    y + 2.03211 * u
  );
}
vec3 compositePal(vec2 uv, vec2 scanPos, vec3 col){
  vec2 tx = vec2(1.0 / u_sourceSize.x, 0.0);
  vec2 ty = vec2(0.0, 1.0 / u_sourceSize.y);
  vec3 yuv0 = rgbToYuv(toSrgb(col));
  vec3 yuv1 = rgbToYuv(texture(u_sceneTex, uv + tx).rgb);
  vec3 yuv2 = rgbToYuv(texture(u_sceneTex, uv + tx * 2.0).rgb);
  vec3 yuv3 = rgbToYuv(texture(u_sceneTex, uv + tx * 3.0).rgb);
  vec3 yuv4 = rgbToYuv(texture(u_sceneTex, uv + tx * 4.0).rgb);
  float y = yuv0.x * 0.86 + yuv1.x * 0.10 + yuv2.x * 0.04;
  float u = yuv0.y * 0.62 + yuv1.y * 0.20 + yuv2.y * 0.11 + yuv3.y * 0.05 + yuv4.y * 0.02;
  float v = yuv0.z * 0.62 + yuv1.z * 0.20 + yuv2.z * 0.11 + yuv3.z * 0.05 + yuv4.z * 0.02;
  vec3 py0 = rgbToYuv(texture(u_sceneTex, uv - ty).rgb);
  vec3 py1 = rgbToYuv(texture(u_sceneTex, uv - ty + tx).rgb);
  vec3 py2 = rgbToYuv(texture(u_sceneTex, uv - ty + tx * 2.0).rgb);
  float uPrev = py0.y * 0.50 + py1.y * 0.30 + py2.y * 0.20;
  float vPrev = py0.z * 0.50 + py1.z * 0.30 + py2.z * 0.20;
  u = mix(u, uPrev, 0.10);
  v = mix(v, vPrev, 0.10);
  u *= 0.94;
  v *= 0.94;
  return toLinear(clamp(yuvToRgb(vec3(y, u, v)), 0.0, 1.0));
}
float scanlinePass(float phase, float luminance, float scaleY){
  float strength = smoothstep(1.5, 3.5, scaleY);
  float beam = mix(1.20, 0.80, clamp(sqrt(max(luminance, 0.0)), 0.0, 1.0));
  float wave = max(0.0, 0.5 - 0.5 * cos(phase * 6.2831853));
  float floor = mix(0.82, 0.95, clamp(luminance, 0.0, 1.0));
  float shaped = floor + (1.0 - floor) * pow(wave, beam);
  return mix(1.0, shaped, strength);
}
void main(){
  vec2 uv = warp(v_uv);
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  float scaleY = u_outputSize.y / max(1.0, u_scanlineSize.y);
  float minScale = min(u_outputSize.x / u_sourceSize.x, scaleY);
  float vScale = mix(-1.6, -4.0, smoothstep(1.0, 3.0, scaleY));
  vec2 samplePos = uv * u_sourceSize;
  vec2 scanPos = uv * u_scanlineSize;
  vec3 col = tri(samplePos, scanPos, vScale);
  col = compositePal(uv, scanPos, col);
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col *= scanlinePass(fract(scanPos.y), lum, scaleY);
  col *= mix(1.0, 1.015, smoothstep(1.5, 3.5, scaleY));
  vec2 d = uv * 2.0 - 1.0;
  float vignette = 1.0 - 0.07 * dot(d, d);
  col *= clamp(vignette, 0.0, 1.0);
  float maskFade = smoothstep(4.0, 6.0, minScale);
  col *= mix(vec3(1.0), shadowMask(), maskFade);
  col *= mix(1.0, 1.005, maskFade);
  col *= tubeCornerMask(uv);
  outColor = vec4(toSrgb(col), 1.0);
}
