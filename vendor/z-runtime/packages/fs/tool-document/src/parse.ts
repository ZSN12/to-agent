import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { DocumentReadError } from './errors.ts'
import type { DocumentKind, DocumentOptions, DocumentReadResult } from './protocol.ts'
import { descendants, directChildren, firstDescendant, parseXml, textContent } from './xml.ts'
import { extractZipEntries, inspectZip, textPart } from './zip.ts'

const PDF_MAX_BYTES = 100 * 1024 * 1024
const OFFICE_MAX_BYTES = 50 * 1024 * 1024
const PDF_MAX_PAGES = 2_000
const SEGMENT_MAX = 20
const SHEET_MAX_ROWS = 200
const SHEET_MAX_COLUMNS = 50
const CELL_MAX_CHARS = 200
type ZipCatalog = ReturnType<typeof inspectZip>

function resolvePartTarget(base: string, target: string): string {
  if (target.includes('\\')) throw new DocumentReadError('Office relationship contains an unsafe path.', 'DOCUMENT_PART_MISSING')
  const parts = target.startsWith('/') ? [] : base.split('/').filter(Boolean)
  for (const segment of target.replace(/^\//u, '').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') {
      if (parts.length === 0) throw new DocumentReadError('Office relationship escapes the package root.', 'DOCUMENT_PART_MISSING')
      parts.pop()
    } else parts.push(segment)
  }
  return parts.join('/')
}

function detectDocument(bytes: Uint8Array): { kind: DocumentKind; catalog?: ZipCatalog } {
  const header = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 2048)))
  if (header.startsWith('%PDF-')) return { kind: 'pdf' }
  if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) {
    if (/\/Encrypt\b/u.test(header)) throw new DocumentReadError('This legacy Office file is encrypted. Save an unencrypted modern Office copy and retry.', 'DOCUMENT_ENCRYPTED')
    throw new DocumentReadError('Legacy .doc, .ppt, and .xls files must be saved as .docx, .pptx, or .xlsx before reading.', 'DOCUMENT_LEGACY_OFFICE')
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    const catalog = inspectZip(bytes)
    if (!catalog.has('[Content_Types].xml')) throw new DocumentReadError('ZIP archive is not a supported Office document.', 'DOCUMENT_UNSUPPORTED')
    const manifest = textPart(extractZipEntries(bytes, catalog, new Set(['[Content_Types].xml'])), '[Content_Types].xml')
    if (/\/ppt\/presentation\.xml/u.test(manifest)) return { kind: 'pptx', catalog }
    if (/\/word\/document\.xml/u.test(manifest)) return { kind: 'docx', catalog }
    if (/\/xl\/workbook\.xml/u.test(manifest)) return { kind: 'xlsx', catalog }
    throw new DocumentReadError('ZIP archive is not a supported .pptx, .docx, or .xlsx file.', 'DOCUMENT_UNSUPPORTED')
  }
  throw new DocumentReadError('Unsupported document type. Supported formats are PDF, PPTX, DOCX, and XLSX.', 'DOCUMENT_UNSUPPORTED')
}

function estimateTokens(value: string): number {
  let cjk = 0
  for (const character of value) {
    const code = character.codePointAt(0)!
    if ((code >= 0x2e80 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff)) cjk += 1
  }
  return Math.ceil(cjk * 1.3 + ([...value].length - cjk) / 4)
}

function result(
  value: string,
  metadata: Partial<Omit<DocumentReadResult, 'content' | 'tokensEstimate'>> = {},
  maxBytes = 50 * 1024,
): DocumentReadResult {
  const lines = [value]
  const outline: string[] = []
  let clipped = false
  const nextText = metadata.next ? '\n\nNext: ' + metadata.next : ''
  const fits = (candidate: string): boolean => Buffer.byteLength(candidate + nextText, 'utf8') <= maxBytes
  if (metadata.outline?.length) {
    const heading = lines.concat('', 'Outline:').join('\n')
    if (fits(heading)) lines.push('', 'Outline:')
    else clipped = true
    for (const entry of metadata.outline) {
      if (clipped) break
      const candidate = lines.concat('- ' + entry).join('\n')
      if (!fits(candidate)) {
        clipped = true
        break
      }
      outline.push(entry)
      lines.push('- ' + entry)
    }
    if (clipped) {
      const candidate = lines.concat('- [outline clipped by the output limit]').join('\n')
      if (fits(candidate)) lines.push('- [outline clipped by the output limit]')
    }
  }
  if (metadata.next) lines.push('', 'Next: ' + metadata.next)
  let contentText = lines.join('\n')
  if (Buffer.byteLength(contentText, 'utf8') > maxBytes) {
    const notice = '\n\n[Output clipped by the configured byte limit]'
    const room = Math.max(0, maxBytes - Buffer.byteLength(notice + nextText, 'utf8'))
    let base = ''
    let used = 0
    for (const character of value) {
      const size = Buffer.byteLength(character, 'utf8')
      if (used + size > room) break
      base += character
      used += size
    }
    contentText = base + notice + nextText
    if (metadata.outline) outline.length = 0
    clipped = true
  }
  return {
    ...metadata,
    ...(metadata.outline ? { outline } : {}),
    content: [{ type: 'text', text: contentText }],
    truncated: Boolean(metadata.truncated || clipped),
    tokensEstimate: estimateTokens(contentText),
  }
}

