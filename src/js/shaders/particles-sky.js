'use strict';
// GLSL for point-sprite particles, rain / snow precipitation and the sky dome (clouds, stars, sun).
// Soft round point sprites; size in world units scaled by distance. Additive for glows, alpha for smoke/dust.
const PART_VS = `#version 300 es
layout(location=0) in vec3 p; layout(location=1) in vec4 c; layout(location=2) in float s;
uniform mat4 vp; uniform float ph, maxPx; out vec4 vc;
void main(){ gl_Position = vp * vec4(p, 1.); gl_PointSize = clamp(s * ph / max(gl_Position.w, .05), 1., maxPx); vc = c; }`;
const PART_FS = `#version 300 es
precision highp float;
in vec4 vc; out vec4 o;
void main(){ vec2 q = gl_PointCoord * 2. - 1.; float r = dot(q, q); if (r > 1.) discard; float a = 1. - r; o = vec4(vc.rgb, vc.a * a * a); }`;
// rain streaks and snowflakes: a fixed cloud of drops in a box that wraps around the camera as it falls
const PRECIP_VS = `#version 300 es
layout(location=0) in vec4 a; // position in a unit box; w: 0 head / 1 tail of a streak
uniform mat4 vp; uniform vec3 cam; uniform float t, fall, box, snow; uniform vec2 wind, drift; out float al;   // drift: how far the wind has carried it (added up per frame)
void main(){
  float ph = a.x * 13.7 + a.y * 7.1 + a.z * 3.3;
  vec3 p = a.xyz * box; p.z -= t * fall * (.8 + .4 * fract(ph)); p.xy += drift;
  if (snow > .5) p.xy += vec2(sin(t * 1.3 + ph * 6.), cos(t * 1.1 + ph * 4.)) * .5;
  vec3 rel = mod(p - cam + box * .5, box) - box * .5, w = cam + rel;
  if (snow < .5) w -= vec3(wind, -fall) * .045 * a.w;
  gl_Position = vp * vec4(w, 1.); gl_PointSize = snow > .5 ? clamp(70. / gl_Position.w, 1.5, 7.) : 1.;
  al = 1. - smoothstep(box * .2, box * .5, length(rel));
}`;
const PRECIP_FS = `#version 300 es
precision highp float; in float al; out vec4 o; uniform vec4 pc; uniform float snow;
void main(){ float k = 1.; if (snow > .5) { vec2 q = gl_PointCoord * 2. - 1.; k = 1. - dot(q, q); if (k < 0.) discard; } o = vec4(pc.rgb, pc.a * al * k); }`;
const SKY_VS = `#version 300 es
layout(location=0) in vec2 p; out vec2 ndc; void main(){ ndc = p; gl_Position = vec4(p, .9999, 1.); }`;
const SKY_FS = `#version 300 es
precision highp float;
in vec2 ndc; out vec4 o; uniform vec3 R, U, F, sun, zen, hor, sunc; uniform vec2 tn; uniform float night, t, sset, clouds, stars;
uniform vec4 wsky; // cloud cover, lightning flash, wind drift, fog
uniform vec2 cdrift; // how far the clouds have drifted (added up per frame, so a change of wind doesn't jump them)
uniform float lk_skyGradient, lk_sun, lk_clouds; // the look's effects (src/looks/*.json): a wider glowing horizon, a big soft sun, puffy two-tone clouds; 0 = the original
${NOISE_GLSL}
float h31(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
void main(){
  vec3 d = normalize(F + ndc.x*tn.x*R + ndc.y*tn.y*U);
  vec3 c = mix(hor, zen, mix(clamp(d.z*2.2, 0., 1.), smoothstep(-.02, .7, d.z), lk_skyGradient));
  if (d.z < 0.) c = hor * (1. + d.z * .5);
  float s = max(dot(d, sun), 0.);
  c += sunc * sset * pow(s, 5.) * .7 * (1. - clamp(d.z * 2., 0., 1.));                        // sunset glow
  c += mix(vec3(1., .9, .7) * (pow(s, 900.)*6. + pow(s, 24.)*.25), vec3(1., .9, .55) * (smoothstep(.99875, .9991, s) * 1.6 + pow(s, 60.) * .45 + pow(s, 8.) * .12), lk_sun) * smoothstep(-.06, .02, sun.z) * (1. - .92 * smoothstep(.55, .9, wsky.x)); // sun (painted: a wide pale-yellow disc with a glow)
  float m = max(dot(d, -sun), 0.);                                                             // moon, opposite the sun
  c += vec3(.85, .9, 1.) * (smoothstep(.99935, .9997, m) * 1.3 + pow(m, 80.) * .08) * night * (1. - .95 * smoothstep(.5, .9, wsky.x));
  if (stars > .5 && night > .01 && d.z > 0. && wsky.x < .85) {
    float h = h31(floor(d * 260.)), tw = .6 + .4 * sin(t * 3. + h * 50.);
    c += vec3(.9, .95, 1.) * step(.9975, h) * (h - .9975) * 400. * tw * night * smoothstep(0., .25, d.z) * (1. - wsky.x);
  }
  if (clouds > .5 && d.z > .015) { // drifting cloud layer projected on a plane overhead
    vec2 p = d.xy / d.z * 2.6 + cdrift;
    float n = vn(p) * .55 + vn(p * 2.3 + 3.1) * .3 + vn(p * 5.3 + 7.7) * .15, cv = wsky.x;
    float k = smoothstep(mix(.56 - .5 * cv, .6 - .5 * cv, lk_clouds), mix(.84 - .3 * cv, .69 - .38 * cv, lk_clouds), n) * smoothstep(.015, .2, d.z);   // painted: crisper puffy edges
    vec3 cc = mix(hor * 1.08 + sunc * sset * .45, vec3(1.), .5 * (1. - night) * (1. - sset) * (1. - .7 * cv));
    if (lk_clouds > 0. && k > 0.) { // painted: two-tone, the side towards the sun lit (salmon at sunset), the far side a cool purple shadow
      vec2 ps = p + normalize(sun.xy + vec2(1e-4)) * .18; float ns = vn(ps) * .55 + vn(ps * 2.3 + 3.1) * .3 + vn(ps * 5.3 + 7.7) * .15;
      float lt = smoothstep(-.03, .05, n - ns) * .75 + .25 * (1. - smoothstep(.65, .9, n));   // facing the sun, and thin edges, are lit
      vec3 tc = mix(mix(vec3(.7, .74, .88), vec3(.56, .42, .64), sset), mix(vec3(1., .98, .95), vec3(1., .64, .48), sset), lt) * (.25 + .75 * max(max(hor.r, hor.g), hor.b));
      cc = mix(cc, tc, lk_clouds * (1. - smoothstep(.5, .9, cv)));
    }
    cc = mix(cc, hor * .7 + vec3(.015, .018, .03), night * .85);
    cc *= 1. - .35 * smoothstep(.6, 1., cv) * (.6 + .4 * n);   // heavy, dark-bottomed rain clouds
    c = mix(c, cc, k * (.85 + .15 * cv));
  }
  c = mix(c, hor, wsky.w * (.95 - .55 * clamp(d.z * 1.5, 0., 1.)));   // fog swallows the horizon and pales the sky
  c += vec3(.75, .8, 1.) * wsky.y * .7;   // lightning
  o = vec4(c, 1.);
}`;
