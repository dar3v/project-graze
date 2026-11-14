import { N_COLUMNS, type Dataset } from '../src/data/covertype.ts'

/** Synthetic Covertype-shaped dataset: classes and areas cycle, elevation encodes the class. */
export function syntheticDataset(n: number): Dataset {
  const x = new Int16Array(n * N_COLUMNS)
  const y = new Uint8Array(n)
  const area = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    y[i] = i % 7
    area[i] = Math.floor(i / 7) % 4
    x[i * N_COLUMNS] = 2000 + 200 * y[i] + (i % 13)
    x[i * N_COLUMNS + 10 + area[i]] = 1
  }
  return { n, x, y, area }
}
