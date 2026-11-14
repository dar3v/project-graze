/** The recipe for a generated world (no DOM, no Svelte; unit-tested). */

export interface WorldConfig {
  readonly seed: number
  /** Band center in the elevation range, 0..1 (Role 1's `center`). */
  readonly center: number
  /** Share of cells under water, 0..1. */
  readonly waterShare: number
  /** Generator relief, 0..1 (Role 1's default 0.2; see world/README.md). */
  readonly relief: number
  readonly roughness: number
  readonly valley: number
}

/**
 * Sandbox defaults. center 0.4: the 0.5 band predicts almost only Lodgepole
 * Pine. Relief, roughness and valley are Role 1's generator defaults.
 * Kept in step with ml/src/generatedTerrain.ts SANDBOX_WORLD (Role 3's OOD study).
 */
export const DEFAULT_WORLD: WorldConfig = { seed: 7, center: 0.4, waterShare: 0.12, relief: 0.2, roughness: 0.5, valley: 0.35 }

/**
 * Identity of the generated landscape. Water share is left out on purpose:
 * moving the water slider floods the same terrain, it does not make a new one.
 */
export function worldKeyOf(cfg: WorldConfig): string {
  return `s${cfg.seed}|c${cfg.center}|r${cfg.relief}|g${cfg.roughness}|v${cfg.valley}`
}
