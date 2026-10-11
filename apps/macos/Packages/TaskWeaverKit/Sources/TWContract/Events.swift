// GENERATED — contractHash: e5aacefda3a2572a2ef12989a86fea4951bd50c9797d1bb59074e7724f5d6218
import Foundation

public protocol TaskWeaverEventTransport: Sendable {
    func subscribe(to channel: String) -> AsyncStream<JSONValue>
}

public final class TaskWeaverEvents: Sendable {
    private let transport: TaskWeaverEventTransport

    public init(transport: TaskWeaverEventTransport) {
        self.transport = transport
    }

    /// Event stream for 'models:oauthStatus'
    public var modelsOauthStatus: AsyncStream<JSONValue> {
        transport.subscribe(to: "models:oauthStatus")
    }

    /// Event stream for 'models:catalogUpdated'
    public var modelsCatalogUpdated: AsyncStream<JSONValue> {
        transport.subscribe(to: "models:catalogUpdated")
    }

    /// Event stream for 'models:updateStatus'
    public var modelsUpdateStatus: AsyncStream<JSONValue> {
        transport.subscribe(to: "models:updateStatus")
    }

    /// Event stream for 'mcp:githubOAuthStatus'
    public var mcpGithubOAuthStatus: AsyncStream<JSONValue> {
        transport.subscribe(to: "mcp:githubOAuthStatus")
    }

    /// Event stream for 'chat:mux'
    public var chatMux: AsyncStream<JSONValue> {
        transport.subscribe(to: "chat:mux")
    }

    /// Event stream for 'chat:dshView'
    public var chatDshView: AsyncStream<JSONValue> {
        transport.subscribe(to: "chat:dshView")
    }

    /// Event stream for 'chat:stream'
    public var chatStream: AsyncStream<JSONValue> {
        transport.subscribe(to: "chat:stream")
    }

    /// Event stream for 'chat:promptBudget'
    public var chatPromptBudget: AsyncStream<JSONValue> {
        transport.subscribe(to: "chat:promptBudget")
    }

    /// Event stream for 'permission:prompt'
    public var permissionPrompt: AsyncStream<JSONValue> {
        transport.subscribe(to: "permission:prompt")
    }

    /// Event stream for 'user-question:prompt'
    public var userQuestionPrompt: AsyncStream<JSONValue> {
        transport.subscribe(to: "user-question:prompt")
    }

    /// Event stream for 'user-question:resolved'
    public var userQuestionResolved: AsyncStream<JSONValue> {
        transport.subscribe(to: "user-question:resolved")
    }

    /// Event stream for 'terminal:data'
    public var terminalData: AsyncStream<JSONValue> {
        transport.subscribe(to: "terminal:data")
    }

    /// Event stream for 'terminal:exit'
    public var terminalExit: AsyncStream<JSONValue> {
        transport.subscribe(to: "terminal:exit")
    }

    /// Event stream for 'sandbox:mode'
    public var sandboxMode: AsyncStream<JSONValue> {
        transport.subscribe(to: "sandbox:mode")
    }
}
