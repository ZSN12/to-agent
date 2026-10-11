import Foundation
import Observation
import TWContract
import TWRPC

@Observable
public final class AppModel: @unchecked Sendable {
    public static let shared = AppModel()

    private let client: TaskWeaverClient
    @ObservationIgnored private var activeChatRequestID: UUID?
    @ObservationIgnored private var activeChatConversationID: String?
    @ObservationIgnored private var chatEventTask: Task<Void, Never>?

    public var backendState: BackendState = .stopped
    public var firstRunNoticeItems: [FirstRunNoticeItem] = []
    public var showFirstRunNotice: Bool = false
    public var errorMessage: String?

    // Chat session state
    public var sessions: [SessionItem] = []
    public var activeSessionId: String?
    public var messages: [ChatMessageItem] = []
    public var isStreaming: Bool = false

    // Model selection & Settings state
    public var selectedModelId: String = "claude-3-5-sonnet"
    public var showSettingsSheet: Bool = false
    public var focusedProviderId: String? = nil

    public var selectedModel: ModelDescriptor {
        ModelCatalog.standardModels.first { $0.id == selectedModelId } ?? ModelCatalog.standardModels[0]
    }

    public struct FirstRunNoticeItem: Identifiable, Sendable, Hashable {
        public let id = UUID()
        public let kind: String
        public let label: String

        public init(kind: String, label: String) {
            self.kind = kind
            self.label = label
        }
    }

    public init(client: TaskWeaverClient? = nil) {
        self.client = client ?? BackendSupervisor.shared.client
        BackendSupervisor.shared.onStateChange = { [weak self] newState in
            Task { @MainActor [weak self] in
                self?.backendState = newState
                if case .ready = newState {
                    await self?.checkFirstRunNotice()
                }
            }
        }
    }

    @MainActor
    public func boot() async {
        self.loadStoredSessions()
        do {
            try await BackendSupervisor.shared.start()
        } catch {
            self.errorMessage = error.localizedDescription
        }
    }

    @MainActor
    public func checkFirstRunNotice() async {
        do {
            let res = try await client.app.getFirstRunNotice([])
            if case .object(let dict) = res,
               case .object(let data)? = dict["data"] ?? dict["result"] {
                var dismissed = false
                if case .bool(let d) = data["dismissed"] { dismissed = d }
                if !dismissed, case .array(let itemsArr)? = data["items"] {
                    var parsed: [FirstRunNoticeItem] = []
                    for item in itemsArr {
                        if case .object(let itemDict) = item,
                           case .string(let k)? = itemDict["kind"],
                           case .string(let l)? = itemDict["label"] {
                            parsed.append(FirstRunNoticeItem(kind: k, label: l))
                        }
                    }
                    if !parsed.isEmpty {
                        self.firstRunNoticeItems = parsed
                        self.showFirstRunNotice = true
                    }
                }
            }
        } catch {
            print("[AppModel] checkFirstRunNotice error:", error)
        }
    }

    @MainActor
    public func dismissFirstRunNotice() async {
        _ = try? await client.app.dismissFirstRunNotice([])
        self.showFirstRunNotice = false
        self.firstRunNoticeItems = []
    }

    // MARK: - Chat & Session Operations

    @MainActor
    public func loadStoredSessions() {
        let (currentId, threads) = ThreadStorage.loadThreads()
        self.sessions = threads.map { t in
            let preview = t.messages?.last?.text ?? ""
            let date = t.updatedAt != nil ? Date(timeIntervalSince1970: t.updatedAt! / 1000) : Date()
            return SessionItem(id: t.id, title: t.title, lastPreview: preview, updatedAt: date)
        }
        if let currentId, let thread = threads.first(where: { $0.id == currentId }) {
            self.activeSessionId = currentId
            loadThreadMessages(thread)
        } else if let first = threads.first {
            self.activeSessionId = first.id
            loadThreadMessages(first)
        }
    }

