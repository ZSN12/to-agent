// GENERATED — contractHash: e5aacefda3a2572a2ef12989a86fea4951bd50c9797d1bb59074e7724f5d6218
import Foundation

public protocol TaskWeaverTransport: Sendable {
    func invoke(_ channel: String, args: [AnyEncodable]) async throws -> JSONValue
}

public final class TaskWeaverClient: Sendable {
    public let transport: TaskWeaverTransport
    public let events: TaskWeaverEvents

    public let app: TaskWeaverAppAPI
    public let models: TaskWeaverModelsAPI
    public let openusage: TaskWeaverOpenusageAPI
    public let portfolio: TaskWeaverPortfolioAPI
    public let pricing: TaskWeaverPricingAPI
    public let usage: TaskWeaverUsageAPI
    public let chat: TaskWeaverChatAPI
    public let skills: TaskWeaverSkillsAPI
    public let tasks: TaskWeaverTasksAPI
    public let debug: TaskWeaverDebugAPI
    public let github: TaskWeaverGithubAPI
    public let preferences: TaskWeaverPreferencesAPI
    public let webSearch: TaskWeaverWebSearchAPI
    public let jobs: TaskWeaverJobsAPI
    public let mcp: TaskWeaverMcpAPI
    public let memory: TaskWeaverMemoryAPI
    public let permission: TaskWeaverPermissionAPI
    public let userQuestions: TaskWeaverUserQuestionsAPI
    public let sandbox: TaskWeaverSandboxAPI
    public let terminal: TaskWeaverTerminalAPI
    public let worktree: TaskWeaverWorktreeAPI
    public let workspace: TaskWeaverWorkspaceAPI

    public init(transport: TaskWeaverTransport, eventTransport: TaskWeaverEventTransport) {
        self.transport = transport
        self.events = TaskWeaverEvents(transport: eventTransport)
        self.app = TaskWeaverAppAPI(transport: transport)
        self.models = TaskWeaverModelsAPI(transport: transport)
        self.openusage = TaskWeaverOpenusageAPI(transport: transport)
        self.portfolio = TaskWeaverPortfolioAPI(transport: transport)
        self.pricing = TaskWeaverPricingAPI(transport: transport)
        self.usage = TaskWeaverUsageAPI(transport: transport)
        self.chat = TaskWeaverChatAPI(transport: transport)
        self.skills = TaskWeaverSkillsAPI(transport: transport)
        self.tasks = TaskWeaverTasksAPI(transport: transport)
        self.debug = TaskWeaverDebugAPI(transport: transport)
        self.github = TaskWeaverGithubAPI(transport: transport)
        self.preferences = TaskWeaverPreferencesAPI(transport: transport)
        self.webSearch = TaskWeaverWebSearchAPI(transport: transport)
        self.jobs = TaskWeaverJobsAPI(transport: transport)
        self.mcp = TaskWeaverMcpAPI(transport: transport)
        self.memory = TaskWeaverMemoryAPI(transport: transport)
        self.permission = TaskWeaverPermissionAPI(transport: transport)
        self.userQuestions = TaskWeaverUserQuestionsAPI(transport: transport)
        self.sandbox = TaskWeaverSandboxAPI(transport: transport)
        self.terminal = TaskWeaverTerminalAPI(transport: transport)
        self.worktree = TaskWeaverWorktreeAPI(transport: transport)
        self.workspace = TaskWeaverWorkspaceAPI(transport: transport)
    }

    /// Root-level channels (e.g. backendReady)
    public func backendReady(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("backend:ready", args: args)
    }
}

public final class TaskWeaverRootAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func backendReady(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("backend:ready", args: args)
    }
}

