/**
 * What Role 1's WorldView can do today. The app shows a control as working
 * only when its flag is true; otherwise the control is visible but disabled
 * with "needs the 3D world update". Role 1 flips a flag in the same change
 * that adds the matching WorldView prop (see docs/app-state.md, "WorldView
 * props the app will pass").
 */
export const WORLD_FEATURES = {
  /** ROLE-1 D8: `viewMode` prop, first-person walk mode. */
  walkMode: false,
  /** ROLE-1 D10: `timeOfDay` / `autoCycle` props. */
  timeOfDay: false,
  /** ROLE-1 D12: `quality` prop. */
  qualityPresets: false,
  /** `overlay` / `showOod` props (WorldView keeps its own overlay controls until then). */
  overlayProps: false,
  /** `reducedMotion` prop on WorldView (the page backdrop already takes it). */
  reducedMotion: false,
} as const

export type WorldFeature = keyof typeof WORLD_FEATURES

/** Shown under the world in every view mode and in the footer (ROLE-1 D11). */
export const PREDICTION_NOTICE = 'Predictions are for terrain-like inputs, not real ground truth.'
