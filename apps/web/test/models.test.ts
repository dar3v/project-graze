// ROLE-1 D17: custom .glb models. The rules, the loader (run here in Node on
// tiny fixtures built in memory), the fallback, and the animal facing.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import * as THREE from 'three'

import { animalMatrix, herbivoreGeometry, hipHeight, predatorGeometry } from '../src/lib/world/fauna.ts'
import { BUDGETS, EMPTY_MANIFEST, MAX_FILE_BYTES, MODEL_SLOTS, modelsLine, parseManifest, PLANT_SLOTS, slotKind, validateModel, withinTotalBudget } from '../src/lib/world/modelRules.ts'
import type { ModelSummary } from '../src/lib/world/modelRules.ts'
import { loadModelSet } from '../src/lib/world/models.ts'
import { luminance, saturation } from '../src/lib/world/palette.ts'
import { OOD_DENSITY, plantTint, SPECIES } from '../src/lib/world/vegetation.ts'
import { fan, makeGlb } from './glb.ts'

const MANIFEST_PATH = new URL('../public/models/manifest.json', import.meta.url)

const entry = (file: string) => ({ file, author: 'Test Author', source: 'team-made', version: 1 })
const manifestOf = (slots: Record<string, unknown>) => new TextEncoder().encode(JSON.stringify({ version: 1, slots })).buffer as ArrayBuffer

/** A `read` function over an in-memory folder. A missing file rejects, like a 404. */
function folder(files: Record<string, ArrayBuffer>): (file: string) => Promise<ArrayBuffer> {
  return async (file) => {
    const f = files[file]
    if (!f) throw new Error('HTTP 404')
    return f
  }
}

/** A plausible tree: a 1.2-unit crown over a short trunk, standing on Y = 0. */
const tree = (crownTriangles = 8) =>
  makeGlb([
    { positions: fan(crownTriangles, 0.9, 0.6, 0.3), material: 'crown_top', colors: new Array(crownTriangles * 9).fill(0.85) },
    { positions: fan(3, 0.3, 0.12), material: 'trunk', baseColor: [0.3, 0.2, 0.1] },
  ])

test('slots: the 7 plant silhouettes from SPECIES, the grass tuft and two animals', () => {
  assert.deepEqual(PLANT_SLOTS, SPECIES.map((s) => s.silhouette))
  assert.deepEqual(MODEL_SLOTS, ['spire', 'pole', 'broadPine', 'roundCrown', 'slender', 'fullCone', 'shrub', 'grassTuft', 'herbivore', 'predator'])
  assert.equal(slotKind('shrub'), 'shrub')
  assert.equal(slotKind('spire'), 'tree')
  assert.equal(slotKind('grassTuft'), 'grass')
  assert.equal(slotKind('predator'), 'animal')
})

test('the shipped manifest lists every slot, all empty, so no file is ever requested', () => {
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as { slots: Record<string, unknown> }
  const { manifest, errors } = parseManifest(raw)
  assert.deepEqual(errors, [])
  assert.deepEqual(Object.keys(raw.slots).sort(), [...MODEL_SLOTS].sort())
  for (const slot of MODEL_SLOTS) assert.equal(manifest.slots[slot], null)
})

test('manifest: provenance is required; a bad entry is reported and its slot stays empty', () => {
  const { manifest, errors } = parseManifest({
    version: 1,
    slots: {
      spire: entry('spire.glb'),
      pole: { file: 'pole.glb', source: 'team-made', version: 1 }, // no author
      shrub: { file: 'shrub.glb', author: 'A', source: 'downloaded', version: 1 },
      slender: { file: '../secret.glb', author: 'A', source: 'team-made', version: 1 }, // not a plain file name
      fullCone: { file: 'https://example.com/x.glb', author: 'A', source: 'team-made', version: 1 },
      dragon: entry('dragon.glb'), // unknown slot
      herbivore: null,
    },
  })
  assert.deepEqual(manifest.slots.spire, { file: 'spire.glb', author: 'Test Author', source: 'team-made', version: 1 })
  for (const slot of ['pole', 'shrub', 'slender', 'fullCone', 'herbivore'] as const) assert.equal(manifest.slots[slot], null)
  assert.equal(errors.length, 5)
  assert.ok(errors.some((e) => e.includes('"pole"') && e.includes('author')))
  assert.ok(errors.some((e) => e.includes('"shrub"') && e.includes('team-made')))
  assert.ok(errors.some((e) => e.includes('dragon')))
  // Junk never throws.
  for (const junk of [null, 5, 'x', [], { slots: 3 }]) assert.deepEqual(parseManifest(junk).manifest.slots, EMPTY_MANIFEST.slots)
})

