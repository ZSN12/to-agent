import Foundation

/// Spawns `desktop/shell/run.mjs` (Node backend, no Electron runtime).
final class BackendLauncher {
    private var process: Process?
    private(set) var baseURL: URL?

    let port: Int

    init(port: Int = 31981) {
        self.port = port
    }

    func start() throws {
        guard process == nil else { return }

        let paths = resolveLaunchPaths()
        let proc = Process()
        proc.executableURL = paths.node
        if paths.useEnvNode {
            proc.arguments = ["node", paths.script.path]
        } else {
            proc.arguments = [paths.script.path]
        }
        proc.currentDirectoryURL = paths.appRoot

        var env = ProcessInfo.processInfo.environment
        env["TASKWEAVER_SHELL_SERVER"] = "1"
        env["TASKWEAVER_SHELL_PORT"] = String(port)
        env["TASKWEAVER_SHELL_HOST"] = "127.0.0.1"
        if paths.isPackaged {
            env["TASKWEAVER_PACKAGED"] = "1"
            env["TASKWEAVER_RESOURCES_PATH"] = paths.resources.path
        }
        proc.environment = env
        proc.standardOutput = FileHandle.nullDevice
        proc.standardError = FileHandle.nullDevice
        try proc.run()
        process = proc
        baseURL = URL(string: "http://127.0.0.1:\(port)")!
    }

    func stop() {
        process?.terminate()
        process = nil
    }

    func waitUntilHealthy(timeoutSeconds: TimeInterval = 120) async throws {
        guard let baseURL else { throw BackendError.notStarted }
        let deadline = Date().addingTimeInterval(timeoutSeconds)
        let health = baseURL.appendingPathComponent("shell/v1/health")
        while Date() < deadline {
            if let ok = try? await fetchHealth(health), ok {
                return
            }
            try await Task.sleep(nanoseconds: 200_000_000)
        }
        throw BackendError.healthTimeout
    }

    private func fetchHealth(_ url: URL) async throws -> Bool {
        let (data, response) = try await URLSession.shared.data(from: url)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return false }
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
        return json["ok"] as? Bool == true
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
           FileManager.default.fileExists(atPath: resourceURL.appendingPathComponent("app/desktop/shell/run.mjs").path) {
            let appRoot = resourceURL.appendingPathComponent("app")
            let node = resourceURL.appendingPathComponent("host-node/bin/node")
            let script = appRoot.appendingPathComponent("desktop/shell/run.mjs")
            return LaunchPaths(node: node, script: script, appRoot: appRoot, resources: resourceURL, isPackaged: true, useEnvNode: false)
        }

        let repo = ProcessInfo.processInfo.environment["TASKWEAVER_REPO_ROOT"]
            ?? FileManager.default.currentDirectoryPath
        let appRoot = URL(fileURLWithPath: repo, isDirectory: true)
        let script = appRoot.appendingPathComponent("desktop/shell/run.mjs")
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

    enum BackendError: Error {
        case notStarted
        case healthTimeout
    }
}
