// ROLE-1 D6/D18: the built-in animal shapes and their facing.
import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as THREE from 'three'

import { animalMatrix, herbivoreGeometry, hipHeight, predatorGeometry } from '../src/lib/world/fauna.ts'

test('animals: the built-in shapes mark their legs, stand on their base and face +X', () => {
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
    assert.ok(geo.getAttribute('color'), 'vertex colors')
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
