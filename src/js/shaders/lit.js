'use strict';
// GLSL for the lit world shader: swim deformation, fog, caustics, value noise, LIT_VS / LIT_FS (surface materials, seasons, fire lights).
// ---- shaders ----
// how the body moves when swimming (the vertex shader's modes): side-to-side tail beats; a wave down the whole body (eels);
// a stiff body with a sweeping tail (tuna, marlin); flapping wings (rays); up-and-down ripples (flatfish on their side)
const SWIM_MODES = { auto: -1, carangiform: 0, anguilliform: 1, thunniform: 2, ray: 3, flat: 4, cetacean: 5, turtle: 6 };
const SWIM_GLSL = `float tl = max(-p.x, 0.);
    if (swm < .5) pp.y += wig * sin(ph + p.x * 5.) * (.025 + .3 * tl * tl);
    else if (swm < 1.5) pp.y += wig * sin(ph + p.x * 12.) * (.012 + .07 * (.5 - p.x));
    else if (swm < 2.5) pp.y += wig * sin(ph + p.x * 4.) * (.004 + .9 * tl * tl * tl);
    else if (swm < 3.5) { float sy = abs(p.y); pp.z += wig * sin(ph * .45 - sy * 2.5) * .55 * sy * sy; }
    else if (swm < 4.5) pp.z += wig * sin(ph + p.x * 8.) * (.006 + .05 * (.5 - p.x));
    else if (swm < 5.5) pp.z += wig * sin(ph + p.x * 4.) * (.004 + .7 * tl * tl * tl);
    else { float e = max(abs(p.y) - .2, 0.); pp.z += wig * sin(ph * .45 + p.x * 1.5) * e * 1.8; }`;   // turtles: only the flippers beat   // whales, dolphins, manatees: flukes beat up and down