const ok: ModelSummary = { bytes: 4000, meshes: 2, triangles: 40, missingAttributes: [], hasSkin: false, hasAnimation: false, min: [-0.4, 0, -0.4], max: [0.4, 1.3, 0.4] }

test('validateModel: budgets, size, origin at the base, no skins or clips; each rejection says why', () => {
  assert.equal(validateModel('spire', ok), null)
  assert.match(validateModel('spire', { ...ok, triangles: 74 })!, /74 triangles > 60/)
  assert.equal(validateModel('spire', { ...ok, triangles: 60 }), null, 'the budget itself is allowed')
  assert.match(validateModel('grassTuft', { ...ok, triangles: 7, max: [0.05, 0.1, 0.05] })!, /7 triangles > 6/)
  assert.equal(validateModel('herbivore', { ...ok, triangles: 200, min: [-0.25, 0, -0.1], max: [0.25, 0.5, 0.1] }), null)
  assert.match(validateModel('herbivore', { ...ok, triangles: 201, min: [-0.25, 0, -0.1], max: [0.25, 0.5, 0.1] })!, /201 triangles > 200/)
  assert.match(validateModel('spire', { ...ok, bytes: MAX_FILE_BYTES + 1 })!, /KB > 100 KB/)
  assert.match(validateModel('spire', { ...ok, meshes: 0 })!, /no mesh/)
  assert.match(validateModel('spire', { ...ok, missingAttributes: ['position'] })!, /missing attribute position/)
  assert.match(validateModel('herbivore', { ...ok, hasSkin: true })!, /skin/)
  assert.match(validateModel('herbivore', { ...ok, hasAnimation: true })!, /animation/)
  // Origin at the base: the lowest point must be at about Y = 0.
  assert.match(validateModel('spire', { ...ok, min: [-0.4, -0.6, -0.4], max: [0.4, 0.7, 0.4] })!, /lowest point/)
  assert.match(validateModel('spire', { ...ok, min: [-0.4, 0.5, -0.4], max: [0.4, 1.8, 0.4] })!, /lowest point/)
  // Plausible size: a tree is about 1-1.4 units, a shrub about 0.3, an animal about 0.5 long.
  assert.match(validateModel('spire', { ...ok, max: [0.4, 30, 0.4] })!, /units tall/, 'exported in meters by mistake')
  assert.match(validateModel('shrub', ok)!, /units tall/, 'a tree in the shrub slot')
  assert.equal(validateModel('shrub', { ...ok, max: [0.3, 0.3, 0.3] }), null)
  assert.match(validateModel('predator', { ...ok, min: [-1.5, 0, -0.1], max: [1.5, 0.4, 0.1] })!, /units long/)
  assert.ok(BUDGETS.tree.maxTriangles === 60 && BUDGETS.grass.maxTriangles === 6 && BUDGETS.animal.maxTriangles === 200)
})

test('total size: the set stays under 1 MB', () => {
  const sizes = MODEL_SLOTS.map((slot) => ({ slot, bytes: 150 * 1024 }))
  const { kept, over } = withinTotalBudget(sizes)
  assert.equal(kept.length, 6)
  assert.equal(over.length, 4)
})

test('loader: bakes, flattens, masks crown and trunk, takes colors, merges into one geometry', async () => {
  const warnings: string[] = []
  const set = await loadModelSet(folder({ 'manifest.json': manifestOf({ spire: entry('spire.glb') }), 'spire.glb': tree() }), (w) => warnings.push(w))
  assert.deepEqual(warnings, [])
  assert.deepEqual(set.report.custom, ['spire'])
  const g = set.geometries.spire!
  assert.equal(g.index, null, 'non-indexed')
  assert.equal(g.getAttribute('position').count, (8 + 3) * 3, 'one merged geometry')
  assert.deepEqual(Object.keys(g.attributes).sort(), ['color', 'normal', 'position', 'tintMask'], 'one attribute set')
  const mask = g.getAttribute('tintMask')
  const color = g.getAttribute('color')
  // The crown (first 24 vertices) takes the tint; the trunk does not and keeps its material color.
  for (let i = 0; i < 24; i++) assert.equal(mask.getX(i), 1)
  for (let i = 24; i < 33; i++) assert.equal(mask.getX(i), 0)
  assert.ok(Math.abs(color.getX(0) - 0.85) < 1e-6, 'vertex color')
  assert.ok(Math.abs(color.getX(30) - 0.3) < 1e-6 && Math.abs(color.getZ(30) - 0.1) < 1e-6, 'material color where there are no vertex colors')
  g.computeBoundingBox()
  assert.ok(Math.abs(g.boundingBox!.min.y) < 1e-6 && Math.abs(g.boundingBox!.max.y - 1.2) < 1e-6)
  assert.equal(set.summaries.spire!.triangles, 11)
})

