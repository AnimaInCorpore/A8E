precision mediump float;
uniform sampler2D u_sceneTex;
uniform vec2 u_sourceSize;
uniform vec2 u_scanlineSize;
uniform vec2 u_outputSize;
varying vec2 v_uv;

// Inlined and optimized functions
#define gaus(pos, scale) exp2(scale * pos * pos)
#define toLinear(c) pow(c, vec3(2.2))
#define toSrgb(c) pow(c, vec3(0.45454545))

// Precompute constants
const vec3 YUV_R = vec3(0.299, 0.587, 0.114);
const vec3 YUV_U = vec3(-0.14713, -0.28886, 0.436);
const vec3 YUV_V = vec3(0.615, -0.51499, -0.10001);
const float INV_2_2 = 0.45454545;
const float TWO_PI = 6.2831853;
vec2 warp(vec2 uv){
  vec2 c = uv * 2.0 - 1.0;
  c *= vec2(1.0 + (c.y * c.y) * 0.020, 1.0 + (c.x * c.x) * 0.026);
  return c * 0.5 + 0.5;
}
// Optimized to avoid max(c, vec3(0.0)) since texture returns valid range
vec3 fetchLinear(vec2 pixelPos){
  return toLinear(texture2D(u_sceneTex, pixelPos / u_sourceSize).rgb);
}
// Optimized horizontal filtering
vec3 horz3(vec2 pos, float py){
  float fx = fract(pos.x) - 0.5;
  float px = floor(pos.x) + 0.5;
  vec3 a = fetchLinear(vec2(px - 1.0, py));
  vec3 b = fetchLinear(vec2(px, py));
  vec3 c = fetchLinear(vec2(px + 1.0, py));
  // Precompute weight positions
  float fx1 = fx + 1.0;
  float fx_1 = fx - 1.0;
  float wa = gaus(fx1, -1.15);
  float wb = gaus(fx, -1.15);
  float wc = gaus(fx_1, -1.15);
  float wSum = wa + wb + wc;
  return (a * wa + b * wb + c * wc) / wSum;
}
// Optimized vertical filtering
vec3 tri(vec2 samplePos, vec2 scanPos, float vScale, float yStep){
  float fy = fract(scanPos.y) - 0.5;
  float center = (floor(scanPos.y) + 0.5) * yStep;
  vec3 a = horz3(samplePos, center - yStep);
  vec3 b = horz3(samplePos, center);
  vec3 c = horz3(samplePos, center + yStep);
  float fy1 = fy + 1.0;
  float fy_1 = fy - 1.0;
  float wa = gaus(fy1, vScale);
  float wb = gaus(fy, vScale);
  float wc = gaus(fy_1, vScale);
  float wSum = wa + wb + wc;
  return (a * wa + b * wb + c * wc) / wSum;
}
// Optimized shadow mask with reduced branching
vec3 shadowMask(float scaleX, float scaleY){
  float line = mod(floor(gl_FragCoord.y / scaleY), 2.0);
  float phase = mod(floor(gl_FragCoord.x / scaleX) + line, 3.0);
  // Use step functions to avoid branching
  vec3 mask = vec3(0.96);
  mask.r = mix(mask.r, 1.005, step(phase, 0.5));
  mask.g = mix(mask.g, 1.005, step(0.5, phase) * step(phase, 1.5));
  mask.b = mix(mask.b, 1.005, step(1.5, phase));
  return mask;
}
// Optimized tube corner mask
float tubeCornerMask(vec2 uv, vec2 outPx){
  float radiusPx = clamp(min(outPx.x, outPx.y) * 0.07, 16.0, 90.0);
  float featherPx = clamp(radiusPx * 0.35, 3.0, 12.0);
  vec2 halfOut = outPx * 0.5;
  vec2 p = uv * outPx - halfOut;
  vec2 halfRect = max(halfOut - radiusPx - 0.5, 1.0);
  vec2 q = abs(p) - halfRect;
  float dist = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radiusPx;
  return 1.0 - smoothstep(-featherPx, featherPx, dist);
}
// Optimized YUV conversions using precomputed constants
vec3 rgbToYuv(vec3 c){
  return vec3(
    dot(c, YUV_R),
    dot(c, YUV_U),
    dot(c, YUV_V)
  );
}
vec3 yuvToRgb(vec3 yuv){
  return vec3(
    yuv.x + 1.13983 * yuv.z,
    yuv.x - 0.39465 * yuv.y - 0.58060 * yuv.z,
    yuv.x + 2.03211 * yuv.y
  );
}
// Optimized composite PAL simulation - reduced texture fetches where possible
vec3 compositePal(vec2 uv, vec3 col, vec2 invSourceSize){
  vec2 tx = vec2(invSourceSize.x, 0.0);
  vec2 ty = vec2(0.0, invSourceSize.y);

  // Convert current color and fetch neighboring pixels
  vec3 yuv0 = rgbToYuv(toSrgb(col));
  vec3 yuv1 = rgbToYuv(texture2D(u_sceneTex, uv + tx).rgb);
  vec3 yuv2 = rgbToYuv(texture2D(u_sceneTex, uv + tx * 2.0).rgb);
  vec3 yuv3 = rgbToYuv(texture2D(u_sceneTex, uv + tx * 3.0).rgb);
  vec3 yuv4 = rgbToYuv(texture2D(u_sceneTex, uv + tx * 4.0).rgb);

  // Luma blur (horizontal)
  float y = yuv0.x * 0.86 + yuv1.x * 0.10 + yuv2.x * 0.04;

  // Chroma blur (horizontal + vertical bleed)
  float u = yuv0.y * 0.62 + yuv1.y * 0.20 + yuv2.y * 0.11 + yuv3.y * 0.05 + yuv4.y * 0.02;
  float v = yuv0.z * 0.62 + yuv1.z * 0.20 + yuv2.z * 0.11 + yuv3.z * 0.05 + yuv4.z * 0.02;

  // Previous line bleed
  vec3 py0 = rgbToYuv(texture2D(u_sceneTex, uv - ty).rgb);
  vec3 py1 = rgbToYuv(texture2D(u_sceneTex, uv - ty + tx).rgb);
  vec3 py2 = rgbToYuv(texture2D(u_sceneTex, uv - ty + tx * 2.0).rgb);

  // Mix with previous line and apply desaturation
  u = mix(u, py0.y * 0.50 + py1.y * 0.30 + py2.y * 0.20, 0.10) * 0.94;
  v = mix(v, py0.z * 0.50 + py1.z * 0.30 + py2.z * 0.20, 0.10) * 0.94;

  return toLinear(clamp(yuvToRgb(vec3(y, u, v)), 0.0, 1.0));
}
// Optimized scanline effect
float scanlinePass(float phase, float luminance, float strength){
  float lumClamped = clamp(luminance, 0.0, 1.0);
  float beam = mix(1.20, 0.80, sqrt(lumClamped));
  float wave = max(0.0, 0.5 - 0.5 * cos(phase * TWO_PI));
  float floor = mix(0.82, 0.95, lumClamped);
  float shaped = floor + (1.0 - floor) * pow(wave, beam);
  return mix(1.0, shaped, strength);
}
void main(){
  // Apply barrel distortion warp
  vec2 uv = warp(v_uv);

  // Early exit for out-of-bounds pixels
  if (uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // Precompute scales and frequently used values
  vec2 invSourceSize = 1.0 / u_sourceSize;
  float scanlineY = max(1.0, u_scanlineSize.y);
  float scaleY = u_outputSize.y / scanlineY;
  float scaleX = u_outputSize.x / u_sourceSize.x;
  float minScale = min(scaleX, scaleY);
  float yStep = max(1.0, u_sourceSize.y / scanlineY);

  // Calculate sample positions
  vec2 samplePos = uv * u_sourceSize;
  vec2 scanPos = uv * u_scanlineSize;

  // Vertical interpolation scale
  float vScale = mix(-1.6, -4.0, smoothstep(1.0, 3.0, scaleY));

  // Apply triangular filtering
  vec3 col = tri(samplePos, scanPos, vScale, yStep);

  // Apply composite PAL color bleeding
  col = compositePal(uv, col, invSourceSize);

  // Apply scanlines
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float scanlineStrength = smoothstep(1.5, 3.5, scaleY);
  col *= scanlinePass(fract(scanPos.y), lum, scanlineStrength);

  // Brightness boost at higher resolutions
  col *= mix(1.0, 1.015, scanlineStrength);

  // Apply vignette
  vec2 d = uv * 2.0 - 1.0;
  col *= clamp(1.0 - 0.07 * dot(d, d), 0.0, 1.0);

  // Apply shadow mask with fade
  float maskFade = smoothstep(4.0, 6.0, minScale);
  col *= mix(vec3(1.0), shadowMask(scaleX, scaleY), maskFade);
  col *= mix(1.0, 1.005, maskFade);

  // Apply tube corner mask
  vec2 outPx = max(u_outputSize, 1.0);
  float tubeMask = tubeCornerMask(uv, outPx);

  gl_FragColor = vec4(toSrgb(col), tubeMask);
}
