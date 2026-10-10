import { strToU8, zipSync } from 'fflate'

const xml = (value: string): Uint8Array => strToU8(value)
const TINY_PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64'))

export function makeLegacyOle(marker?: string): Uint8Array {
  const header = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
  return new Uint8Array(Buffer.concat([header, marker ? Buffer.from(marker, 'utf16le') : Buffer.alloc(16)]))
}

/** Small generated BIFF8 workbook inside a minimal version-3 CFB container. */
export function makeLegacyXls(): Uint8Array {
  const record = (id: number, payload: Buffer): Buffer => {
    const header = Buffer.alloc(4)
    header.writeUInt16LE(id, 0)
    header.writeUInt16LE(payload.length, 2)
    return Buffer.concat([header, payload])
  }
  const bof = (type: number): Buffer => {
    const payload = Buffer.alloc(16)
    payload.writeUInt16LE(0x0600, 0)
    payload.writeUInt16LE(type, 2)
    payload.writeUInt16LE(0x0dbb, 4)
    payload.writeUInt16LE(0x07cc, 6)
    payload.writeUInt32LE(0x00000041, 8)
    payload.writeUInt32LE(0x00000006, 12)
    return record(0x0809, payload)
  }
  const boundsheetPayload = Buffer.alloc(12)
  boundsheetPayload.writeUInt8(0, 4) // visible
  boundsheetPayload.writeUInt8(0, 5) // worksheet
  boundsheetPayload.writeUInt8(5, 6)
  boundsheetPayload.writeUInt8(0, 7) // compressed single-byte sheet name
  boundsheetPayload.write('Sheet', 8, 'latin1')
  const globals = [
    bof(0x0005),
    record(0x0042, Buffer.from([0xb0, 0x04])),
    record(0x003d, Buffer.alloc(18)),
    record(0x0022, Buffer.from([0, 0])),
    record(0x0085, boundsheetPayload),
    record(0x000a, Buffer.alloc(0)),
  ]
  const worksheetOffset = globals.reduce((sum, part) => sum + part.length, 0)
  boundsheetPayload.writeUInt32LE(worksheetOffset, 0)
  globals[4] = record(0x0085, boundsheetPayload)

  const dimensions = Buffer.alloc(14)
  dimensions.writeUInt32LE(0, 0)
  dimensions.writeUInt32LE(1, 4)
  dimensions.writeUInt16LE(0, 8)
  dimensions.writeUInt16LE(1, 10)
  dimensions.writeUInt16LE(0, 12)
  const number = Buffer.alloc(14)
  number.writeUInt16LE(0, 0)
  number.writeUInt16LE(0, 2)
  number.writeUInt16LE(0, 4)
  number.writeDoubleLE(42, 6)
  const workbookData = Buffer.concat([
    ...globals,
    bof(0x0010),
    record(0x0200, dimensions),
    record(0x0203, number),
    record(0x000a, Buffer.alloc(0)),
  ])
  const streamSize = 4096
  if (workbookData.length > streamSize) throw new Error('minimal XLS fixture exceeds its stream allocation')
  const workbook = Buffer.alloc(streamSize)
  workbookData.copy(workbook)

  const compoundHeader = Buffer.alloc(512)
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(compoundHeader)
  compoundHeader.writeUInt16LE(0x003e, 24)
  compoundHeader.writeUInt16LE(3, 26)
  compoundHeader.writeUInt16LE(0xfffe, 28)
  compoundHeader.writeUInt16LE(9, 30)
  compoundHeader.writeUInt16LE(6, 32)
  compoundHeader.writeUInt32LE(0, 40) // directory sectors (version 3)
  compoundHeader.writeUInt32LE(1, 44) // FAT sectors
  compoundHeader.writeUInt32LE(0, 48) // first directory sector
  compoundHeader.writeUInt32LE(0, 52)
  compoundHeader.writeUInt32LE(4096, 56) // mini-stream cutoff
  compoundHeader.writeUInt32LE(0xfffffffe, 60) // no mini-FAT
  compoundHeader.writeUInt32LE(0, 64)
  compoundHeader.writeUInt32LE(0xfffffffe, 68) // no DIFAT chain
  compoundHeader.writeUInt32LE(0, 72)
  compoundHeader.writeUInt32LE(1, 76) // FAT sector id
  for (let index = 1; index < 109; index += 1) compoundHeader.writeUInt32LE(0xffffffff, 76 + index * 4)

  const directory = Buffer.alloc(512)
  const directoryEntry = (name: string, type: number, startSector: number, size: number): Buffer => {
    const entry = Buffer.alloc(128)
    const encodedName = Buffer.from(name + '\0', 'utf16le')
    encodedName.copy(entry, 0)
    entry.writeUInt16LE(encodedName.length, 64)
    entry.writeUInt8(type, 66)
    entry.writeUInt8(1, 67)
    entry.writeUInt32LE(0xffffffff, 68)
    entry.writeUInt32LE(0xffffffff, 72)
    entry.writeUInt32LE(0xffffffff, 76)
    entry.writeUInt32LE(startSector, 116)
    entry.writeBigUInt64LE(BigInt(size), 120)
    return entry
  }
  const root = directoryEntry('Root Entry', 5, 0xfffffffe, 0)
  root.writeUInt32LE(1, 76) // root storage's Workbook child
  directoryEntry('Workbook', 2, 2, streamSize).copy(directory, 128)
  root.copy(directory, 0)

  const fat = Buffer.alloc(512, 0xff)
  fat.writeUInt32LE(0xfffffffe, 0) // directory sector
  fat.writeUInt32LE(0xfffffffd, 4) // FAT sector
  for (let sector = 2; sector < 9; sector += 1) fat.writeUInt32LE(sector + 1, sector * 4)
  fat.writeUInt32LE(0xfffffffe, 9 * 4)

  return new Uint8Array(Buffer.concat([compoundHeader, directory, fat, workbook]))
}