test('loader: an unapplied node transform is baked into the vertices', async () => {
  const glb = makeGlb([{ positions: fan(6, 1, 0.5, -3), material: 'crown', translation: [0, 3, 0] }])
  const set = await loadModelSet(folder({ 'manifest.json': manifestOf({ pole: entry('pole.glb') }), 'pole.glb': glb }), () => undefined)
  assert.deepEqual(set.report.custom, ['pole'], 'the mesh sits at Y = -3 in the file but its node lifts it to 0')
  set.geometries.pole!.computeBoundingBox()
  assert.ok(Math.abs(set.geometries.pole!.boundingBox!.min.y) < 1e-6)
})

test('loader: a failed slot keeps its default; each failure is one warning naming the file', async () => {
  const warnings: string[] = []
  const set = await loadModelSet(
    folder({
      'manifest.json': manifestOf({
        spire: entry('spire.glb'), // fine
        pole: entry('pole.glb'), // missing file (404)
        broadPine: entry('broadPine.glb'), // not a glb
        fullCone: entry('fullCone.glb'), // over the triangle budget
        shrub: entry('shrub.glb'), // origin not at the base
        herbivore: entry('herbivore.glb'), // has an animation clip
      }),
      'spire.glb': tree(),
      'broadPine.glb': new TextEncoder().encode('this is not a model').buffer as ArrayBuffer,
      'fullCone.glb': tree(72),
      'shrub.glb': makeGlb([{ positions: fan(6, 0.3, 0.4, 0.5), material: 'crown' }]),
      'herbivore.glb': makeGlb([{ positions: fan(8, 0.4, 0.5), material: 'body' }], { animation: true }),
    }),
    (w) => warnings.push(w),
  )
  assert.deepEqual(set.report.custom, ['spire'])
  assert.deepEqual(Object.keys(set.geometries), ['spire'])
  assert.deepEqual(set.report.rejected.map((r) => r.slot), ['pole', 'broadPine', 'fullCone', 'shrub', 'herbivore'])
  assert.equal(warnings.length, 5, 'one warning per failure')
  for (const r of set.report.rejected) assert.ok(warnings.some((w) => w.includes(r.file) && w.includes(r.reason)), r.file)
  const why = Object.fromEntries(set.report.rejected.map((r) => [r.slot, r.reason]))
  assert.match(why.pole, /404/)
  assert.match(why.broadPine, /could not be loaded/)
  assert.match(why.fullCone, /75 triangles > 60/)
  assert.match(why.shrub, /lowest point/)
  assert.match(why.herbivore, /animation/)
})

test('loader: no manifest, or a broken one, means the built-in shapes and one warning; it never throws', async () => {
  const w1: string[] = []
  const none = await loadModelSet(folder({}), (w) => w1.push(w))
  assert.deepEqual(none.report.custom, [])
  assert.equal(w1.length, 1)
  const w2: string[] = []
  const broken = await loadModelSet(folder({ 'manifest.json': new TextEncoder().encode('{ nope').buffer as ArrayBuffer }), (w) => w2.push(w))
  assert.deepEqual(broken.geometries, {})
  assert.equal(w2.length, 1)
  // The shipped manifest: nothing to load, nothing to warn about.
  const w3: string[] = []
  const bytes = readFileSync(MANIFEST_PATH) // a Buffer may share its ArrayBuffer: copy the file's own bytes
  const shipped = await loadModelSet(folder({ 'manifest.json': bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer }), (w) => w3.push(w))
  assert.deepEqual(w3, [])
  assert.equal(modelsLine(shipped.report), 'models: 0/10 custom, 10 default')
})

test('the P readout models line', () => {
  assert.equal(
    modelsLine({ custom: ['spire', 'pole', 'broadPine', 'roundCrown', 'slender', 'shrub', 'herbivore'], rejected: [{ slot: 'fullCone', file: 'fullCone.glb', reason: '74 triangles > 60' }], errors: [] }),
    'models: 7/10 custom, 3 default; fullCone.glb rejected: 74 triangles > 60',
  )
})

