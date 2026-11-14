/**
 * Terrain material (D9): the flat-shaded, vertex-colored Lambert material of
 * the mesh, with a small shader patch for the natural look:
 *
 * - slope blending: moderate slopes turn to dirt, steep ones to rock;
 * - shoreline: a sand band just above the water, darker wet ground below it;
 * - a little per-fragment noise so a 30 m triangle is not one flat color.
 *
 * The patch is scaled by `uNatural`. It is 1 in the natural view and 0 while
 * a data overlay (cover, confidence) is shown, so overlay colors stay exactly
 * the class colors of the legend. The per-vertex attribute `grazeBlend` does
 * the same for single cells: it is 0 on a cell that carries a low-trust mark,
 * so rock or sand never paints over the mark.
 *
 * The slope here is the TRUE slope: the vertical exaggeration of the drawing
 * is divided out. It is only a look; the model's slope input is computed from
 * the heightmap in `@graze/features`.
 */

import * as THREE from 'three'

import { VERTICAL_EXAGGERATION } from './coords.ts'
import { PALETTE } from './palette.ts'

/** Slopes (degrees) where dirt, then rock, take over from the vertex color. */
export const DIRT_SLOPE = { from: 20, to: 31 } as const
export const ROCK_SLOPE = { from: 31, to: 43 } as const
/** Height of the sand band above the water, world units. */
export const SHORE_BAND = 0.3

export interface TerrainUniforms {
  uNatural: { value: number }
  uWaterY: { value: number }
}

export function createTerrainMaterial(): { material: THREE.MeshLambertMaterial; uniforms: TerrainUniforms } {
  const uniforms = {
    uNatural: { value: 1 },
    uWaterY: { value: -1e6 },
    uExaggeration: { value: VERTICAL_EXAGGERATION },
    uRock: { value: new THREE.Color(PALETTE.terrain.rock) },
    uDirt: { value: new THREE.Color(PALETTE.terrain.dirt) },
    uSand: { value: new THREE.Color(PALETTE.terrain.sand) },
    uBed: { value: new THREE.Color(PALETTE.terrain.riverbed) },
    uSlopes: { value: new THREE.Vector4(DIRT_SLOPE.from, DIRT_SLOPE.to, ROCK_SLOPE.from, ROCK_SLOPE.to) },
    uShoreBand: { value: SHORE_BAND },
  }
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float grazeBlend;\nvarying vec3 vGrazeWorld;\nvarying float vGrazeBlend;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGrazeWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvGrazeBlend = grazeBlend;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
varying vec3 vGrazeWorld;
varying float vGrazeBlend;
uniform float uNatural;
uniform float uWaterY;
uniform float uExaggeration;
uniform float uShoreBand;
uniform vec3 uRock;
uniform vec3 uDirt;
uniform vec3 uSand;
uniform vec3 uBed;
uniform vec4 uSlopes;
float grazeHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float grazeNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(grazeHash(i), grazeHash(i + vec2(1.0, 0.0)), f.x), mix(grazeHash(i + vec2(0.0, 1.0)), grazeHash(i + vec2(1.0, 1.0)), f.x), f.y);
}`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
if (uNatural > 0.0) {
  // Face normal in world space, from screen-space derivatives (flat shading).
  vec3 wn = normalize(cross(dFdx(vGrazeWorld), dFdy(vGrazeWorld)));
  float slopeDeg = degrees(atan(length(wn.xz) / max(abs(wn.y), 1e-4) / uExaggeration));
  float n = grazeNoise(vGrazeWorld.xz * 2.6) * 0.6 + grazeNoise(vGrazeWorld.xz * 9.0) * 0.4;
  float s = slopeDeg + (n - 0.5) * 9.0;
  vec3 c = diffuseColor.rgb;
  c = mix(c, uDirt, smoothstep(uSlopes.x, uSlopes.y, s) * 0.7);
  c = mix(c, uRock, smoothstep(uSlopes.z, uSlopes.w, s));
  float above = vGrazeWorld.y - uWaterY + (n - 0.5) * 0.12;
  if (above >= 0.0) {
    c = mix(c, uSand, (1.0 - smoothstep(0.0, uShoreBand, above)) * 0.9);
  } else {
    c = mix(uSand * 0.75, uBed, smoothstep(0.0, 0.5, -above));
  }
  c *= 0.9 + 0.2 * n;
  diffuseColor.rgb = mix(diffuseColor.rgb, c, uNatural * vGrazeBlend);
}`,
      )
  }
  material.customProgramCacheKey = () => 'graze-terrain'
  return { material, uniforms }
}
