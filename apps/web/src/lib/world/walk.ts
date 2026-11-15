/**
 * Walk mode physics (D8). Three-free and pure, so it is unit-tested: the
 * renderer feeds it key/joystick input and draws the camera where it says.
 *
 * Frame: world coordinates from ./coords.ts. One world unit is one cell
 * (30 m), +X is east, -Z is north, and the heightmap is the same row-major
 * contract array the orbit view and the model read (docs/feature-contract.md).
 *
 * Scale: walk mode is a diorama, not a human-scale hike. A 3.84 km map at
 * true walking speed would take 45 minutes to cross and one 30 m cell would
 * fill the screen, so the walker is a giant: the eye is 0.5 cells above the
 * ground and a step covers several cells a second. The constants below are in
 * world units (cells) and say what they are in meters.
 *
 * Water (chosen behaviour): water up to WADE_DEPTH_M deep can be waded and
 * slows the walker to WADE_SPEED_FACTOR. Deeper water is blocked; the water
 * surface draws a pale "deep line" at exactly that depth, so the boundary is
 * visible before you reach it. A walker who ends up in deep water anyway (the
 * water slider moved, or the ground was lowered under them) can always move
 * toward shallower water.
 */

import { worldToCellF } from './coords.ts'
import { sampleHeight } from './terrain.ts'

/** Eye height above the ground, world units (0.5 cells; 7.5 m of heightmap at the 2x vertical exaggeration). */
export const EYE_HEIGHT = 0.5
/** Walking speed, cells per second (90 m/s: the map is crossed in about 40 s). */
export const WALK_SPEED = 3
/** Running speed (Shift), cells per second. */
export const RUN_SPEED = 7
/** Steepest TRUE terrain slope (degrees, before vertical exaggeration) the walker can climb. Going down is never blocked. */
export const SLOPE_LIMIT = 45
/** Water deeper than this many meters is blocked; shallower water is waded. */
export const WADE_DEPTH_M = 6
/** Speed multiplier while wading. */
export const WADE_SPEED_FACTOR = 0.45
/** The walker stays this many cells inside the outermost cell centers (the map edge). */
export const EDGE_MARGIN = 0.25

/** Mouse look settings (D15). The defaults reproduce the behaviour before they existed. */
export interface LookSettings {
  /** Multiplier on mouse and drag look speed. 1 is the default. */
  readonly sensitivity: number
  /** Moving the mouse up looks down. */
  readonly invertY: boolean
  /** Vertical field of view in walk mode, degrees. */
  readonly fov: number
}

/** Field of view in walk mode: the default and the range the setting allows. */
export const WALK_FOV_DEFAULT = 68
/**
 * 50 is a narrow, calm view that still shows the ground ahead; 100 is as wide
 * as the low-poly trees stay undistorted at the screen edge. Below 50 the
 * diorama reads as a telephoto shot; above 100 the horizon bends.
 */
export const WALK_FOV_RANGE = { min: 50, max: 100 } as const
/** Look sensitivity range the setting allows. */
export const LOOK_SENSITIVITY_RANGE = { min: 0.25, max: 3 } as const
export const DEFAULT_LOOK: LookSettings = { sensitivity: 1, invertY: false, fov: WALK_FOV_DEFAULT }

/**
 * Why walk mode was left (D15). Every path does the same thing; the reason
 * is for the page.
 *  - `button`: the "Exit walk mode" button in the HUD;
 *  - `escape`: Esc, with or without the pointer locked;
 *  - `key`: V, or the page's own view switch;
 *  - `lock-lost`: the browser took the pointer lock away (the window lost
 *    focus, another app came forward).
 */
export type ExitReason = 'button' | 'escape' | 'key' | 'lock-lost'

/** What the model says about one cell, as the walk HUD and the exit panel show it. */
export interface CellReading {
  readonly x: number
  readonly y: number
  /** Under the water level: no prediction is shown for water. */
  readonly water: boolean
  /** Predicted class index and name, or null (water, or no cover map yet). */
  readonly classIndex: number | null
  readonly className: string | null
  /** 0..1, or null when there is none. */
  readonly confidence: number | null
  /** The cell is unlike the training data (out of distribution). */
  readonly lowTrust: boolean
}

/** What `onexit` hands the page: why the walk ended, and the cell last stood on. */
export interface WalkExit {
  readonly reason: ExitReason
  readonly cell: CellReading
}

export interface CellArrays {
  readonly heightmap: Float32Array
  readonly size: number
  readonly waterLevelM: number
  readonly classes: readonly string[]
  readonly cover: Uint8Array | null
  readonly confidence: Float32Array | null
  readonly ood: Uint8Array | null
}

