#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { IPC_CHANNELS, PRELOAD_EVENTS } from '../contract/channels.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const targetDir = path.join(root, 'apps/macos/Packages/TaskWeaverKit/Sources/TWContract')
const schemaPath = path.join(root, 'contract/contract.schema.json')

function computeHash() {
  if (fs.existsSync(schemaPath)) {
    return crypto.createHash('sha256').update(fs.readFileSync(schemaPath, 'utf8')).digest('hex')
  }
  return 'unhashed'
}

const contractHash = computeHash()

// --- 1. Generate Models.swift ---
function renderModelsSwift() {
  return `// GENERATED — contractHash: ${contractHash}
import Foundation

/// General recursive JSONValue representation conforming to Codable, Sendable, Hashable.
public enum JSONValue: Codable, Sendable, Hashable {
    case string(String)
    case number(Double)
    case int(Int)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let boolVal = try? container.decode(Bool.self) {
            self = .bool(boolVal)
        } else if let intVal = try? container.decode(Int.self) {
            self = .int(intVal)
        } else if let doubleVal = try? container.decode(Double.self) {
            self = .number(doubleVal)
        } else if let stringVal = try? container.decode(String.self) {
            self = .string(stringVal)
        } else if let arrayVal = try? container.decode([JSONValue].self) {
            self = .array(arrayVal)
        } else if let objectVal = try? container.decode([String: JSONValue].self) {
            self = .object(objectVal)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unknown JSON value")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let s): try container.encode(s)
        case .number(let n): try container.encode(n)
        case .int(let i): try container.encode(i)
        case .bool(let b): try container.encode(b)
        case .object(let obj): try container.encode(obj)
        case .array(let arr): try container.encode(arr)
        case .null: try container.encodeNil()
        }
    }
}

public struct AnyEncodable: Encodable, Sendable {
    private let _encode: @Sendable (Encoder) throws -> Void

    public init<T: Encodable & Sendable>(_ wrapped: T) {
        self._encode = { encoder in
            try wrapped.encode(to: encoder)
        }
    }

    public func encode(to encoder: Encoder) throws {
        try _encode(encoder)
    }
}

/// Generic IPC response structure { ok: Bool, data?: T, error?: String }
public struct IpcResponse<T: Codable & Sendable>: Codable, Sendable {
    public let ok: Bool
    public let data: T?
    public let error: String?

    public init(ok: Bool, data: T? = nil, error: String? = nil) {
        self.ok = ok
        self.data = data
        self.error = error
    }
}

/// Handshake result returned by 'initialize'
public struct InitializeResult: Codable, Sendable, Hashable {
    public let protocolVersion: Int
    public let contractHash: String
    public let backendVersion: String

    public init(protocolVersion: Int, contractHash: String, backendVersion: String) {
        self.protocolVersion = protocolVersion
        self.contractHash = contractHash
        self.backendVersion = backendVersion
    }
}
`
}

// --- 2. Generate Events.swift ---
function renderEventsSwift() {
  const eventTypes = PRELOAD_EVENTS.map((e) => {
    const parts = e.event.split(/[:-]/)
    const structName = parts.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('') + 'Event'
    const propertyName = parts.map((s, idx) => idx === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)).join('')
    return {
      channel: e.event,
      structName,
      propertyName,
    }
  })

  return `// GENERATED — contractHash: ${contractHash}
import Foundation

public protocol TaskWeaverEventTransport: Sendable {
    func subscribe(to channel: String) -> AsyncStream<JSONValue>
}

public final class TaskWeaverEvents: Sendable {
    private let transport: TaskWeaverEventTransport

    public init(transport: TaskWeaverEventTransport) {
        self.transport = transport
    }

${eventTypes.map((e) => `    /// Event stream for '${e.channel}'
    public var ${e.propertyName}: AsyncStream<JSONValue> {
        transport.subscribe(to: "${e.channel}")
    }`).join('\n\n')}
}
`
}

// --- 3. Generate Client.swift ---
function renderClientSwift() {
  // Group channels by bridgePath prefix (e.g. app.*, models.*, chat.*, git.*)
  const groups = new Map()
  for (const entry of IPC_CHANNELS) {
    const parts = entry.bridgePath.split('.')
    const ns = parts.length > 1 ? parts[0] : 'root'
    const method = parts.length > 1 ? parts.slice(1).join('_').replaceAll('-', '_') : parts[0].replaceAll('-', '_')

    if (!groups.has(ns)) groups.set(ns, [])
    groups.get(ns).push({
      channel: entry.name,
      methodName: method,
      bridgePath: entry.bridgePath,
    })
  }

  const namespaceStructs = []
  const clientProperties = []

  for (const [ns, methods] of groups.entries()) {
    const className = 'TaskWeaver' + ns.charAt(0).toUpperCase() + ns.slice(1) + 'API'
    if (ns !== 'root') {
      clientProperties.push(`    public let ${ns}: ${className}`)
    }

    const methodDefs = methods.map((m) => {
      return `    public func ${m.methodName}(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("${m.channel}", args: args)
    }`
    })

    namespaceStructs.push(`
public final class ${className}: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

${methodDefs.join('\n\n')}
}`)
  }

  return `// GENERATED — contractHash: ${contractHash}
import Foundation

public protocol TaskWeaverTransport: Sendable {
    func invoke(_ channel: String, args: [AnyEncodable]) async throws -> JSONValue
}

public final class TaskWeaverClient: Sendable {
    public let transport: TaskWeaverTransport
    public let events: TaskWeaverEvents

${clientProperties.join('\n')}

    public init(transport: TaskWeaverTransport, eventTransport: TaskWeaverEventTransport) {
        self.transport = transport
        self.events = TaskWeaverEvents(transport: eventTransport)
${Array.from(groups.keys()).filter((ns) => ns !== 'root').map((ns) => `        self.${ns} = TaskWeaver${ns.charAt(0).toUpperCase() + ns.slice(1)}API(transport: transport)`).join('\n')}
    }

    /// Root-level channels (e.g. backendReady)
${groups.get('root')?.map((m) => `    public func ${m.methodName}(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("${m.channel}", args: args)
    }`).join('\n\n') ?? ''}
}
${namespaceStructs.join('\n')}
`
}

const isCheck = process.argv.includes('--check')

fs.mkdirSync(targetDir, { recursive: true })

const modelsCode = renderModelsSwift()
const eventsCode = renderEventsSwift()
const clientCode = renderClientSwift()

const files = [
  { name: 'Models.swift', content: modelsCode },
  { name: 'Events.swift', content: eventsCode },
  { name: 'Client.swift', content: clientCode },
]

if (isCheck) {
  let isClean = true
  for (const { name, content } of files) {
    const dest = path.join(targetDir, name)
    if (!fs.existsSync(dest) || fs.readFileSync(dest, 'utf8') !== content) {
      console.error(`gen-swift-client: ${name} is stale or missing`)
      isClean = false
    }
  }
  if (!isClean) process.exit(1)
  console.log(`gen-swift-client: ok (3 files match contractHash: ${contractHash.slice(0, 12)})`)
} else {
  for (const { name, content } of files) {
    fs.writeFileSync(path.join(targetDir, name), content, 'utf8')
    console.log(`gen-swift-client: wrote ${path.relative(root, path.join(targetDir, name))}`)
  }
}
