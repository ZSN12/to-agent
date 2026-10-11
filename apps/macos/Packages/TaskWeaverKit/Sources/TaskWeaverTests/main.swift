import Foundation
import TWContract
import TWPlatform
import TWRPC
import TWCore
import TWMarkdown
import TWUI

final class ChatHarnessTransport: TaskWeaverTransport, TaskWeaverEventTransport, @unchecked Sendable {
    private let lock = NSLock()
    private var streamContinuation: AsyncStream<JSONValue>.Continuation?
    private var queuedEventBatches: [[JSONValue]] = []
    private var invocations: [(String, [JSONValue])] = []

    func subscribe(to channel: String) -> AsyncStream<JSONValue> {
        AsyncStream { continuation in
            install(continuation)
            continuation.onTermination = { [weak self] _ in
                self?.removeStreamContinuation()
            }
        }
    }

    func enqueueChatEvents(_ events: [JSONValue]) {
        lock.lock()
        queuedEventBatches.append(events)
        lock.unlock()
    }

    func lastInvocation(named channel: String) -> (String, [JSONValue])? {
        lock.lock()
        defer { lock.unlock() }
        return invocations.last(where: { $0.0 == channel })
    }

    func invoke(_ channel: String, args: [AnyEncodable]) async throws -> JSONValue {
        let encodedArgs = try JSONDecoder().decode([JSONValue].self, from: JSONEncoder().encode(args))
        recordInvocation(channel, args: encodedArgs)
        guard channel == "chat:send" else { return .object([:]) }

        let events = takeNextEventBatch()
        try? await Task.sleep(nanoseconds: 10_000_000)
        for event in events {
            publish(event)
        }
        return .object(["ok": .bool(true), "data": .object(["accepted": .bool(true)])])
    }

    private func install(_ continuation: AsyncStream<JSONValue>.Continuation) {
        lock.lock()
        streamContinuation = continuation
        lock.unlock()
    }

    private func removeStreamContinuation() {
        lock.lock()
        streamContinuation = nil
        lock.unlock()
    }

    private func recordInvocation(_ channel: String, args: [JSONValue]) {
        lock.lock()
        invocations.append((channel, args))
        lock.unlock()
    }

    private func takeNextEventBatch() -> [JSONValue] {
        lock.lock()
        defer { lock.unlock() }
        guard !queuedEventBatches.isEmpty else { return [] }
        return queuedEventBatches.removeFirst()
    }

    private func publish(_ event: JSONValue) {
        lock.lock()
        let continuation = streamContinuation
        lock.unlock()
        continuation?.yield(event)
    }
}

@inline(__always)
func assertTrue(_ condition: Bool, _ message: String = "", file: StaticString = #file, line: UInt = #line) {
    if !condition {
        fputs("❌ Assertion Failed: \(message) at \(file):\(line)\n", stderr)
        exit(1)
    }
}

@inline(__always)
func assertEqual<T: Equatable>(_ a: T, _ b: T, _ message: String = "", file: StaticString = #file, line: UInt = #line) {
    if a != b {
        fputs("❌ Assertion Failed: [\(a)] != [\(b)] \(message) at \(file):\(line)\n", stderr)
        exit(1)
    }
}

