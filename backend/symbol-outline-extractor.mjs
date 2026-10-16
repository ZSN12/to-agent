import path from 'node:path'
import ts from 'typescript'

const SYMBOL_OUTLINE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyi', '.rs', '.go', '.swift',
])

export function supportsFileSymbolOutline(filePath) {
  return SYMBOL_OUTLINE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
}

/**
 * 符号种类定义
 * @typedef {'class' | 'interface' | 'type' | 'function' | 'method' | 'property' | 'enum' | 'struct' | 'trait'} SymbolKind
 *
 * @typedef {{
 *   name: string,
 *   kind: SymbolKind,
 *   line: number,
 *   signature?: string,
 *   exported?: boolean,
 *   rawName?: string,
 *   children?: SymbolEntry[],
 * }} SymbolEntry
 */

/**
 * 提取 TypeScript / JavaScript 文件的符号大纲（利用 TypeScript Compiler API AST）
 * @param {string} filePath
 * @param {string} content
 * @returns {SymbolEntry[]}
 */
export function extractTsJsSymbols(filePath, content) {
  const ext = path.extname(filePath).toLowerCase()
  let scriptKind = ts.ScriptKind.TS
  if (ext === '.tsx') scriptKind = ts.ScriptKind.TSX
  else if (ext === '.jsx') scriptKind = ts.ScriptKind.JSX
  else if (ext === '.js' || ext === '.mjs' || ext === '.cjs') scriptKind = ts.ScriptKind.JS

  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  )

  /** @type {SymbolEntry[]} */
  const symbols = []

  /**
   * 判断节点是否有 export 修饰符
   */
  function isExported(node) {
    if (!node.modifiers) return false
    return node.modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  }

  /**
   * 格式化参数列表
   */
  function formatParams(parameters) {
    if (!parameters || parameters.length === 0) return '()'
    const parts = parameters.map((p) => {
      const name = p.name ? p.name.getText(sourceFile) : 'arg'
      const optional = p.questionToken ? '?' : ''
      return `${name}${optional}`
    })
    return `(${parts.join(', ')})`
  }

  function getLine(node) {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
  }

  function visit(node) {
    // 1. 函数声明 function foo(x, y)
    if (ts.isFunctionDeclaration(node) && node.name) {
      const name = node.name.text
      const line = getLine(node)
      const params = formatParams(node.parameters)
      symbols.push({
        name: `${name}${params}`,
        rawName: name,
        kind: 'function',
        line,
        signature: `function ${name}${params}`,
        exported: isExported(node),
      })
    }

    // 2. 类声明 class Foo
    else if (ts.isClassDeclaration(node) && node.name) {
      const name = node.name.text
      const line = getLine(node)
      /** @type {SymbolEntry[]} */
      const children = []

      // 提取类中可调用成员；把构造器、存取器和函数型字段纳入索引，
      // 这样 Planner 才能沿类型定义定位真实调用入口。
      for (const member of node.members) {
        let methodName = null
        let parameters = null
        let signaturePrefix = ''
        if (ts.isMethodDeclaration(member) && member.name) {
          methodName = member.name.getText(sourceFile)
          parameters = member.parameters
        } else if (ts.isConstructorDeclaration(member)) {
          methodName = 'constructor'
          parameters = member.parameters
        } else if ((ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) && member.name) {
          methodName = member.name.getText(sourceFile)
          parameters = member.parameters
          signaturePrefix = ts.isGetAccessorDeclaration(member) ? 'get ' : 'set '
        } else if (ts.isPropertyDeclaration(member) && member.name && member.initializer
          && (ts.isArrowFunction(member.initializer) || ts.isFunctionExpression(member.initializer))) {
          methodName = member.name.getText(sourceFile)
          parameters = member.initializer.parameters
        }
        if (methodName) {
          const mLine = getLine(member)
          const params = formatParams(parameters)
          children.push({
            name: `${methodName}${params}`,
            rawName: methodName,
            kind: 'method',
            line: mLine,
            signature: `${signaturePrefix}${methodName}${params}`,
            exported: false,
          })
        }
      }

      symbols.push({
        name,
        rawName: name,
        kind: 'class',
        line,
        signature: `class ${name}`,
        exported: isExported(node),
        children: children.length > 0 ? children : undefined,
      })
    }

    // 3. 接口声明 interface Bar
    else if (ts.isInterfaceDeclaration(node)) {
      const name = node.name.text
      const line = getLine(node)
      const children = node.members.flatMap((member) => {
        if (ts.isMethodSignature(member) && member.name) {
          const methodName = member.name.getText(sourceFile)
          const params = formatParams(member.parameters)
          return [{
            name: `${methodName}${params}`,
            rawName: methodName,
            kind: 'method',
            line: getLine(member),
            signature: `${methodName}${params}`,
            exported: false,
          }]
        }
        if (ts.isPropertySignature(member) && member.name) {
          const propertyName = member.name.getText(sourceFile)
          return [{
            name: propertyName,
            rawName: propertyName,
            kind: 'property',
            line: getLine(member),
            signature: propertyName,
            exported: false,
          }]
        }
        return []
      })
      symbols.push({
        name,
        rawName: name,
        kind: 'interface',
        line,
        signature: `interface ${name}`,
        exported: isExported(node),
        children: children.length > 0 ? children : undefined,
      })
    }

    // 4. 类型别名 type Baz = ...
    else if (ts.isTypeAliasDeclaration(node)) {
      const name = node.name.text
      const line = getLine(node)
      symbols.push({
        name,
        rawName: name,
        kind: 'type',
        line,
        signature: `type ${name}`,
        exported: isExported(node),
      })
    }

    // 5. 枚举 enum Color
    else if (ts.isEnumDeclaration(node)) {
      const name = node.name.text
      const line = getLine(node)
      symbols.push({
        name,
        rawName: name,
        kind: 'enum',
        line,
        signature: `enum ${name}`,
        exported: isExported(node),
      })
    }

    // 6. 顶级变量中的箭头函数/表达式: const handler = (...) => ...
    else if (ts.isVariableStatement(node)) {
      const exported = isExported(node)
      for (const decl of node.declarationList.declarations) {
        if (decl.name && ts.isIdentifier(decl.name)) {
          const varName = decl.name.text
          if (decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) {
            const line = getLine(decl)
            const params = formatParams(decl.initializer.parameters)
            symbols.push({
              name: `${varName}${params}`,
              rawName: varName,
              kind: 'function',
              line,
              signature: `const ${varName} = ${params} =>`,
              exported,
            })
          }
        }
      }
    }

    ts.forEachChild(node, (child) => {
      // 不递归深入函数体内部提取局部变量
      if (!ts.isFunctionDeclaration(node) && !ts.isMethodDeclaration(node) && !ts.isClassDeclaration(node)) {
        visit(child)
      }
    })
  }

  visit(sourceFile)
  return symbols
}

