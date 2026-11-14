/**
 * Water surface (D9): one flat plane with a small custom shader. Animated
 * ripples, transparency, a depth tint (pale shallows, dark deeps), foam along
 * the shore, and, in walk mode, a pale line where wading ends.
 *
 * Depth comes from the heightmap itself: the heights are packed into a small
 * texture and the shader compares them with the water level. That gives the
 * shoreline and the depth tint without rendering the scene a second time,
 * which is what three's `Water` addon does for its reflection. It also means
 * the shore follows the brush as you sculpt.
 *
 * Colors are uniforms set from `daynight.ts` (palette keyframes).
 */

import * as THREE from 'three'

import type { DayState } from './daynight.ts'
import { PALETTE } from './palette.ts'

/** Depths are stored as 8 bits over +/- this many meters around the water level. */
export const DEPTH_RANGE_M = 48

const VERTEX = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform float uSize;
varying vec2 vCell;
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  // Cell coordinates: vertex (x, y) of the terrain sits at the cell center.
  vCell = world.xz + (uSize - 1.0) * 0.5;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`

const FRAGMENT = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uDepth;
uniform float uSize;
uniform float uDepthRange;
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uDeepLine;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform float uLight;
uniform float uWadeDepth;
uniform float uShowDeepLine;
varying vec2 vCell;
varying vec3 vWorld;

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

// Water depth in meters at this fragment (positive under water).
float depthAt(vec2 cell) {
  float t = texture2D(uDepth, (cell + 0.5) / uSize).r;
  return (t - 0.5) * 2.0 * uDepthRange;
}

void main() {
  float depth = depthAt(vCell);
  // The plane also runs under the land. Drop it there, or it shows through
  // the open sides of the terrain at the map edge.
  if (depth < -2.0) discard;

  // Two layers of drifting ripples.
  vec2 p = vWorld.xz;
  float r1 = noise(p * 1.7 + uTime * vec2(0.35, 0.22));
  float r2 = noise(p * 4.3 - uTime * vec2(0.28, 0.41));
  float ripple = r1 * 0.6 + r2 * 0.4;

  // Depth tint: pale in the shallows, dark in the deeps.
  float deep = smoothstep(0.0, 22.0, depth + (ripple - 0.5) * 3.0);
  vec3 col = mix(uShallow, uDeep, deep);
  float alpha = mix(0.5, 0.9, deep);

  // Ripple shading and a sun (or moon) glint.
  vec3 n = normalize(vec3((r1 - 0.5) * 0.5, 1.0, (r2 - 0.5) * 0.5));
  vec3 view = normalize(cameraPosition - vWorld);
  float glint = pow(max(dot(reflect(-uLightDir, n), view), 0.0), 60.0);
  col *= 0.86 + 0.28 * ripple;
  col += uLightColor * glint * 0.55 * uLight;
  // Grazing angles reflect more sky: lighten and firm up.
  float fresnel = pow(1.0 - max(view.y, 0.0), 3.0);
  col = mix(col, mix(uShallow, vec3(1.0), 0.25), fresnel * 0.35);
  alpha = mix(alpha, 0.95, fresnel * 0.5);

  // Foam where the water meets the land, breaking up with the ripples.
  float foam = (1.0 - smoothstep(0.0, 1.6, depth + (ripple - 0.5) * 1.6)) * (0.55 + 0.45 * sin(uTime * 1.3 + ripple * 9.0));
  col = mix(col, uFoam * (0.5 + 0.5 * uLight), clamp(foam, 0.0, 1.0) * 0.85);
  alpha = max(alpha, clamp(foam, 0.0, 1.0) * 0.9);

  // Walk mode: a dashed pale line at the wading limit ("deep water starts here").
  if (uShowDeepLine > 0.0) {
    float band = 1.0 - smoothstep(0.6, 1.5, abs(depth - uWadeDepth));
    float dash = step(0.3, fract((vWorld.x + vWorld.z) * 1.1 + uTime * 0.05));
    col = mix(col, uDeepLine * (0.55 + 0.45 * uLight), band * dash * 0.85 * uShowDeepLine);
    alpha = max(alpha, band * dash * 0.9 * uShowDeepLine);
  }

  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`

