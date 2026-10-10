import { closeSync, mkdirSync, openSync, unlinkSync, writeSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Zip, ZipDeflate, ZipPassThrough, strToU8 } from 'fflate'
import {
  makeDocx,
  makeEncryptedDocx,
  makeEncryptedPdf,
  makeLegacyXls,
  makePdf,
  makePptx,
  makeScannedPdf,
  makeZipBomb,
} from './fixtures.ts'

const FIXTURE_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'documents')

function writeZipParts(path: string, parts: Record<string, Uint8Array | string>, sheetRows: number): void {
  let fileDescriptor: number | undefined = openSync(path, 'w', 0o600)
  let callbackError: Error | undefined
  const zip = new Zip((error, chunk, final) => {
    if (error) {
      callbackError = error
      return
    }
    if (chunk && fileDescriptor !== undefined) {
      let offset = 0
      while (offset < chunk.length) offset += writeSync(fileDescriptor, chunk, offset, chunk.length - offset)
    }
    if (final && fileDescriptor !== undefined) {
      closeSync(fileDescriptor)
      fileDescriptor = undefined
    }
  })

  const smallEntries = Object.entries(parts).map(([name, content]) => new ZipPassThrough(name))
  const worksheet = new ZipDeflate('xl/worksheets/sheet1.xml', { level: 6 })
  for (const entry of smallEntries) zip.add(entry)
  zip.add(worksheet)

  try {
    for (const [index, [, content]] of Object.entries(parts).entries()) {
      smallEntries[index]!.push(typeof content === 'string' ? strToU8(content) : content, true)
    }
    worksheet.push(strToU8('<worksheet><dimension ref="A1:BH' + sheetRows + '"/><sheetData>'), false)
    for (let row = 1; row <= sheetRows; row += 1) {
      let line = '<row r="' + row + '">'
      if (row === 1) {
        for (let column = 1; column <= 60; column += 1) {
          line += '<c r="' + columnName(column) + '1" t="inlineStr"><is><t>Column ' + column + '</t></is></c>'
        }
      } else {
        for (let column = 1; column <= 60; column += 1) {
          const address = columnName(column) + row
          if (column === 2) {
            line += '<c r="' + address + '"><f>SUM(A' + row + ':A' + row + ')</f><v>' + stableNumber(row, column) + '</v></c>'
          } else if (column === 3) {
            line += '<c r="' + address + '" s="1"><v>' + (45_000 + row) + '</v></c>'
          } else {
            line += '<c r="' + address + '"><v>' + stableNumber(row, column) + '</v></c>'
          }
        }
      }
      line += '</row>'
      worksheet.push(strToU8(line), false)
    }
    worksheet.push(strToU8('</sheetData></worksheet>'), true)
    zip.end()
    if (callbackError) throw callbackError
  } catch (error) {
    if (fileDescriptor !== undefined) {
      closeSync(fileDescriptor)
      fileDescriptor = undefined
    }
    unlinkSync(path)
    throw error
  }
}

function columnName(value: number): string {
  let number = value
  let output = ''
  while (number > 0) {
    number -= 1
    output = String.fromCharCode(65 + number % 26) + output
    number = Math.floor(number / 26)
  }
  return output
}

function stableNumber(row: number, column: number): number {
  return (row * 73_856_093 + column * 19_349_663 + (row ^ column) * 83_492_791) % 1_000_000_000
}

function writeFile(name: string, data: Uint8Array): void {
  const path = join(FIXTURE_DIRECTORY, name)
  const fd = openSync(path, 'w', 0o600)
  try {
    let offset = 0
    while (offset < data.length) offset += writeSync(fd, data, offset, data.length - offset)
  } finally {
    closeSync(fd)
  }
}

export function generateDocumentFixtures(directory = FIXTURE_DIRECTORY, worksheetRows = 50_000): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const originalDirectory = FIXTURE_DIRECTORY
  if (resolve(directory) !== resolve(originalDirectory)) {
    throw new Error('Document fixture output is fixed to tests/fixtures/documents to avoid accidental writes elsewhere.')
  }
  writeFile('text-50-pages.pdf', makePdf(50))
  writeFile('scan-image-only.pdf', makeScannedPdf(1))
  writeFile('encrypted.pdf', makeEncryptedPdf())
  writeFile('encrypted.docx', makeEncryptedDocx())
  writeFile('notes-table-image.pptx', makePptx())
  writeFile('headings-table-image.docx', makeDocx(
    '<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Overview</w:t></w:r></w:p>' +
    '<w:p><w:r><w:t>Generated copyright-free fixture.</w:t></w:r></w:p>' +
    '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Field</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Value</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
    '<w:p><w:r><w:drawing><a:blip r:embed="rIdImage"/></w:drawing></w:r></w:p>',
    true,
  ))
  writeZipParts(join(directory, 'large-50k-60.xlsx'), {
    '[Content_Types].xml': '<Types><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
    'xl/workbook.xml': '<workbook xmlns:r="urn:r"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/styles.xml': '<styleSheet><numFmts count="0"/><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
  }, worksheetRows)
  writeFile('legacy.xls', makeLegacyXls())
  writeFile('zip-bomb.docx', makeZipBomb())
  writeFile('xxe.docx', makeDocx('<!DOCTYPE w:document [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><w:body>&xxe;</w:body>'))
  writeFile('wrong-extension.pdf', makePptx())
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  generateDocumentFixtures()
  console.log('Generated copyright-free document fixtures in ' + FIXTURE_DIRECTORY)
}