function bounded(value: string, maxBytes: number, next?: string): DocumentReadResult {
  const footerBytes = next ? Buffer.byteLength('\n\nNext: ' + next, 'utf8') : 0
  if (Buffer.byteLength(value, 'utf8') + footerBytes <= maxBytes) return result(value, next ? { next } : {}, maxBytes)
  let excerpt = value
  const notice = '\n\n[Output reached the configured byte limit and was truncated.]'
  while (Buffer.byteLength(excerpt + notice, 'utf8') + footerBytes > maxBytes && excerpt.length > 0) excerpt = excerpt.slice(0, Math.floor(excerpt.length * 0.8))
  return result(excerpt + notice, { truncated: true, ...(next ? { next } : {}) }, maxBytes)
}

function parseRange(value: string | undefined, total: number, name: string): [number, number] {
  if (value === undefined || value.trim() === '') {
    if (total > SEGMENT_MAX) throw new DocumentReadError('Document exceeds the per-call segment limit. Inspect the outline and specify a range.', 'DOCUMENT_RANGE_REQUIRED')
    return total === 0 ? [1, 0] : [1, total]
  }
  const match = /^(\d+)(?:\s*-\s*(\d+))?$/u.exec(value.trim())
  if (!match) throw new DocumentReadError(name + ' must be a number or an ascending range such as 1-5.', 'DOCUMENT_RANGE_INVALID')
  const start = Number(match[1])
  const end = Number(match[2] ?? match[1])
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end - start + 1 > SEGMENT_MAX) {
    throw new DocumentReadError(name + ' range must be ascending and include at most ' + SEGMENT_MAX + ' segments.', 'DOCUMENT_RANGE_LIMIT')
  }
  if (start > total) throw new DocumentReadError(name + ' ' + start + ' exceeds the document length of ' + total + '.', 'DOCUMENT_RANGE_INVALID')
  return [start, Math.min(end, total)]
}

function pdfPageText(items: Array<{ str?: string; transform?: number[] }>): string {
  const lines: Array<{ y: number; x: number; text: string }> = []
  for (const item of items) {
    const value = item.str?.trim()
    if (!value) continue
    const x = item.transform?.[4] ?? 0
    const y = item.transform?.[5] ?? 0
    const line = lines.find(candidate => Math.abs(candidate.y - y) < 2.5)
    if (line) {
      line.x = Math.min(line.x, x)
      line.text += ' ' + value
    } else lines.push({ y, x, text: value })
  }
  return lines.sort((a, b) => b.y - a.y || a.x - b.x).map(line => line.text).join('\n')
}

interface PdfDocumentLike {
  getPage(number: number): Promise<{
    getTextContent(options: { includeMarkedContent: boolean }): Promise<{ items: Array<{ str?: string; transform?: number[] } | { type: string }> }>
    getOperatorList(): Promise<{ fnArray: number[] }>
    cleanup(): void
  }>
}

async function inspectPdfPage(pdf: PdfDocumentLike, pageNumber: number): Promise<{ text: string; scanned: boolean }> {
  const page = await pdf.getPage(pageNumber)
  const content = await page.getTextContent({ includeMarkedContent: false })
  const textItems = content.items.filter((item): item is { str?: string; transform?: number[] } => 'str' in item)
  const text = pdfPageText(textItems)
  let scanned = false
  if (text.length < 20) {
    const operators = await page.getOperatorList()
    const imageOps = new Set([
      OPS.paintImageXObject,
      OPS.paintInlineImageXObject,
      OPS.paintImageMaskXObject,
      OPS.paintImageMaskXObjectGroup,
      OPS.paintImageXObjectRepeat,
    ].filter((value): value is number => typeof value === 'number'))
    scanned = operators.fnArray.some(operator => imageOps.has(operator))
  }
  page.cleanup()
  return { text, scanned }
}