export function officeArchive(parts: Record<string, string | Uint8Array>): Uint8Array {
  const files = Object.fromEntries(Object.entries(parts).map(([name, contents]) => [name, typeof contents === 'string' ? xml(contents) : contents]))
  return zipSync(files, { level: 0 })
}

export function makeDocx(body: string, withImage = false): Uint8Array {
  return officeArchive({
    '[Content_Types].xml': '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    'word/document.xml': '<w:document xmlns:w="urn:w"><w:body>' + body + '</w:body></w:document>',
    ...(withImage ? {
      'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/pixel.png"/></Relationships>',
      'word/media/pixel.png': TINY_PNG,
    } : {}),
  })
}

export function makePptx(): Uint8Array {
  return officeArchive({
    '[Content_Types].xml': '<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>',
    'ppt/presentation.xml': '<p:presentation xmlns:p="urn:p" xmlns:r="urn:r"><p:sldIdLst><p:sldId id="1" r:id="rId1"/></p:sldIdLst></p:presentation>',
    'ppt/_rels/presentation.xml.rels': '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml" Type="slide"/></Relationships>',
    'ppt/slides/slide1.xml': '<p:sld xmlns:p="urn:p" xmlns:a="urn:a" xmlns:r="urn:r"><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Agenda</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:txBody><a:p><a:r><a:t>First point</a:t></a:r></a:p></p:txBody></p:sp><p:pic><p:blipFill><a:blip r:embed="rImage"/></p:blipFill></p:pic><a:tbl><a:tr><a:tc><a:p><a:r><a:t>Metric</a:t></a:r></a:p></a:tc><a:tc><a:p><a:r><a:t>Value</a:t></a:r></a:p></a:tc></a:tr><a:tr><a:tc><a:p><a:r><a:t>Coverage</a:t></a:r></a:p></a:tc><a:tc><a:p><a:r><a:t>92%</a:t></a:r></a:p></a:tc></a:tr></a:tbl></p:spTree></p:sld>',
    'ppt/slides/_rels/slide1.xml.rels': '<Relationships><Relationship Id="rNotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/><Relationship Id="rImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/pixel.png"/></Relationships>',
    'ppt/notesSlides/notesSlide1.xml': '<p:notes xmlns:p="urn:p" xmlns:a="urn:a"><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Speaker note</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><a:t>1</a:t></p:sp></p:notes>',
    'ppt/media/pixel.png': TINY_PNG,
  })
}

