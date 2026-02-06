precision mediump float;
uniform sampler2D u_indexTex;
uniform sampler2D u_paletteTex;
varying vec2 v_uv;
void main(){
  float idx = floor(texture2D(u_indexTex, v_uv).r * 255.0 + 0.5);
  float u = (idx + 0.5) / 256.0;
  gl_FragColor = texture2D(u_paletteTex, vec2(u, 0.5));
}