/** Read one cell from the live arrays. Arrays of the wrong length (a map being replaced) read as "no prediction". */
export function readCell(x: number, y: number, a: CellArrays): CellReading {
  const cx = Math.min(a.size - 1, Math.max(0, Math.round(x)))
  const cy = Math.min(a.size - 1, Math.max(0, Math.round(y)))
  const i = cy * a.size + cx
  const n = a.size * a.size
  const water = a.heightmap[i] < a.waterLevelM
  const has = !!a.cover && a.cover.length === n && !water
  const classIndex = has ? a.cover![i] : null
  return {
    x: cx,
    y: cy,
    water,
    classIndex,
    className: classIndex === null ? null : (a.classes[classIndex] ?? `Class ${classIndex}`),
    confidence: has && a.confidence && a.confidence.length === n ? a.confidence[i] : null,
    lowTrust: has && !!a.ood && a.ood.length === n && a.ood[i] === 1,
  }
}

export interface WalkTerrain {
  /** Contract heightmap: meters, row-major, `index = y * size + x`. */
  readonly heightmap: Float32Array
  readonly size: number
  readonly cellSizeM: number
  readonly waterLevelM: number
}

/**
 * Ground height in meters under the world point (x, z).
 *
 * The point is converted to fractional cell coordinates and the four
 * surrounding heightmap cells are blended bilinearly (`sampleHeight`, the
 * same function that places the animals). Interpolating, instead of taking
 * the nearest cell, keeps the walk smooth: the height changes continuously
 * as the walker crosses a cell, with no 30 m steps. At a cell center it
 * returns that cell's exact height; outside the grid it clamps to the edge.
 */
export function getGroundHeight(x: number, z: number, t: WalkTerrain): number {
  const c = worldToCellF(x, z, { size: t.size, cellSizeM: t.cellSizeM, baseM: 0 })
  return sampleHeight(t.heightmap, t.size, c.x, c.y)
}

/** Water depth in meters at a world point: positive under water, negative on dry land. */
export function waterDepth(x: number, z: number, t: WalkTerrain): number {
  return t.waterLevelM - getGroundHeight(x, z, t)
}

/** Largest |x| and |z| the walker may reach. */
export function walkBound(size: number): number {
  return (size - 1) / 2 - EDGE_MARGIN
}

export interface WalkInput {
  /** -1 (back) .. 1 (forward). Analog values (a joystick) are respected. */
  readonly forward: number
  /** -1 (left) .. 1 (right). */
  readonly strafe: number
  readonly run: boolean
  /** Camera yaw in radians (three.js convention: 0 looks down -Z, positive turns left). */
  readonly yaw: number
}

export type Blocked = 'none' | 'edge' | 'slope' | 'water'

