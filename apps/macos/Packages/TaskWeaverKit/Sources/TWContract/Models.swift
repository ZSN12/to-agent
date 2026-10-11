// GENERATED — contractHash: e5aacefda3a2572a2ef12989a86fea4951bd50c9797d1bb59074e7724f5d6218
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
