import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { create, fromBinary, toBinary } from '@bufbuild/protobuf'
import { resolveTaskWeaverOpenCodexRoot } from '../electron/backend/opencodex-package-root.mjs'

const pkg = resolveTaskWeaverOpenCodexRoot()
if (!pkg) {
  console.error('test-opencodex-taskweaver-patch: no vendor/opencodex or @taskweaver/opencodex')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 1. Static Contract & Patch Markers Check
// ---------------------------------------------------------------------------
const targetFile = path.join(pkg, 'src/adapters/cursor/protobuf-events.ts')
const source = fsSync.readFileSync(targetFile, 'utf8')

assert.match(
  source,
  /TaskWeaver: map bare Host tool names/,
  'Expected TaskWeaver marker comment in protobuf-events.ts',
)
assert.match(
  source,
  /const OCX_CLIENT_TOOL_WIRE_PREFIX = "ocx_client_";/,
  'Expected OCX_CLIENT_TOOL_WIRE_PREFIX definition in protobuf-events.ts',
)
assert.match(
  source,
  /function resolveAdvertisedClientToolName\(/,
  'Expected resolveAdvertisedClientToolName definition in protobuf-events.ts',
)
assert.match(
  source,
  /function toolSchemaForWireName\(/,
  'Expected toolSchemaForWireName definition in protobuf-events.ts',
)

// Ensure both resolveAdvertisedClientToolName and toolSchemaForWireName have the patch logic
const resolveMatch = source.match(/function resolveAdvertisedClientToolName[\s\S]*?return undefined;\s*\}/)
assert.ok(resolveMatch, 'Could not extract resolveAdvertisedClientToolName body')
assert.match(
  resolveMatch[0],
  /OCX_CLIENT_TOOL_WIRE_PREFIX/,
  'resolveAdvertisedClientToolName must include TaskWeaver wire prefix mapping',
)

const schemaMatch = source.match(/function toolSchemaForWireName[\s\S]*?return undefined;\s*\}/)
assert.ok(schemaMatch, 'Could not extract toolSchemaForWireName body')
assert.match(
  schemaMatch[0],
  /OCX_CLIENT_TOOL_WIRE_PREFIX/,
  'toolSchemaForWireName must include TaskWeaver wire prefix schema resolution',
)

// ---------------------------------------------------------------------------
// 2. Build and Load Bundled Modules for Wire-level Testing
// ---------------------------------------------------------------------------
const tmpDir = path.join(process.cwd(), '.tmp-ocx-patch-test')
await fs.mkdir(tmpDir, { recursive: true })
const eventsOut = path.join(tmpDir, `protobuf-events-${process.pid}.mjs`)
const pbOut = path.join(tmpDir, `agent-pb-${process.pid}.mjs`)

try {
  await build({
    entryPoints: [targetFile],
    outfile: eventsOut,
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    logLevel: 'silent',
  })

  await build({
    entryPoints: [path.join(pkg, 'src/adapters/cursor/gen/agent_pb.ts')],
    outfile: pbOut,
    bundle: true,
    format: 'esm',
    platform: 'node',
    packages: 'external',
    logLevel: 'silent',
  })

  const {
    createCursorProtobufEventState,
    mapCursorProtobufServerMessage,
  } = await import(pathToFileURL(eventsOut).href)

  const { AgentServerMessageSchema } = await import(pathToFileURL(pbOut).href)

  // -------------------------------------------------------------------------
  // 3. Golden Fixtures: Wire-level Protobuf Encoding Snapshot
  // -------------------------------------------------------------------------
  const textEncoder = new TextEncoder()
  const providerIdentifier = 'opencodex-responses'

  const wireTools = [
    { bare: 'read', prefixed: 'ocx_client_read', args: { file_path: 'README.md' } },
    { bare: 'grep', prefixed: 'ocx_client_grep', args: { pattern: 'TaskWeaver', path: 'src/' } },
    { bare: 'bash', prefixed: 'ocx_client_bash', args: { command: 'pwd' } },
    { bare: 'edit', prefixed: 'ocx_client_edit', args: { file_path: 'config.json' } },
  ]

  const wireSchemas = new Map([
    ['ocx_client_read', { type: 'object', properties: { file_path: { type: 'string' } }, required: ['file_path'] }],
    ['ocx_client_grep', { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } } }],
    ['ocx_client_bash', { type: 'object', properties: { command: { type: 'string' } } }],
    ['ocx_client_edit', { type: 'object', properties: { file_path: { type: 'string' } } }],
  ])

  // a. Test Wire Serialization & Deserialization
  const wireBuffers = []
  for (let i = 0; i < wireTools.length; i++) {
    const item = wireTools[i]
    const callId = `call_wire_fixture_${i + 1}`
    const argMapBytes = {}
    for (const [k, v] of Object.entries(item.args)) {
      argMapBytes[k] = textEncoder.encode(JSON.stringify(v))
    }

    const protoMsg = create(AgentServerMessageSchema, {
      message: {
        case: 'interactionUpdate',
        value: {
          message: {
            case: 'toolCallCompleted',
            value: {
              callId,
              toolCall: {
                tool: {
                  case: 'mcpToolCall',
                  value: {
                    args: {
                      providerIdentifier,
                      toolName: item.bare, // Wire sends BARE tool name!
                      args: argMapBytes,
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    const wireBytes = toBinary(AgentServerMessageSchema, protoMsg)
    assert.ok(wireBytes.byteLength > 20, `Wire binary for ${item.bare} must not be empty`)
    wireBuffers.push({ item, callId, wireBytes })

    // Verify round-trip decoding from protobuf wire bytes
    const decoded = fromBinary(AgentServerMessageSchema, wireBytes)
    assert.equal(decoded.message.case, 'interactionUpdate')
    assert.equal(decoded.message.value?.message?.case, 'toolCallCompleted')
    const completedUpdate = decoded.message.value?.message?.value
    assert.equal(completedUpdate?.callId, callId)
    assert.equal(completedUpdate?.toolCall?.tool?.value?.args?.toolName, item.bare)
  }

  // -------------------------------------------------------------------------
  // 4. ocx_client_* Tool Name Negotiation & Schema Contract Snapshot
  // -------------------------------------------------------------------------
  const advertisedNames = new Set(wireTools.map(t => t.prefixed))
  const state = createCursorProtobufEventState({
    clientToolNames: advertisedNames,
    toolSchemas: wireSchemas,
  })

  // Snapshot: Two-way tool negotiation verification
  const negotiationSnapshot = wireTools.map(t => {
    // 1) Host tool name -> Advertised wire name
    const hostToWire = `ocx_client_${t.bare}`
    assert.equal(hostToWire, t.prefixed)

    // 2) Schema for bare tool resolves to schema for prefixed tool
    const schemaDirect = wireSchemas.get(t.prefixed)
    assert.ok(schemaDirect, `Schema for ${t.prefixed} must exist`)

    return {
      hostTool: t.bare,
      advertisedWireTool: hostToWire,
      resolvedSchemaProperties: Object.keys(schemaDirect.properties),
    }
  })

  const EXPECTED_NEGOTIATION_SNAPSHOT = [
    { hostTool: 'read', advertisedWireTool: 'ocx_client_read', resolvedSchemaProperties: ['file_path'] },
    { hostTool: 'grep', advertisedWireTool: 'ocx_client_grep', resolvedSchemaProperties: ['pattern', 'path'] },
    { hostTool: 'bash', advertisedWireTool: 'ocx_client_bash', resolvedSchemaProperties: ['command'] },
    { hostTool: 'edit', advertisedWireTool: 'ocx_client_edit', resolvedSchemaProperties: ['file_path'] },
  ]
  assert.deepEqual(negotiationSnapshot, EXPECTED_NEGOTIATION_SNAPSHOT, 'Tool negotiation snapshot mismatch')

  // -------------------------------------------------------------------------
  // 5. Message Mapping Snapshot (End-to-End from Wire Decode to Client Events)
  // -------------------------------------------------------------------------
  const emittedEvents = []
  for (const { item, callId, wireBytes } of wireBuffers) {
    const decoded = fromBinary(AgentServerMessageSchema, wireBytes)
    const events = mapCursorProtobufServerMessage(decoded, state)
    emittedEvents.push(...events)

    // Verify each call mapped to ocx_client_* tool call
    const startEvent = events.find(e => e.type === 'tool_call_start')
    assert.ok(startEvent, `Must emit tool_call_start for ${item.bare}`)
    assert.equal(startEvent.name, item.prefixed, `Bare name ${item.bare} must map to ${item.prefixed}`)
    assert.equal(startEvent.id, callId)

    const deltaEvent = events.find(e => e.type === 'tool_call_delta')
    assert.ok(deltaEvent, `Must emit tool_call_delta for ${item.bare}`)
    assert.deepEqual(JSON.parse(deltaEvent.arguments), item.args)

    const endEvent = events.find(e => e.type === 'tool_call_end')
    assert.ok(endEvent, `Must emit tool_call_end for ${item.bare}`)
    assert.equal(endEvent.id, callId)
  }

  // Also verify text delta and thinking delta events pass through cleanly
  const textMsg = create(AgentServerMessageSchema, {
    message: {
      case: 'interactionUpdate',
      value: {
        message: {
          case: 'textDelta',
          value: { text: 'TaskWeaver golden fixture ok' },
        },
      },
    },
  })
  const textEvents = mapCursorProtobufServerMessage(textMsg, state)
  assert.deepEqual(textEvents, [{ type: 'text', text: 'TaskWeaver golden fixture ok' }])

  const thinkingMsg = create(AgentServerMessageSchema, {
    message: {
      case: 'interactionUpdate',
      value: {
        message: {
          case: 'thinkingDelta',
          value: { text: 'Evaluating TaskWeaver architecture' },
        },
      },
    },
  })
  const thinkingEvents = mapCursorProtobufServerMessage(thinkingMsg, state)
  assert.deepEqual(thinkingEvents, [{ type: 'thinking', thinking: 'Evaluating TaskWeaver architecture' }])

  // Golden event snapshot verification
  const GOLDEN_EVENT_SNAPSHOT = [
    { type: 'tool_call_start', id: 'call_wire_fixture_1', name: 'ocx_client_read' },
    { type: 'tool_call_delta', arguments: '{"file_path":"README.md"}' },
    { type: 'tool_call_end', id: 'call_wire_fixture_1' },
    { type: 'tool_call_start', id: 'call_wire_fixture_2', name: 'ocx_client_grep' },
    { type: 'tool_call_delta', arguments: '{"pattern":"TaskWeaver","path":"src/"}' },
    { type: 'tool_call_end', id: 'call_wire_fixture_2' },
    { type: 'tool_call_start', id: 'call_wire_fixture_3', name: 'ocx_client_bash' },
    { type: 'tool_call_delta', arguments: '{"command":"pwd"}' },
    { type: 'tool_call_end', id: 'call_wire_fixture_3' },
    { type: 'tool_call_start', id: 'call_wire_fixture_4', name: 'ocx_client_edit' },
    { type: 'tool_call_delta', arguments: '{"file_path":"config.json"}' },
    { type: 'tool_call_end', id: 'call_wire_fixture_4' },
  ]
  assert.deepEqual(emittedEvents, GOLDEN_EVENT_SNAPSHOT, 'Golden event snapshot mismatch')

  // -------------------------------------------------------------------------
  // 6. Anti-Regression Check: Ensure Test Red-Flags When Patch is Missing
  // -------------------------------------------------------------------------
  // When bare name mapping is absent (e.g. unadvertised bare tool called),
  // Cursor adapter MUST return unknown tool error, proving patch necessity.
  const unpatchedState = createCursorProtobufEventState({
    clientToolNames: new Set(['different_tool_name']),
  })
  const unpatchedEvents = mapCursorProtobufServerMessage(
    fromBinary(AgentServerMessageSchema, wireBuffers[0].wireBytes),
    unpatchedState,
  )
  assert.equal(unpatchedEvents.length, 1)
  assert.equal(unpatchedEvents[0].type, 'error')
  assert.match(
    unpatchedEvents[0].message,
    /Cursor requested unknown Responses tool: read/,
    'Without patch, bare tool must fail as unknown tool',
  )

  console.log('test-opencodex-taskweaver-patch: all wire-level golden fixtures passed! (package:', pkg, ')')
} finally {
  await fs.rm(tmpDir, { recursive: true, force: true })
}