public final class TaskWeaverAppAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func clearConversation(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("app:clearConversation", args: args)
    }

    public func deleteThread(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("app:deleteThread", args: args)
    }

    public func forkThread(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("app:forkThread", args: args)
    }

    public func getState(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("app:getState", args: args)
    }

    public func listOutputLogs(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("app:listOutputLogs", args: args)
    }

    public func listThreads(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("app:listThreads", args: args)
    }

    public func pickWorkspace(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("app:pickWorkspace", args: args)
    }

    public func renameThread(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("app:renameThread", args: args)
    }

    public func searchThreads(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("app:searchThreads", args: args)
    }

    public func setModelKey(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("app:setModelKey", args: args)
    }

    public func setPermissionMode(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("app:setPermissionMode", args: args)
    }

    public func setThinkingLevel(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("app:setThinkingLevel", args: args)
    }

    public func setWorkspace(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("app:setWorkspace", args: args)
    }

    public func switchThread(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("app:switchThread", args: args)
    }

    public func toggleArchiveThread(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("app:toggleArchiveThread", args: args)
    }

    public func togglePinThread(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("app:togglePinThread", args: args)
    }

    public func getFirstRunNotice(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("app:getFirstRunNotice", args: args)
    }

    public func dismissFirstRunNotice(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("app:dismissFirstRunNotice", args: args)
    }
}

public final class TaskWeaverModelsAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func bridgeGetStatus(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("bridge:getStatus", args: args)
    }

    public func bridgeLogin(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("bridge:login", args: args)
    }

    public func add(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:add", args: args)
    }

    public func batchAddCustomModels(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:batchAddCustomModels", args: args)
    }

    public func cancelOAuth(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:cancelOAuth", args: args)
    }

    public func checkForUpdates(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:checkForUpdates", args: args)
    }

    public func discoverProviderModels(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:discoverProviderModels", args: args)
    }

    public func getBusyEnterMode(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:getBusyEnterMode", args: args)
    }

    public func getThinkingLevel(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:getThinkingLevel", args: args)
    }

    public func getUpdateStatus(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:getUpdateStatus", args: args)
    }

    public func list(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:list", args: args)
    }

    public func listCustomProviders(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:listCustomProviders", args: args)
    }

    public func loadBundle(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:loadBundle", args: args)
    }

    public func logoutOAuth(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:logoutOAuth", args: args)
    }

    public func migrateLegacyOpenCodexRoutes(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:migrateLegacyOpenCodexRoutes", args: args)
    }

    public func probeProviderModels(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:probeProviderModels", args: args)
    }

    public func listProvidersAuth(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:providersAuth", args: args)
    }

    public func refresh(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:refresh", args: args)
    }

    public func remove(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:remove", args: args)
    }

    public func removeCustomProvider(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:removeCustomProvider", args: args)
    }

    public func removeProviderCredentials(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:removeProviderCredentials", args: args)
    }

    public func rollbackRegistry(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:rollbackRegistry", args: args)
    }

    public func scanLocal(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:scanLocal", args: args)
    }

    public func setActive(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:setActive", args: args)
    }

    public func setBusyEnterMode(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:setBusyEnterMode", args: args)
    }

    public func setProviderApiKey(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:setProviderApiKey", args: args)
    }

    public func setThinkingLevel(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:setThinkingLevel", args: args)
    }

    public func startOAuth(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:startOAuth", args: args)
    }

    public func submitOAuthCode(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:submitOAuthCode", args: args)
    }

    public func testCustomProvider(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:testCustomProvider", args: args)
    }

    public func testCustomProviderToolCall(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:testCustomProviderToolCall", args: args)
    }

    public func upsertCustomProvider(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:upsertCustomProvider", args: args)
    }

    public func upsertProfile(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("models:upsertProfile", args: args)
    }
}

public final class TaskWeaverOpenusageAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func getLimits(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("openusage:getLimits", args: args)
    }
}

public final class TaskWeaverPortfolioAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func get(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("portfolio:get", args: args)
    }

    public func resetToBundled(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("portfolio:resetToBundled", args: args)
    }

    public func save(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("portfolio:save", args: args)
    }
}

public final class TaskWeaverPricingAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func getStatus(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("pricing:getStatus", args: args)
    }

    public func sync(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("pricing:sync", args: args)
    }
}

