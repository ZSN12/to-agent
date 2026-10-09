import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@z/cordis'
import SystemPrompt from '@z/dsh-system-prompt'
import ToolRuntime from '@z/dsh-tools'
import LocalFileSystem from '@z/dsh-fs-local'
import * as ToolDocument from '../src/index.ts'
import { parseDocumentBytes } from '../src/parse.ts'
import { parseXml } from '../src/xml.ts'
import { makeDocx, makeEncryptedDocx, makePdf, makePptx, makeScannedPdf, makeWideXlsx, makeXlsx, makeZipBomb } from './fixtures.ts'
import type { DocumentOptions } from '../src/protocol.ts'

const options = (overrides: Partial<DocumentOptions> = {}): DocumentOptions => ({
  images: false,
  maxOutputBytes: 50 * 1024,
  ...overrides,
})

describe('read_document parsers', () => {
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
    expect(content).toContain('1 embedded image')
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

  it('distinguishes a scanned page without pretending image attachment is available', async () => {
    const result = await parseDocumentBytes(makeScannedPdf(), options({ pages: '1', images: true }))
    expect(result.content[0]?.text).toContain('Scanned page')
    expect(result.content[0]?.text).toContain('image persistence is not connected')
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
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0])
    await expect(parseDocumentBytes(ole, options())).rejects.toThrow(/Legacy .doc/u)
    await expect(parseDocumentBytes(new TextEncoder().encode('plain text'), options())).rejects.toThrow(/Unsupported document type/u)
  })

  it('registers read_document over ctx.fs and parses outside the host event loop', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'dsh-tool-document-'))
    const file = join(cwd, 'report.docx')
    await writeFile(file, makeDocx('<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Report</w:t></w:r></w:p><w:p><w:r><w:t>Private text from the file body.</w:t></w:r></w:p>'))
    await writeFile(join(cwd, 'mislabeled.docx'), makeXlsx(2))
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(LocalFileSystem, { cwd })
    const fiber = await ctx.plugin(ToolDocument)
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

      const mismatchedExtension = await ctx.tools.execute({
        signal: new AbortController().signal,
        callId: 'document-test-2' as never,
        name: 'read_document',
        arguments: { path: 'mislabeled.docx', sheet: 'Data', range: 'A1:C2' },
      })
      expect(mismatchedExtension.error).toBeUndefined()
      expect(mismatchedExtension.content.map(block => block.type === 'text' ? block.text : '').join('')).toContain('Sheet: Data')
    } finally {
      await fiber.dispose()
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