export class WaterSurface {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
  #data = new Uint8Array(1)
  #texture: THREE.DataTexture
  #size = 1

  constructor() {
    this.#texture = this.#makeTexture(1)
    const uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uDepth: { value: null },
        uSize: { value: 1 },
        uDepthRange: { value: DEPTH_RANGE_M },
        uTime: { value: 0 },
        uShallow: { value: new THREE.Color() },
        uDeep: { value: new THREE.Color() },
        uFoam: { value: new THREE.Color(PALETTE.water.foam) },
        uDeepLine: { value: new THREE.Color(PALETTE.water.deepLine) },
        uLightDir: { value: new THREE.Vector3(0, 1, 0) },
        uLightColor: { value: new THREE.Color() },
        uLight: { value: 1 },
        uWadeDepth: { value: 6 },
        uShowDeepLine: { value: 0 },
      },
    ])
    uniforms.uDepth.value = this.#texture
    const material = new THREE.ShaderMaterial({
      name: 'GrazeWater',
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      fog: true,
    })
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material)
    this.mesh.renderOrder = 1
  }

  #makeTexture(size: number): THREE.DataTexture {
    this.#data = new Uint8Array(size * size)
    const tex = new THREE.DataTexture(this.#data, size, size, THREE.RedFormat, THREE.UnsignedByteType)
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    tex.unpackAlignment = 1
    tex.needsUpdate = true
    return tex
  }

  /** Repack the depths. Call when the heightmap or the water level changes. */
  setDepths(heightmap: Float32Array, size: number, waterLevelM: number): void {
    if (size !== this.#size) {
      this.#texture.dispose()
      this.#texture = this.#makeTexture(size)
      this.#size = size
      this.mesh.material.uniforms.uDepth.value = this.#texture
      this.mesh.material.uniforms.uSize.value = size
      this.mesh.scale.set(size - 1, 1, size - 1) // exactly the terrain footprint
    }
    const d = this.#data
    const k = 127.5 / DEPTH_RANGE_M
    for (let i = 0; i < d.length; i++) d[i] = Math.min(255, Math.max(0, Math.round(127.5 + (waterLevelM - heightmap[i]) * k)))
    this.#texture.needsUpdate = true
  }

  apply(s: DayState): void {
    const u = this.mesh.material.uniforms
    ;(u.uShallow.value as THREE.Color).setRGB(...s.waterShallow)
    ;(u.uDeep.value as THREE.Color).setRGB(...s.waterDeep)
    ;(u.uLightDir.value as THREE.Vector3).set(...s.lightDir)
    ;(u.uLightColor.value as THREE.Color).setRGB(...s.lightColor)
    u.uLight.value = Math.min(1, 0.25 + s.day * 0.75 + s.twilight * 0.4)
  }

  /** The decorative backdrop: one flat tint, no day/night. */
  applyFlat(hex: string): void {
    const u = this.mesh.material.uniforms
    ;(u.uShallow.value as THREE.Color).set(hex)
    ;(u.uDeep.value as THREE.Color).set(hex).multiplyScalar(0.55)
    ;(u.uLightColor.value as THREE.Color).set('#ffffff')
    u.uLight.value = 0.6
  }

  /** Show the wading-limit line (walk mode). `depthM` is WADE_DEPTH_M. */
  setDeepLine(show: boolean, depthM: number): void {
    const u = this.mesh.material.uniforms
    u.uShowDeepLine.value = show ? 1 : 0
    u.uWadeDepth.value = depthM
  }

  setTime(timeS: number): void {
    this.mesh.material.uniforms.uTime.value = timeS
  }

  dispose(): void {
    this.mesh.geometry.dispose()
    this.mesh.material.dispose()
    this.#texture.dispose()
  }
}
