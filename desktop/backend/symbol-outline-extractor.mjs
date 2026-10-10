import path from 'node:path'
import ts from 'typescript'

/**
 * 符号种类定义
 * @typedef {'class' | 'interface' | 'type' | 'function' | 'method' | 'enum' | 'struct' | 'trait'} SymbolKind
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

      // 提取类方法
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name) {
          const methodName = member.name.getText(sourceFile)
          const mLine = getLine(member)
          const params = formatParams(member.parameters)
          children.push({
            name: `${methodName}${params}`,
            rawName: methodName,
            kind: 'method',
            line: mLine,
            signature: `${methodName}${params}`,
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
      symbols.push({
        name,
        rawName: name,
        kind: 'interface',
        line,
        signature: `interface ${name}`,
        exported: isExported(node),
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
  let currentClass = null

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    const trimmed = rawLine.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // class Foo(Bar):
    const classMatch = rawLine.match(/^class\s+([a-zA-Z0-9_]+)(?:\((.*?)\))?\s*:/)
    if (classMatch) {
      const name = classMatch[1]
      const inherit = classMatch[2] ? `(${classMatch[2]})` : ''
      currentClass = {
        name,
        rawName: name,
        kind: 'class',
        line: i + 1,
        signature: `class ${name}${inherit}`,
        exported: !name.startsWith('_'),
        children: [],
      }
      symbols.push(currentClass)
      continue
    }

    // def bar(self, x):
    const funcMatch = trimmed.match(/^(?:async\s+)?def\s+([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)/)
    if (funcMatch) {
      const name = funcMatch[1]
      const rawParams = funcMatch[2].replace(/\s+/g, ' ').trim()
      const params = rawParams ? `(${rawParams.slice(0, 30)})` : '()'
      const isIndented = rawLine.startsWith(' ') || rawLine.startsWith('\t')

      const entry = {
        name: `${name}${params}`,
        rawName: name,
        kind: isIndented ? 'method' : 'function',
        line: i + 1,
        signature: `def ${name}${params}`,
        exported: !name.startsWith('_'),
      }

      if (isIndented && currentClass && Array.isArray(currentClass.children)) {
        currentClass.children.push(entry)
      } else {
        if (!isIndented) currentClass = null
        symbols.push(entry)
      }
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

    // fn name(...)
    const fnMatch = line.match(/^(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?fn\s+([a-zA-Z0-9_]+)\s*\((.*?)\)/)
    if (fnMatch) {
      const name = fnMatch[1]
      const params = fnMatch[2] ? `(...)` : '()'
      symbols.push({
        name: `${name}${params}`,
        rawName: name,
        kind: 'function',
        line: i + 1,
        signature: `fn ${name}${params}`,
        exported: pub,
      })
    }
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('//')) continue

    // type Foo struct / interface
    const typeMatch = line.match(/^type\s+([a-zA-Z0-9_]+)\s+(struct|interface)/)
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

    // func (r *Recv) Method(...)
    const methodMatch = line.match(/^func\s+\((?:[^)]+)\)\s+([a-zA-Z0-9_]+)\s*\((.*?)\)/)
    if (methodMatch) {
      const name = methodMatch[1]
      const exported = /^[A-Z]/.test(name)
      symbols.push({
        name: `${name}()`,
        rawName: name,
        kind: 'method',
        line: i + 1,
        signature: `func (...) ${name}()`,
        exported,
      })
      continue
    }

    // func Foo(...)
    const funcMatch = line.match(/^func\s+([a-zA-Z0-9_]+)\s*\((.*?)\)/)
    if (funcMatch) {
      const name = funcMatch[1]
      const exported = /^[A-Z]/.test(name)
      symbols.push({
        name: `${name}()`,
        rawName: name,
        kind: 'function',
        line: i + 1,
        signature: `func ${name}()`,
        exported,
      })
    }
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

  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'].includes(ext)) {
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

  return []
}
