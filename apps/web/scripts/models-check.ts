/**
 * `pnpm models:check`: validate the custom models in apps/web/public/models/
 * without a browser (for CI). It runs the SAME loader and rules as the app
 * (src/lib/world/models.ts, modelRules.ts) and prints one row per slot.
 *
 * It fails (exit code 1) when:
 *  - manifest.json is missing, unreadable or has a bad entry, including a
 *    missing `author` or a `source` other than "team-made";
 *  - a listed model is rejected (missing file, parse error, over budget, bad
 *    size, a skin or an animation clip);
 *  - a listed file has no line in CREDITS.md;
 *  - a .glb file in the folder is not listed in the manifest.
 *
 * Usage: node --experimental-strip-types apps/web/scripts/models-check.ts [folder]
 */

import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { BUDGETS, MODEL_SLOTS, slotKind } from '../src/lib/world/modelRules.ts'
import { loadModelSet } from '../src/lib/world/models.ts'

const dir = resolve(process.argv[2] ?? fileURLToPath(new URL('../public/models/', import.meta.url)))

const read = async (file: string): Promise<ArrayBuffer> => {
  const b = await readFile(resolve(dir, file))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
}

const problems: string[] = []
const set = await loadModelSet(read, () => undefined)
problems.push(...set.report.errors)

let credits = ''
try {
  credits = await readFile(resolve(dir, 'CREDITS.md'), 'utf8')
} catch {
  problems.push('CREDITS.md is missing')
}

const rows: string[][] = [['slot', 'file', 'author', 'triangles', 'KB', 'height', 'length', 'result']]
const fmt = (v: number) => (Math.round(v * 100) / 100).toString()
const listed = new Set<string>()
for (const slot of MODEL_SLOTS) {
  const entry = set.manifest.slots[slot]
  const budget = BUDGETS[slotKind(slot)]
  if (!entry) {
    rows.push([slot, '-', '-', `- / ${budget.maxTriangles}`, '-', '-', '-', 'default (code-built)'])
    continue
  }
  listed.add(entry.file)
  const s = set.summaries[slot]
  const rejection = set.report.rejected.find((r) => r.slot === slot)
  if (rejection) problems.push(`${entry.file} rejected: ${rejection.reason}`)
  if (!credits.includes(entry.file)) problems.push(`${entry.file} has no line in CREDITS.md`)
  rows.push([
    slot,
    entry.file,
    entry.author,
    s ? `${s.triangles} / ${budget.maxTriangles}` : '?',
    s ? fmt(s.bytes / 1024) : '?',
    s ? fmt(s.max[1] - s.min[1]) : '?',
    s ? fmt(s.max[0] - s.min[0]) : '?',
    rejection ? `REJECTED: ${rejection.reason}` : 'ok',
  ])
}

try {
  for (const f of await readdir(dir)) if (f.toLowerCase().endsWith('.glb') && !listed.has(f)) problems.push(`${f} is in the folder but not in manifest.json`)
} catch {
  problems.push(`the folder ${dir} could not be read`)
}

const widths = rows[0].map((_, c) => Math.max(...rows.map((r) => r[c].length)))
console.log(`Models in ${dir}\n`)
rows.forEach((r, i) => {
  console.log(r.map((cell, c) => cell.padEnd(widths[c])).join('  '))
  if (i === 0) console.log(widths.map((w) => '-'.repeat(w)).join('  '))
})
console.log(`\n${set.report.custom.length}/${MODEL_SLOTS.length} custom, ${MODEL_SLOTS.length - set.report.custom.length} default.`)

if (problems.length > 0) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('All checks passed.')