async function readPdf(bytes: Uint8Array, options: DocumentOptions): Promise<DocumentReadResult> {
  if (bytes.length > PDF_MAX_BYTES) throw new DocumentReadError('PDF exceeds the 100 MB file limit.', 'DOCUMENT_TOO_LARGE')
  const loading = getDocument({ data: Uint8Array.from(bytes), isEvalSupported: false, useWorkerFetch: false, verbosity: 0 })
  let pdf
  try {
    pdf = await loading.promise
  } catch (cause) {
    const name = (cause as { name?: string })?.name
    if (name === 'PasswordException' || /password|encrypt/iu.test(String(cause))) {
      throw new DocumentReadError('This PDF is password-protected. Remove the password and retry.', 'DOCUMENT_ENCRYPTED', { cause })
    }
    throw new DocumentReadError('PDF could not be read: ' + (cause instanceof Error ? cause.message : String(cause)), 'DOCUMENT_PDF_INVALID', { cause })
  }
  try {
    const total = pdf.numPages
    const outline: string[] = []
    const previews = new Map<number, { text: string; scanned: boolean }>()
    const pageLimit = Math.min(total, PDF_MAX_PAGES)
    const needOutline = total > PDF_MAX_PAGES || (options.pages === undefined && total > SEGMENT_MAX)
    if (needOutline) {
      for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
        const preview = await inspectPdfPage(pdf, pageNumber)
        previews.set(pageNumber, preview)
        const firstLine = preview.text.split('\n').find(line => line.trim())?.slice(0, 180)
        outline.push(pageNumber + '. ' + (firstLine || (preview.scanned ? '(Scanned page)' : '(Blank page)')))
      }
    }
    if (total > PDF_MAX_PAGES) return result('PDF has ' + total + ' pages, above the ' + PDF_MAX_PAGES + '-page parsing limit. Outline shows the first ' + PDF_MAX_PAGES + ' pages.', {
      outline, next: 'Split the PDF into files of at most 2000 pages.', truncated: true,
    }, options.maxOutputBytes)
    if (options.pages === undefined && total > SEGMENT_MAX) return result('PDF has ' + total + ' pages. First call returns its outline; specify pages, up to ' + SEGMENT_MAX + ' per call.', {
      outline, next: 'pages=1-20', truncated: true,
    }, options.maxOutputBytes)
    const [start, end] = parseRange(options.pages, total, 'pages')
    const pieces: string[] = []
    for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
      const page = previews.get(pageNumber) ?? await inspectPdfPage(pdf, pageNumber)
      const unavailable = page.scanned
        ? options.images
          ? '[Scanned page; image persistence is not connected in this build, so the page image was not attached]'
          : '[Scanned page; provide a screenshot or a searchable PDF to read this page]'
        : '[Blank page]'
      pieces.push('--- Page ' + pageNumber + ' ---\n' + (page.text || unavailable))
    }
    const next = end < total ? 'pages=' + (end + 1) + '-' + Math.min(total, end + SEGMENT_MAX) : undefined
    return bounded(pieces.join('\n\n'), options.maxOutputBytes, next)
  } finally {
    await loading.destroy()
  }
}

function rootOf(parts: ReadonlyMap<string, Uint8Array>, name: string) {
  return parseXml(textPart(parts, name))
}

function nodeText(node: Parameters<typeof textContent>[0]): string {
  return textContent(node).replace(/\s+/gu, ' ').trim()
}

function pptxSlidePaths(presentation: ReturnType<typeof parseXml>, rels: ReturnType<typeof parseXml>): string[] {
  const targets = new Map(descendants(rels, 'Relationship').map(rel => [rel.attributes.Id, rel.attributes.Target]))
  return descendants(presentation, 'sldId').map(ref => {
    const target = targets.get(ref.attributes.id ?? '')
    if (!target || target.split('/').includes('..')) {
      throw new DocumentReadError('PPTX slide relationship is missing or unsafe.', 'DOCUMENT_PART_MISSING')
    }
    return resolvePartTarget('ppt', target)
  })
}

function pptxTitle(slide: ReturnType<typeof parseXml>): string {
  for (const shape of descendants(slide, 'sp')) {
    const type = firstDescendant(shape, 'ph')?.attributes.type
    if (type === 'title' || type === 'ctrTitle') {
      const value = descendants(shape, 't').map(nodeText).filter(Boolean).join(' ')
      if (value) return value
    }
  }
  return descendants(slide, 't').map(nodeText).find(Boolean) ?? '(Untitled)'
}

function pptxBody(slide: ReturnType<typeof parseXml>): string {
  const lines: string[] = []
  for (const shape of descendants(slide, 'sp')) {
    const type = firstDescendant(shape, 'ph')?.attributes.type
    if (type === 'title' || type === 'ctrTitle') continue
    for (const paragraph of descendants(shape, 'p')) {
      const value = descendants(paragraph, 't').map(nodeText).filter(Boolean).join('')
      if (!value) continue
      const level = Number(firstDescendant(paragraph, 'pPr')?.attributes.lvl ?? '0')
      lines.push((level > 0 ? '  '.repeat(Math.min(level, 8)) + '- ' : '') + value)
    }
  }
  for (const table of descendants(slide, 'tbl')) {
    const rows = descendants(table, 'tr').map(row => descendants(row, 'tc').map(cell =>
      descendants(cell, 't').map(nodeText).filter(Boolean).join(' ').replace(/\|/gu, '\\|'),
    ))
    if (rows.length > 0) {
      lines.push('| ' + rows[0]!.join(' | ') + ' |')
      lines.push('| ' + rows[0]!.map(() => '---').join(' | ') + ' |')
      for (const row of rows.slice(1)) lines.push('| ' + row.join(' | ') + ' |')
    }
  }
  return lines.join('\n')
}

