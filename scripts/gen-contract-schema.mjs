#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPC_CHANNELS, PRELOAD_EVENTS } from '../contract/channels.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const targetSchemaPath = path.join(root, 'contract', 'contract.schema.json')

export function generateContractSchema() {
  const channels = []

  for (const entry of IPC_CHANNELS) {
    const argsMatch = entry.argsSchema.reference.match(/^Parameters<NonNullable<import\('([^']+)'\)\.([A-Za-z0-9_]+)\['([A-Za-z0-9_]+)'\]>>$/)
    const [, typeModule, apiInterface, methodName] = argsMatch || ['', '', '', '']

    channels.push({
      name: entry.name,
      direction: entry.direction,
      bridgePath: entry.bridgePath,
      handlerModule: entry.handlerModule,
      typeInfo: {
        module: typeModule,
        interface: apiInterface,
        method: methodName,
      },
    })
  }

  const events = PRELOAD_EVENTS.map((e) => ({
    event: e.event,
    bridgePath: e.bridgePath,
  }))

  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'TaskWeaverContract',
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    channels,
    events,
  }

  const content = JSON.stringify(schema, null, 2) + '\n'
  const contractHash = crypto.createHash('sha256').update(content).digest('hex')

  return { schema, content, contractHash }
}

const isCheck = process.argv.includes('--check')
const { content, contractHash } = generateContractSchema()

if (isCheck) {
  if (!fs.existsSync(targetSchemaPath)) {
    console.error('gen-contract-schema: contract.schema.json does not exist. Run node scripts/gen-contract-schema.mjs')
    process.exit(1)
  }
  const existing = fs.readFileSync(targetSchemaPath, 'utf8')
  // Compare without generatedAt timestamp to be deterministic
  const existingObj = JSON.parse(existing)
  const currentObj = JSON.parse(content)
  delete existingObj.generatedAt
  delete currentObj.generatedAt

  if (JSON.stringify(existingObj) !== JSON.stringify(currentObj)) {
    console.error('gen-contract-schema: contract.schema.json is stale. Run node scripts/gen-contract-schema.mjs')
    process.exit(1)
  }
  console.log(`gen-contract-schema: ok (contractHash: ${contractHash.slice(0, 12)})`)
} else {
  fs.writeFileSync(targetSchemaPath, content, 'utf8')
  console.log(`gen-contract-schema: wrote contract/contract.schema.json (contractHash: ${contractHash.slice(0, 12)})`)
}
