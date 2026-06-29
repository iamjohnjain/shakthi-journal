/**
 * Generates minimal placeholder PNG icons for the PWA manifest.
 * Run once: node create-icons.mjs
 *
 * Replace the output files with proper icons (e.g. via https://realfavicongenerator.net)
 * before publishing publicly.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const tb = Buffer.from(type, 'ascii')
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length)
  const crcInput = Buffer.concat([tb, data])
  const crcBuf = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(crcInput))
  return Buffer.concat([len, tb, data, crcBuf])
}

function solidPNG(size, r, g, b) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  const ihdr = Buffer.allocUnsafe(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8]  = 8  // bit depth
  ihdr[9]  = 2  // RGB color type
  ihdr[10] = 0  // deflate compression
  ihdr[11] = 0  // adaptive filter
  ihdr[12] = 0  // no interlace

  // Each row: filter byte 0 + RGB pixels
  const row = Buffer.allocUnsafe(1 + size * 3)
  row[0] = 0
  for (let x = 0; x < size; x++) {
    row[1 + x * 3] = r
    row[2 + x * 3] = g
    row[3 + x * 3] = b
  }
  const rows = Buffer.concat(Array.from({ length: size }, () => row))
  const idat = deflateSync(rows)

  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))])
}

// Very dark background (#0c0c0e) — matches app theme
const R = 0x0c, G = 0x0c, B = 0x0e

writeFileSync('public/icon-192.png', solidPNG(192, R, G, B))
writeFileSync('public/icon-512.png', solidPNG(512, R, G, B))
console.log('✓ public/icon-192.png (192×192)')
console.log('✓ public/icon-512.png (512×512)')
console.log('')
console.log('These are solid-color placeholder icons.')
console.log('Replace with real icons via https://realfavicongenerator.net')
