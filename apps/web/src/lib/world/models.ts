/**
 * Custom `.glb` models (D17): the loader. The rules it applies are in
 * `./modelRules.ts`; this file turns a parsed glTF into ONE geometry that the
 * instanced plant and animal meshes can use as it is.
 *
 * Per mesh in the file:
 *  - the world matrix is baked into the vertices (so an unapplied transform in
 *    Blender does not change the shape);
 *  - it is made non-indexed (the scene is flat-shaded);
 *  - `tintMask` is 1 where the material is named `crown*` and 0 for `trunk*`,
 *    `bark*` and anything else. The class tint, and the grey of a low-trust
 *    plant, apply only where the mask is 1;
 *  - `color` comes from the vertex colors (glTF `COLOR_0`), or from the
 *    material color when there are none;
 *  - `legMask` comes from the custom attribute `_LEGMASK` (animals; D18), 0
 *    when it is absent;
 *  - every other attribute is dropped, so all parts share one attribute set.
 * The parts are then merged into one geometry per slot.
 *
 * Nothing here needs a DOM: `loadModelSet` takes a `read(file)` function, so
 * the browser passes `fetch` and `pnpm models:check` passes `fs.readFile`.
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { MAX_FILE_BYTES, MAX_TOTAL_BYTES, MODEL_SLOTS, parseManifest, slotKind, validateModel } from './modelRules.ts'
import type { ModelManifest, ModelRejection, ModelReport, ModelSlot, ModelSummary } from './modelRules.ts'

/** Materials whose name starts with this take the class tint. */
const CROWN = /^crown/i

export interface ProcessedModel {
  /** Null when the file has no usable mesh. */
  readonly geometry: THREE.BufferGeometry | null
  readonly summary: ModelSummary
}

interface GltfLike {
  readonly scene: THREE.Object3D
  readonly animations: readonly unknown[]
}

/** A float attribute with 3 values per vertex, from any color attribute (RGB or RGBA, float or normalized ints). */
function colorsOf(g: THREE.BufferGeometry, material: THREE.Material | undefined): Float32Array {
  const n = g.getAttribute('position').count
  const out = new Float32Array(n * 3)
  const base = material && 'color' in material && material.color instanceof THREE.Color ? material.color : new THREE.Color(1, 1, 1)
  const src = g.getAttribute('color') as THREE.BufferAttribute | undefined
  for (let i = 0; i < n; i++) {
    // getX/Y/Z de-normalize integer attributes. glTF vertex colors multiply the material color.
    out[i * 3] = (src ? src.getX(i) : 1) * base.r
    out[i * 3 + 1] = (src ? src.getY(i) : 1) * base.g
    out[i * 3 + 2] = (src ? src.getZ(i) : 1) * base.b
  }
  return out
}

/**
 * Bake, flatten, mask, color, unify and merge every mesh of a parsed glTF
 * into one geometry for `slot`, and measure it for the rules.
 */
export function geometryFromGltf(gltf: GltfLike, slot: ModelSlot, bytes: number): ProcessedModel {
  const animal = slotKind(slot) === 'animal'
  const parts: THREE.BufferGeometry[] = []
  const missing = new Set<string>()
  let meshes = 0
  let hasSkin = false

  gltf.scene.updateMatrixWorld(true)
  gltf.scene.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) hasSkin = true
    if (!(o as THREE.Mesh).isMesh) return
    const mesh = o as THREE.Mesh
    meshes++
    const src = mesh.geometry
    if (!src.getAttribute('position')) {
      missing.add('position')
      return
    }
    const baked = src.clone().applyMatrix4(mesh.matrixWorld)
    const g = baked.index ? baked.toNonIndexed() : baked
    if (g !== baked) baked.dispose()
    const n = g.getAttribute('position').count
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    const colors = colorsOf(g, material)
    const leg = g.getAttribute('_legmask') as THREE.BufferAttribute | undefined
    const legMask = new Float32Array(n)
    if (leg) for (let i = 0; i < n; i++) legMask[i] = leg.getX(i)
    if (!g.getAttribute('normal')) g.computeVertexNormals()
    const normal = g.getAttribute('normal')

    // One attribute set for every part, whatever the file carried (uv, tangents, extra colors).
    const out = new THREE.BufferGeometry()
    out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').array), 3))
    out.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normal.array), 3))
    out.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    if (animal) out.setAttribute('legMask', new THREE.BufferAttribute(legMask, 1))
    else out.setAttribute('tintMask', new THREE.BufferAttribute(new Float32Array(n).fill(CROWN.test(material?.name ?? '') ? 1 : 0), 1))
    g.dispose()
    parts.push(out)
  })

  const geometry = parts.length > 0 ? mergeGeometries(parts, false) : null
  parts.forEach((p) => p.dispose())
  const box = new THREE.Box3()
  if (geometry) {
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    box.copy(geometry.boundingBox!)
  }
  const summary: ModelSummary = {
    bytes,
    meshes,
    triangles: geometry ? geometry.getAttribute('position').count / 3 : 0,
    missingAttributes: [...missing],
    hasSkin,
    hasAnimation: gltf.animations.length > 0,
    min: geometry ? [box.min.x, box.min.y, box.min.z] : [0, 0, 0],
    max: geometry ? [box.max.x, box.max.y, box.max.z] : [0, 0, 0],
  }
  return { geometry, summary }
}