/**
 * 提取 Python 文件的符号大纲
 * @param {string} content
 * @returns {SymbolEntry[]}
 */
export function extractPythonSymbols(content) {
  const lines = content.split(/\r?\n/)
  /** @type {SymbolEntry[]} */
  const symbols = []
  /** @type {{ indent: number, entry: SymbolEntry }[]} */
  const scopeStack = []

  function getIndentWidth(line) {
    let width = 0
    for (const char of line) {
      if (char === ' ') width += 1
      else if (char === '\t') width += 8 - (width % 8)
      else break
    }
    return width
  }

  /**
   * @param {SymbolEntry} entry
   * @param {SymbolEntry | null} parent
   */
  function addSymbol(entry, parent) {
    if (parent) {
      parent.children ??= []
      parent.children.push(entry)
    } else {
      symbols.push(entry)
    }
  }

  function parseFunctionHeader(startLine, startIndent) {
    const declaration = lines[startLine].trim().match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(/)
    if (!declaration) return null
    const functionName = declaration[1]
    const openColumn = lines[startLine].indexOf('(', lines[startLine].indexOf(functionName) + functionName.length)
    if (openColumn < 0) return null

    let opened = false
    let depth = 0
    let quote = null
    let tripleQuote = false
    let escaped = false
    let parameters = ''
    for (let lineIndex = startLine; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex]
      if (lineIndex > startLine && getIndentWidth(line) <= startIndent && line.trim()
        && !line.trim().startsWith(')')) return null
      const beginColumn = lineIndex === startLine ? openColumn : 0
      for (let column = beginColumn; column < line.length; column += 1) {
        const char = line[column]
        const next = line[column + 1]
        const nextNext = line[column + 2]
        if (!opened) {
          if (char === '(') {
            opened = true
            depth = 1
          }
          continue
        }
        if (quote) {
          if (escaped) escaped = false
          else if (char === '\\') escaped = true
          else if (tripleQuote && char === quote && next === quote && nextNext === quote) {
            quote = null
            tripleQuote = false
            column += 2
          } else if (!tripleQuote && char === quote) quote = null
          parameters += char
          continue
        }
        if (char === '#') break
        if ((char === '\'' || char === '"') && next === char && nextNext === char) {
          quote = char
          tripleQuote = true
          parameters += char.repeat(3)
          column += 2
          continue
        }
        if (char === '\'' || char === '"') {
          quote = char
          parameters += char
          continue
        }
        if (char === '(') depth += 1
        if (char === ')') {
          depth -= 1
          if (depth === 0) {
            return { name: functionName, parameters, endLine: lineIndex }
          }
        }
        parameters += char
      }
      parameters += '\n'
    }
    return null
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const indent = getIndentWidth(rawLine)
    while (scopeStack.length > 0 && scopeStack.at(-1).indent >= indent) {
      scopeStack.pop()
    }
    const parent = scopeStack.at(-1)?.entry ?? null

    // class Foo(Bar):
    const classMatch = trimmed.match(/^class\s+([a-zA-Z0-9_]+)(?:\((.*?)\))?\s*:/)
    if (classMatch) {
      const name = classMatch[1]
      const inherit = classMatch[2] ? `(${classMatch[2]})` : ''
      /** @type {SymbolEntry} */
      const entry = {
        name,
        rawName: name,
        kind: 'class',
        line: i + 1,
        signature: `class ${name}${inherit}`,
        exported: !name.startsWith('_'),
        children: [],
      }
      addSymbol(entry, parent)
      scopeStack.push({ indent, entry })
      continue
    }

    // def bar(self, x): 也支持跨多行签名、默认值括号和字符串中的右括号。
    const funcHeader = parseFunctionHeader(i, indent)
    if (funcHeader) {
      const name = funcHeader.name
      const rawParams = funcHeader.parameters.replace(/\s+/g, ' ').trim()
      const params = rawParams ? `(${rawParams.slice(0, 50)})` : '()'

      /** @type {SymbolEntry} */
      const entry = {
        name: `${name}${params}`,
        rawName: name,
        kind: parent?.kind === 'class' ? 'method' : 'function',
        line: i + 1,
        signature: `def ${name}${params}`,
        exported: !name.startsWith('_'),
      }

      addSymbol(entry, parent)
      scopeStack.push({ indent, entry })
      i = funcHeader.endLine
    }
  }

  return symbols
}

