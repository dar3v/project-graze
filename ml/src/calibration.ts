/** Temperature scaling (D5): one scalar T minimizing log loss on a holdout. */
import { logLoss } from './metrics.ts'
import { applyTemperature } from './models/types.ts'

/** Golden-section search over log T in [log 0.05, log 20]. */
export function fitTemperature(probs: Float32Array, y: Uint8Array, k: number): number {
  const f = (logT: number) => logLoss(applyTemperature(probs, k, Math.exp(logT)), y, k)
  let a = Math.log(0.05)
  let b = Math.log(20)
  const g = (Math.sqrt(5) - 1) / 2
  let c = b - g * (b - a)
  let d = a + g * (b - a)
  let fc = f(c)
  let fd = f(d)
  for (let i = 0; i < 40; i++) {
    if (fc < fd) {
      b = d
      d = c
      fd = fc
      c = b - g * (b - a)
      fc = f(c)
    } else {
      a = c
      c = d
      fc = fd
      d = a + g * (b - a)
      fd = f(d)
    }
  }
  return Math.exp((a + b) / 2)
}
