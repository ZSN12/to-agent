#!/usr/bin/env node
/** Validate root package-script references without running project commands. */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const issues = []
const scripts = manifest.scripts ?? {}
const pathExtensions = /\.(?:mjs|cjs|js|mts|cts|ts|tsx)$/u
const flagsWithValues = new Set(['--import', '--require', '-r', '--loader', '--env-file', '--test-name-pattern', '--test-reporter'])

function shellTokens(command) {
  const tokens = []
  let token = ''
  let quote = null
  let escaped = false
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index]
    if (escaped) {
      token += char
      escaped = false
      continue
    }
    if (char === '\\' && quote !== "'") {
      escaped = true
      continue
    }
    if (quote) {
      if (char === quote) quote = null
      else token += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/u.test(char)) {
      if (token) tokens.push(token)
      token = ''
      continue
    }
    if (char === ';' || char === '|') {
      if (token) tokens.push(token)
      token = ''
      if (char === '|' && command[index + 1] === '|') index += 1
      continue
    }
    if (char === '&' && command[index + 1] === '&') {
      if (token) tokens.push(token)
      token = ''
      index += 1
      continue
    }
    token += char
  }
  if (token) tokens.push(token)
  return tokens
}

function assertTarget(target, cwd, fromScript) {
  if (!pathExtensions.test(target) || target.startsWith('-') || target.includes('://')) return
  const absolute = path.resolve(cwd, target)
  if (target.includes('*')) {
    const matches = fs.globSync(target, { cwd })
    if (matches.length === 0) issues.push(`${fromScript}: command target glob has no files: ${target}`)
  } else if (!fs.existsSync(absolute)) {
    issues.push(`${fromScript}: command target does not exist: ${path.relative(root, absolute)}`)
  }
}

for (const [scriptName, command] of Object.entries(scripts)) {
  for (const match of command.matchAll(/\bnpm\s+run\s+(?:--if-present\s+)?([\w:-]+)/gu)) {
    if (!Object.hasOwn(scripts, match[1])) issues.push(`${scriptName}: npm run references missing script ${match[1]}`)
  }

  let cwd = root
  const tokens = shellTokens(command)
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token === 'cd' && tokens[index + 1]) {
      cwd = path.resolve(cwd, tokens[index + 1])
      index += 1
      continue
    }
    if (token !== 'node' && token !== 'tsx' && !token.endsWith('/node') && !token.endsWith('/tsx')) continue

    let target = null
    for (let cursor = index + 1; cursor < tokens.length; cursor += 1) {
      const argument = tokens[cursor]
      if (argument === '&&' || argument === '||' || argument === ';') break
      if (argument.startsWith('-')) {
        if (flagsWithValues.has(argument)) cursor += 1
        continue
      }
      if (pathExtensions.test(argument) || argument.includes('*')) {
        target = argument
        break
      }
      // Non-option arguments such as `-e` source are executable snippets; the
      // following words are its program text, not source-file paths.
      if (token === 'node' && (argument === '-e' || argument === '--eval')) break
    }
    if (target) assertTarget(target, cwd, scriptName)
  }
}

if (issues.length) {
  console.error(`check-package-scripts: failed (${issues.length} issue${issues.length === 1 ? '' : 's'})`)
  for (const issue of issues) console.error(`- ${issue}`)
  process.exitCode = 1
} else {
  console.log(`check-package-scripts: ok (${Object.keys(scripts).length} scripts, all npm run and direct node/tsx file references resolve)`)
}
