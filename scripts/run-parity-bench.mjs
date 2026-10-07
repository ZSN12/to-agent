#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { renderMarkdown, summarizeReport } from './parity-bench-summary.mjs'

const usage = `Usage: node scripts/run-parity-bench.mjs [--format markdown|json] [--] <report.json> [report.json ...]

Summarize read-smoke, lifecycle-smoke, or live-DAG reports without printing conversation text,
tool arguments, credentials, or other raw report contents.

Options:
  --format <format>  Output format: markdown (default) or json
  --json             Shorthand for --format json
  -h, --help         Show this help

JSON uses schemaVersion 2 and milliseconds. It accepts single-agent read-smoke and
live-DAG reports, selecting aggregate fields only. Missing metrics are null (— in
Markdown), never treated as zero. Report content, tool arguments, and credentials
are not copied into the summary.
`

function parseArgs(args) {
  let format = 'markdown'
  let positionalOnly = false
  let help = false
  const inputs = []

  for (let index = 0; index < args.length; index += 1) {
    const token = args[index]
    if (positionalOnly) {
      inputs.push(token)
      continue
    }
    if (token === '--') {
      positionalOnly = true
      continue
    }
    if (token === '-h' || token === '--help') {
      help = true
      continue
    }
    if (token === '--json') {
      format = 'json'
      continue
    }
    if (token === '--format') {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) throw new Error('Missing value for --format')
      format = value
      index += 1
      continue
    }
    if (token.startsWith('--format=')) {
      format = token.slice('--format='.length)
      continue
    }
    if (token.startsWith('-')) throw new Error(`Unknown option: ${token}`)
    inputs.push(token)
  }

  if (format !== 'markdown' && format !== 'json') throw new Error('--format must be markdown or json')
  if (!help && inputs.length === 0) throw new Error('Provide at least one report.json path')
  return { format, help, inputs }
}

async function readReport(input, index) {
  const filePath = path.resolve(input)
  let stat
  try {
    stat = await fs.stat(filePath)
  } catch {
    throw new Error(`Input ${index + 1}: cannot access ${filePath}`)
  }
  if (!stat.isFile()) throw new Error(`Input ${index + 1}: not a regular file: ${filePath}`)

  let raw
  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch {
    throw new Error(`Input ${index + 1}: cannot read ${filePath}`)
  }

  let report
  try {
    report = JSON.parse(raw)
  } catch {
    // Avoid echoing parser diagnostics because they may quote report contents.
    throw new Error(`Input ${index + 1}: invalid JSON in ${filePath}`)
  }
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error(`Input ${index + 1}: expected a JSON object in ${filePath}`)
  }

  // Deliberately select only aggregate metadata. Never inspect text/thinking,
  // tool arguments or summaries, credentials, paths, or arbitrary report fields.
  return summarizeReport(report, index + 1)
}

async function main() {
  let options
  try {
    options = parseArgs(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${usage}`)
    process.exitCode = 2
    return
  }

  if (options.help) {
    process.stdout.write(usage)
    return
  }

  const rows = []
  const errors = []
  for (const [index, input] of options.inputs.entries()) {
    try {
      rows.push(await readReport(input, index))
    } catch (error) {
      errors.push(error.message)
    }
  }
  if (errors.length > 0) {
    process.stderr.write(`${errors.join('\n')}\n`)
    process.exitCode = 1
    return
  }

  if (options.format === 'json') {
    process.stdout.write(`${JSON.stringify({ schemaVersion: 2, timeUnit: 'ms', results: rows }, null, 2)}\n`)
  } else {
    process.stdout.write(renderMarkdown(rows))
  }
}

await main()
