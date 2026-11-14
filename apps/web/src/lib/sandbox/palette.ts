// Muted, low-saturation colors for cover classes, assigned by class INDEX
// (names always come from model_card.json).
const CLASS_COLORS = ['#5d7568', '#6f7f5a', '#9a8f63', '#5f8189', '#a3a07a', '#7a6f5c', '#8d9196']

export function classColor(index: number): string {
  return CLASS_COLORS[index % CLASS_COLORS.length]
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export const WATER_RGB: [number, number, number] = [16, 27, 34]
export const HERBIVORE_COLOR = '#e3e5e8'
export const PREDATOR_COLOR = '#c4a27f'