function notesForSlide(bytes: Uint8Array, catalog: ZipCatalog, path: string): string | undefined {
  const filename = path.slice(path.lastIndexOf('/') + 1)
  const relsPath = 'ppt/slides/_rels/' + filename + '.rels'
  if (!catalog.has(relsPath)) return undefined
  const rels = rootOf(extractZipEntries(bytes, catalog, new Set([relsPath])), relsPath)
  const relation = descendants(rels, 'Relationship').find(item => item.attributes.type?.endsWith('/notesSlide'))
  const target = relation?.attributes.Target
  if (!target) return undefined
  let notesPath: string
  try {
    notesPath = resolvePartTarget('ppt/slides', target)
  } catch {
    return undefined
  }
  if (!catalog.has(notesPath)) return undefined
  const notes = rootOf(extractZipEntries(bytes, catalog, new Set([notesPath])), notesPath)
  const text = descendants(notes, 'sp').filter(shape => {
    const kind = firstDescendant(shape, 'ph')?.attributes.type
    return !['sldNum', 'slidenum', 'sldImg'].includes(kind ?? '')
  }).flatMap(shape => descendants(shape, 't').map(nodeText)).filter(Boolean).join(' ')
  return text || undefined
}

async function readPptx(bytes: Uint8Array, options: DocumentOptions, catalog: ZipCatalog): Promise<DocumentReadResult> {
  if (bytes.length > OFFICE_MAX_BYTES) throw new DocumentReadError('Office file exceeds the 50 MB file limit.', 'DOCUMENT_TOO_LARGE')
  const basics = extractZipEntries(bytes, catalog, new Set(['ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels']))
  const paths = pptxSlidePaths(rootOf(basics, 'ppt/presentation.xml'), rootOf(basics, 'ppt/_rels/presentation.xml.rels'))
  const titles: string[] = []
  for (const path of paths) {
    if (!catalog.has(path)) throw new DocumentReadError('PPTX is missing ' + path, 'DOCUMENT_PART_MISSING')
    const slide = rootOf(extractZipEntries(bytes, catalog, new Set([path])), path)
    titles.push(pptxTitle(slide))
  }
  const outline = titles.map((title, index) => (index + 1) + '. ' + title)
  if (options.pages === undefined && paths.length > SEGMENT_MAX) return result('Presentation has ' + paths.length + ' slides. First call returns its outline; specify pages, up to ' + SEGMENT_MAX + ' slides per call.', {
    outline, next: 'pages=1-20', truncated: true,
  }, options.maxOutputBytes)
  const [start, end] = parseRange(options.pages, paths.length, 'pages')
  const content: string[] = []
  for (let page = start; page <= end; page += 1) {
    const path = paths[page - 1]!
    const slide = rootOf(extractZipEntries(bytes, catalog, new Set([path])), path)
    let section = '## Slide ' + page + ': ' + titles[page - 1] + '\n' + pptxBody(slide)
    const notes = notesForSlide(bytes, catalog, path)
    if (notes) section += '\n> Notes: ' + notes
    const relsPath = 'ppt/slides/_rels/' + path.slice(path.lastIndexOf('/') + 1) + '.rels'
    if (catalog.has(relsPath)) {
      const rels = rootOf(extractZipEntries(bytes, catalog, new Set([relsPath])), relsPath)
      const images = descendants(rels, 'Relationship').filter(rel => rel.attributes.type?.endsWith('/image'))
      if (images.length) section += '\n\n[' + images.length + ' embedded image(s)' + (options.images ? '; image attachment pipeline is not connected, images omitted' : '') + ']'
    }
    content.push(section)
  }
  const next = end < paths.length ? 'pages=' + (end + 1) + '-' + Math.min(paths.length, end + SEGMENT_MAX) : undefined
  return bounded(content.join('\n\n'), options.maxOutputBytes, next)
}

type DocSection = { title: string; level: number; blocks: string[] }

const DOCX_HIDDEN_REVISION_NODES = new Set([
  'ins', 'del', 'moveFrom', 'moveTo', 'commentRangeStart', 'commentRangeEnd', 'commentReference',
])

