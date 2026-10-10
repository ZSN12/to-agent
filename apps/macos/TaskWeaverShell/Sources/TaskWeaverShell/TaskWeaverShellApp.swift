import SwiftUI
import WebKit

@main
struct TaskWeaverShellApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var session = ShellSession()

    var body: some Scene {
        WindowGroup {
            Group {
                if let url = session.uiURL {
                    ShellWebView(url: url)
                        .frame(minWidth: 960, minHeight: 640)
                } else if let message = session.errorMessage {
                    VStack(spacing: 12) {
                        Text("TaskWeaver 无法启动")
                            .font(.headline)
                        Text(message)
                            .font(.body)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal)
                    }
                    .frame(minWidth: 480, minHeight: 240)
                } else {
                    ProgressView("正在启动后端…")
                        .frame(minWidth: 320, minHeight: 120)
                }
            }
            .task { await session.boot() }
        }
    }
}

@MainActor
final class ShellSession: ObservableObject {
    @Published var uiURL: URL?
    @Published var errorMessage: String?

    private let launcher = BackendLauncher()

    func boot() async {
        do {
            try launcher.start()
            try await launcher.waitUntilHealthy()
            uiURL = ShellEnvironment.uiURL(shellApiBase: launcher.baseURL!.absoluteString)
        } catch {
            errorMessage = error.localizedDescription
            launcher.stop()
        }
    }

    deinit {
        launcher.stop()
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}

struct ShellWebView: NSViewRepresentable {
    let url: URL

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.load(URLRequest(url: url))
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}
}

enum ShellEnvironment {
    static func uiURL(shellApiBase: String) -> URL {
        if let raw = ProcessInfo.processInfo.environment["TASKWEAVER_UI_URL"],
           let url = URL(string: raw) {
            return url
        }
        if let dist = bundledDistIndex(shellApiBase: shellApiBase) {
            return dist
        }
        var components = URLComponents(string: "http://127.0.0.1:5173/")!
        components.queryItems = [URLQueryItem(name: "shellApi", value: shellApiBase)]
        return components.url!
    }

    private static func bundledDistIndex(shellApiBase: String) -> URL? {
        guard let resourceURL = Bundle.main.resourceURL else { return nil }
        let index = resourceURL.appendingPathComponent("app/dist/index.html")
        guard FileManager.default.fileExists(atPath: index.path) else { return nil }
        var components = URLComponents(url: index, resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "shellApi", value: shellApiBase)]
        return components.url
    }
}
