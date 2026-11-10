'use strict';
// GLSL for water surfaces (WATER_VS / WATER_FS: flow, foam, ripples, ice) and the underwater light shafts (RAYS_FS).
// Water surfaces: one mesh per terrain chunk at each vertex's own water level.
// Per vertex: flow (m/s) and props = (depth, foam, murk, wave height).
const WATER_VS = `#version 300 es
layout(location=0) in vec3 p; layout(location=1) in vec2 fl; layout(location=2) in vec4 pr; layout(location=3) in float kd;
uniform mat4 vp; uniform float t, wnd;
out vec3 wp; out vec2 flw; out vec4 prp; out float wkd;
void main(){
  vec3 q = p;
  q.z += pr.w * (.6 + .8 * wnd) * (.07 * sin(q.x * .23 + t * 1.1) + .05 * sin(q.y * .31 - t * 1.37 + q.x * .07)) - .02; // gentle swell laps the shore
  wp = q; flw = fl; prp = pr; wkd = kd; gl_Position = vp * vec4(q, 1.);
}`;
const WATER_FS = `#version 300 es
precision highp float;
in vec3 wp; in vec2 flw; in vec4 prp; in float wkd; out vec4 o;
uniform float t; uniform vec3 lcol, amb, zen, hor; uniform vec4 rip[8];
uniform vec4 wx; // weather: rain, wind, stream turbidity, lightning
uniform vec4 ice; // ice on lakes, on ponds; snow lying on it; arctic pack ice on the sea
${FOG_GLSL}
${NOISE_GLSL}
${CAVE_GLSL}
// boats (up to 4): x, y, cos/sin heading · length, z, sin pitch, sin roll · freeboard, draft; then half-beams at the waterline and the gunwale, 12 stations each
uniform vec4 hul[12]; uniform vec4 hbt[24]; uniform int nh;
float hbAt(int base, int k){ return dot(hbt[base + k / 4], vec4(equal(ivec4(k % 4), ivec4(0, 1, 2, 3)))); }
bool inHull(vec3 p){   // is this bit of water inside a hull? (then it isn't drawn: no water sloshing over the floor)
  for (int i = 0; i < 4; i++) { if (i >= nh) break;
    vec4 A = hul[i * 3], B = hul[i * 3 + 1], C = hul[i * 3 + 2]; vec2 d = p.xy - A.xy; float lx = dot(d, A.zw), ly = d.y * A.z - d.x * A.w, t = lx / B.x + .5;
    if (t <= 0. || t >= 1.) continue;
    float f = t * 11.; int k = min(int(f), 10); f -= float(k);
    float w = mix(hbAt(i * 6, k), hbAt(i * 6, k + 1), f), g = mix(hbAt(i * 6 + 3, k), hbAt(i * 6 + 3, k + 1), f), lz = p.z - B.y - B.z * lx - B.w * ly;
    if (abs(ly) < (lz < 0. ? w * max(0., 1. + lz / C.y) : mix(w, g, min(lz / C.x, 1.))) + .015) return true; }
  return false;
}
float hgt(vec2 q){ return vn(q) * .6 + vn(q * 2.3 + 4.1) * .4; }
vec2 grd(vec2 q){ float h = hgt(q); return vec2(hgt(q + vec2(.12, 0.)) - h, hgt(q + vec2(0., .12)) - h) / .12; }
void main(){
  float dep = prp.x, foam = prp.y, murk = prp.z, wav = prp.w * (.55 + 1.1 * wx.y);
  if (wkd > 2.5) murk += wx.z * .55;   // streams run muddy after rain
  if (nh > 0 && inHull(wp)) discard;
  vec2 q = wp.xy;
  // metres of water under one pixel: detail finer than that aliases into stripes far off, so fade it (aa(freq in rad/m))
  vec2 fq2 = fwidth(q); float px = max(fq2.x, fq2.y);
  #define aa(f) (1. - smoothstep(.6, 2., px * (f)))
  float ia = wkd > .5 && wkd < 1.5 ? ice.x : wkd > 1.5 && wkd < 2.5 ? ice.y : 0.;
  float icy = ia > 0. ? smoothstep(-.3, .3, ia * 16. - .2 - dep + (vn(q * .3) - .5) * 1.5) : 0.;
  if (wkd < .5 && ice.w > 0.) { // pack ice floes (the same noise the game walks on: floe() in JS)
    float fl = .65 * vn(q * .025) + .35 * vn(q * .09 + vec2(3., 7.)), th = ice.w * .95 - .12 + .18 * (1. - smoothstep(2., 12., dep));
    icy = smoothstep(-.012, .012, th - fl);
  }
  if (icy > .99) { // frozen: milky blue ice with cracks and drifted snow
    float cr = smoothstep(.015, 0., abs(vn(q * .45) - .5)) * .35 + smoothstep(.012, 0., abs(vn(q * 1.7 + 7.) - .5)) * .2;
    float sn = ice.z * smoothstep(.3, .7, vn(q * .25) * .6 + vn(q * 1.3) * .3 + ice.z * .5);
    vec3 ic = mix(vec3(.62, .74, .8), vec3(.8, .86, .9), vn(q * .15)) * (1. - cr * .35);
    ic = mix(ic, vec3(.93, .95, .98), sn);
    if (uwf > .5) { o = vec4(fog(fogc * 1.6 + ic * .08, wp), 1.); return; }
    vec3 V = normalize(cam - wp); float fr = .04 + .96 * pow(1. - max(V.z, 0.), 5.);
    vec3 c = ic * (amb * 1.3 + lcol * (.45 + .35 * max(sun.z, 0.))) * (.82 + .18 * vn(q * .6)) + mix(hor, zen, .5) * fr * .3 * (1. - sn) + wx.w * .4;
    o = vec4(fog(c, wp), 1.); return;
  }
  // standing waves: big swell on the sea, wind chop on lakes, near-glass on ponds
  float sw = min(wav * wav, 2.); // long swell only really belongs to the sea
  // swell: waves of different lengths from different (never square-on) directions, so they don't line up into a grid; deep-water speeds
  vec2 g = vec2(0.);
  #define WV(an, k, s) { vec2 d = vec2(cos(an), sin(an)); g += d * (sw * (s) * aa(k) * cos(dot(d, q) * (k) + t * sqrt(9.8 * (k)))); }
  WV(.35, .29, .07) WV(1.2, .47, .05) WV(-.55, .71, .04) WV(.95, 1.13, .03) WV(-.2, 1.9, .02)
  g += (.03 + .06 * sw) * aa(4.3) * vec2(sin(q.x*4.1 + q.y*1.3 + t*4.), cos(q.y*3.7 - q.x*1.1 + t*3.6));
  // irregular wind ripples: two noise layers drifting different ways, so the pattern keeps changing
  float windFade0 = aa(5.7), windFade1 = aa(10.7);
  vec2 wind0 = vec2(0.), wind1 = vec2(0.);
  if (windFade0 > 0.) wind0 = grd(q * .9 + t * vec2(.35, .22)) * windFade0;
  if (windFade1 > 0.) wind1 = grd(q * 1.7 - t * vec2(.18, .41) + 11.) * .6 * windFade1;
  g += (wind0 + wind1) * (.05 + .16 * wav);
  // flowing water: ripple noise carried along the current in two staggered phases, cross-faded so it never stretches
  float sp = length(flw), ph0 = fract(t * .3), ph1 = fract(t * .3 + .5), bl = abs(1. - 2. * ph0);
  vec2 a0 = q - flw * ph0 * 3.33, a1 = q - flw * ph1 * 3.33 + vec2(3.7, 1.9);
  float moving = smoothstep(.02, .3, sp);
  if (moving > 0. && aa(12.) > 0.) g += mix(grd(a0 * 1.9), grd(a1 * 1.9), bl) * (.07 + .12 * min(sp, 2.)) * moving * aa(12.);   // one scale of ripples is plenty
  if (wx.x > .01) for (int k = 0; k < 2; k++) { // raindrops: rings popping up all over
    vec2 cq = q * 1.8 + float(k) * vec2(.37, .71), id = floor(cq), fq = fract(cq) - .5;
    float h = h21(id + float(k) * 7.3); if (h > wx.x) continue;
    float ph = fract(t * 1.3 + h * 7.), r = ph * .42; vec2 dv = fq - (vec2(h21(id + 3.1), h21(id + 5.7)) - .5) * .5; float dd = length(dv) + .001;
    g += dv / dd * sin((dd - r) * 40.) * exp(-pow((dd - r) * 14., 2.)) * (1. - ph) * .35 * aa(72.);
  }
  // ripple rings (swimmers, rising fish, splashes)
  for (int i = 0; i < 8; i++) { vec4 r = rip[i]; float age = t - r.z; if (r.w <= 0. || age < 0. || age > 5.) continue;
    vec2 dv = q - r.xy; float d = length(dv) + .001, k = d - age * 1.3;
    g += dv / d * sin(k * 8.) * exp(-k * k * 1.5) * exp(-age * .8) * r.w * min(age * 4., 1.) * aa(8.); }
  vec3 N = normalize(vec3(-g, 1.));
  // foam: shoreline lapping band plus rapids, broken up by noise that rides the current
  float fn = moving > 0. ? mix(vn(a0 * 1.7), vn(a1 * 1.7 + 7.), bl) : vn(q * 1.7 + t * .05);
  float shore = 1. - smoothstep(0., .28 + .08 * sin(t * 1.6 + q.x * .4 + q.y * .3), dep);
  float fo = clamp(foam + shore * (.5 + .5 * wav), 0., 1.), fm = fo * smoothstep(.35, .7, fn + fo * .35);
  if (uwf < .5) { // seen from above
    vec3 V = normalize(cam - wp), R = reflect(-V, N);
    vec2 cs = caveShade(wp, sun);   // under a cenote's roof: the ceiling, not the sky, is reflected; sunlight only through the opening
    vec3 sky = mix(hor, zen, clamp(R.z * 2.2, 0., 1.)) * (1. - .85 * cs.x);
    float spec = pow(max(dot(R, sun), 0.), 280.) * 3. * (1. - cs.y), fr = .03 + .97 * pow(1. - max(dot(N, V), 0.), 5.);
    vec3 shallow = mix(vec3(.13, .45, .42), vec3(.22, .3, .12), murk), deep = mix(vec3(.02, .12, .2), vec3(.06, .1, .04), murk);
    float dd = clamp(dep / (3.5 - 2.5 * murk), 0., 1.);
    vec3 body = mix(shallow, deep, sqrt(dd)) * (amb * 1.6 * (1. - .6 * cs.x) + lcol * (.45 + .4 * max(dot(N, sun), 0.)) * (1. - cs.y));
    vec3 c = mix(body, sky, fr * .9) + lcol * spec * (1. - fm);
    float al = max(max(mix(.16 + .55 * murk, .95, smoothstep(0., 1., dd)), .12), fr * .85);
    c = mix(c, vec3(.92, .96, 1.) * (amb * 1.4 + lcol * .9), fm * .9); al = max(al, fm * .9);
    c += wx.w * .35 * (.4 + fr);   // lightning
    if (icy > 0.) { c = mix(c, vec3(.7, .8, .86) * (amb * 1.5 + lcol * .7), icy); al = max(al, icy); }   // thin ice at the freezing edge
    al *= smoothstep(-.08, .03, dep);
    o = vec4(fog(c, wp), al);
  } else { // seen from below: a bright window onto the sky overhead, mirror-like beyond it (total internal reflection)
    vec3 D = normalize(wp - cam), Nn = normalize(vec3(g * .7, 1.));
    float win = smoothstep(.6, .72, dot(D, Nn));
    vec3 sky = mix(hor, zen, .5) * 1.05 * (.85 + .3 * vn(q * 2. + t * .3)) + lcol * pow(max(dot(D, sun), 0.), 20.) * 2.;
    vec3 c = mix(fogc * (1.2 + .35 * vn(q * 1.3 - t * .2)), sky, win);
    c = mix(c, (amb + lcol) * .9, fm * .5 * win);
    o = vec4(fog(c, wp), 1.);
  }
}`;
// light shafts seen when diving: drawn additively over the scene, fanning out from the (refracted) sun
const RAYS_FS = `#version 300 es
precision highp float;
in vec2 ndc; out vec4 o; uniform vec3 R, U, F, sun, col; uniform vec2 tn; uniform float t, k;
${NOISE_GLSL}
void main(){
  vec3 d = normalize(F + ndc.x*tn.x*R + ndc.y*tn.y*U);
  vec3 s = normalize(vec3(sun.xy * .6, max(sun.z, .35)));
  vec3 ta = normalize(cross(s, vec3(0., 0., 1.)) + vec3(1e-4)), tb = cross(s, ta);
  float sd = dot(d, s), ang = atan(dot(d, tb), dot(d, ta));
  float ray = smoothstep(.12, .6, vn(vec2(ang * 9., t * .25)) * vn(vec2(ang * 23. + 3., t * .4 + 7.)) * 1.6);
  float glow = pow(max(sd, 0.), 6.) * .45;
  o = vec4(col * (ray * smoothstep(-.3, 1., sd) * .22 + glow) * k, 1.);
}`;