/**
 * 提取 Rust 文件的符号大纲
 * @param {string} content
 * @returns {SymbolEntry[]}
 */
export function extractRustSymbols(content) {
  const lines = content.split(/\r?\n/)
  /** @type {SymbolEntry[]} */
  const symbols = []
  const functionsByLine = new Map()
  const functionPattern = /^[ \t]*(?:(pub(?:\([^)\r\n]+\))?)\s+)?(?:(?:async|unsafe|const|extern(?:\s+"[^"]+")?)\s+)*fn\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*(?:->[^;{]*)?[;{]/gm
  for (const match of content.matchAll(functionPattern)) {
    const line = content.slice(0, match.index).split('\n').length
    const indent = lines[line - 1]?.match(/^[ \t]*/)?.[0].length ?? 0
    const name = match[2]
    const hasParams = Boolean(match[3]?.trim())
    functionsByLine.set(line, {
      name: `${name}${hasParams ? '(...)' : '()'}`,
      rawName: name,
      kind: indent > 0 ? 'method' : 'function',
      line,
      signature: `fn ${name}${hasParams ? '(...)' : '()'}`,
      exported: Boolean(match[1]),
    })
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('//') || line.startsWith('/*')) continue

    const pub = line.startsWith('pub')

    // struct Name
    const structMatch = line.match(/^(?:pub(?:\([^)]+\))?\s+)?struct\s+([a-zA-Z0-9_]+)/)
    if (structMatch) {
      symbols.push({
        name: structMatch[1],
        rawName: structMatch[1],
        kind: 'struct',
        line: i + 1,
        signature: `struct ${structMatch[1]}`,
        exported: pub,
      })
      continue
    }

    // enum Name
    const enumMatch = line.match(/^(?:pub(?:\([^)]+\))?\s+)?enum\s+([a-zA-Z0-9_]+)/)
    if (enumMatch) {
      symbols.push({
        name: enumMatch[1],
        rawName: enumMatch[1],
        kind: 'enum',
        line: i + 1,
        signature: `enum ${enumMatch[1]}`,
        exported: pub,
      })
      continue
    }

    // trait Name
    const traitMatch = line.match(/^(?:pub(?:\([^)]+\))?\s+)?trait\s+([a-zA-Z0-9_]+)/)
    if (traitMatch) {
      symbols.push({
        name: traitMatch[1],
        rawName: traitMatch[1],
        kind: 'trait',
        line: i + 1,
        signature: `trait ${traitMatch[1]}`,
        exported: pub,
      })
      continue
    }

    const functionSymbol = functionsByLine.get(i + 1)
    if (functionSymbol) symbols.push(functionSymbol)
  }

  return symbols
}