    @MainActor
    public func selectSession(id: String) {
        guard activeSessionId != id else { return }
        chatEventTask?.cancel()
        chatEventTask = nil
        activeChatRequestID = nil
        activeChatConversationID = nil
        isStreaming = false
        activeSessionId = id
        let (_, threads) = ThreadStorage.loadThreads()
        if let thread = threads.first(where: { $0.id == id }) {
            loadThreadMessages(thread)
        } else {
            messages.removeAll()
        }
    }

    private func loadThreadMessages(_ thread: StoredThread) {
        guard let rawMsgs = thread.messages else {
            self.messages = []
            return
        }
        self.messages = rawMsgs.map { m in
            let isUser = m.author == "user"
            return ChatMessageItem(
                id: m.id,
                role: isUser ? .user : .assistant,
                content: m.text ?? "",
                timestamp: m.timestamp != nil ? Date(timeIntervalSince1970: m.timestamp! / 1000) : Date()
            )
        }
    }

    @MainActor
    public func createSession(title: String = "新会话") {
        let newSession = SessionItem(id: UUID().uuidString, title: title, lastPreview: "暂无消息", updatedAt: Date())
        self.sessions.insert(newSession, at: 0)
        self.activeSessionId = newSession.id
        self.messages.removeAll()

        var (_, threads) = ThreadStorage.loadThreads()
        let newThread = StoredThread(
            id: newSession.id,
            conversationId: UUID().uuidString,
            workspacePath: nil,
            title: title,
            modelKey: nil,
            createdAt: Date().timeIntervalSince1970 * 1000,
            updatedAt: Date().timeIntervalSince1970 * 1000,
            messages: []
        )
        threads.insert(newThread, at: 0)
        ThreadStorage.saveThreads(currentThreadId: newSession.id, threads: threads)
    }

    @MainActor
    public func renameSession(id: String, newTitle: String) {
        if let idx = sessions.firstIndex(where: { $0.id == id }) {
            sessions[idx].title = newTitle
        }
        var (cur, threads) = ThreadStorage.loadThreads()
        if let idx = threads.firstIndex(where: { $0.id == id }) {
            threads[idx].title = newTitle
            ThreadStorage.saveThreads(currentThreadId: cur, threads: threads)
        }
    }

    @MainActor
    public func deleteSession(id: String) {
        sessions.removeAll { $0.id == id }
        var (_, threads) = ThreadStorage.loadThreads()
        threads.removeAll { $0.id == id }
        if activeSessionId == id {
            activeSessionId = sessions.first?.id
            if let activeSessionId, let firstThread = threads.first(where: { $0.id == activeSessionId }) {
                loadThreadMessages(firstThread)
            } else {
                messages.removeAll()
            }
        }
        ThreadStorage.saveThreads(currentThreadId: activeSessionId, threads: threads)
    }

    public func exportCurrentSessionMarkdown() -> String {
        var doc = "# TaskWeaver 会话记录\n\n"
        for msg in messages {
            let roleName = msg.role == .user ? "## 用户" : "## Assistant"
            doc += "\(roleName) (\(msg.timestamp.formatted()))\n\n"
            if let thinking = msg.thinking, !thinking.isEmpty {
                doc += "> 💭 思考过程:\n> \(thinking.replacingOccurrences(of: "\n", with: "\n> "))\n\n"
            }
            doc += "\(msg.content)\n\n---\n\n"
        }
        return doc
    }

    public func exportCurrentSessionJSON() -> String {
        let exportData = messages.map { m in
            [
                "id": m.id,
                "role": m.role.rawValue,
                "content": m.content,
                "thinking": m.thinking ?? "",
                "timestamp": m.timestamp.timeIntervalSince1970
            ] as [String : Any]
        }
        if let data = try? JSONSerialization.data(withJSONObject: exportData, options: .prettyPrinted),
           let str = String(data: data, encoding: .utf8) {
            return str
        }
        return "[]"
    }

    @MainActor
    public func clearMessages() {
        self.messages.removeAll()
    }