export function makeXlsx(rows = 4, multipleSheets = false): Uint8Array {
  const rowXml = Array.from({ length: rows }, (_, offset) => {
    const row = offset + 1
    if (row === 1) return '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>'
    return '<row r="' + row + '"><c r="A' + row + '"><v>' + row + '</v></c><c r="B' + row + '"><f>SUM(A1:A' + row + ')</f><v>' + (row * 2) + '</v></c><c r="C' + row + '" s="1"><v>45000</v></c></row>'
  }).join('')
  return officeArchive({
    '[Content_Types].xml': '<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    'xl/workbook.xml': '<workbook xmlns:r="urn:r"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/>' + (multipleSheets ? '<sheet name="Summary" sheetId="2" r:id="rId2"/>' : '') + '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/>' + (multipleSheets ? '<Relationship Id="rId2" Type="worksheet" Target="worksheets/sheet2.xml"/>' : '') + '</Relationships>',
    'xl/worksheets/sheet1.xml': '<worksheet><dimension ref="A1:C' + rows + '"/><sheetData>' + rowXml + '</sheetData><mergeCells count="1"><mergeCell ref="A1:C1"/></mergeCells></worksheet>',
    ...(multipleSheets ? { 'xl/worksheets/sheet2.xml': '<worksheet><dimension ref="A1:A1"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>summary</t></is></c></row></sheetData></worksheet>' } : {}),
    'xl/sharedStrings.xml': '<sst><si><t>Name</t></si><si><t>Result</t></si></sst>',
    'xl/styles.xml': '<styleSheet><numFmts count="0"/><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
  })
}

export function makeWideXlsx(rows = 250): Uint8Array {
  return officeArchive({
    '[Content_Types].xml': '<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    'xl/workbook.xml': '<workbook xmlns:r="urn:r"><sheets><sheet name="Wide" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': '<worksheet><dimension ref="A1:BH' + rows + '"/><sheetData><row r="1"><c r="AY1" t="inlineStr"><is><t>column 51</t></is></c><c r="BH1" t="inlineStr"><is><t>column 60</t></is></c></row></sheetData></worksheet>',
  })
}

export function makePdf(pageCount: number, encrypted = false): Uint8Array {
  const objects: string[] = []
  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push('<< /Type /Pages /Kids [' + Array.from({ length: pageCount }, (_, index) => (8 + index * 2) + ' 0 R').join(' ') + '] /Count ' + pageCount + ' >>')
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  objects.push('<< /Type /Font /Subtype /Type0 /BaseFont /Arial /Encoding /Identity-H /DescendantFonts [5 0 R] /ToUnicode 7 0 R >>')
  objects.push('<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Arial /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor 6 0 R /DW 1000 /CIDToGIDMap /Identity >>')
  objects.push('<< /Type /FontDescriptor /FontName /Arial /Flags 32 /FontBBox [-1000 -1000 2000 2000] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 >>')
  const cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n1 beginbfrange\n<0000> <007F> <0000>\nendbfrange\n2 beginbfchar\n<4E2D> <4E2D>\n<6587> <6587>\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend'
  objects.push('<< /Length ' + Buffer.byteLength(cmap) + ' >>\nstream\n' + cmap + '\nendstream')
  for (let page = 1; page <= pageCount; page += 1) {
    const pageObject = 8 + (page - 1) * 2
    const streamObject = pageObject + 1
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + streamObject + ' 0 R >>')
    const stream = 'BT /F1 12 Tf 50 700 Td (Page ' + page + ' searchable text ) Tj /F2 12 Tf <4E2D6587> Tj ET'
    objects.push('<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream')
  }
  if (encrypted) objects.push('<< /Filter /Standard /V 1 /R 2 /O <' + '00'.repeat(32) + '> /U <' + '00'.repeat(32) + '> /P -4 >>')
  const parts = ['%PDF-1.4\n']
  const offsets = [0]
  let bytes = Buffer.byteLength(parts[0]!)
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(bytes)
    const object = (index + 1) + ' 0 obj\n' + objects[index] + '\nendobj\n'
    parts.push(object)
    bytes += Buffer.byteLength(object)
  }
  const xrefOffset = bytes
  parts.push('xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n')
  for (const offset of offsets.slice(1)) parts.push(String(offset).padStart(10, '0') + ' 00000 n \n')
  parts.push('trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R' + (encrypted ? ' /Encrypt ' + objects.length + ' 0 R' : '') + ' >>\nstartxref\n' + xrefOffset + '\n%%EOF')
  return new Uint8Array(Buffer.from(parts.join(''), 'utf8'))
}

