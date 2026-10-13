import Foundation
import CryptoKit

/// Spawns `backend/shell/run.mjs` (Node backend, no Electron runtime).
@MainActor
final class BackendLauncher {
    private var process: Process?
    private var lastTerminationStatus: Int32?
    private(set) var baseURL: URL?
    private(set) var shellToken: String?
    var onTermination: ((Int32) -> Void)?

    let port: Int

    init(port: Int = 31981) {
        self.port = port
    }

    func start() throws {
        guard process == nil else { return }
        lastTerminationStatus = nil
        let shellToken = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()

        let paths = resolveLaunchPaths()
        let proc = Process()
        proc.executableURL = paths.node
        if paths.useEnvNode {
            proc.arguments = ["node", paths.script.path]
        } else {
            proc.arguments = [paths.script.path]
        }
        proc.currentDirectoryURL = paths.appRoot

        let parentEnvironment = ProcessInfo.processInfo.environment
        var env: [String: String] = [:]
        for key in ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "LC_CTYPE", "USER", "LOGNAME", "SHELL", "TERM", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"] {
            if let value = parentEnvironment[key] { env[key] = value }
        }
        env["TASKWEAVER_SHELL_SERVER"] = "1"
        env["TASKWEAVER_SHELL_PORT"] = String(port)
        env["TASKWEAVER_SHELL_HOST"] = "127.0.0.1"
        env["TASKWEAVER_SHELL_TOKEN"] = shellToken
        if paths.isPackaged {
            env["TASKWEAVER_PACKAGED"] = "1"
            env["TASKWEAVER_RESOURCES_PATH"] = paths.resources.path
        }
        let uiRoot = paths.appRoot.appendingPathComponent("dist", isDirectory: true)
        if FileManager.default.fileExists(atPath: uiRoot.appendingPathComponent("index.html").path) {
            env["TASKWEAVER_SHELL_UI_ROOT"] = uiRoot.path
        } else {
            env.removeValue(forKey: "TASKWEAVER_SHELL_UI_ROOT")
        }
        proc.environment = env
        proc.standardOutput = FileHandle.nullDevice
        proc.standardError = FileHandle.nullDevice
        proc.terminationHandler = { [weak self] terminated in
            Task { @MainActor [weak self] in
                guard let self, self.process === terminated else { return }
                self.process = nil
                self.baseURL = nil
                self.shellToken = nil
                self.lastTerminationStatus = terminated.terminationStatus
                self.onTermination?(terminated.terminationStatus)
            }
        }
        try proc.run()
        process = proc
        baseURL = URL(string: "http://127.0.0.1:\(port)")!
        self.shellToken = shellToken
    }

    func stop() {
        let runningProcess = process
        process = nil
        baseURL = nil
        shellToken = nil
        runningProcess?.terminationHandler = nil
        if runningProcess?.isRunning == true {
            runningProcess?.terminate()
        }
    }

    func waitUntilHealthy(timeoutSeconds: TimeInterval = 120) async throws {
        guard let baseURL else { throw BackendError.notStarted }
        guard let shellToken else { throw BackendError.notStarted }
        let deadline = Date().addingTimeInterval(timeoutSeconds)
        let health = baseURL.appendingPathComponent("shell/v1/health")
        while Date() < deadline {
            if process?.isRunning != true {
                throw BackendError.processExited(lastTerminationStatus ?? process?.terminationStatus)
            }
            if let ok = try? await fetchHealth(health, token: shellToken), ok {
                return
            }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        throw BackendError.healthTimeout
    }

    private func fetchHealth(_ url: URL, token: String) async throws -> Bool {
        let challenge = UUID().uuidString
        var request = URLRequest(url: url)
        request.setValue(challenge, forHTTPHeaderField: "X-TaskWeaver-Shell-Challenge")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return false }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        guard json["ok"] as? Bool == true,
              let proof = json["proof"] as? String else { return false }
        let key = SymmetricKey(data: Data(token.utf8))
        let expected = HMAC<SHA256>.authenticationCode(for: Data(challenge.utf8), using: key)
            .map { String(format: "%02x", $0) }
            .joined()
        return proof == expected
    }

    private struct LaunchPaths {
        let node: URL
        let script: URL
        let appRoot: URL
        let resources: URL
        let isPackaged: Bool
        let useEnvNode: Bool
    }

    private func resolveLaunchPaths() -> LaunchPaths {
        if let resourceURL = Bundle.main.resourceURL,
           FileManager.default.fileExists(atPath: resourceURL.appendingPathComponent("app/backend/shell/run.mjs").path) {
            let appRoot = resourceURL.appendingPathComponent("app")
            let node = resourceURL.appendingPathComponent("host-node/bin/node")
            let script = appRoot.appendingPathComponent("backend/shell/run.mjs")
            return LaunchPaths(node: node, script: script, appRoot: appRoot, resources: resourceURL, isPackaged: true, useEnvNode: false)
        }

        let repo = ProcessInfo.processInfo.environment["TASKWEAVER_REPO_ROOT"]
            ?? FileManager.default.currentDirectoryPath
        let appRoot = URL(fileURLWithPath: repo, isDirectory: true)
        let script = appRoot.appendingPathComponent("backend/shell/run.mjs")
        if let hostNode = ProcessInfo.processInfo.environment["TASKWEAVER_HOST_NODE"], !hostNode.isEmpty {
            return LaunchPaths(
                node: URL(fileURLWithPath: hostNode),
                script: script,
                appRoot: appRoot,
                resources: appRoot,
                isPackaged: false,
                useEnvNode: false
            )
        }
        return LaunchPaths(
            node: URL(fileURLWithPath: "/usr/bin/env"),
            script: script,
            appRoot: appRoot,
            resources: appRoot,
            isPackaged: false,
            useEnvNode: true
        )
    }

    enum BackendError: LocalizedError {
        case notStarted
        case healthTimeout
        case processExited(Int32?)

        var errorDescription: String? {
            switch self {
            case .notStarted:
                return "Node 后端尚未启动。"
            case .healthTimeout:
                return "Node 后端在 120 秒内未通过健康检查。"
            case .processExited(let status):
                if let status { return "Node 后端在启动完成前退出，状态码：\(status)。" }
                return "Node 后端在启动完成前退出。"
            }
        }
    }
}
