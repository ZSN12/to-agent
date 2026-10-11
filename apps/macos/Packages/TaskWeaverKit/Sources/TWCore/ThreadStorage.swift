import Foundation
import TWRPC

public struct StoredThread: Codable, Sendable {
    public let id: String
    public let conversationId: String?
    public let workspacePath: String?
    public var title: String
    public let modelKey: String?
    public let createdAt: Double?
    public let updatedAt: Double?
    public var messages: [StoredMessage]?

    public struct StoredMessage: Codable, Sendable {
        public let id: String
        public let author: String?
        public let name: String?
        public let time: String?
        public let timestamp: Double?
        public let text: String?
    }
}

public struct StoredThreadRoot: Codable, Sendable {
    public var currentThreadId: String?
    public var threads: [StoredThread]
}

public enum ThreadStorage {
    public static func loadThreads() -> (currentThreadId: String?, threads: [StoredThread]) {
        let dir = BackendSupervisor.resolveUserDataDirectory()
        let fileURL = dir.appendingPathComponent("taskweaver-threads.json")
        guard FileManager.default.fileExists(atPath: fileURL.path),
              let data = try? Data(contentsOf: fileURL) else {
            return (nil, [])
        }

        do {
            let root = try JSONDecoder().decode(StoredThreadRoot.self, from: data)
            return (root.currentThreadId, root.threads)
        } catch {
            print("⚠️ ThreadStorage decode error:", error)
            return (nil, [])
        }
    }

    public static func saveThreads(currentThreadId: String?, threads: [StoredThread]) {
        let dir = BackendSupervisor.resolveUserDataDirectory()
        let fileURL = dir.appendingPathComponent("taskweaver-threads.json")
        let root = StoredThreadRoot(currentThreadId: currentThreadId, threads: threads)
        do {
            let data = try JSONEncoder().encode(root)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            print("⚠️ ThreadStorage save error:", error)
        }
    }
}
