import { strToU8, zipSync } from 'fflate'

const xml = (value: string): Uint8Array => strToU8(value)

export function officeArchive(parts: Record<string, string>): Uint8Array {
  const files = Object.fromEntries(Object.entries(parts).map(([name, contents]) => [name, xml(contents)]))
  return zipSync(files, { level: 0 })
}

export function makeDocx(body: string): Uint8Array {
  return officeArchive({
    '[Content_Types].xml': '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    'word/document.xml': '<w:document xmlns:w="urn:w"><w:body>' + body + '</w:body></w:document>',
  })
}

export function makePptx(): Uint8Array {
  return officeArchive({
    '[Content_Types].xml': '<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>',
    'ppt/presentation.xml': '<p:presentation xmlns:p="urn:p" xmlns:r="urn:r"><p:sldIdLst><p:sldId id="1" r:id="rId1"/></p:sldIdLst></p:presentation>',
    'ppt/_rels/presentation.xml.rels': '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml" Type="slide"/></Relationships>',
    'ppt/slides/slide1.xml': '<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><p:spTree><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Agenda</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:txBody><a:p><a:r><a:t>First point</a:t></a:r></a:p></p:txBody></p:sp><a:tbl><a:tr><a:tc><a:p><a:r><a:t>Metric</a:t></a:r></a:p></a:tc><a:tc><a:p><a:r><a:t>Value</a:t></a:r></a:p></a:tc></a:tr><a:tr><a:tc><a:p><a:r><a:t>Coverage</a:t></a:r></a:p></a:tc><a:tc><a:p><a:r><a:t>92%</a:t></a:r></a:p></a:tc></a:tr></a:tbl></p:spTree></p:sld>',
    'ppt/slides/_rels/slide1.xml.rels': '<Relationships><Relationship Id="rNotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/><Relationship Id="rImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/pixel.png"/></Relationships>',
    'ppt/notesSlides/notesSlide1.xml': '<p:notes xmlns:p="urn:p" xmlns:a="urn:a"><p:sp><p:nvSpPr><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>Speaker note</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><a:t>1</a:t></p:sp></p:notes>',
    'ppt/media/pixel.png': 'not-real-png-fixture',
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

export function makePdf(pageCount: number): Uint8Array {
  const objects: string[] = []
  const pageRefs: string[] = []
  objects.push('<< /Type /Catalog /Pages 2 0 R >>')
  objects.push('<< /Type /Pages /Kids [' + Array.from({ length: pageCount }, (_, index) => (4 + index * 2) + ' 0 R').join(' ') + '] /Count ' + pageCount + ' >>')
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  for (let page = 1; page <= pageCount; page += 1) {
    const pageObject = 4 + (page - 1) * 2
    const streamObject = pageObject + 1
    pageRefs.push(pageObject + ' 0 R')
    objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ' + streamObject + ' 0 R >>')
    const stream = 'BT /F1 12 Tf 50 700 Td (Page ' + page + ' searchable text) Tj ET'
    objects.push('<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + '\nendstream')
  }
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
  parts.push('trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF')
  return new Uint8Array(Buffer.from(parts.join(''), 'utf8'))
}

/** A copyright-free, one-pixel image-only PDF page for scan detection tests. */
export function makeScannedPdf(): Uint8Array {
  const image = Buffer.from([0, 0, 0])
  const content = Buffer.from('q 1 0 0 1 10 10 cm /Im1 Do Q', 'ascii')
  const objects = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'ascii'),
    Buffer.from('<< /Type /Pages /Kids [4 0 R] /Count 1 >>', 'ascii'),
    Buffer.concat([
      Buffer.from('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 3 >>\nstream\n', 'ascii'),
      image,
      Buffer.from('\nendstream', 'ascii'),
    ]),
    Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 20 20] /Resources << /XObject << /Im1 3 0 R >> >> /Contents 5 0 R >>', 'ascii'),
    Buffer.concat([
      Buffer.from('<< /Length ' + content.length + ' >>\nstream\n', 'ascii'),
      content,
      Buffer.from('\nendstream', 'ascii'),
    ]),
  ]
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
