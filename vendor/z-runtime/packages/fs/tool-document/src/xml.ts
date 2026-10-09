import { DocumentReadError } from './errors.ts'

export interface XmlNode {
  name: string
  attributes: Record<string, string>
  children: XmlNode[]
  text: string
}

function localName(name: string): string {
  const split = name.lastIndexOf(':')
  return split === -1 ? name : name.slice(split + 1)
}

function tagEnd(xml: string, start: number): number {
  let quote = ''
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index]!
    if (quote) {
      if (character === quote) quote = ''
    } else if (character === '"' || character === "'") quote = character
    else if (character === '>') return index
  }
  return -1
}

function decodeEntities(value: string): string {
  if (/&(?!(?:amp|lt|gt|quot|apos|#(?:[0-9]+|x[0-9a-f]+));)/iu.test(value)) {
    throw new DocumentReadError('Office XML contains an invalid entity reference', 'DOCUMENT_XML_ENTITY')
  }
  return value.replace(/&([^;]{1,32});/gu, (_entity, code: string) => {
    switch (code) {
      case 'amp': return '&'
      case 'lt': return '<'
      case 'gt': return '>'
      case 'quot': return '"'
      case 'apos': return "'"
      default: {
        const numeric = code.startsWith('#x') || code.startsWith('#X')
          ? Number.parseInt(code.slice(2), 16)
          : code.startsWith('#') ? Number.parseInt(code.slice(1), 10) : Number.NaN
        if (!Number.isInteger(numeric) || numeric < 1 || numeric > 0x10ffff || (numeric >= 0xd800 && numeric <= 0xdfff)) {
          throw new DocumentReadError('Office XML contains an unsupported entity reference', 'DOCUMENT_XML_ENTITY')
        }
        return String.fromCodePoint(numeric)
      }
    }
  })
}

function parseAttributes(source: string): Record<string, string> {
  const result: Record<string, string> = Object.create(null) as Record<string, string>
  const matcher = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/gu
  let match: RegExpExecArray | null
  while ((match = matcher.exec(source)) !== null) {
    const name = localName(match[1]!)
    const value = decodeEntities(match[3] ?? match[4] ?? '')
    result[name] = value
    result[name.toLowerCase()] = value
  }
  return result
}

/** A deliberately small, non-validating XML reader: external entities and DTDs are rejected. */
export function parseXml(xml: string, maxNodes = 1_000_000): XmlNode {
  if (xml.length > 50 * 1024 * 1024) throw new DocumentReadError('Office XML part exceeds the 50 MB parser limit', 'DOCUMENT_XML_TOO_LARGE')
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(xml)) {
    throw new DocumentReadError('Office XML with DTD or entity declarations is not accepted', 'DOCUMENT_XML_DTD')
  }

  const root: XmlNode = { name: '#document', attributes: Object.create(null) as Record<string, string>, children: [], text: '' }
  const stack: XmlNode[] = [root]
  let nodes = 0
  let cursor = 0

  while (cursor < xml.length) {
    const open = xml.indexOf('<', cursor)
    const parent = stack.at(-1)!
    if (open === -1) {
      if (cursor < xml.length) parent.text += decodeEntities(xml.slice(cursor))
      break
    }
    if (open > cursor) parent.text += decodeEntities(xml.slice(cursor, open))
    if (xml.startsWith('<!--', open)) {
      const end = xml.indexOf('-->', open + 4)
      if (end === -1) throw new DocumentReadError('Office XML has an unterminated comment', 'DOCUMENT_XML_INVALID')
      cursor = end + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', open)) {
      const end = xml.indexOf(']]>', open + 9)
      if (end === -1) throw new DocumentReadError('Office XML has an unterminated CDATA section', 'DOCUMENT_XML_INVALID')
      parent.text += xml.slice(open + 9, end)
      cursor = end + 3
      continue
    }
    if (xml.startsWith('<?', open)) {
      const end = xml.indexOf('?>', open + 2)
      if (end === -1) throw new DocumentReadError('Office XML has an unterminated processing instruction', 'DOCUMENT_XML_INVALID')
      cursor = end + 2
      continue
    }

    const close = tagEnd(xml, open + 1)
    if (close === -1) throw new DocumentReadError('Office XML has an unterminated tag', 'DOCUMENT_XML_INVALID')
    const raw = xml.slice(open + 1, close).trim()
    if (raw.startsWith('!')) throw new DocumentReadError('Office XML contains an unsupported declaration', 'DOCUMENT_XML_DTD')
    if (raw.startsWith('/')) {
      const expected = localName(raw.slice(1).trim())
      if (stack.length === 1 || stack.at(-1)!.name !== expected) {
        throw new DocumentReadError('Office XML contains mismatched tags', 'DOCUMENT_XML_INVALID')
      }
      stack.pop()
      cursor = close + 1
      continue
    }

    const selfClosing = raw.endsWith('/')
    const body = selfClosing ? raw.slice(0, -1).trimEnd() : raw
    const nameEnd = body.search(/\s/u)
    const name = localName(nameEnd === -1 ? body : body.slice(0, nameEnd))
    if (!name) throw new DocumentReadError('Office XML contains an empty tag name', 'DOCUMENT_XML_INVALID')
    const node: XmlNode = {
      name,
      attributes: parseAttributes(nameEnd === -1 ? '' : body.slice(nameEnd + 1)),
      children: [],
      text: '',
    }
    parent.children.push(node)
    nodes += 1
    if (nodes > maxNodes) throw new DocumentReadError('Office XML exceeds the parser node limit', 'DOCUMENT_XML_TOO_LARGE')
    if (!selfClosing) stack.push(node)
    cursor = close + 1
  }
  if (stack.length !== 1) throw new DocumentReadError('Office XML contains unclosed tags', 'DOCUMENT_XML_INVALID')
  return root
}

export function descendants(node: XmlNode, name: string): XmlNode[] {
  const found: XmlNode[] = []
  const stack = [...node.children].reverse()
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current.name === name) found.push(current)
    for (let index = current.children.length - 1; index >= 0; index -= 1) stack.push(current.children[index]!)
  }
  return found
}

export function firstDescendant(node: XmlNode, name: string): XmlNode | undefined {
  const stack = [...node.children].reverse()
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current.name === name) return current
    for (let index = current.children.length - 1; index >= 0; index -= 1) stack.push(current.children[index]!)
  }
  return undefined
}

export function directChildren(node: XmlNode, name: string): XmlNode[] {
  return node.children.filter(child => child.name === name)
}

export function textContent(node: XmlNode): string {
  const parts: string[] = []
  const stack = [node]
  while (stack.length > 0) {
    const current = stack.pop()!
    if (current.text) parts.push(current.text)
    for (let index = current.children.length - 1; index >= 0; index -= 1) stack.push(current.children[index]!)
  }
  return parts.join('')
}