export interface ModelSet {
  /** Accepted geometries by slot. Owned by this set: users clone, and dispose their clones. */
  readonly geometries: Partial<Record<ModelSlot, THREE.BufferGeometry>>
  readonly report: ModelReport
  readonly manifest: ModelManifest
  /** What was measured in each file that could be read (for the checker's table). */
  readonly summaries: Partial<Record<ModelSlot, ModelSummary>>
}

export type ReadFile = (file: string) => Promise<ArrayBuffer>

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))

/**
 * Load every model the manifest lists, validate each one, and keep the ones
 * that pass. A slot that fails (missing file, parse error, over budget, bad
 * attributes) is left out, so its code-built shape stays; the failure is ONE
 * `warn` naming the file and the reason. Never throws.
 */
export async function loadModelSet(read: ReadFile, warn: (text: string) => void = (t) => console.warn(t)): Promise<ModelSet> {
  const geometries: Partial<Record<ModelSlot, THREE.BufferGeometry>> = {}
  const summaries: Partial<Record<ModelSlot, ModelSummary>> = {}
  const rejected: ModelRejection[] = []
  const custom: ModelSlot[] = []

  let raw: unknown = null
  let manifestError: string | null = null
  try {
    raw = JSON.parse(new TextDecoder().decode(await read('manifest.json')))
  } catch (err) {
    manifestError = `manifest.json could not be read: ${message(err)}`
  }
  const parsed = manifestError ? { manifest: parseManifest({ version: 1, slots: {} }).manifest, errors: [manifestError] } : parseManifest(raw)
  for (const e of parsed.errors) warn(`[models] ${e}`)

  let total = 0
  for (const slot of MODEL_SLOTS) {
    const entry = parsed.manifest.slots[slot]
    if (!entry) continue
    const reject = (reason: string) => {
      rejected.push({ slot, file: entry.file, reason })
      warn(`[models] ${entry.file} rejected: ${reason}. The built-in ${slot} shape is used.`)
    }
    let processed: ProcessedModel | null = null
    try {
      const buffer = await read(entry.file)
      if (buffer.byteLength > MAX_FILE_BYTES) {
        reject(`${Math.ceil(buffer.byteLength / 1024)} KB > ${MAX_FILE_BYTES / 1024} KB`)
        continue
      }
      if (total + buffer.byteLength > MAX_TOTAL_BYTES) {
        reject(`the models together would be over ${MAX_TOTAL_BYTES / 1024} KB`)
        continue
      }
      const gltf = await new GLTFLoader().parseAsync(buffer, '')
      processed = geometryFromGltf(gltf, slot, buffer.byteLength)
      summaries[slot] = processed.summary
      const reason = validateModel(slot, processed.summary)
      if (reason || !processed.geometry) {
        processed.geometry?.dispose()
        reject(reason ?? 'no mesh in the file')
        continue
      }
      total += buffer.byteLength
      geometries[slot] = processed.geometry
      custom.push(slot)
    } catch (err) {
      processed?.geometry?.dispose()
      reject(`it could not be loaded (${message(err)})`)
    }
  }
  return { geometries, summaries, manifest: parsed.manifest, report: { custom, rejected, errors: parsed.errors } }
}

const cache = new Map<string, Promise<ModelSet>>()

/** Where the app serves the models from: `models/` next to index.html (Vite's `public/models/`). */
export function modelsUrl(): string {
  return new URL('models/', document.baseURI).href
}

/**
 * The app's model set. Loaded once per page load and cached, so switching
 * between walk and orbit view (or between the two renderers) never fetches a
 * file again. Reload the page to pick up an edited `.glb`.
 */
export function loadModels(base: string = modelsUrl()): Promise<ModelSet> {
  let set = cache.get(base)
  if (!set) {
    set = loadModelSet(async (file) => {
      // `no-cache` revalidates, so an edited file shows after a reload.
      const res = await fetch(new URL(file, base), { cache: 'no-cache' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.arrayBuffer()
    })
    cache.set(base, set)
  }
  return set
}