@MainActor
func runAllTests() async {
    print("🧪 Starting TaskWeaverKit Unit Tests...")

    let originalUserDataOverride = getenv("TW_USER_DATA_OVERRIDE").map { String(cString: $0) }
    let isolatedUserData = FileManager.default.temporaryDirectory
        .appendingPathComponent("taskweaver-swift-tests-\(UUID().uuidString)", isDirectory: true)
    try? FileManager.default.createDirectory(at: isolatedUserData, withIntermediateDirectories: true)
    defer {
        if let originalUserDataOverride {
            setenv("TW_USER_DATA_OVERRIDE", originalUserDataOverride, 1)
        } else {
            unsetenv("TW_USER_DATA_OVERRIDE")
        }
        try? FileManager.default.removeItem(at: isolatedUserData)
    }

    // Test 1: User Data Directory Precedence
    print("  - Running testUserDataPrecedence...")
    unsetenv("TW_USER_DATA_OVERRIDE")
    let defaultDir = BackendSupervisor.resolveUserDataDirectory()
    assertTrue(!defaultDir.path.isEmpty, "User data directory path must not be empty")
    assertTrue(defaultDir.path.contains("taskweaver-desktop") || defaultDir.path.contains("TaskWeaver"), "Path should contain target directory name")

    setenv("TW_USER_DATA_OVERRIDE", isolatedUserData.path, 1)

    // Test 2: Custom User Data Override
    print("  - Running testCustomUserDataOverride...")
    setenv("TW_USER_DATA_OVERRIDE", "/tmp/mock-tw-override", 1)
    let overrideDir = BackendSupervisor.resolveUserDataDirectory()
    assertEqual(overrideDir.path, "/tmp/mock-tw-override", "Should respect TW_USER_DATA_OVERRIDE")
    setenv("TW_USER_DATA_OVERRIDE", isolatedUserData.path, 1)

    // Test 3: Keychain Helper
    print("  - Running testKeychainSetGetDelete...")
    let key = "test_key_\(UUID().uuidString)"
    let value = "test_val_998877"
    do {
        try KeychainHelper.shared.set(value, for: key)
        let fetched = KeychainHelper.shared.get(for: key)
        assertEqual(fetched, value, "Fetched value must match stored value")
        try KeychainHelper.shared.delete(for: key)
        let afterDelete = KeychainHelper.shared.get(for: key)
        assertTrue(afterDelete == nil, "Deleted key must be nil")
    } catch {
        print("    ⚠️ Note: Keychain test skipped or failed in non-interactive environment: \(error)")
    }

    // Test 4: StreamBlockSplitter
    print("  - Running testStreamBlockSplitter...")
    let testMarkdown = """
    # 标题一
    这是第一段普通文本。

    ```swift
    let answer = 42
    ```

    > 这是引用内容
    """
    let blocks = StreamBlockSplitter.parseStream(markdown: testMarkdown)
    assertTrue(!blocks.isEmpty, "Parsed blocks should not be empty")
    let hasHeading = blocks.contains { b in
        if case .heading(let level, _) = b.kind { return level == 1 }
        return false
    }
    assertTrue(hasHeading, "Should parse heading block")
    let hasCode = blocks.contains { b in
        if case .code(let lang, let code) = b.kind { return lang == "swift" && code.contains("42") }
        return false
    }
    assertTrue(hasCode, "Should parse Swift code block")

    // Test 4b: Benchmark 2,000 Messages Stream Block Parsing
    print("  - Running benchmark2000Messages...")
    let sampleChunk = """
    ### 性能评估报告
    当前架构采用 Swift 原生实现，消除 Electron 桥接层与 IPC 序列化损耗。

    ```swift
    func runBenchmark() async -> Double {
        let start = ContinuousClock.now
        return Double(start.components.attoseconds)
    }
    ```

    > 结论：流式稳定块切分算法平均每秒可吞吐 > 100,000 个块。
    """
    let t0 = DispatchTime.now()
    for _ in 1...2000 {
        _ = StreamBlockSplitter.parseStream(markdown: sampleChunk)
    }
    let t1 = DispatchTime.now()
    let elapsedMs = Double(t1.uptimeNanoseconds - t0.uptimeNanoseconds) / 1_000_000
    print("    ⚡️ 2,000 块解析耗时: \(String(format: "%.2f", elapsedMs)) ms (平均 \(String(format: "%.3f", elapsedMs / 2000)) ms/条)")
    assertTrue(elapsedMs < 1000, "2,000 条消息解析必须在 1 秒内完成！")

    // Test 5: S8 Composer Attachment Formatting
    print("  - Running testComposerAttachmentFormatting...")
    let att1 = ComposerAttachment(name: "image.png", sizeBytes: 512, isImage: true)
    assertEqual(att1.sizeFormatted, "512 B")
    let att2 = ComposerAttachment(name: "doc.pdf", sizeBytes: 1024 * 50, isImage: false)
    assertEqual(att2.sizeFormatted, "50 KB")

    // Test 6: S9 Session Item & Export
    print("  - Running testSessionExport...")
    let testSession = SessionItem(id: "sess-1", title: "测试会话")
    assertEqual(testSession.title, "测试会话")
    let appModel = AppModel()
    appModel.sendUserMessage(text: "Hello TaskWeaver")
    let exportedMd = appModel.exportCurrentSessionMarkdown()
    assertTrue(exportedMd.contains("# TaskWeaver 会话记录"))
    assertTrue(exportedMd.contains("Hello TaskWeaver"))
    let exportedJson = appModel.exportCurrentSessionJSON()
    assertTrue(exportedJson.contains("Hello TaskWeaver"))

    // Test 6b: Native chat invokes the backend and applies only the active
    // conversation's delta/done/error stream events.
    print("  - Running testNativeChatSendStream...")
    let chatTransport = ChatHarnessTransport()
    let chatClient = TaskWeaverClient(transport: chatTransport, eventTransport: chatTransport)
    let chatModel = AppModel(client: chatClient)
    chatModel.createSession(title: "RPC chat")
    let conversationID = ThreadStorage.loadThreads().threads.first?.conversationId ?? ""
    assertTrue(!conversationID.isEmpty, "New chat thread must have a conversationId")
    chatTransport.enqueueChatEvents([
        .object([
            "conversationId": .string("another-conversation"),
            "type": .string("delta"),
            "delta": .string("must be ignored"),
        ]),
        .object([
            "conversationId": .string(conversationID),
            "type": .string("delta"),
            "delta": .string("partial"),
        ]),
        .object([
            "conversationId": .string(conversationID),
            "type": .string("done"),
            "full": .string("backend response"),
        ]),
    ])
    await chatModel.sendChatMessage(text: "hello backend")
    for _ in 0..<40 where chatModel.isStreaming {
        try? await Task.sleep(nanoseconds: 10_000_000)
    }
    let sendInvocation = chatTransport.lastInvocation(named: "chat:send")
    assertTrue(sendInvocation != nil, "Native chat must invoke chat:send")
    if let args = sendInvocation?.1 {
        assertTrue(args.count >= 6, "chat:send must include positional arguments through conversationId")
        if args.count >= 6 {
            assertEqual(args[0], .string("hello backend"))
            assertEqual(args[5], .string(conversationID), "chat:send must use the active thread conversationId")
        }
    }
    assertEqual(chatModel.messages.last?.content ?? "", "backend response", "done.full must settle the assistant message")
    assertTrue(!chatModel.isStreaming, "done must clear the streaming state")
    let persistedChatMessages = ThreadStorage.loadThreads().threads
        .first(where: { $0.id == chatModel.activeSessionId })?.messages ?? []
    assertEqual(persistedChatMessages.map { $0.text ?? "" }, ["hello backend", "backend response"], "user and done content must persist to the active thread")

    chatModel.createSession(title: "RPC error")
    let errorConversationID = ThreadStorage.loadThreads().threads.first?.conversationId ?? ""
    chatTransport.enqueueChatEvents([
        .object([
            "conversationId": .string(errorConversationID),
            "type": .string("delta"),
            "delta": .string("partial output"),
        ]),
        .object([
            "conversationId": .string(errorConversationID),
            "type": .string("error"),
            "message": .string("mock backend error"),
        ]),
    ])
    await chatModel.sendChatMessage(text: "fail this turn")
    for _ in 0..<40 where chatModel.isStreaming {
        try? await Task.sleep(nanoseconds: 10_000_000)
    }
    assertEqual(chatModel.errorMessage ?? "", "mock backend error", "error events must reach the UI model")
    assertEqual(chatModel.messages.last?.content ?? "", "partial output", "error should preserve received text")
    assertTrue(!chatModel.isStreaming, "error must clear the streaming state")
    let persistedErrorMessages = ThreadStorage.loadThreads().threads
        .first(where: { $0.id == chatModel.activeSessionId })?.messages ?? []
    assertEqual(persistedErrorMessages.map { $0.text ?? "" }, ["fail this turn", "partial output"], "user and partial error output must persist to the active thread")

    // Test 7: S10 Model Registry & Catalog
    print("  - Running testModelCatalog...")
    assertTrue(ModelCatalog.standardProviders.count >= 5, "Must have standard providers configured")
    let sonnet = ModelCatalog.standardModels.first { $0.id == "claude-3-5-sonnet" }
    assertTrue(sonnet != nil, "Must include Claude 3.5 Sonnet")
    assertTrue(sonnet?.isThinkingSupported == true, "Claude 3.5 Sonnet supports thinking")

    // Test 8: ReverseRequestHandler
    print("  - Running testReverseRequestHandler...")
    do {
        let setRes = try await ReverseRequestHandler.handle(
            method: "$platform/secrets.set",
            params: .object(["key": .string("rpc_test_k"), "value": .string("rpc_test_v")])
        )
        assertEqual(setRes, .null)

        let getRes = try await ReverseRequestHandler.handle(
            method: "$platform/secrets.get",
            params: .object(["key": .string("rpc_test_k")])
        )
        assertEqual(getRes, .string("rpc_test_v"))

        _ = try await ReverseRequestHandler.handle(
            method: "$platform/secrets.delete",
            params: .object(["key": .string("rpc_test_k")])
        )
    } catch {
        print("    ⚠️ ReverseRequestHandler keychain op skipped: \(error)")
    }

    print("✅ All TaskWeaverKit Unit Tests PASSED!")
}

@main
struct TaskWeaverTestRunner {
    @MainActor
    static func main() async {
        await runAllTests()
    }
}
