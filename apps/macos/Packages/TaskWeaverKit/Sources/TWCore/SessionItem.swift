import Foundation

public struct SessionItem: Identifiable, Sendable, Hashable {
    public let id: String
    public var title: String
    public var lastPreview: String
    public var updatedAt: Date
    public var isRunning: Bool

    public init(
        id: String = UUID().uuidString,
        title: String,
        lastPreview: String = "",
        updatedAt: Date = Date(),
        isRunning: Bool = false
    ) {
        self.id = id
        self.title = title
        self.lastPreview = lastPreview
        self.updatedAt = updatedAt
        self.isRunning = isRunning
    }
}