function visibleDocxText(node: ReturnType<typeof parseXml>['children'][number]): string {
  const parts: string[] = []
  const stack = [node]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (DOCX_HIDDEN_REVISION_NODES.has(current.name)) continue
    if (current.name === 't') {
      if (current.text) parts.push(current.text)
      continue
    }
    for (let index = current.children.length - 1; index >= 0; index -= 1) stack.push(current.children[index]!)
  }
  return parts.join('')
}

function docParagraphText(paragraph: ReturnType<typeof parseXml>['children'][number]): string {
  return visibleDocxText(paragraph).replace(/\s+/gu, ' ').trim()
}

function docHeadingLevel(paragraph: ReturnType<typeof parseXml>['children'][number]): number | undefined {
  const style = firstDescendant(paragraph, 'pStyle')?.attributes.val?.toLowerCase()
  const match = style ? /heading\s*([1-6])/u.exec(style) : undefined
  return match ? Number(match[1]) : undefined
}

function docSections(root: ReturnType<typeof parseXml>): DocSection[] {
  const body = firstDescendant(root, 'body')
  if (!body) throw new DocumentReadError('DOCX body is missing.', 'DOCUMENT_XML_INVALID')
  const sections: DocSection[] = []
  let current: DocSection = { title: 'Document', level: 1, blocks: [] }
  const save = (): void => {
    if (current.title !== 'Document' || current.blocks.length) sections.push(current)
  }
  for (const block of body.children) {
    if (block.name === 'p') {
      const value = docParagraphText(block)
      const level = docHeadingLevel(block)
      if (level !== undefined) {
        save()
        current = { title: value || '(Untitled)', level, blocks: [] }
      } else if (value) {
        const listLevel = firstDescendant(block, 'ilvl')?.attributes.val
        current.blocks.push((listLevel === undefined ? '' : '  '.repeat(Math.min(Number(listLevel) || 0, 8)) + '- ') + value)
      }
    } else if (block.name === 'tbl') {
      const rows = descendants(block, 'tr').map(row => descendants(row, 'tc').map(cell =>
        descendants(cell, 'p').map(docParagraphText).filter(Boolean).join('<br>').replace(/\|/gu, '\\|'),
      ))
      if (rows.length) {
        current.blocks.push('| ' + rows[0]!.join(' | ') + ' |', '| ' + rows[0]!.map(() => '---').join(' | ') + ' |')
        current.blocks.push(...rows.slice(1).map(row => '| ' + row.join(' | ') + ' |'))
      }
    }
  }
  save()
  if (sections.length === 0) sections.push(current)
  if (sections.length !== 1 || sections[0]!.title !== 'Document') return sections

  // Untitled documents lack semantic heading boundaries. Split their blocks
  // into navigable sections around the same 20k-character reading window.
  const chunks: DocSection[] = []
  let chunk: string[] = []
  let length = 0
  const flush = (): void => {
    if (chunk.length === 0) return
    chunks.push({ title: 'Document part ' + (chunks.length + 1), level: 1, blocks: chunk })
    chunk = []
    length = 0
  }
  for (const block of sections[0]!.blocks) {
    if (length > 0 && length + block.length > 20_000) flush()
    if (block.length <= 20_000) {
      chunk.push(block)
      length += block.length
      continue
    }
    const characters = Array.from(block)
    for (let offset = 0; offset < characters.length; offset += 20_000) {
      const part = characters.slice(offset, offset + 20_000).join('')
      if (length > 0) flush()
      chunk.push(part)
      length = part.length
      if (offset + 20_000 < characters.length) flush()
    }
  }
  flush()
  return chunks.length > 0 ? chunks : sections
}

function docSectionRange(value: string, count: number): [number, number] {
  const match = /^(\d+)(?:\s*-\s*(\d+))?$/u.exec(value.trim())
  if (!match) throw new DocumentReadError('section must be a number or range such as 2-3.', 'DOCUMENT_RANGE_INVALID')
  const start = Number(match[1])
  const end = Number(match[2] ?? match[1])
  if (start < 1 || end < start || end - start + 1 > SEGMENT_MAX) throw new DocumentReadError('section range must be ascending and contain at most ' + SEGMENT_MAX + ' sections.', 'DOCUMENT_RANGE_LIMIT')
  if (start > count) throw new DocumentReadError('section is out of range; the document has ' + count + ' sections.', 'DOCUMENT_RANGE_INVALID')
  return [start, Math.min(end, count)]
}

