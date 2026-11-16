/**
 * Test helper: build a tiny binary glTF (.glb) in memory, so the model loader
 * can be tested without a file and without Blender. Test fixtures only; the
 * app ships no model made this way.
 */

export interface GlbMesh {
  /** Triangle soup: 9 numbers per triangle. */
  readonly positions: readonly number[]
  /** Material name: `crown*` takes the class tint. */
  readonly material: string
  /** Material base color (linear RGB), default white. */
  readonly baseColor?: readonly [number, number, number]
  /** Vertex colors, 3 floats per vertex (glTF COLOR_0). */
  readonly colors?: readonly number[]
  /** Custom attribute `_LEGMASK`, one float per vertex. */
  readonly legMask?: readonly number[]
  /** Node translation: an unapplied transform the loader must bake in. */
  readonly translation?: readonly [number, number, number]
}

const FLOAT = 5126

export function makeGlb(meshes: readonly GlbMesh[], extra: { animation?: boolean } = {}): ArrayBuffer {
  const chunks: Float32Array[] = []
  const bufferViews: object[] = []
  const accessors: object[] = []
  let offset = 0
  const push = (data: readonly number[], type: 'VEC3' | 'SCALAR', withBounds: boolean): number => {
    const arr = new Float32Array(data)
    const size = type === 'VEC3' ? 3 : 1
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: arr.byteLength })
    const acc: Record<string, unknown> = { bufferView: bufferViews.length - 1, componentType: FLOAT, count: arr.length / size, type }
    if (withBounds) {
      const min = [Infinity, Infinity, Infinity]
      const max = [-Infinity, -Infinity, -Infinity]
      for (let i = 0; i < arr.length; i++) {
        min[i % 3] = Math.min(min[i % 3], arr[i])
        max[i % 3] = Math.max(max[i % 3], arr[i])
      }
      acc.min = min
      acc.max = max
    }
    accessors.push(acc)
    chunks.push(arr)
    offset += arr.byteLength
    return accessors.length - 1
  }

  const json = {
    asset: { version: '2.0', generator: 'graze test fixture' },
    scene: 0,
    scenes: [{ nodes: meshes.map((_, i) => i) }],
    nodes: meshes.map((m, i) => ({ mesh: i, ...(m.translation ? { translation: m.translation } : {}) })),
    materials: meshes.map((m) => ({ name: m.material, pbrMetallicRoughness: { baseColorFactor: [...(m.baseColor ?? [1, 1, 1]), 1], metallicFactor: 0 } })),
    meshes: meshes.map((m, i) => {
      const attributes: Record<string, number> = { POSITION: push(m.positions, 'VEC3', true) }
      if (m.colors) attributes.COLOR_0 = push(m.colors, 'VEC3', false)
      if (m.legMask) attributes._LEGMASK = push(m.legMask, 'SCALAR', false)
      return { primitives: [{ attributes, material: i, mode: 4 }] }
    }),
    ...(extra.animation
      ? {
          animations: [
            {
              name: 'Walk',
              channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
              samplers: [{ input: push([0, 1], 'SCALAR', false), output: push([0, 0, 0, 0, 0.1, 0], 'VEC3', false), interpolation: 'LINEAR' }],
            },
          ],
        }
      : {}),
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  }
  // The animation sampler input needs min/max to be valid glTF.
  for (const a of accessors as Record<string, unknown>[]) if (a.type === 'SCALAR' && a.count === 2 && !a.min) Object.assign(a, { min: [0], max: [1] })

  const text = new TextEncoder().encode(JSON.stringify(json))
  const jsonLength = Math.ceil(text.length / 4) * 4
  const total = 12 + 8 + jsonLength + 8 + offset
  const out = new ArrayBuffer(total)
  const view = new DataView(out)
  const bytes = new Uint8Array(out)
  view.setUint32(0, 0x46546c67, true) // 'glTF'
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonLength, true)
  view.setUint32(16, 0x4e4f534a, true) // 'JSON'
  bytes.fill(0x20, 20, 20 + jsonLength)
  bytes.set(text, 20)
  const bin = 20 + jsonLength
  view.setUint32(bin, offset, true)
  view.setUint32(bin + 4, 0x004e4942, true) // 'BIN\0'
  let at = bin + 8
  for (const c of chunks) {
    bytes.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), at)
    at += c.byteLength
  }
  return out
}

/** A flat triangle fan standing on Y = 0: `triangles` triangles, `height` tall, about `width` wide. */
export function fan(triangles: number, height: number, width = 0.4, y0 = 0): number[] {
  const out: number[] = []
  for (let k = 0; k < triangles; k++) {
    const a = (k / triangles) * Math.PI * 2
    const b = ((k + 1) / triangles) * Math.PI * 2
    out.push(0, y0 + height, 0, (Math.cos(a) * width) / 2, y0, (Math.sin(a) * width) / 2, (Math.cos(b) * width) / 2, y0, (Math.sin(b) * width) / 2)
  }
  return out
}
