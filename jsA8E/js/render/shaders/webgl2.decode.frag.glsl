#version 300 es
precision mediump float;
uniform sampler2D u_indexTex;
uniform sampler2D u_paletteTex;
in vec2 v_uv;
out vec4 outColor;
void main(){
  float idx = floor(texture(u_indexTex, v_uv).r * 255.0 + 0.5);
  float u = (idx + 0.5) / 256.0;
  outColor = texture(u_paletteTex, vec2(u, 0.5));
}
