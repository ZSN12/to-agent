import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const propertyName = (name) => (
  ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
    ? name.text
    : null
)

function firstInvokeChannel(node) {
  let channel = null
  function visit(current) {
    if (channel) return
    if (
      ts.isCallExpression(current)
      && ts.isIdentifier(current.expression)
      && current.expression.text === 'invoke'
      && ts.isStringLiteral(current.arguments[0])
    ) {
      channel = current.arguments[0].text
      return
    }
    ts.forEachChild(current, visit)
  }
  visit(node)
  return channel
}

/** Read the methods exposed by the preload source, including channels and API paths. */
export function parsePreloadApi(source, fileName = 'electron/preload.cjs') {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const invokeMethods = new Map()
  const bridgeMethods = new Map()
  const exposedPaths = new Set([''])

  const addPath = (segments) => {
    for (let index = 1; index <= segments.length; index += 1) {
      exposedPaths.add(segments.slice(0, index).join('.'))
    }
  }

  function visitBridgeObject(object, prefix = []) {
    for (const property of object.properties) {
      if (ts.isPropertyAssignment(property)) {
        const name = propertyName(property.name)
        if (name === null) continue
        const segments = [...prefix, name]
        const initializer = property.initializer
        if (ts.isObjectLiteralExpression(initializer)) {
          addPath(segments)
          visitBridgeObject(initializer, segments)
          continue
        }
        addPath(segments)
        if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
          const bridgePath = segments.join('.')
          bridgeMethods.set(bridgePath, initializer.getText(sourceFile))
        }
        const channel = firstInvokeChannel(initializer)
        if (!channel) continue
        const bridgePath = segments.join('.')
        const previous = invokeMethods.get(channel)
        if (previous && previous !== bridgePath) {
          throw new Error(`preload channel ${channel} is exposed at multiple paths: ${previous}, ${bridgePath}`)
        }
        invokeMethods.set(channel, bridgePath)
      }
      if (ts.isSpreadAssignment(property)) {
        function visitSpread(node) {
          if (ts.isObjectLiteralExpression(node)) {
            visitBridgeObject(node, prefix)
            return
          }
          ts.forEachChild(node, visitSpread)
        }
        visitSpread(property.expression)
      }
    }
  }

  function visitSource(node) {
    if (
      ts.isCallExpression(node)
      && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'exposeInMainWorld'
      && ts.isStringLiteral(node.arguments[0])
      && node.arguments[0].text === 'taskweaver'
      && node.arguments[1]
      && ts.isObjectLiteralExpression(node.arguments[1])
    ) {
      visitBridgeObject(node.arguments[1])
    }
    ts.forEachChild(node, visitSource)
  }
  visitSource(sourceFile)
  return { invokeMethods, bridgeMethods, exposedPaths }
}

/** Return channel -> relative module path for statically registered ipcHandle calls. */
export function scanRegisteredHandlers(backendDir, rootDir) {
  const handlers = new Map()
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, name)
      if (fs.statSync(fullPath).isDirectory()) {
        walk(fullPath)
        continue
      }
      if (!name.endsWith('.mjs')) continue
      const source = fs.readFileSync(fullPath, 'utf8')
      for (const match of source.matchAll(/ipcHandle\(\s*ipcMain,\s*'([^']+)'/g)) {
        const channel = match[1]
        if (handlers.has(channel)) {
          throw new Error(`duplicate ipcHandle registration for ${channel}: ${handlers.get(channel)}, ${path.relative(rootDir, fullPath)}`)
        }
        handlers.set(channel, path.relative(rootDir, fullPath).split(path.sep).join('/'))
      }
    }
  }
  walk(backendDir)
  return handlers
}

/** Find statically written window.taskweaver property paths used by renderer source. */
export function scanRendererTaskweaverPaths(srcDir) {
  const paths = new Map()
  const unwrap = (node) => {
    while (
      ts.isParenthesizedExpression(node)
      || ts.isNonNullExpression(node)
      || ts.isAsExpression(node)
      || ts.isTypeAssertionExpression(node)
      || ts.isSatisfiesExpression(node)
    ) node = node.expression
    return node
  }
  function readChain(node) {
    node = unwrap(node)
    if (ts.isIdentifier(node)) return [node.text]
    if (ts.isPropertyAccessExpression(node)) {
      const parent = readChain(node.expression)
      return parent ? [...parent, node.name.text] : null
    }
    if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) {
      const parent = readChain(node.expression)
      return parent ? [...parent, node.argumentExpression.text] : null
    }
    return null
  }
  function visitFile(filePath) {
    const extension = path.extname(filePath)
    const kind = extension === '.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    const sourceFile = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true, kind)
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const chain = readChain(node.expression)
        if (chain?.[0] === 'window' && chain?.[1] === 'taskweaver') {
          const accessPath = chain.slice(2).join('.')
          paths.set(accessPath, (paths.get(accessPath) ?? 0) + 1)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, name)
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) walk(fullPath)
      else if (name.endsWith('.ts') || name.endsWith('.tsx')) visitFile(fullPath)
    }
  }
  walk(srcDir)
  return paths
}