export function makeEncryptedPdf(): Uint8Array {
  return makePdf(1, true)
}

/** Copyright-free image-only PDF pages for scanned-page routing tests. */
export function makeScannedPdf(pageCount = 1): Uint8Array {
  const image = Buffer.from([0, 0, 0])
  const content = Buffer.from('q 1 0 0 1 10 10 cm /Im1 Do Q', 'ascii')
  const kids = Array.from({ length: pageCount }, (_, index) => (4 + index * 2) + ' 0 R').join(' ')
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'ascii'),
    Buffer.from('<< /Type /Pages /Kids [' + kids + '] /Count ' + pageCount + ' >>', 'ascii'),
    Buffer.concat([
      Buffer.from('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 3 >>\nstream\n', 'ascii'),
      image,
      Buffer.from('\nendstream', 'ascii'),
    ]),
  ]
  for (let page = 1; page <= pageCount; page += 1) {
    const pageObject = 4 + (page - 1) * 2
    objects.push(Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 20 20] /Resources << /XObject << /Im1 3 0 R >> >> /Contents ' + (pageObject + 1) + ' 0 R >>', 'ascii'))
    objects.push(Buffer.concat([
      Buffer.from('<< /Length ' + content.length + ' >>\nstream\n', 'ascii'),
      content,
      Buffer.from('\nendstream', 'ascii'),
    ]))
  }
  const parts: Buffer[] = [Buffer.from('%PDF-1.4\n', 'ascii')]
  const offsets = [0]
  let bytes = parts[0]!.length
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(bytes)
    const object = Buffer.concat([
      Buffer.from((index + 1) + ' 0 obj\n', 'ascii'),
      objects[index]!,
      Buffer.from('\nendobj\n', 'ascii'),
    ])
    parts.push(object)
    bytes += object.length
  }
  const xrefOffset = bytes
  parts.push(Buffer.from('xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n', 'ascii'))
  for (const offset of offsets.slice(1)) parts.push(Buffer.from(String(offset).padStart(10, '0') + ' 00000 n \n', 'ascii'))
  parts.push(Buffer.from('trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF', 'ascii'))
  return new Uint8Array(Buffer.concat(parts))
}

export function makeZipBomb(): Uint8Array {
  return zipSync({ '[Content_Types].xml': xml('<Types><Override PartName="/word/document.xml"/></Types>'), 'word/document.xml': xml('<w:document>' + 'A'.repeat(150_000) + '</w:document>') }, { level: 9 })
}

export function makeEncryptedDocx(): Uint8Array {
  const bytes = makeDocx('<w:p><w:r><w:t>encrypted fixture</w:t></w:r></w:p>')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  for (let offset = 0; offset + 46 <= bytes.length; offset += 1) {
    if (view.getUint32(offset, true) === 0x02014b50) {
      view.setUint16(offset + 8, view.getUint16(offset + 8, true) | 0x1, true)
    }
  }
  return bytes
}