public final class TaskWeaverUsageAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func clear(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("usage:clear", args: args)
    }

    public func getReport(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("usage:getReport", args: args)
    }

    public func getStats(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("usage:getStats", args: args)
    }

    public func setEnabled(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("usage:setEnabled", args: args)
    }
}

public final class TaskWeaverChatAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func cancel(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:cancel", args: args)
    }

    public func getDshView(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:getDshView", args: args)
    }

    public func getToolOutput(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:getToolOutput", args: args)
    }

    public func getImageAttachment(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:getImageAttachment", args: args)
    }

    public func getImageLimits(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:getImageLimits", args: args)
    }

    public func getResultAttachment(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:getResultAttachment", args: args)
    }

    public func getLiveContext(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:getLiveContext", args: args)
    }

    public func getSessionStats(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:getSessionStats", args: args)
    }

    public func listRunningConversations(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:listRunningConversations", args: args)
    }

    public func pickImages(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:pickImages", args: args)
    }

    public func pickAttachments(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:pickAttachments", args: args)
    }

    public func releaseDocuments(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:releaseDocuments", args: args)
    }

    public func queueMutate(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:queueMutate", args: args)
    }

    public func readDroppedImageFile(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:readDroppedImage", args: args)
    }

    public func stageDroppedDocumentFile(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:stageDroppedDocument", args: args)
    }

    public func subscribeMux(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:subscribeMux", args: args)
    }

    public func unsubscribeMux(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:unsubscribeMux", args: args)
    }

    public func followUp(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:followUp", args: args)
    }

    public func send(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:send", args: args)
    }

    public func steer(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("chat:steer", args: args)
    }
}

public final class TaskWeaverSkillsAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func list(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("skills:list", args: args)
    }
}

public final class TaskWeaverTasksAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func approvePlan(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("tasks:approvePlan", args: args)
    }

    public func cancel(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("tasks:cancel", args: args)
    }

    public func pauseRun(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("tasks:pauseRun", args: args)
    }

    public func rejectPlan(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("tasks:rejectPlan", args: args)
    }

    public func rerunDownstream(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("tasks:rerunDownstream", args: args)
    }

    public func resumeCheckpoint(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("tasks:resumeCheckpoint", args: args)
    }

    public func resumeRun(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("tasks:resumeRun", args: args)
    }

    public func listRuns(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("tasks:listRuns", args: args)
    }

    public func sendMessage(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("tasks:sendMessage", args: args)
    }
}

public final class TaskWeaverDebugAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func shadowTranscript(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("debug:shadowTranscript", args: args)
    }
}

public final class TaskWeaverGithubAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func listPullRequests(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("github:listPullRequests", args: args)
    }
}

public final class TaskWeaverPreferencesAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func get(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("preferences:get", args: args)
    }

    public func set(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("preferences:set", args: args)
    }
}

public final class TaskWeaverWebSearchAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func getConfig(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("webSearch:getConfig", args: args)
    }

    public func setConfig(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("webSearch:setConfig", args: args)
    }

    public func testSearch(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("webSearch:testSearch", args: args)
    }
}

public final class TaskWeaverJobsAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func installLaunchAgent(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("jobs:installLaunchAgent", args: args)
    }

    public func list(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("jobs:list", args: args)
    }

    public func launchAgentInstalled(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("jobs:launchAgentInstalled", args: args)
    }

    public func remove(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("jobs:remove", args: args)
    }

    public func removeLaunchAgent(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("jobs:removeLaunchAgent", args: args)
    }

    public func runNow(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("jobs:runNow", args: args)
    }

    public func upsert(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("jobs:upsert", args: args)
    }
}