async function readDocx(bytes: Uint8Array, options: DocumentOptions, catalog: ZipCatalog): Promise<DocumentReadResult> {
  if (bytes.length > OFFICE_MAX_BYTES) throw new DocumentReadError('Office file exceeds the 50 MB file limit.', 'DOCUMENT_TOO_LARGE')
  const root = rootOf(extractZipEntries(bytes, catalog, new Set(['word/document.xml'])), 'word/document.xml')
  const sections = docSections(root)
  const outline = sections.map((section, index) => (index + 1) + '. ' + '#'.repeat(Math.max(1, Math.min(section.level, 6))) + ' ' + section.title)
  const totalChars = sections.reduce((sum, section) => sum + section.blocks.join('\n').length, 0)
  if (options.section === undefined && (sections.length > 1 || totalChars > 20_000)) return result('Document has ' + sections.length + ' sections and about ' + totalChars + ' body characters. First call returns its outline; specify section.', {
    outline, next: 'section=1', truncated: true,
  }, options.maxOutputBytes)
  const [start, end] = options.section ? docSectionRange(options.section, sections.length) : [1, sections.length]
  const selected = sections.slice(start - 1, end)
  const content = selected.map(section => '#'.repeat(Math.max(1, Math.min(section.level, 6))) + ' ' + section.title + '\n' + section.blocks.join('\n\n'))
  const next = end < sections.length ? 'section=' + (end + 1) : undefined
  return bounded(content.join('\n\n'), options.maxOutputBytes, next)
}

function excelColumnToNumber(name: string): number {
  let result = 0
  for (const character of name.toUpperCase()) result = result * 26 + character.charCodeAt(0) - 64
  return result
}

function excelNumberToColumn(value: number): string {
  let number = value
  let output = ''
  while (number > 0) {
    number -= 1
    output = String.fromCharCode(65 + number % 26) + output
    number = Math.floor(number / 26)
  }
  return output
}

function parseCellAddress(value: string): { column: number; row: number } {
  const match = /^([A-Z]{1,3})([1-9]\d*)$/iu.exec(value)
  if (!match) throw new DocumentReadError('Invalid XLSX cell address ' + value, 'DOCUMENT_RANGE_INVALID')
  return { column: excelColumnToNumber(match[1]!), row: Number(match[2]) }
}

type CellRange = { c1: number; r1: number; c2: number; r2: number }

function parseCellRange(value: string | undefined, dimension: string): CellRange {
  const dim = /^([A-Z]+\d+)(?::([A-Z]+\d+))?$/iu.exec(dimension)
  if (value === undefined) {
    const last = parseCellAddress(dim?.[2] ?? dim?.[1] ?? 'AX200')
    return { c1: 1, r1: 1, c2: Math.min(SHEET_MAX_COLUMNS, last.column), r2: Math.min(SHEET_MAX_ROWS, last.row) }
  }
  const match = /^([A-Z]+\d+)(?::([A-Z]+\d+))?$/iu.exec(value)
  if (!match) throw new DocumentReadError('range must use A1 notation, for example A1:Z200.', 'DOCUMENT_RANGE_INVALID')
  const first = parseCellAddress(match[1]!)
  const last = parseCellAddress(match[2] ?? match[1]!)
  const range = {
    c1: Math.min(first.column, last.column),
    r1: Math.min(first.row, last.row),
    c2: Math.max(first.column, last.column),
    r2: Math.max(first.row, last.row),
  }
  if (range.c2 - range.c1 + 1 > SHEET_MAX_COLUMNS || range.r2 - range.r1 + 1 > SHEET_MAX_ROWS) {
    throw new DocumentReadError('XLSX range is limited to ' + SHEET_MAX_ROWS + ' rows × ' + SHEET_MAX_COLUMNS + ' columns per call.', 'DOCUMENT_RANGE_LIMIT')
  }
  return range
}

function workbookParts(bytes: Uint8Array, catalog: ZipCatalog) {
  const names = new Set(['xl/workbook.xml', 'xl/_rels/workbook.xml.rels'])
  const parts = extractZipEntries(bytes, catalog, names)
  const workbook = rootOf(parts, 'xl/workbook.xml')
  const rels = rootOf(parts, 'xl/_rels/workbook.xml.rels')
  const targets = new Map(descendants(rels, 'Relationship').map(rel => [rel.attributes.Id, rel.attributes.Target]))
  const sheets = descendants(workbook, 'sheet').map(sheet => {
    const target = targets.get(sheet.attributes.id ?? '')
    if (!target) throw new DocumentReadError('XLSX sheet relationship is missing or unsafe.', 'DOCUMENT_PART_MISSING')
    const path = resolvePartTarget('xl', target)
    return { name: sheet.attributes.name ?? '(unnamed)', path }
  })
  return { workbook, sheets }
}

function excelDate(serial: number, date1904: boolean): string {
  const offset = date1904 ? 1_462 : 0
  const date = new Date(Date.UTC(1899, 11, 30) + (serial + offset) * 86_400_000)
  if (!Number.isFinite(date.getTime())) return String(serial)
  return date.toISOString().replace('T', ' ').replace(/\.000Z$/u, ' UTC')
}