export interface WalkStep {
  readonly x: number
  readonly z: number
  /** Ground height in meters under the new position. */
  readonly groundM: number
  /** Water depth in meters at the new position (<= 0 on dry land). */
  readonly depthM: number
  readonly wading: boolean
  /** What stopped (part of) this step, if anything. */
  readonly blocked: Blocked
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const MAX_GRADE = Math.tan((SLOPE_LIMIT * Math.PI) / 180)

function canMove(fromX: number, fromZ: number, toX: number, toZ: number, t: WalkTerrain): Blocked {
  const dist = Math.hypot(toX - fromX, toZ - fromZ)
  if (dist < 1e-9) return 'none'
  const g0 = getGroundHeight(fromX, fromZ, t)
  const g1 = getGroundHeight(toX, toZ, t)
  const d0 = t.waterLevelM - g0
  const d1 = t.waterLevelM - g1
  // Deep water is blocked, unless the walker is already deeper and is wading out.
  if (d1 > WADE_DEPTH_M && d1 >= d0) return 'water'
  // Uphill steeper than the limit is blocked (true slope: meters over meters).
  if ((g1 - g0) / (dist * t.cellSizeM) > MAX_GRADE) return 'slope'
  return 'none'
}

/**
 * Advance the walker by `dt` seconds. Movement is relative to the camera yaw.
 * The step slides along obstacles: if the full move is blocked, the X-only
 * and Z-only parts are tried, so walking into a cliff or a shoreline at an
 * angle follows it instead of stopping dead.
 */
export function stepWalk(x: number, z: number, input: WalkInput, dt: number, t: WalkTerrain): WalkStep {
  const bound = walkBound(t.size)
  let px = clamp(x, -bound, bound)
  let pz = clamp(z, -bound, bound)
  let blocked: Blocked = 'none'

  let f = clamp(input.forward, -1, 1)
  let s = clamp(input.strafe, -1, 1)
  const len = Math.hypot(f, s)
  if (len > 1) {
    f /= len
    s /= len
  }
  if (len > 1e-6 && dt > 0) {
    const wadingNow = waterDepth(px, pz, t) > 0
    const speed = (input.run ? RUN_SPEED : WALK_SPEED) * (wadingNow ? WADE_SPEED_FACTOR : 1)
    // Forward is (-sin yaw, -cos yaw); right is (cos yaw, -sin yaw).
    const sin = Math.sin(input.yaw)
    const cos = Math.cos(input.yaw)
    const dx = (-sin * f + cos * s) * speed * dt
    const dz = (-cos * f - sin * s) * speed * dt
    const wantX = px + dx
    const wantZ = pz + dz
    const tx = clamp(wantX, -bound, bound)
    const tz = clamp(wantZ, -bound, bound)
    if (tx !== wantX || tz !== wantZ) blocked = 'edge'

    const full = canMove(px, pz, tx, tz, t)
    if (full === 'none') {
      px = tx
      pz = tz
    } else {
      blocked = full
      // Slide: keep whichever single-axis move is allowed (larger one first).
      const order: [number, number][] = Math.abs(dx) >= Math.abs(dz) ? [[tx, pz], [px, tz]] : [[px, tz], [tx, pz]]
      for (const [nx, nz] of order) {
        if ((nx !== px || nz !== pz) && canMove(px, pz, nx, nz, t) === 'none') {
          px = nx
          pz = nz
          break
        }
      }
    }
  }

  const groundM = getGroundHeight(px, pz, t)
  const depthM = t.waterLevelM - groundM
  return { x: px, z: pz, groundM, depthM, wading: depthM > 0, blocked }
}

/**
 * Where to put the walker: the dry cell center nearest to the wanted world
 * point. Falls back to the shallowest cell if the whole map is under water.
 */
export function findSpawn(wantX: number, wantZ: number, t: WalkTerrain): { x: number; z: number } {
  const half = (t.size - 1) / 2
  let best = -1
  let bestD = Infinity
  let shallowest = 0
  for (let y = 1; y < t.size - 1; y++) {
    for (let x = 1; x < t.size - 1; x++) {
      const i = y * t.size + x
      if (t.heightmap[i] > t.heightmap[shallowest]) shallowest = i
      if (t.heightmap[i] < t.waterLevelM) continue
      const d = (x - half - wantX) ** 2 + (y - half - wantZ) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
  }
  const i = best >= 0 ? best : shallowest
  return { x: (i % t.size) - half, z: Math.floor(i / t.size) - half }
}

/**
 * Keep the walker where they were if that is still a place to stand, else
 * move them to the nearest dry cell (D15). Used after a re-seed, a terrain
 * edit under the walker, or a water-level change:
 *
 * - a point outside the map is pulled back inside the edge margin;
 * - a point on dry land, or in water shallow enough to wade, is kept;
 * - a point in water deeper than `WADE_DEPTH_M` moves to the nearest dry cell
 *   center (`findSpawn`), so the walker never starts in deep water.
 */
export function settleWalker(x: number, z: number, t: WalkTerrain): { x: number; z: number; moved: boolean } {
  const bound = walkBound(t.size)
  const cx = Number.isFinite(x) ? clamp(x, -bound, bound) : 0
  const cz = Number.isFinite(z) ? clamp(z, -bound, bound) : 0
  if (waterDepth(cx, cz, t) <= WADE_DEPTH_M) return { x: cx, z: cz, moved: cx !== x || cz !== z }
  const dry = findSpawn(cx, cz, t)
  return { x: clamp(dry.x, -bound, bound), z: clamp(dry.z, -bound, bound), moved: true }
}

/** Compass bearing in degrees (0 = north = -Z, 90 = east = +X) for a camera yaw. */
export function yawToBearing(yaw: number): number {
  const deg = (-yaw * 180) / Math.PI
  return ((deg % 360) + 360) % 360
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

/** 'N', 'NE', ... for a bearing in degrees. */
export function compassPoint(bearing: number): (typeof COMPASS)[number] {
  return COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]
}

/** The eye never dips closer than this to the water surface (world units). */
export const MIN_EYE_ABOVE_WATER = 0.08

/** Eye height in world units for a ground height and water surface given in world units. */
export function eyeY(groundY: number, waterY: number): number {
  return Math.max(groundY + EYE_HEIGHT, waterY + MIN_EYE_ABOVE_WATER)
}
