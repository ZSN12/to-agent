#!/usr/bin/env node
import fs from 'node:fs/promises'

const tracePath = process.argv[2]
if (!tracePath) {
  console.error('Usage: node scripts/tw-startup-report.mjs <startup-trace.jsonl>')
  process.exit(2)
}

const raw = await fs.readFile(tracePath, 'utf8')
const groups = new Map()
for (const [index, line] of raw.split(/\r?\n/).entries()) {
  if (!line.trim()) continue
  let row
  try {
    row = JSON.parse(line)
  } catch (error) {
    throw new Error(`Invalid JSON on line ${index + 1}: ${error.message}`)
  }
  if (!Number.isFinite(row.pid) || !Number.isFinite(row.elapsedMs) || typeof row.event !== 'string') continue
  const key = `${row.pid}:${row.startupId ?? 'legacy'}`
  const rows = groups.get(key) ?? []
  rows.push(row)
  groups.set(key, rows)
}

const sessions = [...groups.entries()].map(([key, rows]) => {
  rows.sort((a, b) => a.elapsedMs - b.elapsedMs)
  const first = rows[0]?.elapsedMs ?? 0
  let previous = first
  const events = rows.map((row) => {
    const event = { name: row.event, elapsedMs: Number(row.elapsedMs.toFixed(3)), deltaMs: Number((row.elapsedMs - previous).toFixed(3)) }
    previous = row.elapsedMs
    return event
  })
  return {
    pid: rows[0]?.pid,
    startupId: rows[0]?.startupId ?? null,
    startedAt: rows[0]?.timestamp ?? null,
    totalMs: Number(((rows.at(-1)?.elapsedMs ?? first) - first).toFixed(3)),
    events,
  }
})

console.log(JSON.stringify({ tracePath, sessions }, null, 2))
