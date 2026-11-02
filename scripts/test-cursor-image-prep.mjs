// Cursor vision image prep must work in the runtime the Host actually uses (Node, via sharp)
// as well as under Bun. Run with `node --import tsx` and with `bun`.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const {
  CURSOR_VISION_MAX_EDGE,
  CURSOR_VISION_SOFT_MAX_BYTES,
  prepareCursorImageForWire,
  sharpImageCodec,
  sniffCursorImageDimensions,
} = await import('../packages/provider-bridge/src/adapters/cursor/images.ts')

const sharp = createRequire(new URL('../packages/provider-bridge/package.json', import.meta.url))('sharp')
const runtime = typeof Bun === 'undefined' ? 'node' : 'bun'

const rgba = (width, height, fill) => {
  const pixels = Buffer.alloc(width * height * 4)
  for (let index = 0; index < width * height; index += 1) fill(pixels, index * 4, index % width, Math.floor(index / width))
  return { raw: { width, height, channels: 4 } , pixels }
}
const encode = async ({ raw, pixels }, format) => new Uint8Array(await sharp(pixels, { raw })[format]().toBuffer())

// A real screenshot-sized PNG with detail, well above the 100 KiB soft cap.
const noisy = rgba(3000, 1500, (pixels, offset, x, y) => {
  pixels[offset] = (x * 7 + y * 13) % 256
  pixels[offset + 1] = (x * y) % 256
  pixels[offset + 2] = (x ^ y) % 256
  pixels[offset + 3] = 255
})
const largePng = await encode(noisy, 'png')
assert.ok(largePng.byteLength > CURSOR_VISION_SOFT_MAX_BYTES)
const large = await prepareCursorImageForWire({ data: largePng, mimeType: 'image/png' })
assert.equal(large.status, 'ready', `${runtime}: a large PNG is shrunk instead of omitted`)
assert.equal(large.image.mimeType, 'image/jpeg')
assert.ok(large.image.data.byteLength <= CURSOR_VISION_SOFT_MAX_BYTES, `${runtime}: output fits the soft cap`)
const largeSize = sniffCursorImageDimensions(large.image.data)
assert.ok(Math.max(largeSize.width, largeSize.height) <= CURSOR_VISION_MAX_EDGE, `${runtime}: longest edge is capped`)
assert.ok(Math.abs(largeSize.width / largeSize.height - 2) < 0.02, `${runtime}: aspect ratio is kept`)

const tinyPng = await encode(rgba(4, 4, (pixels, offset) => pixels.fill(200, offset, offset + 4)), 'png')
const tiny = await prepareCursorImageForWire({ data: tinyPng, mimeType: 'image/png' })
assert.equal(tiny.status, 'ready')
assert.equal(tiny.image.mimeType, 'image/jpeg')

const smallJpeg = await encode(rgba(64, 64, (pixels, offset, x) => { pixels.fill(x * 4, offset, offset + 3); pixels[offset + 3] = 255 }), 'jpeg')
const passthrough = await prepareCursorImageForWire({ data: smallJpeg, mimeType: 'image/jpeg' })
assert.equal(passthrough.status, 'ready')
assert.equal(passthrough.image.data, smallJpeg, `${runtime}: a valid small JPEG is sent unchanged`)

// Corrupt bytes fail the decode pass and are never sent.
const truncated = largePng.slice(0, Math.floor(largePng.byteLength / 3))
assert.equal((await prepareCursorImageForWire({ data: truncated, mimeType: 'image/png' })).status, 'omitted',
  `${runtime}: a truncated PNG is omitted`)

// A header that claims a huge canvas is rejected before any decode.
const bomb = new Uint8Array(tinyPng)
new DataView(bomb.buffer).setUint32(16, 20_000)
new DataView(bomb.buffer).setUint32(20, 20_000)
let decodeCalls = 0
const countingCodec = { decode: async () => { decodeCalls += 1; return {} }, encodeJpeg: async () => new Uint8Array() }
assert.equal((await prepareCursorImageForWire({ data: bomb, mimeType: 'image/png' }, undefined, { codec: countingCodec })).status, 'omitted')
assert.equal(decodeCalls, 0, 'decode bombs are rejected from the header alone')

// Without any decoder the image is omitted rather than sent unvalidated.
assert.equal((await prepareCursorImageForWire({ data: tinyPng, mimeType: 'image/png' }, undefined, { codec: null })).status, 'omitted')

// The Node codec flattens transparency onto white (JPEG has no alpha).
const transparentPng = await encode(rgba(8, 8, (pixels, offset) => pixels.fill(0, offset, offset + 4)), 'png')
const flattened = await sharpImageCodec(sharp).encodeJpeg(transparentPng, null, 90)
const { data: flatPixels } = await sharp(flattened).raw().toBuffer({ resolveWithObject: true })
assert.ok(flatPixels[0] > 240 && flatPixels[1] > 240 && flatPixels[2] > 240, 'transparent pixels become white, not black')

console.log(`cursor image prep (${runtime}): large PNG → ${large.image.data.byteLength} B JPEG ${largeSize.width}x${largeSize.height}; passthrough, corrupt, bomb and no-codec cases passed`)
