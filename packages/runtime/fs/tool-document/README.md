# `@z/dsh-tool-document`

`read_document` reads PDF, PPTX, DOCX, and XLSX files through the DSH `ctx.fs` sandbox. It dispatches by file header, parses in a bounded worker pool, returns an outline before large documents, and limits each call to 20 pages/slides, one worksheet range, or selected DOCX sections.

## Limits

- PDF: 100 MB and 2,000 pages; Office Open XML: 50 MB.
- ZIP archives: 10,000 entries, 500 MB total expanded size, and 100:1 maximum per-entry compression ratio.
- XML parts: 50 MB and one million nodes. DTDs and entity declarations are rejected.
- Parser workers: 2 concurrent workers, 512 MB old-generation heap each, and a 30 second timeout.
- Output defaults to 50 KiB. XLSX reads at most 200 rows × 50 columns per call; DOCX untitled text is split into about 20,000-character sections.

## Parser support

- PDF.js extracts searchable text and identifies image-only pages. It does not perform OCR.
- PPTX reads slide order, titles, body text, tables, notes, and image relationship counts.
- DOCX reads headings, paragraphs, lists, and tables; tracked insertions/deletions and comment markers are omitted.
- XLSX reads worksheet dimensions, merged ranges, formulas with cached values, shared strings, and common date styles. `next` advances across row and column windows.

Image blocks, the DSH durable attachment pipeline, persistent document cache/spill, LibreOffice conversion, legacy binary Office formats, and XLS/XLSB are not implemented here. Requests for embedded/scanned images receive an explicit omission message. Legacy OLE files receive a save-as-modern-format instruction. The TaskWeaver bundle must register this package before the tool is available in the application.
