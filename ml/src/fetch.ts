/**
 * `pnpm ml:fetch`: download Covertype from UCI, verify its SHA-256, extract
 * covtype.data.gz + covtype.info into ml/data/, and build the parsed cache.
 * Safe to re-run: existing verified files are reused.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import { readZipEntry } from './lib/zip.ts'
import { DATA_DIR } from './data/paths.ts'
import {
  DATASET_URL,
  DATASET_ZIP_SHA256,
  GZ_PATH,
  INFO_PATH,
  ZIP_PATH,
  loadCovertype,
  sha256,
} from './data/covertype.ts'

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true })
  if (!existsSync(ZIP_PATH)) {
    console.log(`Downloading ${DATASET_URL} ...`)
    const res = await fetch(DATASET_URL)
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`)
    writeFileSync(ZIP_PATH, Buffer.from(await res.arrayBuffer()))
  }
  const zip = readFileSync(ZIP_PATH)
  const hash = sha256(zip)
  if (hash !== DATASET_ZIP_SHA256) {
    throw new Error(
      `covertype.zip SHA-256 is ${hash}, expected ${DATASET_ZIP_SHA256}. ` +
        'UCI may have repackaged the file. Inspect it, then update DATASET_ZIP_SHA256 in ml/src/data/covertype.ts.',
    )
  }
  console.log(`covertype.zip verified (sha256 ${hash.slice(0, 12)}...).`)
  if (!existsSync(GZ_PATH)) writeFileSync(GZ_PATH, readZipEntry(zip, 'covtype.data.gz'))
  if (!existsSync(INFO_PATH)) writeFileSync(INFO_PATH, readZipEntry(zip, 'covtype.info'))
  const t0 = performance.now()
  const d = loadCovertype()
  console.log(`Parsed ${d.n.toLocaleString('en-US')} rows in ${((performance.now() - t0) / 1000).toFixed(1)} s.`)
}

await main()