function dateStyleIndexes(root?: ReturnType<typeof parseXml>): Set<number> {
  if (!root) return new Set()
  const custom = new Map(descendants(root, 'numFmt').map(item => [Number(item.attributes.numFmtId), item.attributes.formatCode ?? '']))
  const xfs = descendants(root, 'cellXfs')[0]
  if (!xfs) return new Set()
  const builtin = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57])
  return new Set(directChildren(xfs, 'xf').flatMap((xf, index) => {
    const id = Number(xf.attributes.numFmtId ?? '0')
    const code = (custom.get(id) ?? '').replace(/"[^"]*"|\\.|\[[^\]]*\]/gu, '')
    return builtin.has(id) || /[ymdh]/iu.test(code) ? [index] : []
  }))
}

function formattedCell(cell: ReturnType<typeof parseXml>['children'][number], shared: string[], dateStyles: Set<number>, date1904: boolean): string {
  const type = cell.attributes.t
  const raw = firstDescendant(cell, 'v')?.text ?? ''
  const formula = firstDescendant(cell, 'f')?.text.trim()
  let value = raw
  if (type === 's') value = shared[Number(raw)] ?? ''
  else if (type === 'inlineStr') value = descendants(cell, 't').map(textContent).join('')
  else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE'
  else if (type === 'e') value = '#ERROR ' + raw
  else if (raw && dateStyles.has(Number(cell.attributes.s ?? '0')) && Number.isFinite(Number(raw))) value = excelDate(Number(raw), date1904)
  if (value.length > CELL_MAX_CHARS) value = value.slice(0, CELL_MAX_CHARS) + '…'
  return formula ? value + (value ? ' ' : '') + '(=' + formula + ')' : value
}

