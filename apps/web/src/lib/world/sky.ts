/**
 * Sky dome (D9, D10): a gradient sky with a sun, a moon, stars and drifting
 * clouds. One small shader, all procedural, no textures or assets.
 *
 * Every color is a uniform set from `daynight.ts`, which blends the palette
 * keyframes. The horizon color IS the fog color, so the far terrain fades
 * into the sky with no seam.
 *
 * (three's `Sky` addon was considered. It computes its colors from a
 * scattering model, so they cannot come from the palette file, and it needs
 * tone mapping, which would shift the overlay colors away from their
 * legends.)
 */

import * as THREE from 'three'

import type { DayState } from './daynight.ts'
import { PALETTE } from './palette.ts'

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
}
`

const FRAGMENT = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uCloud;
uniform vec3 uSunDisc;
uniform vec3 uMoonDisc;
uniform vec3 uStarColor;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uStars;
uniform float uDay;
uniform float uTime;
uniform float uClouds;
varying vec3 vDir;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int k = 0; k < 4; k++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.0);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float up = max(d.y, 0.0);

  // Gradient: fog color at (and below) the horizon, zenith color overhead.
  vec3 col = mix(uHorizon, uZenith, pow(up, 0.55));

  // Stars: one per grid cell on a longitude/latitude grid, twinkling.
  if (uStars > 0.0 && d.y > 0.0) {
    vec2 g = vec2(atan(d.z, d.x), asin(d.y)) * 70.0;
    vec2 id = floor(g);
    float h = hash(id);
    vec2 at = fract(g) - 0.5 - (vec2(hash(id + 1.3), hash(id + 2.7)) - 0.5) * 0.7;
    float star = step(0.9, h) * smoothstep(0.1, 0.0, length(at));
    star *= 0.65 + 0.35 * sin(uTime * 1.7 + h * 50.0);
    col += uStarColor * star * uStars * smoothstep(0.0, 0.25, d.y);
  }

  // Sun: a wide glow, a tight halo and a disc.
  float sd = dot(d, uSunDir);
  float sunUp = smoothstep(-0.12, 0.05, uSunDir.y);
  col += uGlow * (pow(max(sd, 0.0), 6.0) * 0.22 + pow(max(sd, 0.0), 90.0) * 0.5) * sunUp;
  col = mix(col, uSunDisc, smoothstep(0.9990, 0.9995, sd) * sunUp);

  // Moon: a disc with a faint halo.
  float md = dot(d, uMoonDir);
  float moonUp = smoothstep(-0.05, 0.1, uMoonDir.y) * uStars;
  col += uGlow * pow(max(md, 0.0), 200.0) * 0.6 * moonUp;
  col = mix(col, uMoonDisc, smoothstep(0.99955, 0.9998, md) * moonUp);

  // Clouds: noise projected onto a flat layer overhead, drifting with time.
  if (uClouds > 0.0 && d.y > 0.02) {
    vec2 uv = d.xz / (d.y + 0.18) * 1.4 + uTime * vec2(0.012, 0.004);
    float n = fbm(uv);
    float c = smoothstep(0.52, 0.78, n) * smoothstep(0.02, 0.22, d.y);
    // Lit side toward the sun, shaded underneath.
    float lit = 0.75 + 0.25 * smoothstep(0.5, 0.9, fbm(uv + uSunDir.xz * 0.15));
    col = mix(col, uCloud * lit, c * 0.85 * uClouds);
  }

  // Slightly darker below the horizon so the ground plane reads at night.
  col *= mix(0.92, 1.0, smoothstep(-0.25, 0.0, d.y));

  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`

export class SkyDome {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>

  constructor() {
    const uniforms = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uCloud: { value: new THREE.Color() },
      uSunDisc: { value: new THREE.Color(PALETTE.sky.sunDisc) },
      uMoonDisc: { value: new THREE.Color(PALETTE.sky.moonDisc) },
      uStarColor: { value: new THREE.Color(PALETTE.sky.stars) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
      uStars: { value: 0 },
      uDay: { value: 1 },
      uTime: { value: 0 },
      uClouds: { value: 1 },
    }
    const material = new THREE.ShaderMaterial({
      name: 'GrazeSky',
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    })
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material)
    this.mesh.scale.setScalar(900)
    this.mesh.renderOrder = -10
    this.mesh.frustumCulled = false
    this.mesh.matrixAutoUpdate = true
  }

  /** Colors and sun/moon directions for the time of day. */
  apply(s: DayState): void {
    const u = this.mesh.material.uniforms
    ;(u.uZenith.value as THREE.Color).setRGB(...s.zenith)
    ;(u.uHorizon.value as THREE.Color).setRGB(...s.fog)
    ;(u.uGlow.value as THREE.Color).setRGB(...s.glow)
    ;(u.uCloud.value as THREE.Color).setRGB(...s.cloud)
    ;(u.uSunDir.value as THREE.Vector3).set(...s.sunDir)
    ;(u.uMoonDir.value as THREE.Vector3).set(...s.moonDir)
    u.uStars.value = s.stars
    u.uDay.value = s.day
  }

  setClouds(on: boolean): void {
    this.mesh.material.uniforms.uClouds.value = on ? 1 : 0
  }

  /** Call every rendered frame: the dome follows the camera, the clouds drift. */
  update(camera: THREE.Camera, timeS: number): void {
    this.mesh.position.copy(camera.position)
    this.mesh.material.uniforms.uTime.value = timeS
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
  }
}
