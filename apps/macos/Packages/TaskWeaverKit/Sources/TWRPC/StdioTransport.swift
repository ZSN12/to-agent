import Foundation
import TWContract

public actor StdioTransport: TaskWeaverTransport, TaskWeaverEventTransport {
    private var stdinPipe: Pipe?
    private var stdoutPipe: Pipe?
    private var nextRequestId: Int = 1
    private var pendingRequests: [Int: CheckedContinuation<JSONValue, Error>] = [:]
    private struct SubscribedContinuation {
        let id: UUID
        let continuation: AsyncStream<JSONValue>.Continuation
    }
    private var eventContinuations: [String: [SubscribedContinuation]] = [:]
    private var lineBuffer = ""
    private var isRunning = false

    public init() {}

    public func attach(stdin: Pipe, stdout: Pipe) {
        self.stdinPipe = stdin
        self.stdoutPipe = stdout
        self.isRunning = true

        stdout.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            guard let text = String(data: data, encoding: .utf8) else { return }
            Task { [weak self] in
                await self?.consumeIncomingText(text)
            }
        }
    }

    public func detach() {
        self.isRunning = false
        self.stdoutPipe?.fileHandleForReading.readabilityHandler = nil
        self.stdinPipe = nil
        self.stdoutPipe = nil

        for (_, continuation) in pendingRequests {
            continuation.resume(throwing: NSError(domain: "TWRPC", code: -32000, userInfo: [NSLocalizedDescriptionKey: "Transport detached"]))
        }
        pendingRequests.removeAll()

        for (_, list) in eventContinuations {
            for item in list {
                item.continuation.finish()
            }
        }
        eventContinuations.removeAll()
    }

    // --- TaskWeaverTransport: Invoke ---
    public func invoke(_ channel: String, args: [AnyEncodable]) async throws -> JSONValue {
        guard isRunning, let stdin = stdinPipe else {
            throw NSError(domain: "TWRPC", code: -32000, userInfo: [NSLocalizedDescriptionKey: "Backend process is not running"])
        }

        let id = nextRequestId
        nextRequestId += 1

        let payloadDict: [String: Any] = [
            "jsonrpc": "2.0",
            "id": id,
            "method": channel,
            "params": args
        ]

        let data = try JSONSerialization.data(withJSONObject: payloadDict)
        guard var line = String(data: data, encoding: .utf8) else {
            throw NSError(domain: "TWRPC", code: -32600, userInfo: [NSLocalizedDescriptionKey: "Failed to encode JSON-RPC frame"])
        }
        line.append("\n")

        guard let lineData = line.data(using: .utf8) else {
            throw NSError(domain: "TWRPC", code: -32600, userInfo: [NSLocalizedDescriptionKey: "Failed to convert line to data"])
        }

        return try await withCheckedThrowingContinuation { continuation in
            pendingRequests[id] = continuation
            do {
                try stdin.fileHandleForWriting.write(contentsOf: lineData)
            } catch {
                pendingRequests.removeValue(forKey: id)
                continuation.resume(throwing: error)
            }
        }
    }

    // --- TaskWeaverEventTransport: Subscribe ---
    public nonisolated func subscribe(to channel: String) -> AsyncStream<JSONValue> {
        let subId = UUID()
        return AsyncStream { continuation in
            Task {
                await self.addEventContinuation(channel: channel, id: subId, continuation: continuation)
            }
            continuation.onTermination = { [weak self] _ in
                Task { [weak self] in
                    await self?.removeEventContinuation(channel: channel, id: subId)
                }
            }
        }
    }

    private func addEventContinuation(channel: String, id: UUID, continuation: AsyncStream<JSONValue>.Continuation) {
        if eventContinuations[channel] == nil {
            eventContinuations[channel] = []
        }
        eventContinuations[channel]?.append(SubscribedContinuation(id: id, continuation: continuation))
    }

    private func removeEventContinuation(channel: String, id: UUID) {
        if var list = eventContinuations[channel] {
            list.removeAll { $0.id == id }
            eventContinuations[channel] = list
        }
    }

    // --- Ingestion of NDJSON lines ---
    private func consumeIncomingText(_ text: String) {
        lineBuffer.append(text)
        while let newlineRange = lineBuffer.range(of: "\n") {
            let line = String(lineBuffer[..<newlineRange.lowerBound]).trimmingCharacters(in: .whitespacesAndNewlines)
            lineBuffer.removeSubrange(..<newlineRange.upperBound)
            if !line.isEmpty {
                handleJsonLine(line)
            }
        }
    }

    private func handleJsonLine(_ line: String) {
        guard let data = line.data(using: .utf8) else { return }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

        // 1. Response to our request: { id, result / error }
        if let id = json["id"] as? Int, json["method"] == nil {
            if let continuation = pendingRequests.removeValue(forKey: id) {
                if let errorObj = json["error"] as? [String: Any] {
                    let code = errorObj["code"] as? Int ?? -32603
                    let msg = errorObj["message"] as? String ?? "RPC Error"
                    continuation.resume(throwing: NSError(domain: "TWRPC", code: code, userInfo: [NSLocalizedDescriptionKey: msg]))
                } else if let resultData = try? JSONEncoder().encode(try? JSONDecoder().decode(JSONValue.self, from: JSONSerialization.data(withJSONObject: json["result"] ?? NSNull()))) {
                    if let val = try? JSONDecoder().decode(JSONValue.self, from: resultData) {
                        continuation.resume(returning: val)
                    } else {
                        continuation.resume(returning: .null)
                    }
                } else {
                    continuation.resume(returning: .null)
                }
            }
            return
        }

        // 2. Reverse request from Backend -> Swift: { id, method, params }
        if let id = json["id"] as? Int, let method = json["method"] as? String {
            Task { [weak self] in
                var paramsValue: JSONValue?
                if let rawParams = json["params"], let pData = try? JSONSerialization.data(withJSONObject: rawParams) {
                    paramsValue = try? JSONDecoder().decode(JSONValue.self, from: pData)
                }

                do {
                    let result = try await ReverseRequestHandler.handle(method: method, params: paramsValue)
                    await self?.sendReverseResponse(id: id, result: result, error: nil)
                } catch {
                    await self?.sendReverseResponse(id: id, result: nil, error: error)
                }
            }
            return
        }

        // 3. Notification: { method, params }
        if let method = json["method"] as? String, json["id"] == nil {
            var paramsValue: JSONValue = .null
            if let rawParams = json["params"], let pData = try? JSONSerialization.data(withJSONObject: rawParams) {
                paramsValue = (try? JSONDecoder().decode(JSONValue.self, from: pData)) ?? .null
            }

            if let list = eventContinuations[method] {
                for item in list {
                    item.continuation.yield(paramsValue)
                }
            }
        }
    }

    private func sendReverseResponse(id: Int, result: JSONValue?, error: Error?) {
        guard let stdin = stdinPipe else { return }
        var dict: [String: Any] = ["jsonrpc": "2.0", "id": id]
        if let error = error {
            dict["error"] = ["code": (error as NSError).code, "message": error.localizedDescription]
        } else if let result = result {
            if let data = try? JSONEncoder().encode(result), let obj = try? JSONSerialization.jsonObject(with: data) {
                dict["result"] = obj
            } else {
                dict["result"] = NSNull()
            }
        } else {
            dict["result"] = NSNull()
        }

        if let data = try? JSONSerialization.data(withJSONObject: dict), var line = String(data: data, encoding: .utf8) {
            line.append("\n")
            if let lineData = line.data(using: .utf8) {
                try? stdin.fileHandleForWriting.write(contentsOf: lineData)
            }
        }
    }
}