async function readXlsx(bytes: Uint8Array, options: DocumentOptions, catalog: ZipCatalog): Promise<DocumentReadResult> {
  if (bytes.length > OFFICE_MAX_BYTES) throw new DocumentReadError('Office file exceeds the 50 MB file limit.', 'DOCUMENT_TOO_LARGE')
  const { workbook, sheets } = workbookParts(bytes, catalog)
  if (!sheets.length) throw new DocumentReadError('XLSX workbook has no worksheets.', 'DOCUMENT_XML_INVALID')
  const metadata = new Map<string, { dimension: string; formulas: number; merges: string[] }>()
  const worksheets = new Map<string, ReturnType<typeof parseXml>>()
  const outline: string[] = []
  let index = 0
  if (options.sheet !== undefined) {
    if (/^\d+$/u.test(options.sheet.trim())) index = Number(options.sheet) - 1
    else index = sheets.findIndex(sheet => sheet.name === options.sheet)
    if (index < 0 || index >= sheets.length) throw new DocumentReadError('Sheet ' + options.sheet + ' not found. Available sheets: ' + sheets.map(sheet => sheet.name).join(', '), 'DOCUMENT_SHEET_NOT_FOUND')
  }
  const selected = sheets[index]!
  const inspect = options.sheet === undefined ? sheets : [selected]
  for (const sheet of inspect) {
    const root = rootOf(extractZipEntries(bytes, catalog, new Set([sheet.path])), sheet.path)
    const dimension = firstDescendant(root, 'dimension')?.attributes.ref ?? 'A1'
    const formulas = descendants(root, 'f').length
    const merges = descendants(root, 'mergeCell').flatMap(item => item.attributes.ref ? [item.attributes.ref] : [])
    metadata.set(sheet.name, { dimension, formulas, merges })
    worksheets.set(sheet.name, root)
    if (options.sheet === undefined) outline.push(sheet.name + ' — ' + dimension + ' (' + formulas + ' formulas, ' + merges.length + ' merged ranges)')
  }
  if (options.sheet === undefined) {
    if (sheets.length > 1) return result('Workbook has ' + sheets.length + ' sheets. First call returns its outline; specify sheet by name or 1-based number.', {
      outline, next: 'sheet=1', truncated: true,
    }, options.maxOutputBytes)
  }
  const sheetMeta = metadata.get(selected.name)!
  if (options.sheet === undefined) {
    const dimension = /^([A-Z]+\d+)(?::([A-Z]+\d+))?$/iu.exec(sheetMeta.dimension)
    const last = parseCellAddress(dimension?.[2] ?? dimension?.[1] ?? 'AX200')
    if (sheets.length > 1 || last.row > SHEET_MAX_ROWS || last.column > SHEET_MAX_COLUMNS) {
      return result('Workbook contains worksheet data beyond the per-call range limit. First call returns its outline; specify a sheet to start reading.', {
        outline, next: 'sheet=1', truncated: true,
      }, options.maxOutputBytes)
    }
  }
  const range = parseCellRange(options.range, sheetMeta.dimension)
  const sharedPath = 'xl/sharedStrings.xml'
  const stylesPath = 'xl/styles.xml'
  const requested = new Set<string>()
  if (catalog.has(sharedPath)) requested.add(sharedPath)
  if (catalog.has(stylesPath)) requested.add(stylesPath)
  const parts = requested.size > 0 ? extractZipEntries(bytes, catalog, requested) : new Map<string, Uint8Array>()
  const worksheet = worksheets.get(selected.name)!
  const shared = parts.has(sharedPath) ? descendants(rootOf(parts, sharedPath), 'si').map(item => descendants(item, 't').map(textContent).join('')) : []
  const styles = parts.has(stylesPath) ? rootOf(parts, stylesPath) : undefined
  const dateStyles = dateStyleIndexes(styles)
  const rows = new Map<number, Map<number, string>>()
  let formulas = 0
  for (const row of descendants(worksheet, 'row')) {
    for (const cell of directChildren(row, 'c')) {
      const address = cell.attributes.r
      if (!address) continue
      const { row: rowNumber, column } = parseCellAddress(address)
      if (rowNumber < range.r1 || rowNumber > range.r2 || column < range.c1 || column > range.c2) continue
      if (firstDescendant(cell, 'f')) formulas += 1
      let values = rows.get(rowNumber)
      if (!values) rows.set(rowNumber, values = new Map())
      values.set(column, formattedCell(cell, shared, dateStyles, firstDescendant(workbook, 'workbookPr')?.attributes.date1904 === '1'))
    }
  }
  const columns = Array.from({ length: range.c2 - range.c1 + 1 }, (_, offset) => excelNumberToColumn(range.c1 + offset))
  const header = ['Row', ...columns.map(column => column + ' (' + column + range.r1 + ')')]
  const output = [
    'Sheet: ' + selected.name + '; dimensions: ' + sheetMeta.dimension + '; merged ranges: ' + sheetMeta.merges.length +
      (sheetMeta.merges.length ? ' (' + sheetMeta.merges.slice(0, 12).join(', ') + (sheetMeta.merges.length > 12 ? ', …' : '') + ')' : '') +
      '; formulas on sheet: ' + sheetMeta.formulas + '; formulas in this range: ' + formulas,
    '| ' + header.join(' | ') + ' |',
    '| ' + header.map(() => '---').join(' | ') + ' |',
  ]
  for (let rowNumber = range.r1; rowNumber <= range.r2; rowNumber += 1) {
    const row = rows.get(rowNumber)
    const values = columns.map((_column, offset) => (row?.get(range.c1 + offset) ?? '').replace(/\|/gu, '\\|').replace(/\r?\n/gu, '<br>'))
    output.push('| ' + rowNumber + ' | ' + values.join(' | ') + ' |')
  }
  const dimension = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/iu.exec(sheetMeta.dimension)
  const lastRow = dimension ? Number(dimension[4] ?? dimension[2]) : range.r2
  const lastColumn = dimension ? excelColumnToNumber(dimension[3] ?? dimension[1]!) : range.c2
  let next: string | undefined
  if (range.r2 < lastRow) {
    next = 'sheet=' + (index + 1) + '&range=' + excelNumberToColumn(range.c1) + (range.r2 + 1) + ':' + excelNumberToColumn(range.c2) + Math.min(lastRow, range.r2 + SHEET_MAX_ROWS)
  } else if (range.c2 < lastColumn) {
    const nextColumn = range.c2 + 1
    next = 'sheet=' + (index + 1) + '&range=' + excelNumberToColumn(nextColumn) + '1:' + excelNumberToColumn(Math.min(lastColumn, nextColumn + SHEET_MAX_COLUMNS - 1)) + Math.min(lastRow, SHEET_MAX_ROWS)
  } else if (index + 1 < sheets.length) next = 'sheet=' + (index + 2)
  return bounded(output.join('\n'), options.maxOutputBytes, next)
}

export async function parseDocumentBytes(bytes: Uint8Array, options: DocumentOptions): Promise<DocumentReadResult> {
  const detected = detectDocument(bytes)
  if (detected.kind === 'pdf') return await readPdf(bytes, options)
  if (bytes.length > OFFICE_MAX_BYTES) throw new DocumentReadError('Office file exceeds the 50 MB file limit.', 'DOCUMENT_TOO_LARGE')
  if (!detected.catalog) throw new DocumentReadError('Office archive directory is missing.', 'DOCUMENT_ZIP_INVALID')
  if (detected.kind === 'pptx') return await readPptx(bytes, options, detected.catalog)
  if (detected.kind === 'docx') return await readDocx(bytes, options, detected.catalog)
  return await readXlsx(bytes, options, detected.catalog)
}

export function classifyDocument(bytes: Uint8Array): DocumentKind {
  return detectDocument(bytes).kind
}
