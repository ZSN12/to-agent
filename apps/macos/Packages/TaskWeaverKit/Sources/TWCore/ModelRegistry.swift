import Foundation
import TWPlatform

public struct ProviderItem: Identifiable, Sendable, Hashable {
    public let id: String
    public let name: String
    public let iconName: String
    public let requiresApiKey: Bool
    public var apiKeyAccount: String { "model:\(id)" }

    public init(id: String, name: String, iconName: String, requiresApiKey: Bool = true) {
        self.id = id
        self.name = name
        self.iconName = iconName
        self.requiresApiKey = requiresApiKey
    }
}

public struct ModelDescriptor: Identifiable, Sendable, Hashable {
    public let id: String
    public let providerId: String
    public let displayName: String
    public let contextWindow: String
    public let isThinkingSupported: Bool

    public init(id: String, providerId: String, displayName: String, contextWindow: String, isThinkingSupported: Bool = false) {
        self.id = id
        self.providerId = providerId
        self.displayName = displayName
        self.contextWindow = contextWindow
        self.isThinkingSupported = isThinkingSupported
    }
}

public enum ModelCatalog {
    public static let standardProviders: [ProviderItem] = [
        ProviderItem(id: "anthropic", name: "Anthropic", iconName: "brain"),
        ProviderItem(id: "openai", name: "OpenAI", iconName: "sparkles"),
        ProviderItem(id: "deepseek", name: "DeepSeek", iconName: "cpu"),
        ProviderItem(id: "google", name: "Google Gemini", iconName: "globe"),
        ProviderItem(id: "openrouter", name: "OpenRouter", iconName: "network"),
        ProviderItem(id: "cursor", name: "Cursor / Opencodex", iconName: "chevron.left.forwardslash.chevron.right", requiresApiKey: false)
    ]

    public static let standardModels: [ModelDescriptor] = [
        ModelDescriptor(id: "claude-3-5-sonnet", providerId: "anthropic", displayName: "Claude 3.5 Sonnet", contextWindow: "200k", isThinkingSupported: true),
        ModelDescriptor(id: "claude-3-7-sonnet", providerId: "anthropic", displayName: "Claude 3.7 Sonnet (Hybrid)", contextWindow: "200k", isThinkingSupported: true),
        ModelDescriptor(id: "gpt-4o", providerId: "openai", displayName: "GPT-4o", contextWindow: "128k"),
        ModelDescriptor(id: "o3-mini", providerId: "openai", displayName: "o3-mini", contextWindow: "128k", isThinkingSupported: true),
        ModelDescriptor(id: "deepseek-chat", providerId: "deepseek", displayName: "DeepSeek-V3", contextWindow: "64k"),
        ModelDescriptor(id: "deepseek-reasoner", providerId: "deepseek", displayName: "DeepSeek-R1", contextWindow: "64k", isThinkingSupported: true),
        ModelDescriptor(id: "gemini-2-5-pro", providerId: "google", displayName: "Gemini 2.5 Pro", contextWindow: "1M", isThinkingSupported: true),
        ModelDescriptor(id: "composer-2-5", providerId: "cursor", displayName: "Cursor Composer 2.5", contextWindow: "128k")
    ]
}