public final class TaskWeaverMcpAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func cancelGitHubOAuth(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("mcp:cancelGitHubOAuth", args: args)
    }

    public func catalog(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("mcp:catalog", args: args)
    }

    public func configureGitHub(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("mcp:configureGitHub", args: args)
    }

    public func disconnect(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("mcp:disconnect", args: args)
    }

    public func getGitHubOAuthAvailability(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("mcp:getGitHubOAuthAvailability", args: args)
    }

    public func getRuntimeBinding(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("mcp:getRuntimeBinding", args: args)
    }

    public func installCatalog(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("mcp:installCatalog", args: args)
    }

    public func list(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("mcp:list", args: args)
    }

    public func marketplace(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("mcp:marketplace", args: args)
    }

    public func refresh(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("mcp:refresh", args: args)
    }

    public func remove(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("mcp:remove", args: args)
    }

    public func save(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("mcp:save", args: args)
    }

    public func setEnabled(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("mcp:setEnabled", args: args)
    }

    public func startGitHubOAuth(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("mcp:startGitHubOAuth", args: args)
    }

    public func testConnection(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("mcp:testConnection", args: args)
    }
}

public final class TaskWeaverMemoryAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func clear(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("memory:clear", args: args)
    }

    public func get(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("memory:get", args: args)
    }
}

public final class TaskWeaverPermissionAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func addRule(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("permission:addRule", args: args)
    }

    public func clearRules(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("permission:clearRules", args: args)
    }

    public func listApprovalAudit(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("permission:listApprovalAudit", args: args)
    }

    public func listRules(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("permission:listRules", args: args)
    }

    public func removeRule(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("permission:removeRule", args: args)
    }

    public func respondPrompt(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("permission:respondPrompt", args: args)
    }
}

public final class TaskWeaverUserQuestionsAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func answer(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("userQuestions:answer", args: args)
    }

    public func cancel(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("userQuestions:cancel", args: args)
    }
}

public final class TaskWeaverSandboxAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func getEffective(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("sandbox:getEffective", args: args)
    }

    public func probe(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("sandbox:probe", args: args)
    }

    public func setSessionMode(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("sandbox:setSessionMode", args: args)
    }
}

public final class TaskWeaverTerminalAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func create(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("terminal:create", args: args)
    }

    public func kill(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("terminal:kill", args: args)
    }

    public func list(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("terminal:list", args: args)
    }

    public func resize(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("terminal:resize", args: args)
    }

    public func write(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("terminal:write", args: args)
    }
}

public final class TaskWeaverWorktreeAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func applyMerge(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("worktree:applyMerge", args: args)
    }

    public func diff(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("worktree:diff", args: args)
    }

    public func list(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("worktree:list", args: args)
    }

    public func previewMerge(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("worktree:previewMerge", args: args)
    }

    public func remove(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("worktree:remove", args: args)
    }
}

public final class TaskWeaverWorkspaceAPI: Sendable {
    private let transport: TaskWeaverTransport

    public init(transport: TaskWeaverTransport) {
        self.transport = transport
    }

    public func createManualGitCommit(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("workspace:createManualGitCommit", args: args)
    }

    public func deleteGitCheckpoint(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("workspace:deleteGitCheckpoint", args: args)
    }

    public func getGitCheckpointDiff(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("workspace:getGitCheckpointDiff", args: args)
    }

    public func gitStatus(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("workspace:gitStatus", args: args)
    }

    public func gitSuggestCommit(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("workspace:gitSuggestCommit", args: args)
    }

    public func listGitCheckpoints(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("workspace:listGitCheckpoints", args: args)
    }

    public func openPath(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("workspace:openPath", args: args)
    }

    public func previewManualGitCommit(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("workspace:previewManualGitCommit", args: args)
    }

    public func restoreGitCheckpoint(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("workspace:restoreGitCheckpoint", args: args)
    }

    public func revertDiff(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("workspace:revertDiff", args: args)
    }

    public func createReference(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("workspace:createReference", args: args)
    }

    public func getTrust(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("workspace:getTrust", args: args)
    }

    public func listContext(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("workspace:listContext", args: args)
    }

    public func setTrust(_ args: [AnyEncodable] = []) async throws -> JSONValue {
        try await transport.invoke("workspace:setTrust", args: args)
    }
}