/**
 * 提取 Go 文件的符号大纲
 * @param {string} content
 * @returns {SymbolEntry[]}
 */
export function extractGoSymbols(content) {
  const lines = content.split(/\r?\n/)
  /** @type {SymbolEntry[]} */
  const symbols = []
  const functionsByLine = new Map()
  const functionPattern = /^[ \t]*func\s+(?:\(([^)]+)\)\s+)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*[^{}]*\{/gm
  for (const match of content.matchAll(functionPattern)) {
    const line = content.slice(0, match.index).split('\n').length
    const name = match[2]
    const hasParams = Boolean(match[3]?.trim())
    functionsByLine.set(line, {
      name: `${name}${hasParams ? '(...)' : '()'}`,
      rawName: name,
      kind: match[1] ? 'method' : 'function',
      line,
      signature: `func ${name}${hasParams ? '(...)' : '()'}`,
      exported: /^[A-Z]/.test(name),
    })
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('//')) continue

    // type Foo struct / interface
    const typeMatch = line.match(/^type\s+([a-zA-Z0-9_]+)(?:\s*\[[^\]]+\])?\s+(struct|interface)/)
    if (typeMatch) {
      const name = typeMatch[1]
      const kind = typeMatch[2] === 'struct' ? 'struct' : 'interface'
      const exported = /^[A-Z]/.test(name)
      symbols.push({
        name,
        rawName: name,
        kind,
        line: i + 1,
        signature: `type ${name} ${typeMatch[2]}`,
        exported,
      })
      continue
    }

    const functionSymbol = functionsByLine.get(i + 1)
    if (functionSymbol) symbols.push(functionSymbol)
  }

  return symbols
}

function maskSwiftCommentsAndStrings(content) {
  const characters = content.split('')
  const mask = (start, end) => {
    for (let index = start; index < end; index += 1) {
      if (characters[index] !== '\n' && characters[index] !== '\r') characters[index] = ' '
    }
  }

  let index = 0
  while (index < content.length) {
    if (content.startsWith('//', index)) {
      const start = index
      while (index < content.length && content[index] !== '\n' && content[index] !== '\r') index += 1
      mask(start, index)
      continue
    }
    if (content.startsWith('/*', index)) {
      const start = index
      index += 2
      let depth = 1
      while (index < content.length && depth > 0) {
        if (content.startsWith('/*', index)) {
          depth += 1
          index += 2
        } else if (content.startsWith('*/', index)) {
          depth -= 1
          index += 2
        } else {
          index += 1
        }
      }
      mask(start, index)
      continue
    }

    let quoteIndex = index
    while (content[quoteIndex] === '#') quoteIndex += 1
    if (content[quoteIndex] !== '"') {
      index += 1
      continue
    }

    const rawHashCount = quoteIndex - index
    const multiline = content.startsWith('"""', quoteIndex)
    const quoteWidth = multiline ? 3 : 1
    const start = index
    index = quoteIndex + quoteWidth
    while (index < content.length) {
      if (content[index] === '\\') {
        const escapeHashStart = index + 1
        const escapeHashEnd = escapeHashStart + rawHashCount
        if (rawHashCount === 0 || content.slice(escapeHashStart, escapeHashEnd) === '#'.repeat(rawHashCount)) {
          index = Math.min(content.length, escapeHashEnd + 1)
          continue
        }
      }
      if (content.startsWith('"'.repeat(quoteWidth), index)
        && content.slice(index + quoteWidth, index + quoteWidth + rawHashCount) === '#'.repeat(rawHashCount)) {
        index += quoteWidth + rawHashCount
        break
      }
      index += 1
    }
    mask(start, index)
  }

  return characters.join('')
}