test('low trust still works with a custom shape: the crown carries tintMask, so the grey tint reaches it', async () => {
  const set = await loadModelSet(folder({ 'manifest.json': manifestOf({ roundCrown: entry('roundCrown.glb') }), 'roundCrown.glb': tree() }), () => undefined)
  const mask = set.geometries.roundCrown!.getAttribute('tintMask')
  let crown = 0
  for (let i = 0; i < mask.count; i++) crown += mask.getX(i)
  assert.equal(crown, 24, 'every crown vertex is tinted')
  // The tint a low-trust plant gets is grey; a trusted one keeps its class color.
  const trusted = plantTint(3, false, 0.5)
  const low = plantTint(3, true, 0.5)
  assert.ok(saturation(low) < saturation(trusted) * 0.4, 'low trust is close to grey')
  assert.ok(luminance(low) > 0)
  assert.ok(OOD_DENSITY < 1, 'and sparse: placement drops plants before any shape is drawn')
  // A model whose crown material is not named crown* would not be tinted: the loader marks it 0.
  const untinted = await loadModelSet(folder({ 'manifest.json': manifestOf({ spire: entry('s.glb') }), 's.glb': makeGlb([{ positions: fan(6, 1.2), material: 'leaves' }]) }), () => undefined)
  const m2 = untinted.geometries.spire!.getAttribute('tintMask')
  for (let i = 0; i < m2.count; i++) assert.equal(m2.getX(i), 0)
})

test('animals: _LEGMASK becomes legMask, and the built-in shapes mark their legs', async () => {
  const legs = new Array(24).fill(0).map((_, i) => (i < 12 ? 0 : i % 2 ? 1 : -1))
  const set = await loadModelSet(folder({ 'manifest.json': manifestOf({ herbivore: entry('h.glb') }), 'h.glb': makeGlb([{ positions: fan(8, 0.4, 0.5), material: 'body', legMask: legs }]) }), () => undefined)
  const g = set.geometries.herbivore!
  assert.deepEqual(Object.keys(g.attributes).sort(), ['color', 'legMask', 'normal', 'position'])
  assert.deepEqual(Array.from(g.getAttribute('legMask').array as Float32Array), legs)

  for (const [geo, hip] of [
    [herbivoreGeometry(), 0.22],
    [predatorGeometry(), 0.15],
  ] as const) {
    const leg = geo.getAttribute('legMask')
    let plus = 0
    let minus = 0
    for (let i = 0; i < leg.count; i++) {
      if (leg.getX(i) > 0) plus++
      if (leg.getX(i) < 0) minus++
    }
    assert.ok(plus > 0 && plus === minus, 'two legs swing each way')
    assert.ok(Math.abs(hipHeight(geo) - hip) < 1e-6)
    assert.ok(geo.getAttribute('color'), 'vertex colors: a custom model can bring its own')
    geo.computeBoundingBox()
    assert.ok(Math.abs(geo.boundingBox!.min.y) < 1e-6, 'origin at the base')
    assert.ok(geo.boundingBox!.max.x > Math.abs(geo.boundingBox!.min.x) - 0.2, 'the head is on the +X side')
  }
})

test('animal facing: a model that faces +X is turned toward the direction of travel', () => {
  // A tiny asymmetric mesh: its nose is the point at +X.
  const nose = new THREE.Vector3(1, 0, 0)
  const origin = new THREE.Vector3(0, 0, 0)
  const m = new THREE.Matrix4()
  // Grid coordinates: +x is east (+X), +y is south (+Z). Heading is atan2(dy, dx).
  const cases: [string, number, number, [number, number]][] = [
    ['east', 1, 0, [1, 0]],
    ['south', 0, 1, [0, 1]],
    ['west', -1, 0, [-1, 0]],
    ['north', 0, -1, [0, -1]],
    ['south-east', 1, 1, [Math.SQRT1_2, Math.SQRT1_2]],
  ]
  for (const [name, dx, dy, [wx, wz]] of cases) {
    animalMatrix(m, 10, 2, -4, Math.atan2(dy, dx), 1)
    const dir = nose.clone().applyMatrix4(m).sub(origin.clone().applyMatrix4(m))
    assert.ok(Math.abs(dir.x - wx) < 1e-6 && Math.abs(dir.z - wz) < 1e-6 && Math.abs(dir.y) < 1e-6, `${name}: nose points (${dir.x.toFixed(2)}, ${dir.z.toFixed(2)})`)
  }
  // It stands where it was put, and the scale is uniform.
  animalMatrix(m, 10, 2, -4, 0.7, 2.4)
  assert.deepEqual(origin.clone().applyMatrix4(m).toArray(), [10, 2, -4])
  assert.ok(Math.abs(nose.clone().applyMatrix4(m).distanceTo(new THREE.Vector3(10, 2, -4)) - 2.4) < 1e-6)
})
