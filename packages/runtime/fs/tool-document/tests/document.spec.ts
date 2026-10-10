import { afterEach, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@taskweaver/cordis'
import SystemPrompt from '@taskweaver/dsh-system-prompt'
import ToolRuntime from '@taskweaver/dsh-tools'
import LocalFileSystem from '@taskweaver/dsh-fs-local'
import type {} from '@taskweaver/dsh-spill'
import type {} from '@taskweaver/dsh-user-approval'
import { parseDocumentBytes } from '../src/parse.ts'
import { DocumentResultCache, documentCacheKey } from '../src/cache.ts'
import { DocumentWorkerPool } from '../src/worker-pool.ts'
import { parseXml } from '../src/xml.ts'
import { storeDocumentSnapshot } from '../src/documents.ts'
import { legacyOfficeTarget } from '../src/legacy-office.ts'
import { makeDocx, makeEncryptedDocx, makeEncryptedPdf, makeLegacyOle, makeLegacyXls, makePdf, makePptx, makeScannedPdf, makeWideXlsx, makeXlsx, makeZipBomb } from './fixtures.ts'
import type { DocumentOptions } from '../src/protocol.ts'

const options = (overrides: Partial<DocumentOptions> = {}): DocumentOptions => ({
  images: false,
  maxOutputBytes: 50 * 1024,
  maxPdfBytes: 100 * 1024 * 1024,
  maxOfficeBytes: 50 * 1024 * 1024,
  ...overrides,
})

describe('read_document parsers', () => {
  it('uses a shipped filesystem-tool export instead of an unpublished TypeScript source path', async () => {
    const packageEntry = await readFile(new URL('../lib/index.js', import.meta.url), 'utf8')
    expect(packageEntry).toContain('from "@taskweaver/dsh-tool-fs"')
    expect(packageEntry).not.toContain('@taskweaver/dsh-tool-fs/src/')
    const filesystemTools = await import('@taskweaver/dsh-tool-fs')
    expect(Object.keys(filesystemTools)).toContain('resolveRegularReadTarget')
    expect(typeof filesystemTools.resolveRegularReadTarget).toBe('function')
  })

  it('parses generated DOCX headings and tables by section', async () => {
    const data = makeDocx(
      '<w:p><w:pPr><w:pStyle w:val=\"Heading1\"/></w:pPr><w:r><w:t>Overview</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>First paragraph</w:t></w:r></w:p>' +
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Term</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
      '<w:p><w:pPr><w:pStyle w:val=\"Heading2\"/></w:pPr><w:r><w:t>Details</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Second paragraph</w:t></w:r></w:p>',
    )
    const outline = await parseDocumentBytes(data, options())
    expect(outline.truncated).toBe(true)
    expect(outline.outline).toEqual(['1. # Overview', '2. ## Details'])
    expect(outline.next).toBe('section=1')
    const section = await parseDocumentBytes(data, options({ section: '1' }))
    expect(section.content[0]?.text).toContain('| Term | Value |')
    expect(section.content[0]?.text).toContain('First paragraph')
    expect(section.content[0]?.text).not.toContain('Second paragraph')
  })

  it('omits tracked DOCX revisions and splits untitled long text into bounded sections', async () => {
    const revisions = makeDocx(
      '<w:p><w:r><w:t>Kept text</w:t></w:r><w:del><w:r><w:delText>Removed text</w:delText></w:r></w:del>' +
      '<w:ins><w:r><w:t>Inserted text</w:t></w:r></w:ins></w:p>',
    )
    const visible = await parseDocumentBytes(revisions, options({ section: '1' }))
    expect(visible.content[0]?.text).toContain('Kept text')
    expect(visible.content[0]?.text).not.toContain('Removed text')
    expect(visible.content[0]?.text).not.toContain('Inserted text')

    const longText = makeDocx('<w:p><w:r><w:t>' + 'A'.repeat(25_000) + '</w:t></w:r></w:p>')
    const outline = await parseDocumentBytes(longText, options())
    expect(outline.outline).toEqual(['1. # Document part 1', '2. # Document part 2'])
    expect(outline.next).toBe('section=1')
    const lastSection = await parseDocumentBytes(longText, options({ section: '2' }))
    expect(lastSection.content[0]?.text).toContain('Document part 2')
  })

  it('reads PPTX title, ordered slide text, table, notes, and bounded image metadata', async () => {
    const data = makePptx()
    const result = await parseDocumentBytes(data, options({ pages: '1', images: true }))
    const content = result.content[0]?.text ?? ''
    expect(result.outline).toBeUndefined()
    expect(content).toContain('## Slide 1: Agenda')
    expect(content).toContain('First point')
    expect(content).toContain('| Metric | Value |')
    expect(content).toContain('Notes: Speaker note')
    expect(content).toContain('pixel.png 1×1 px')
    expect(result.imageCandidates).toHaveLength(1)
    expect(result.imageCandidates?.[0]?.mediaType).toBe('image/png')
  })

  it('extracts DOCX image relationships only for the selected section', async () => {
    const data = makeDocx(
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Cover</w:t></w:r></w:p>' +
      '<w:p><w:r><w:drawing><a:blip r:embed="rIdImage"/></w:drawing></w:r></w:p>' +
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Details</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Body</w:t></w:r></w:p>',
      true,
    )
    const result = await parseDocumentBytes(data, options({ section: '1', images: true }))
    expect(result.content[0]?.text).toContain('pixel.png 1×1 px')
    expect(result.imageCandidates).toHaveLength(1)
    expect(result.imageCandidates?.[0]?.name).toBe('docx/pixel.png')
  })

  it('returns a workbook outline, reads formulas/dates and gives the next bounded range', async () => {
    const data = makeXlsx(250, true)
    const outline = await parseDocumentBytes(data, options())
    expect(outline.outline?.[0]).toContain('Data — A1:C250')
    expect(outline.next).toBe('sheet=1')
    const result = await parseDocumentBytes(data, options({ sheet: 'Data', range: 'A1:C200' }))
    expect(result.content[0]?.text).toContain('B (B1)')
    expect(result.content[0]?.text).toContain('4 (=SUM(A1:A2))')
    expect(result.content[0]?.text).toContain('C (C1)')
    expect(result.content[0]?.text).toContain('2023-03-15')
    expect(result.next).toBe('sheet=1&range=A201:C250')
    await expect(parseDocumentBytes(data, options({ sheet: '1', range: 'A1:AZ200' }))).rejects.toThrow(/limited to 200 rows × 50 columns/u)
  })

  it('returns an outline before reading a single worksheet that exceeds the default window', async () => {
    const result = await parseDocumentBytes(makeXlsx(250), options())
    expect(result.outline?.[0]).toContain('Data — A1:C250')
    expect(result.next).toBe('sheet=1')
  })

  it('paginates wide worksheets across rows and then columns without skipping cells', async () => {
    const data = makeWideXlsx()
    const outline = await parseDocumentBytes(data, options())
    expect(outline.next).toBe('sheet=1')
    const firstRows = await parseDocumentBytes(data, options({ sheet: 'Wide' }))
    expect(firstRows.next).toBe('sheet=1&range=A201:AX250')
    const lastRows = await parseDocumentBytes(data, options({ sheet: 'Wide', range: 'A201:AX250' }))
    expect(lastRows.next).toBe('sheet=1&range=AY1:BH200')
    const nextColumns = await parseDocumentBytes(data, options({ sheet: 'Wide', range: 'AY1:BH200' }))
    expect(nextColumns.content[0]?.text).toContain('column 51')
    expect(nextColumns.next).toBe('sheet=1&range=AY201:BH250')
  })

  it.skipIf(!existsSync(new URL('./fixtures/documents/large-50k-60.xlsx', import.meta.url)))('streams a generated 50,000 × 60 workbook without building a worksheet DOM', async () => {
    const bytes = new Uint8Array(await readFile(new URL('./fixtures/documents/large-50k-60.xlsx', import.meta.url)))
    const pool = new DocumentWorkerPool({ size: 1, timeoutMs: 30_000, memoryMb: 512 })
    const result = await pool.run(bytes, options({ sheet: 'Data', range: 'A1:C2' }))
    const text = result.content[0]?.text ?? ''
    expect(text).toContain('dimensions: A1:BH50000')
    expect(text).toContain('formulas on sheet: 49999')
    expect(text).toContain('formulas in this range: 1')
    expect(text).toContain('186411512 (=SUM(A2:A2))')
    expect(result.next).toBe('sheet=1&range=A3:C202')
  })

  it('dispatches by file header and reads PDF pages in windows of at most 20', async () => {
    const data = makePdf(21)
    const outline = await parseDocumentBytes(data, options())
    expect(outline.outline).toHaveLength(21)
    expect(outline.next).toBe('pages=1-20')
    const page = await parseDocumentBytes(data, options({ pages: '20-21' }))
    expect(page.content[0]?.text).toContain('Page 20 searchable text')
    expect(page.content[0]?.text).toContain('Page 21 searchable text')
    await expect(parseDocumentBytes(data, options({ pages: '1-21' }))).rejects.toThrow(/at most 20/u)
  })

  it('rejects encrypted PDFs and encrypted OLE Office packages explicitly', async () => {
    await expect(parseDocumentBytes(makeEncryptedPdf(), options())).rejects.toThrow(/password-protected/u)
    const encryptedOle = new Uint8Array(Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.from('EncryptionInfo EncryptedPackage', 'ascii'),
    ]))
    await expect(parseDocumentBytes(encryptedOle, options())).rejects.toThrow(/encrypted/u)
  })

  it('renders scanned pages when Poppler is available and otherwise explains the fallback', async () => {
    const result = await parseDocumentBytes(makeScannedPdf(), options({ pages: '1', images: true }))
    expect(result.content[0]?.text).toContain('Scanned page')
    if (result.imageCandidates?.length) {
      expect(result.imageCandidates[0]?.mediaType).toBe('image/png')
      expect(result.content[0]?.text).toContain('attached as an image')
    } else {
      expect(result.content[0]?.text).toMatch(/Poppler|rendering is unavailable/u)
    }
  })

  it('persists parsed results under a hash-and-options key and rejects corrupt cache entries', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-document-cache-'))
    try {
      const data = makePptx()
      const config = options({ pages: '1', images: true })
      const parsed = await parseDocumentBytes(data, config)
      const key = documentCacheKey(data, config)
      expect(documentCacheKey(data, options({ pages: '1', images: false }))).not.toBe(key)
      const cache = new DocumentResultCache(directory)
      await cache.write(key, parsed)
      const cached = await cache.read(key)
      expect(cached).toEqual(parsed)
      expect(await cache.read('a'.repeat(64))).toBeUndefined()
      await writeFile(join(directory, key + '.json'), '{bad json')
      expect(await cache.read(key)).toBeUndefined()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('terminates an over-time worker while the Host event loop continues to respond', async () => {
    const pool = new DocumentWorkerPool({
      size: 1,
      timeoutMs: 25,
      workerURL: new URL('./fixtures/slow-worker.ts', import.meta.url),
    })
    let hostResponded = false
    const heartbeat = new Promise<void>(resolve => setTimeout(() => {
      hostResponded = true
      resolve()
    }, 5))
    const timedOut = expect(pool.run(new Uint8Array([1]), options())).rejects.toThrow(/25 ms time limit/u)
    await heartbeat
    await timedOut
    expect(hostResponded).toBe(true)
  })

  it('keeps outline responses within the configured UTF-8 byte ceiling', async () => {
    const result = await parseDocumentBytes(makePdf(21), options({ maxOutputBytes: 512 }))
    expect(Buffer.byteLength(result.content[0]?.text ?? '', 'utf8')).toBeLessThanOrEqual(512)
    expect(result.truncated).toBe(true)
  })

  it('rejects external entity declarations and suspicious ZIP expansion before extraction', async () => {
    expect(() => parseXml('<!DOCTYPE x [<!ENTITY e SYSTEM \"file:///etc/passwd\">]><x>&e;</x>')).toThrow(/DTD or entity/u)
    expect(parseXml('<x caption=\"1 > 0\"><y/></x>').children[0]?.attributes.caption).toBe('1 > 0')
    await expect(parseDocumentBytes(makeDocx('<!DOCTYPE w:document [<!ENTITY xxe SYSTEM \"file:///etc/passwd\">]><w:body>&xxe;</w:body>'), options())).rejects.toThrow(/DTD or entity/u)
    await expect(parseDocumentBytes(makeZipBomb(), options())).rejects.toThrow(/compression-ratio/u)
  })

  it('reports explicit errors for encrypted, legacy, and unsupported inputs', async () => {
    await expect(parseDocumentBytes(makeEncryptedDocx(), options())).rejects.toThrow(/Encrypted Office documents are not supported/u)
    const ole = makeLegacyXls()
    expect(Array.from(ole.subarray(0, 8))).toEqual([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
    await expect(parseDocumentBytes(ole, options())).rejects.toThrow(/legacy \.doc/u)
    await expect(parseDocumentBytes(makeLegacyOle('EncryptedPackage'), options())).rejects.toThrow(/Office document is encrypted/u)
    await expect(parseDocumentBytes(new TextEncoder().encode('plain text'), options())).rejects.toThrow(/Unsupported document type/u)
  })

  it('maps legacy Office formats to the planned modern conversion targets', () => {
    expect(legacyOfficeTarget('.doc')).toBe('docx')
    expect(legacyOfficeTarget('.ppt')).toBe('pdf')
    expect(legacyOfficeTarget('.xls')).toBe('xlsx')
  })

  it('stores legacy external attachments only with an explicit Office extension', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dsh-document-legacy-ref-'))
    try {
      const stored = await storeDocumentSnapshot(makeLegacyOle(), { directory, name: '/external/brief.doc', sessionId: 'legacy-session' })
      expect(stored).toMatchObject({ kind: 'doc', name: 'brief.doc', reference: '@doc:' + stored.sha256 })
      const workbook = await storeDocumentSnapshot(makeLegacyXls(), { directory, name: '/external/sample.xls', sessionId: 'legacy-session' })
      expect(workbook).toMatchObject({ kind: 'xls', name: 'sample.xls', reference: '@doc:' + workbook.sha256 })
      await expect(storeDocumentSnapshot(makeLegacyOle(), { directory, name: 'unknown.bin', sessionId: 'legacy-session' })).rejects.toThrow(/\.doc, \.ppt, or \.xls/u)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('asks the user before converting an OLE file and reads only the converter output from a private copy', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-tool-document-legacy-'))
    const converterPath = join(cwd, 'soffice.mjs')
    const converterMarker = join(cwd, 'invoked.txt')
    const converted = makeDocx('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Converted</w:t></w:r></w:p><w:p><w:r><w:t>Converted from a private source snapshot.</w:t></w:r></w:p>')
    const converter = '#!/usr/bin/env node\n'
      + 'import { copyFileSync, writeFileSync } from "node:fs";\n'
      + 'import { dirname, join } from "node:path";\n'
      + 'import { fileURLToPath } from "node:url";\n'
      + 'const args = process.argv.slice(2);\n'
      + 'const dir = dirname(fileURLToPath(import.meta.url));\n'
      + 'const target = args[args.indexOf("--convert-to") + 1];\n'
      + 'const output = args[args.indexOf("--outdir") + 1];\n'
      + 'const input = args.at(-1);\n'
      + 'writeFileSync(join(dir, "invoked.txt"), JSON.stringify({ args, input, target, output }));\n'
      + 'copyFileSync(join(dir, "converted." + target), join(output, "source." + target));\n'
    await writeFile(converterPath, converter, { mode: 0o700 })
    await chmod(converterPath, 0o700)
    await writeFile(join(cwd, 'converted.docx'), converted)
    await writeFile(join(cwd, 'legacy.doc'), makeLegacyOle())
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(LocalFileSystem, { cwd })
    const ToolDocument = await import('../src/index.ts')
    const approvalCalls: Array<{ toolName: string; reason?: string; callId?: string }> = []
    let decision: 'allowed-once' | 'rejected' = 'rejected'
    ctx.provide('approval', {
      async request(request: { toolName: string; reason?: string; callId?: string }) {
        approvalCalls.push(request)
        return decision
      },
    } as never)
    const fiber = await ctx.plugin(ToolDocument, { sofficePath: converterPath, cacheDirectory: join(cwd, 'cache') })
    const agent = { session: { header: { cwd } } } as never
    const call = (callId: string) => ctx.tools.execute({
      signal: new AbortController().signal,
      callId: callId as never,
      name: 'read_document',
      arguments: { path: 'legacy.doc', section: '1' },
      agent,
    })
    try {
      const rejected = await call('legacy-rejected')
      expect(rejected.error).toBeDefined()
      expect(rejected.content.map(block => block.type === 'text' ? block.text : '').join('')).toContain('rejected LibreOffice conversion')
      expect(approvalCalls).toHaveLength(1)
      expect(approvalCalls[0]).toMatchObject({ toolName: 'read_document', callId: 'legacy-rejected' })
      expect(approvalCalls[0]?.reason).toContain('private temporary copy')
      expect(existsSync(converterMarker)).toBe(false)

      decision = 'allowed-once'
      const accepted = await call('legacy-allowed')
      expect(accepted.error).toBeUndefined()
      const acceptedText = accepted.content.map(block => block.type === 'text' ? block.text : '').join('')
      expect(acceptedText).toContain('Converted from a private source snapshot.')
      const invocation = JSON.parse(await readFile(converterMarker, 'utf8')) as { args: string[]; input: string; output: string }
      expect(invocation.args).toContain('--headless')
      expect(invocation.args).toContain('--norestore')
      expect(invocation.args.some(argument => argument.startsWith('-env:UserInstallation=file://'))).toBe(true)
      expect(invocation.input).toMatch(/taskweaver-office-convert/u)
      expect(invocation.input).not.toBe(join(cwd, 'legacy.doc'))
      expect(invocation.output).toMatch(/taskweaver-office-convert/u)

      const cached = await call('legacy-cached')
      expect(cached.error).toBeUndefined()
      expect(approvalCalls).toHaveLength(2)
    } finally {
      await fiber.dispose()
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('keeps tool text within readMaxBytes and saves oversized segments through spillStore', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-tool-document-spill-'))
    const documentText = 'Long document segment. ' + 'A'.repeat(1_200)
    await writeFile(join(cwd, 'long.docx'), makeDocx(
      '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Long document</w:t></w:r></w:p>'
        + '<w:p><w:r><w:t>' + documentText + '</w:t></w:r></w:p>',
    ))
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(LocalFileSystem, { cwd })
    const saved: Array<{ content: string; owner: { sessionId: string }; source: { toolName: string; callId: string; label: string } }> = []
    ctx.provide('spillStore', {
      async saveText(input: typeof saved[number]) {
        saved.push(input)
        return { locator: 'spill://documents/long.txt', bytes: Buffer.byteLength(input.content), retrievalHint: 'Read the saved document segment with the spill retrieval tool.' }
      },
    } as never)
    const ToolDocument = await import('../src/index.ts')
    const fiber = await ctx.plugin(ToolDocument, {
      readMaxBytes: 512,
      maxSegmentBytes: 4096,
      cacheDirectory: join(cwd, 'cache'),
    })
    try {
      const response = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: 'document-spill-call' as never,
        name: 'read_document',
        arguments: { path: 'long.docx', section: '1' },
        agent: { session: { header: { id: 'document-spill-session', cwd } } } as never,
      })
      const text = response.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
      expect(response.error).toBeUndefined()
      expect(Buffer.byteLength(text, 'utf8')).toBeLessThanOrEqual(512)
      expect(text).toContain('spill://documents/long.txt')
      expect((response.value as { truncated: boolean }).truncated).toBe(true)
      expect(saved).toHaveLength(1)
      expect(saved[0]?.owner.sessionId).toBe('document-spill-session')
      expect(saved[0]?.source).toMatchObject({ toolName: 'read_document', callId: 'document-spill-call' })
      expect(saved[0]?.content).toContain(documentText)
    } finally {
      await fiber.dispose()
      await rm(cwd, { recursive: true, force: true })
    }
  })

  it('registers read_document over ctx.fs and parses outside the host event loop', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-tool-document-'))
    const sessionWorkspace = join(cwd, 'session-workspace')
    const file = join(cwd, 'report.docx')
    await mkdir(sessionWorkspace, { recursive: true })
    await writeFile(file, makeDocx('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Report</w:t></w:r></w:p><w:p><w:r><w:t>Private text from the file body.</w:t></w:r></w:p>'))
    await writeFile(join(cwd, 'slides.pptx'), makePptx())
    await writeFile(join(sessionWorkspace, 'report.docx'), makeDocx('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Session report</w:t></w:r></w:p><w:p><w:r><w:t>Read through this session workspace.</w:t></w:r></w:p>'))
    await writeFile(join(cwd, 'mislabeled.docx'), makeXlsx(2))
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(LocalFileSystem, { cwd })
    const ToolDocument = await import('../src/index.ts')
    const documentsDirectory = join(cwd, 'documents')
    const attachedData = makeDocx('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Attached</w:t></w:r></w:p><w:p><w:r><w:t>Read from private document storage.</w:t></w:r></w:p>')
    const stored = await storeDocumentSnapshot(attachedData, { directory: documentsDirectory, name: '/outside/folder/brief.docx', sessionId: 'document-test-session' })
    const attachedDigest = stored.sha256
    expect(stored).toMatchObject({ reference: '@doc:' + attachedDigest, kind: 'docx', name: 'brief.docx' })
    const fiber = await ctx.plugin(ToolDocument, { cacheDirectory: join(cwd, 'cache'), documentsDirectory })
    try {
      expect(ctx.tools.schemas().map(schema => schema.name)).toContain('read_document')
      const call = ctx.tools.execute({
        signal: new AbortController().signal,
        callId: 'document-test-1' as never,
        name: 'read_document',
        arguments: { path: 'report.docx', section: '1' },
      })
      const response = await call
      expect(response.error).toBeUndefined()
      expect(response.content.map(block => block.type === 'text' ? block.text : '').join('')).toContain('Private text from the file body.')

      const attached = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: 'document-test-reference' as never,
        name: 'read_document',
        arguments: { path: '@doc:' + attachedDigest, section: '1' },
        agent: { session: { header: { id: 'document-test-session' } } } as never,
      })
      expect(attached.error).toBeUndefined()
      expect(attached.content.map(block => block.type === 'text' ? block.text : '').join('')).toContain('Read from private document storage.')

      const otherSessionAttachment = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: 'document-test-cross-session-reference' as never,
        name: 'read_document',
        arguments: { path: '@doc:' + attachedDigest, section: '1' },
        agent: { session: { header: { id: 'other-document-session' } } } as never,
      })
      expect(otherSessionAttachment.error).toBeDefined()
      expect(otherSessionAttachment.content.map(block => block.type === 'text' ? block.text : '').join('')).toContain('not available in this session')

      const invalidReference = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: 'document-test-invalid-reference' as never,
        name: 'read_document',
        arguments: { path: '@doc:' + 'a'.repeat(64) + '/../../report.docx' },
      })
      expect(invalidReference.error).toBeDefined()
      expect(invalidReference.content.map(block => block.type === 'text' ? block.text : '').join('')).not.toContain('Private text from the file body.')

      const sessionScoped = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: 'document-test-session-cwd' as never,
        name: 'read_document',
        arguments: { path: 'report.docx', section: '1' },
        agent: { session: { header: { cwd: sessionWorkspace } } } as never,
      })
      const sessionText = sessionScoped.content.map(block => block.type === 'text' ? block.text : '').join('')
      expect(sessionScoped.error).toBeUndefined()
      expect(sessionText).toContain('Read through this session workspace.')
      expect(sessionText).not.toContain('Private text from the file body.')

      const mismatchedExtension = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: 'document-test-2' as never,
        name: 'read_document',
        arguments: { path: 'mislabeled.docx', sheet: 'Data', range: 'A1:C2' },
      })
      expect(mismatchedExtension.error).toBeUndefined()
      expect(mismatchedExtension.content.map(block => block.type === 'text' ? block.text : '').join('')).toContain('Sheet: Data')

      const attachmentCalls: Array<{ mediaType: string; name?: string }> = []
      ctx.provide('attachments', {
        imageLimits: {
          maxImageBytes: 1024 * 1024,
          maxImagesPerMessage: 4,
          maxMessageImageBytes: 2 * 1024 * 1024,
          maxImagePixels: 1_000_000,
          maxImageDimension: 2048,
          mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
        },
        validateImage: () => Promise.resolve(),
        saveImage: async () => ({ attachmentId: 'doc-image-1', mediaType: 'image/png', bytes: 68, width: 1, height: 1 }),
        async saveImages(inputs: readonly { mediaType: string; name?: string }[]) {
          attachmentCalls.push(...inputs)
          return inputs.map((_input, index) => ({ attachmentId: 'doc-image-' + (index + 1), mediaType: 'image/png' as const, bytes: 68, width: 1, height: 1 }))
        },
      } as never)
      ctx.provide('llm', {
        resolveModelInfo: async (provider: string) => ({ inputModalities: provider === 'vision' ? ['text', 'image'] : ['text'] }),
      } as never)
      const visionResult = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: 'document-test-image' as never,
        name: 'read_document',
        arguments: { path: 'slides.pptx', pages: '1', images: true },
        agent: {
          options: { provider: 'vision', model: 'vision-model' },
          session: {
            header: { cwd },
            requestHeader: () => ({ config: { provider: 'vision', model: 'vision-model' } }),
          },
        } as never,
      })
      expect(visionResult.error).toBeUndefined()
      expect(attachmentCalls).toHaveLength(1)
      expect(attachmentCalls[0]).toMatchObject({ mediaType: 'image/png', name: 'pixel.png' })
      expect(visionResult.content.some(block => block.type === 'image')).toBe(true)

      const textOnly = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: 'document-test-nonvision' as never,
        name: 'read_document',
        arguments: { path: 'slides.pptx', pages: '1', images: true },
        agent: {
          options: { provider: 'text', model: 'text-model' },
          session: {
            header: { cwd },
            requestHeader: () => ({ config: { provider: 'text', model: 'text-model' } }),
          },
        } as never,
      })
      expect(textOnly.content.some(block => block.type === 'image')).toBe(false)
      expect(textOnly.content.map(block => block.type === 'text' ? block.text : '').join('')).toContain('does not declare image input')
    } finally {
      await fiber.dispose()
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
