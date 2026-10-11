import Foundation
import TWContract

public enum BackendState: Sendable, Equatable {
    case stopped
    case starting
    case ready(InitializeResult)
    case restarting
    case failed(String)
}

public final class BackendSupervisor: @unchecked Sendable {
    public static let shared = BackendSupervisor()

    private var process: Process?
    private var stdinPipe: Pipe?
    private var stdoutPipe: Pipe?
    private var stderrPipe: Pipe?
    private var logFileHandle: FileHandle?
    private let transport = StdioTransport()
    private var restartCount = 0
    private let maxRestarts = 1

    public var state: BackendState = .stopped
    public var onStateChange: (@Sendable (BackendState) -> Void)?

    public init() {}

    public var client: TaskWeaverClient {
        TaskWeaverClient(transport: transport, eventTransport: transport)
    }

    /// Locate User Data directory with zero-copy migration precedence
    public static func resolveUserDataDirectory() -> URL {
        if let overridePath = ProcessInfo.processInfo.environment["TW_USER_DATA_OVERRIDE"], !overridePath.isEmpty {
            return URL(fileURLWithPath: overridePath)
        }

        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let legacyDesktop = appSupport.appendingPathComponent("taskweaver-desktop")
        let canonicalApp = appSupport.appendingPathComponent("TaskWeaver")

        // 1. If taskweaver-threads.json exists in legacy desktop dir, reuse it directly
        let legacyThreads = legacyDesktop.appendingPathComponent("taskweaver-threads.json")
        if FileManager.default.fileExists(atPath: legacyThreads.path) {
            return legacyDesktop
        }

        // 2. If canonical exists, use it
        let canonicalThreads = canonicalApp.appendingPathComponent("taskweaver-threads.json")
        if FileManager.default.fileExists(atPath: canonicalThreads.path) {
            return canonicalApp
        }

        // 3. Fallback: create legacy desktop dir for complete backward compatibility
        try? FileManager.default.createDirectory(at: legacyDesktop, withIntermediateDirectories: true)
        return legacyDesktop
    }

    public func start() async throws {
        guard state == .stopped || state == .restarting else { return }
        updateState(.starting)

        let userDataURL = Self.resolveUserDataDirectory()
        let t0 = Int(Date().timeIntervalSince1970 * 1000)

        // Setup log directory: ~/Library/Logs/TaskWeaver/backend.log
        let logsURL = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first!
            .appendingPathComponent("Logs")
            .appendingPathComponent("TaskWeaver")
        try? FileManager.default.createDirectory(at: logsURL, withIntermediateDirectories: true)
        let logFileURL = logsURL.appendingPathComponent("backend.log")
        if !FileManager.default.fileExists(atPath: logFileURL.path) {
            FileManager.default.createFile(atPath: logFileURL.path, contents: nil)
        }
        self.logFileHandle = try? FileHandle(forWritingTo: logFileURL)
        self.logFileHandle?.seekToEndOfFile()

        let proc = Process()
        let stdin = Pipe()
        let stdout = Pipe()
        let stderr = Pipe()

        proc.standardInput = stdin
        proc.standardOutput = stdout
        proc.standardError = stderr

        stderr.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            self?.logFileHandle?.write(data)
        }

        // Resolve executable and app server paths
        let launch: LaunchConfiguration
        do {
            launch = try resolveLaunchConfiguration()
        } catch {
            updateState(.failed("Failed to resolve backend bundle: \(error.localizedDescription)"))
            throw error
        }
        proc.executableURL = launch.executableURL
        proc.arguments = launch.arguments
        proc.currentDirectoryURL = launch.appRootURL

        var environment = ProcessInfo.processInfo.environment
        environment["TASKWEAVER_USER_DATA"] = userDataURL.path
        environment["TASKWEAVER_APP_ROOT"] = launch.appRootURL.path
        environment["TASKWEAVER_STARTUP_T0_EPOCH_MS"] = String(t0)
        environment["ELECTRON_RUN_AS_NODE"] = nil // Completely purge Electron flag
        if let resourcesURL = launch.resourcesURL {
            environment["TASKWEAVER_PACKAGED"] = "1"
            environment["TASKWEAVER_RESOURCES_PATH"] = resourcesURL.path
            environment["TASKWEAVER_HOST_NODE"] = launch.executableURL.path
        } else {
            environment["TASKWEAVER_PACKAGED"] = "0"
            environment["TASKWEAVER_RESOURCES_PATH"] = nil
        }
        proc.environment = environment

        proc.terminationHandler = { [weak self] p in
            Task { [weak self] in
                await self?.handleProcessTermination(exitCode: p.terminationStatus)
            }
        }