    @MainActor
    public func loadDemoMessages(count: Int = 2000) {
        var list: [ChatMessageItem] = []
        list.reserveCapacity(count)
        for i in 1...count {
            if i % 2 == 1 {
                list.append(ChatMessageItem(
                    role: .user,
                    content: "第 \(i) 轮提问：请说明 TaskWeaver 原生 macOS 架构的实现细节与性能优化策略。"
                ))
            } else {
                let codeSnippet = """
                ```swift
                // 演示代码块 - 消息序号 #\(i)
                final class Coordinator {
                    func runBenchmark() async {
                        print("Performance index: \(i)")
                    }
                }
                ```
                """
                list.append(ChatMessageItem(
                    role: .assistant,
                    content: "第 \(i) 轮回复：TaskWeaver 已切换至纯原生 SwiftUI + SwiftPM 架构。\n\n\(codeSnippet)\n\n采用稳定块流式解析，保证长列表极速渲染且零掉帧。",
                    thinking: i % 10 == 0 ? "正在检索内部架构文档与 Benchmark 数据集..." : nil
                ))
            }
        }
        self.messages = list
    }

    @MainActor
    @discardableResult
    public func sendUserMessage(text: String) -> String? {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        let userMsg = ChatMessageItem(role: .user, content: text)
        self.messages.append(userMsg)

        let assistantMsg = ChatMessageItem(
            role: .assistant,
            content: "",
            isStreaming: true
        )
        self.messages.append(assistantMsg)
        self.isStreaming = true
        persistActiveThreadMessages()
        return assistantMsg.id
    }

    @MainActor
    public func sendChatMessage(text: String) async {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !isStreaming else { return }

        if activeSessionId == nil {
            createSession()
        }
        guard let sessionID = activeSessionId else {
            errorMessage = "无法确定当前会话。"
            return
        }

        let (_, threads) = ThreadStorage.loadThreads()
        let conversationID = threads.first(where: { $0.id == sessionID })?.conversationId
            .flatMap { $0.isEmpty ? nil : $0 } ?? sessionID
        guard let assistantMessageID = sendUserMessage(text: text) else { return }

        errorMessage = nil
        let requestID = UUID()
        activeChatRequestID = requestID
        activeChatConversationID = conversationID

        let stream = client.events.chatStream
        chatEventTask = Task { @MainActor [weak self] in
            for await event in stream {
                guard !Task.isCancelled, let self else { return }
                guard self.activeChatRequestID == requestID else { return }
                if self.consumeChatStreamEvent(
                    event,
                    conversationID: conversationID,
                    assistantMessageID: assistantMessageID,
                    requestID: requestID
                ) {
                    return
                }
            }
        }

        // Start the stream consumer before invoking chat:send so the first delta
        // cannot be lost while the RPC response is in flight.
        await Task.yield()

        do {
            let response = try await client.chat.send([
                AnyEncodable(text),
                AnyEncodable(selectedModelId),
                AnyEncodable(Optional<String>.none), // skillName
                AnyEncodable(Optional<String>.none), // executionModeOverride
                AnyEncodable("code"),
                AnyEncodable(conversationID),
            ])
            guard activeChatRequestID == requestID else { return }
            if let rejection = Self.chatSendRejection(in: response) {
                errorMessage = rejection
                finishStreaming(messageID: assistantMessageID, requestID: requestID)
                return
            }

            // chat:send resolves after the backend emits its terminal event. Give
            // the stdio reader a brief turn to deliver that notification before
            // reporting a protocol mismatch.
            try? await Task.sleep(nanoseconds: 50_000_000)
            guard activeChatRequestID == requestID else { return }
            if isStreaming {
                errorMessage = "后端调用已返回，但没有收到当前会话的完成事件。"
                finishStreaming(messageID: assistantMessageID, requestID: requestID)
            }
        } catch {
            guard activeChatRequestID == requestID else { return }
            errorMessage = error.localizedDescription
            finishStreaming(messageID: assistantMessageID, requestID: requestID)
        }
    }

    @MainActor
    public func appendAssistantChunk(delta: String, messageID: String? = nil) {
        guard let index = assistantMessageIndex(messageID: messageID) else { return }
        messages[index].content += delta
        persistActiveThreadMessages()
    }

