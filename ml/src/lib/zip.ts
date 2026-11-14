/**
 * Minimal ZIP reader (stored + deflate entries) so `ml:fetch` needs no extra
 * dependency or system `unzip`. Reads the central directory, which is the
 * authoritative entry list.
 */
import { inflateRawSync } from 'node:zlib'

export function readZipEntry(zip: Buffer, name: string): Buffer {
  const EOCD = 0x06054b50
  let eocd = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === EOCD) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP file (no end-of-central-directory record).')
  const count = zip.readUInt16LE(eocd + 10)
  let p = zip.readUInt32LE(eocd + 16)
  const names: string[] = []
  for (let e = 0; e < count; e++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('Corrupt ZIP central directory.')
    const method = zip.readUInt16LE(p + 10)
    const compSize = zip.readUInt32LE(p + 20)
    const nameLen = zip.readUInt16LE(p + 28)
    const extraLen = zip.readUInt16LE(p + 30)
    const commentLen = zip.readUInt16LE(p + 32)
    const localOffset = zip.readUInt32LE(p + 42)
    const entryName = zip.toString('utf8', p + 46, p + 46 + nameLen)
    names.push(entryName)
    if (entryName === name) {
      const lNameLen = zip.readUInt16LE(localOffset + 26)
      const lExtraLen = zip.readUInt16LE(localOffset + 28)
      const start = localOffset + 30 + lNameLen + lExtraLen
      const data = zip.subarray(start, start + compSize)
      if (method === 0) return Buffer.from(data)
      if (method === 8) return inflateRawSync(data)
      throw new Error(`Unsupported ZIP compression method ${method} for ${name}.`)
    }
    p += 46 + nameLen + extraLen + commentLen
  }
  throw new Error(`${name} not found in ZIP (entries: ${names.join(', ')}).`)
}
