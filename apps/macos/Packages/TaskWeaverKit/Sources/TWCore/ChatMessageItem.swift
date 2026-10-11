import Foundation

public enum MessageRole: String, Codable, Sendable {
    case user
    case assistant
    case system
}

public enum ToolCallStatus: Sendable, Hashable {
    case executing
    case success
    case failure(String)
}

public struct ChatMessageItem: Identifiable, Sendable {
    public let id: String
    public let role: MessageRole
    public var content: String
    public var thinking: String?
    public var toolCalls: [ToolCallInfo]
    public let timestamp: Date
    public var isStreaming: Bool

    public struct ToolCallInfo: Identifiable, Sendable {
        public let id: String
        public let name: String
        public let arguments: String
        public let status: ToolCallStatus
        public let output: String?

        public init(id: String = UUID().uuidString, name: String, arguments: String, status: ToolCallStatus = .success, output: String? = nil) {
            self.id = id
            self.name = name
            self.arguments = arguments
            self.status = status
            self.output = output
        }
    }

    public init(
        id: String = UUID().uuidString,
        role: MessageRole,
        content: String,
        thinking: String? = nil,
        toolCalls: [ToolCallInfo] = [],
        timestamp: Date = Date(),
        isStreaming: Bool = false
    ) {
        self.id = id
        self.role = role
        self.content = content
        self.thinking = thinking
        self.toolCalls = toolCalls
        self.timestamp = timestamp
        self.isStreaming = isStreaming
    }
}