const LIT_VS = `#version 300 es
layout(location=0) in vec3 p; layout(location=1) in vec3 n; layout(location=2) in vec3 c;
layout(location=3) in vec4 io; layout(location=4) in vec2 ir;   // per-instance: xyz+scale, rotation+tint
layout(location=5) in vec2 uv; layout(location=6) in float mat;
layout(location=7) in float twl; layout(location=8) in float tmk; layout(location=9) in vec2 iwm; layout(location=10) in float iph; // water level + murk: terrain / per instance; fish swim phase
layout(location=11) in float ipt; // fish pitch (nose up +)
uniform mat4 vp; uniform float inst, sway, time, wig, fsh, pscale, dry, swm, roll; uniform vec3 jawP; // fish jaw hinge (x, z) and widest gape angle
uniform vec4 seasA; // leaves on (0..1), autumn colour, fresh spring green, grass dormancy
out vec3 wp; out vec3 wn; out vec3 col; out vec2 tuv; out float mt; out vec3 tp; out vec3 wv;
void main(){
  vec3 q = p, m = n, cc = c; col = c; mt = mat;
  if (inst > .5 && fsh < .5 && mat > 16.5 && mat < 19.98) { // deciduous leaf clumps: present, coloured or fallen by season
    float kd = floor(mat + .02), cl = (mat - kd) * 25.;
    float r = fract(sin(cl * 12.9898 + ir.y * 78.233 + io.x * .0137 + io.y * .0291) * 43758.5453);
    if (seasA.x < .002 || r > seasA.x) { gl_Position = vec4(2., 2., 2., 1.); wp = vec3(0.); wn = vec3(0., 0., 1.); col = vec3(0.); tuv = vec2(0.); mt = 6.; tp = vec3(0.); wv = vec3(0.); return; }
    float au = clamp(seasA.y * 1.6 - r * .6, 0., 1.), tv = fract(ir.y * 3.7 + cl * .13);
    vec3 ac = kd < 17.5 ? mix(vec3(.62, .36, .12), vec3(.48, .3, .1), tv) : kd < 18.5 ? mix(vec3(.8, .13, .06), vec3(.95, .5, .08), tv) : mix(vec3(.95, .78, .2), vec3(.85, .7, .15), tv);
    float crownShade = clamp(c.g / (kd < 17.5 ? .42 : kd < 18.5 ? .48 : .6), .5, 1.15);
    cc = mix(c, ac * crownShade, au);
    cc = mix(cc, vec3(.42, .63, .25) * (.94 + .12 * tv) * crownShade, seasA.z);   // fresh spring leaves
    mt = 6.;
  }
  if (dry > 0. && mat > 5.5 && mat < 6.5) cc = mix(cc, vec3(.58, .5, .3) * (.85 + .3 * fract(p.x * 37.)), dry);   // reeds go to straw
  if (inst > .5) {
    float s = sin(ir.x), k = cos(ir.x);
    vec3 pp = p;
    if (sway > 0.) { // wind: tree tops sway, trunks stay planted
      float h = max(p.z, 0.), ph = io.x * .13 + io.y * .17;
      pp.xy += sway * h * h * .035 * vec2(sin(time * 1.3 + ph), cos(time * 1.05 + ph * 1.3)) * (1. + .5 * sin(time * 2.7 + ph * 2.));
    }
    vec3 nn = n;
    if (fsh > .5) { // fish and shellfish: iph packs the swim phase (0..2pi) plus 8 x mouth/shell opening (0..12)
      float jo = floor(iph / 8.), ph = iph - jo * 8., op = jo / 12.;
      if (mat > 12.5 && mat < 14.5) { // lower jaw and throat: swing down about the hinge, weighted per vertex
        float an = op * jawP.z * clamp((mat - 13.) / .98, 0., 1.), cs = cos(an), sn = sin(an); vec2 d = pp.xz - jawP.xy;
        pp.xz = jawP.xy + vec2(d.x * cs + d.y * sn, -d.x * sn + d.y * cs); nn.xz = vec2(nn.x * cs + nn.z * sn, -nn.x * sn + nn.z * cs);
      } else if (mat > 14.5 && mat < 16.5) { // shell valves (15 right, 16 left) swing open about the hinge line along x
        float an = op * jawP.z * (mat < 15.5 ? 1. : -1.), cs = cos(an), sn = sin(an); vec2 d = vec2(pp.y, pp.z - jawP.y);
        pp.yz = vec2(d.x * cs - d.y * sn, jawP.y + d.x * sn + d.y * cs); nn.yz = vec2(nn.y * cs - nn.z * sn, nn.y * sn + nn.z * cs);
      } else if (mat > 19.5 && mat < 29.5) { // arms, legs, antennae: a gentle wiggle growing toward the tip (weight = mat - 20)
        float w = mat - 20.; pp.z += sin(ph * .9 + w * 6. + p.x * 9. + p.y * 7.) * .018 * w; pp.y += sin(ph * .7 + w * 5. + p.x * 6. + p.z * 8.) * .014 * w;
      } else if (mat > 29.5) { // rippling fin edges (cuttlefish, squid)
        pp.z += sin(ph * 1.6 + p.x * 42.) * .012 * (mat - 30.);
      }
      ${SWIM_GLSL}   // the body wave: style per species (SWIM_MODES)
      if (roll != 0.) { float cr = cos(roll), sr = sin(roll); pp.yz = vec2(pp.y * cr - pp.z * sr, pp.y * sr + pp.z * cr); nn.yz = vec2(nn.y * cr - nn.z * sr, nn.y * sr + nn.z * cr); }   // boats heel
      if (ipt != 0.) { float cp = cos(ipt), sp = sin(ipt); pp.xz = vec2(pp.x * cp - pp.z * sp, pp.x * sp + pp.z * cp); nn.xz = vec2(nn.x * cp - nn.z * sp, nn.x * sp + nn.z * cp); }
    }
    q = vec3(k*pp.x - s*pp.y, s*pp.x + k*pp.y, pp.z) * io.w * pscale + io.xyz;
    tp = fsh > .5 ? p * io.w + vec3(ir.y * 7.31, ir.y * 3.17, 0.)   // boats, animals, tackle: texture in their own frame, so it rides along with them
                  : vec3(k*p.x - s*p.y, s*p.x + k*p.y, p.z) * io.w * pscale + io.xyz; // unswayed: textures don't swim
    if (mat > 7.05 && mat < 7.2) tp = p.yzx * io.w * pscale; // fallen bark grain follows the log
    m = vec3(k*nn.x - s*nn.y, s*nn.x + k*nn.y, nn.z);
    col = cc * (.82 + .36*ir.y);
    wv = vec3(iwm, 0.);
  } else { tp = p; wv = vec3(twl, tmk, 1.); }
  wp = q; wn = m; tuv = uv; gl_Position = vp * vec4(q, 1.);
}`;
// underwater: fog thickens exponentially into the water colour
const FOG_GLSL = `uniform vec3 cam, sun, fogc; uniform float far, uwf;
vec3 fog(vec3 c, vec3 wp){ float d = length(wp - cam) / far; return mix(c, fogc, uwf > .5 ? 1. - exp(-d * 3.2) : clamp(d*d*1.3, 0., 1.)); }`;
// light focused by surface ripples onto whatever lies underwater
const CAUSTIC_GLSL = `float caustic(vec2 uv, float tm){
  vec2 p = mod(uv * 6.28318, 6.28318) - 250., i = p; float c = 1.;
  for (int n = 0; n < 4; n++) { float t = tm * (1. - 3.5 / float(n + 1));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1. / length(vec2(p.x / (sin(i.x + t) / .005), p.y / (cos(i.y + t) / .005))); }
  c = 1.17 - pow(c / 4., 1.4); return clamp(pow(abs(c), 8.), 0., 1.6);
}`;
const NOISE_GLSL = `float h21(vec2 p){ p = fract(mod(p, 512.) * vec2(.1031, .1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm3(vec2 p){ return vn(p)*.5 + vn(p*2.07 + 5.2)*.3 + vn(p*4.31 + 1.7)*.2; }`;
const LIT_FS = `#version 300 es
precision highp float;
in vec3 wp; in vec3 wn; in vec3 col; in vec2 tuv; in float mt; in vec3 tp; in vec3 wv; out vec4 o;
uniform float night, emk, time; uniform vec4 fl[8]; uniform int nfl; uniform vec3 lcol, amb;
uniform vec4 seasA, seasB; // seasB: snow cover, wetness, lightning flash
${FOG_GLSL}
${NOISE_GLSL}
${CAUSTIC_GLSL}
// face coordinates: u runs horizontally along a wall, v is height; flat tops use world xy
vec2 faceUV(vec3 N, vec3 P){
  if (abs(N.z) > .7) return P.xy;
  vec2 t = normalize(vec2(-N.y, N.x) + vec2(1e-5));
  return vec2(dot(P.xy, t), P.z);
}
vec3 surface(vec3 c, vec3 N, int id, inout float spec, inout float em){
  vec3 P = tp; vec2 q = faceUV(N, P);
  if (id == 0) { // generic: terrain and misc (first: it covers most of the screen)
    float n = vn(q * .22) * .55 + vn(q * 1.7) * .3 + vn(q * 7.) * .15, k = .86 + .28 * n;
    if (abs(N.z) < .35) k *= 1. - .14 * step(.86, fract(P.z * 2.2));
    return c * k;
  }
  if (id == 2) { // wood: boards with grain and dark seams
    float bw = .24, b = floor(q.x / bw), fx = fract(q.x / bw);
    float g = vn(vec2(q.x * 28., q.y * 1.4 + b * 7.)) * .6 + vn(vec2(q.x * 80., q.y * 3.5 + b)) * .4;
    float seam = smoothstep(0., .07, fx) * smoothstep(1., .93, fx);
    if (abs(N.z) > .7) seam = 1.;
    return c * (.85 + .3 * h21(vec2(b, 3.))) * (.72 + .45 * g) * (.55 + .45 * seam);
  }
  if (id == 5) { // broad mineral variation; let the mesh supply fracture planes
    float n = vn(P.xy * .6 + P.z * .35), grit = vn(q * 8.);
    return c * (.86 + .20 * n + .06 * grit);
  }
  if (id == 6) { // restrained leaf texture over baked crown/plant shading
    float a = vn(P.xy * 1.9 + P.z * 1.6), b = vn(P.yx * 5.7 - P.z * 3.1);
    return c * (.86 + .18 * a + .12 * b);
  }
  if (id == 7) { // bark: standing trunks or the local long axis of fallen timber
    if (mt > 7.05) q = vec2(P.x + P.y, P.z);
    float f = vn(vec2(q.x * 16., q.y * 1.3)) * .7 + vn(vec2(q.x * 40., q.y * 4.)) * .3;
    return c * (.64 + .50 * f);
  }
  if (id == 8) return c * (.94 + .06 * vn(q * 45.)); // cloth / skin: smooth with a faint weave
  if (id == 9) { em = 1.; return c; } // crystals glow
  if (id == 11) { em = night; return mix(c * .45, c, night); } // lamp glass
  if (id == 12) { spec = 1.2; return c * (.9 + .1 * vn(q * 30.)); } // metal
  return c;
}
vec3 fireLight(vec3 N){ // up to 8 flickering warm lights (xyz, intensity)
  vec3 a = vec3(0.);
  for (int i = 0; i < 8; i++) { if (i >= nfl) break; vec3 L = fl[i].xyz - wp; float d = length(L) + .001; a += fl[i].w * max(dot(N, L/d)*.7 + .3, 0.) / (1. + d*d*.6); }
  return min(a, 1.6) * vec3(1., .6, .3);
}
uniform float lureCam;
void main(){
  vec3 N = normalize(wn); float spec = 0., em = 0.;
  vec3 bc = surface(col, N, int(mt + .5), spec, em);
  { // seasons: dormant grass browns, snow settles on what faces up, rain darkens
    float above = (wv.z < .5 && wv.x == 0.) || wv.x - wp.z < -.04 ? 1. : 0., id = mt + .5;
    if (wv.z > .5 && above > 0.) { float gr = clamp((bc.g - max(bc.r, bc.b)) * 7., 0., 1.); bc = mix(bc, vec3(dot(bc, vec3(.5, .4, .1))) * vec3(1.18, 1., .62), gr * seasA.w * .8); }
    float up = wv.z > .5 ? smoothstep(.5, .85, N.z) : (id > 5.5 && id < 7.5 ? smoothstep(.1, .55, N.z) : 0.);
    float sn = seasB.x * up * smoothstep(.15, .45, vn(wp.xy * .4) * .55 + vn(wp.xy * 2.1) * .25 + seasB.x * .55) * above;
    bc = mix(bc * (1. - .22 * seasB.y * above), vec3(.9, .93, .97), sn);
  }
  float d = max(dot(N, sun), 0.);
  vec3 a = amb * (.75 + .5 * (.5 + .5 * N.z));
  vec3 c = bc * (a + lcol * d);
  if (spec > 0.) { vec3 V = normalize(cam - wp), H = normalize(sun + V); c += lcol * spec * pow(max(dot(N, H), 0.), 60.) * .8; }
  c += bc * fireLight(N);
  c += bc * seasB.z * vec3(.7, .75, 1.) * (.5 + .5 * max(N.z, 0.));   // lightning
  float wd = wv.x - wp.z; // depth below the local water surface
  if (wd > 0.) { // underwater: tinted, dimmed with depth, dappled by caustics
    float mk = wv.y;
    vec3 tint = mix(vec3(.36, .68, .72), vec3(.5, .55, .25), mk);
    float cs = caustic(wp.xy * .3, time * .7) * exp(-wd * .3) * (1. - .8 * mk) * smoothstep(0., .3, wd) * (.4 + .6 * vn(wp.xy * .15 + time * .05));
    c = c * mix(vec3(1.), tint, clamp(.2 + wd * .2, 0., .9)) * exp(-wd * (.03 + .15 * mk));
    c += lcol * cs * (bc * .9 + .06) * (.35 + .65 * max(N.z, 0.)) * .9;
  } else if (wv.z > .5 && wd > -.45) c *= mix(.62, 1., -wd / .45); // wet band just above the waterline
  // Soft close-range camera illumination keeps bait and approaching mouths
  // readable in deep/murky water, only in the lure inset.
  float fill = lureCam * (1. - smoothstep(.3, 3., length(wp - cam)));
  c = mix(c, max(c, bc * .9), fill);
  o = vec4(fog(mix(c, bc, em * emk), wp), 1.);
}`;