    @MainActor
    public func finishStreaming(messageID: String? = nil, requestID: UUID? = nil) {
        if let requestID, activeChatRequestID != requestID { return }
        if let index = assistantMessageIndex(messageID: messageID) {
            messages[index].isStreaming = false
        }
        self.isStreaming = false
        persistActiveThreadMessages()
        if requestID == nil || activeChatRequestID == requestID {
            activeChatRequestID = nil
            activeChatConversationID = nil
            chatEventTask?.cancel()
            chatEventTask = nil
        }
    }

    @MainActor
    private func consumeChatStreamEvent(
        _ event: JSONValue,
        conversationID: String,
        assistantMessageID: String,
        requestID: UUID
    ) -> Bool {
        guard activeChatRequestID == requestID,
              activeChatConversationID == conversationID,
              case .object(let fields) = event,
              fields["conversationId"] == .string(conversationID),
              case .string(let type)? = fields["type"] else {
            return false
        }

        switch type {
        case "delta":
            if case .string(let delta)? = fields["delta"] {
                appendAssistantChunk(delta: delta, messageID: assistantMessageID)
            }
        case "done":
            if case .string(let full)? = fields["full"] {
                setAssistantMessageContent(full, messageID: assistantMessageID)
            }
            finishStreaming(messageID: assistantMessageID, requestID: requestID)
            return true
        case "error":
            if case .string(let full)? = fields["full"] {
                setAssistantMessageContent(full, messageID: assistantMessageID)
            }
            if case .string(let message)? = fields["message"] {
                errorMessage = message
            } else {
                errorMessage = "后端对话失败。"
            }
            finishStreaming(messageID: assistantMessageID, requestID: requestID)
            return true
        default:
            break
        }
        return false
    }

    @MainActor
    private func assistantMessageIndex(messageID: String?) -> Int? {
        if let messageID {
            return messages.firstIndex(where: { $0.id == messageID && $0.role == .assistant })
        }
        guard let index = messages.indices.last, messages[index].role == .assistant else { return nil }
        return index
    }

    @MainActor
    private func setAssistantMessageContent(_ content: String, messageID: String) {
        guard let index = assistantMessageIndex(messageID: messageID) else { return }
        messages[index].content = content
        persistActiveThreadMessages()
    }

    @MainActor
    private func persistActiveThreadMessages() {
        guard let activeSessionId else { return }
        var (currentThreadId, threads) = ThreadStorage.loadThreads()
        guard let index = threads.firstIndex(where: { $0.id == activeSessionId }) else { return }
        let thread = threads[index]
        let persistedMessages = messages.map { message in
            StoredThread.StoredMessage(
                id: message.id,
                author: message.role.rawValue,
                name: nil,
                time: nil,
                timestamp: message.timestamp.timeIntervalSince1970 * 1000,
                text: message.content
            )
        }
        threads[index] = StoredThread(
            id: thread.id,
            conversationId: thread.conversationId,
            workspacePath: thread.workspacePath,
            title: thread.title,
            modelKey: thread.modelKey,
            createdAt: thread.createdAt,
            updatedAt: Date().timeIntervalSince1970 * 1000,
            messages: persistedMessages
        )
        if currentThreadId == nil { currentThreadId = activeSessionId }
        ThreadStorage.saveThreads(currentThreadId: currentThreadId, threads: threads)

        if let sessionIndex = sessions.firstIndex(where: { $0.id == activeSessionId }) {
            sessions[sessionIndex].updatedAt = Date()
            sessions[sessionIndex].lastPreview = messages.last(where: { !$0.content.isEmpty })?.content ?? ""
        }
    }

    private static func chatSendRejection(in response: JSONValue) -> String? {
        guard case .object(let root) = response else { return nil }
        if root["ok"] == .bool(false) {
            if case .string(let message)? = root["error"] { return message }
            return "后端拒绝了本次对话请求。"
        }
        let body: [String: JSONValue]
        if case .object(let data)? = root["data"] ?? root["result"] {
            body = data
        } else {
            body = root
        }
        if body["needsOrchestrationChoice"] == .bool(true) {
            if case .string(let reason)? = body["reason"] { return reason }
            return "此请求需要选择编排模式，原生界面尚未接入该选择。"
        }
        return nil
    }
}