        do {
            try proc.run()
        } catch {
            updateState(.failed("Failed to launch backend: \(error.localizedDescription)"))
            throw error
        }

        self.process = proc
        self.stdinPipe = stdin
        self.stdoutPipe = stdout
        self.stderrPipe = stderr

        await transport.attach(stdin: stdin, stdout: stdout)

        // Perform initialize handshake
        do {
            let res = try await client.transport.invoke("initialize", args: [])
            if case .object(let dict) = res,
               case .int(let proto)? = dict["protocolVersion"],
               case .string(let hash)? = dict["contractHash"],
               case .string(let ver)? = dict["backendVersion"] {
                let initResult = InitializeResult(protocolVersion: proto, contractHash: hash, backendVersion: ver)
                self.restartCount = 0
                updateState(.ready(initResult))
            } else {
                updateState(.ready(InitializeResult(protocolVersion: 1, contractHash: "", backendVersion: "1.2.1")))
            }
        } catch {
            updateState(.failed("Handshake failed: \(error.localizedDescription)"))
            stop()
            throw error
        }
    }

    private struct LaunchConfiguration {
        let executableURL: URL
        let arguments: [String]
        let appRootURL: URL
        let resourcesURL: URL?
    }

    private func resolveLaunchConfiguration() throws -> LaunchConfiguration {
        let environment = ProcessInfo.processInfo.environment
        let isAppBundle = Bundle.main.bundleURL.pathExtension == "app"
        if !isAppBundle, let devRepo = environment["TW_DEV_REPO"], !devRepo.isEmpty {
            return makeDevelopmentLaunchConfiguration(repoPath: devRepo)
        }

        if let resourceURL = Bundle.main.resourceURL {
            let backendRoot = resourceURL.appendingPathComponent("backend", isDirectory: true)
            let appRoot = backendRoot.appendingPathComponent("app", isDirectory: true)
            let bundledNode = backendRoot.appendingPathComponent("node")
            let bundledServer = appRoot.appendingPathComponent("backend/app-server.mjs")
            let runtimeRoot = backendRoot.appendingPathComponent("runtime", isDirectory: true)
            let runtimeHasEntry = ["lib/entry.js", "lib/bin.js"].contains { entry in
                FileManager.default.fileExists(atPath: runtimeRoot.appendingPathComponent(entry).path)
            }
            let contractSchema = appRoot.appendingPathComponent("contract/contract.schema.json")
            if FileManager.default.isExecutableFile(atPath: bundledNode.path),
               FileManager.default.fileExists(atPath: bundledServer.path),
               runtimeHasEntry,
               FileManager.default.fileExists(atPath: contractSchema.path) {
                return LaunchConfiguration(
                    executableURL: bundledNode,
                    arguments: [bundledServer.path, "--platform=rpc"],
                    appRootURL: appRoot,
                    resourcesURL: resourceURL
                )
            }
        }

        if isAppBundle {
            throw NSError(
                domain: "TaskWeaverBackend",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "应用包缺少 Resources/backend 的 Node、app-server、契约或 Z runtime。请重新组装应用。"]
            )
        }

        // Dev mode fallback
        return makeDevelopmentLaunchConfiguration(repoPath: FileManager.default.currentDirectoryPath)
    }

    private func makeDevelopmentLaunchConfiguration(repoPath: String) -> LaunchConfiguration {
        let repoRoot = URL(fileURLWithPath: repoPath)

        let appServer = repoRoot.appendingPathComponent("backend/app-server.mjs")
        let nodeURL = URL(fileURLWithPath: "/usr/local/bin/node")
        let defaultNode = FileManager.default.fileExists(atPath: nodeURL.path) ? nodeURL : URL(fileURLWithPath: "/usr/bin/env")
        let args = defaultNode.lastPathComponent == "env" ? ["node", appServer.path, "--platform=rpc"] : [appServer.path, "--platform=rpc"]

        return LaunchConfiguration(
            executableURL: defaultNode,
            arguments: args,
            appRootURL: repoRoot,
            resourcesURL: nil
        )
    }

    private func handleProcessTermination(exitCode: Int32) async {
        await transport.detach()
        if exitCode != 0 && restartCount < maxRestarts {
            restartCount += 1
            updateState(.restarting)
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            try? await start()
        } else if exitCode != 0 {
            updateState(.failed("Backend exited unexpectedly with code \(exitCode). Check ~/Library/Logs/TaskWeaver/backend.log"))
        } else {
            updateState(.stopped)
        }
    }

    public func stop() {
        process?.terminationHandler = nil
        process?.terminate()
        process = nil
        Task {
            await transport.detach()
        }
        updateState(.stopped)
    }

    private func updateState(_ newState: BackendState) {
        self.state = newState
        onStateChange?(newState)
    }
}