function swiftDeclarationSignature(lines, startLine) {
  let signature = ''
  let roundDepth = 0
  let squareDepth = 0
  for (let index = startLine; index < Math.min(lines.length, startLine + 12); index += 1) {
    const line = lines[index]
    signature += `${signature ? ' ' : ''}${line.trim()}`
    for (const character of line) {
      if (character === '(') roundDepth += 1
      else if (character === ')') roundDepth = Math.max(0, roundDepth - 1)
      else if (character === '[') squareDepth += 1
      else if (character === ']') squareDepth = Math.max(0, squareDepth - 1)
      else if (character === '{' && roundDepth === 0 && squareDepth === 0) return signature.slice(0, signature.indexOf('{')).trim().slice(0, 220)
    }
    if (roundDepth === 0 && squareDepth === 0) break
  }
  return signature.slice(0, 220)
}

/**
 * Swift outline parser for common top-level and direct type-member declarations.
 * It masks comments and strings before scanning braces so examples and docs do
 * not become fake symbols. This is intentionally a lightweight index; source
 * reads remain the authority for exact syntax and behavior.
 * @param {string} content
 * @returns {SymbolEntry[]}
 */
export function extractSwiftSymbols(content) {
  if (!content || typeof content !== 'string') return []
  const masked = maskSwiftCommentsAndStrings(content)
  const lines = masked.split(/\r?\n/)
  const symbols = []
  const braceStack = []
  let pendingType = null
  let pendingBody = false
  const modifierPrefix = String.raw`(?:(?:public|private(?:\([^)]*\))?|fileprivate|internal|open|package|final|indirect|distributed|nonisolated|static|override|mutating|nonmutating|convenience|required|lazy|weak|unowned|dynamic|optional|prefix|postfix|infix|borrowing|consuming|sending|@\w+(?:\.\w+)*(?:\([^)]*\))?)\s+)*`

  const appendSymbol = (entry) => {
    const parent = braceStack.at(-1)
    if (parent?.kind === 'type' && parent.symbol) {
      parent.symbol.children ??= []
      parent.symbol.children.push(entry)
    } else {
      symbols.push(entry)
    }
  }

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]
    const trimmed = line.trim()
    const currentScope = braceStack.at(-1)
    const declarationScope = braceStack.length === 0 || currentScope?.kind === 'type'
    let typeSymbol = null
    let memberDeclaration = null
    let protocolRequirement = false

    if (declarationScope && trimmed) {
      const typeMatch = trimmed.match(new RegExp(`^${modifierPrefix}(class|struct|enum|protocol|actor|extension)\\s+([A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*)*)`))
      if (typeMatch) {
        const [, typeKeyword, name] = typeMatch
        const kind = typeKeyword === 'struct' ? 'struct'
          : typeKeyword === 'enum' ? 'enum'
            : typeKeyword === 'protocol' ? 'interface'
              : typeKeyword === 'extension' ? 'type' : 'class'
        typeSymbol = {
          name: typeKeyword === 'extension' ? `extension ${name}` : name,
          rawName: name,
          kind,
          line: lineIndex + 1,
          signature: `${typeKeyword} ${name}`,
          exported: /\b(?:public|open)\b/.test(trimmed),
        }
        appendSymbol(typeSymbol)
      } else {
        const functionMatch = trimmed.match(new RegExp(`^${modifierPrefix}(?:(?:class|static|override|mutating|nonmutating|nonisolated|optional|prefix|postfix|infix|borrowing|consuming|sending)\\s+)*func\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*(?:<[^>]*>)?\\s*\\(`))
        const initializerMatch = trimmed.match(new RegExp(`^${modifierPrefix}(?:(?:override|required|convenience|nonisolated)\\s+)*(init)(?:[?!])?\\s*\\(`))
        const deinitializerMatch = trimmed.match(new RegExp(`^${modifierPrefix}(deinit)\\b`))
        const subscriptMatch = trimmed.match(new RegExp(`^${modifierPrefix}(?:(?:static|class|override|mutating|nonmutating)\\s+)*(subscript)\\s*\\[`))
        const propertyMatch = trimmed.match(new RegExp(`^${modifierPrefix}(?:(?:class|static|override|lazy|weak|unowned|dynamic)\\s+)*(?:let|var)\\s+([A-Za-z_][A-Za-z0-9_]*)\\b`))
        const enumCaseMatch = currentScope?.symbol?.kind === 'enum' && trimmed.match(new RegExp(`^${modifierPrefix}case\\s+([A-Za-z_][A-Za-z0-9_]*)\\b`))
        const rawName = functionMatch?.[1] ?? initializerMatch?.[1] ?? deinitializerMatch?.[1] ?? subscriptMatch?.[1]
          ?? propertyMatch?.[1] ?? enumCaseMatch?.[1]

        if (rawName) {
          const isCallable = Boolean(functionMatch || initializerMatch || deinitializerMatch || subscriptMatch)
          const signature = swiftDeclarationSignature(lines, lineIndex)
          const entry = {
            name: isCallable ? `${rawName}${rawName === 'deinit' ? '' : '(...)'}` : rawName,
            rawName,
            kind: isCallable ? (braceStack.length > 0 ? 'method' : 'function') : 'property',
            line: lineIndex + 1,
            signature,
            exported: /\b(?:public|open)\b/.test(trimmed),
          }
          appendSymbol(entry)
          memberDeclaration = { isCallable, isProperty: Boolean(propertyMatch || enumCaseMatch) }
          protocolRequirement = isCallable && currentScope?.symbol?.kind === 'interface'
        }
      }
    }

    let declarationBraceAssigned = false
    let openedType = false
    for (const character of line) {
      if (character === '{') {
        if (!declarationBraceAssigned) {
          if (typeSymbol || pendingType) {
            const symbol = typeSymbol ?? pendingType
            braceStack.push({ kind: 'type', symbol, typeKeyword: symbol.kind === 'interface' ? 'protocol' : null })
            typeSymbol = null
            pendingType = null
            openedType = true
          } else if (pendingBody || memberDeclaration) {
            braceStack.push({ kind: 'other' })
            pendingBody = false
          } else {
            braceStack.push({ kind: 'other' })
          }
          declarationBraceAssigned = true
        } else {
          braceStack.push({ kind: 'other' })
        }
      } else if (character === '}') {
        braceStack.pop()
      }
    }

    if (typeSymbol && !openedType) pendingType = typeSymbol
    if (memberDeclaration && !declarationBraceAssigned && !protocolRequirement) pendingBody = true
  }

  return symbols
}

/**
 * 统一文件符号大纲提取入口
 * @param {string} filePath 文件绝对路径或相对路径
 * @param {string} content 文件源码内容
 * @returns {Promise<SymbolEntry[]> | SymbolEntry[]}
 */
export function extractFileSymbols(filePath, content) {
  if (!content || typeof content !== 'string') return []
  const ext = path.extname(filePath).toLowerCase()

  if (['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
    return extractTsJsSymbols(filePath, content)
  }
  if (['.py', '.pyi'].includes(ext)) {
    return extractPythonSymbols(content)
  }
  if (['.rs'].includes(ext)) {
    return extractRustSymbols(content)
  }
  if (['.go'].includes(ext)) {
    return extractGoSymbols(content)
  }
  if (ext === '.swift') {
    return extractSwiftSymbols(content)
  }

  return []
}
