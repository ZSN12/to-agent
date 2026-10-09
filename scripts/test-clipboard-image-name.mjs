#!/usr/bin/env node
import assert from 'node:assert/strict'
import path from 'node:path'
import {
  assertAttachmentInsideDir,
  sanitizeClipboardAttachmentFilename,
} from '../electron/backend/clipboard-attachment.mjs'

assert.equal(sanitizeClipboardAttachmentFilename('../../x', '.png').replace(/pasted-image-\d+\.png/, 'pasted-image-.png'), 'pasted-image-.png')
assert.equal(sanitizeClipboardAttachmentFilename('a/b.png', '.png'), 'b.png')
assert.match(sanitizeClipboardAttachmentFilename('shot.PNG', '.png'), /^shot\.PNG$/i)
assert.match(sanitizeClipboardAttachmentFilename(undefined, '.jpg'), /^pasted-image-\d+\.jpg$/)

const dir = path.join('/tmp', 'tw-attach-test')
const inside = path.join(dir, 'ok.png')
assert.throws(() => assertAttachmentInsideDir(dir, path.join(dir, '..', 'escape.png')))

console.log('test-clipboard-image-name: ok')
