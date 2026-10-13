import SwiftUI
import WebKit
import AppKit
import ShellURLPolicy

@main
struct TaskWeaverShellApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var session = ShellSession()

    var body: some Scene {
        WindowGroup {
            Group {
                if let url = session.uiURL {
                    ShellWebView(url: url, session: session)
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
                        Button("重新启动后端") {
                            Task { await session.boot() }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .frame(minWidth: 480, minHeight: 240)
                } else {
                    ProgressView("正在启动后端…")
                        .frame(minWidth: 320, minHeight: 120)
                }
            }
            .background {
                WindowAccessor { window in
                    appDelegate.attach(window, to: session)
                }
                .frame(width: 0, height: 0)
            }
            .task { await session.boot() }
            .onAppear { appDelegate.session = session }
            .preferredColorScheme(.dark)
        }
    }
}

@MainActor
final class ShellSession: ObservableObject {
    @Published var uiURL: URL?
    @Published var errorMessage: String?

    private let launcher = BackendLauncher()
    weak var window: NSWindow?
    private var nativeWindowTitle = "新对话"

    func attachWindow(_ window: NSWindow) {
        self.window = window
        window.title = nativeWindowTitle
    }

    func updateWindowTitle(_ title: String?) {
        let cleaned = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !cleaned.isEmpty, cleaned != "TaskWeaver" else { return }

        nativeWindowTitle = cleaned
        window?.title = cleaned
    }

    func boot() async {
        errorMessage = nil
        launcher.onTermination = { [weak self] status in
            guard let self else { return }
            self.uiURL = nil
            self.errorMessage = "后端进程意外退出（状态码 \(status)）。可以重新启动后端继续使用。"
        }
        do {
            try launcher.start()
            try await launcher.waitUntilHealthy()
            guard let shellApiBase = launcher.baseURL?.absoluteString,
                  let shellToken = launcher.shellToken else {
                throw BackendLauncher.BackendError.notStarted
            }
            uiURL = ShellEnvironment.uiURL(shellApiBase: shellApiBase, shellApiToken: shellToken)
        } catch {
            errorMessage = error.localizedDescription
            launcher.stop()
        }
    }

    func shutdown() {
        launcher.stop()
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    weak var session: ShellSession?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let darkAppearance = NSAppearance(named: .darkAqua)
        NSApplication.shared.appearance = darkAppearance
        NSApplication.shared.windows.forEach(applyWindowAppearance(_:))
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(windowBecameKey(_:)),
            name: NSWindow.didBecomeKeyNotification,
            object: nil
        )
    }

    @objc private func windowBecameKey(_ notification: Notification) {
        guard let window = notification.object as? NSWindow else { return }
        applyWindowAppearance(window)
    }

    private func applyWindowAppearance(_ window: NSWindow) {
        window.appearance = NSAppearance(named: .darkAqua)
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = false
        window.styleMask.remove(.fullSizeContentView)
        window.styleMask.formUnion([.titled, .closable, .miniaturizable, .resizable])

        // Keep the native macOS traffic lights visible while the React header
        // owns the conversation title and controls inside the content area.
        for buttonType in [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton] {
            guard let button = window.standardWindowButton(buttonType) else { continue }
            button.isHidden = false
            button.alphaValue = 1
            button.superview?.isHidden = false
            button.superview?.alphaValue = 1
        }
    }

    func attach(_ window: NSWindow, to session: ShellSession) {
        self.session = session
        applyWindowAppearance(window)
        session.attachWindow(window)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        session?.shutdown()
    }
}

struct ShellWebView: NSViewRepresentable {
    let url: URL
    let session: ShellSession

    func makeCoordinator() -> Coordinator {
        Coordinator(initialURL: url, session: session)
    }

    func makeNSView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.userContentController.addUserScript(WKUserScript(
            source: Self.titleSyncScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        context.coordinator.observe(webView)
        if url.isFileURL {
            let readAccessRoot = ShellEnvironment.bundledDistRoot ?? url.deletingLastPathComponent()
            webView.loadFileURL(url, allowingReadAccessTo: readAccessRoot)
        } else {
            webView.load(URLRequest(url: url))
        }
        return webView
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}

    private static let titleSyncScript = """
        (() => {
          const applyShellLayout = () => {
            if (document.getElementById('taskweaver-shell-layout')) return;
            const style = document.createElement('style');
            style.id = 'taskweaver-shell-layout';
            style.textContent = [
              '.conversation-header { height: 38px !important; flex-basis: 38px !important; display: flex !important; }',
              '.conversation-header .conversation-title > svg:not(.nav-toggle) { display: none !important; }',
            ].join(' ');
            (document.head || document.documentElement)?.appendChild(style);
          };
          const syncTitle = () => {
            applyShellLayout();
            const settingsPage = document.querySelector('.settings-screen');
            if (settingsPage) {
              const sectionTitle = settingsPage.querySelector('#settings-content h1, #settings-content h2')
                ?.textContent?.trim();
              const category = settingsPage.querySelector('.settings-nav-item[aria-current="page"] span')
                ?.textContent?.trim();
              const title = sectionTitle || category || '设置';
              if (document.title !== `设置 · ${title}`) document.title = `设置 · ${title}`;
              return;
            }
            const title = document.querySelector('.conversation-header .conversation-title strong')
              ?.textContent?.trim();
            if (title && document.title !== title) document.title = title;
          };
          let titleSyncPending = false;
          const scheduleTitleSync = () => {
            if (titleSyncPending) return;
            titleSyncPending = true;
            requestAnimationFrame(() => {
              titleSyncPending = false;
              syncTitle();
            });
          };
          const observer = new MutationObserver(scheduleTitleSync);
          const observe = () => {
            if (document.documentElement) {
              observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
                characterData: true
              });
              syncTitle();
            } else {
              requestAnimationFrame(observe);
            }
          };
          observe();
        })();
        """

    final class Coordinator: NSObject, WKNavigationDelegate {
        private let initialURL: URL
        private weak var session: ShellSession?
        private var titleObservation: NSKeyValueObservation?

        init(initialURL: URL, session: ShellSession) {
            self.initialURL = initialURL
            self.session = session
        }

        func observe(_ webView: WKWebView) {
            titleObservation = webView.observe(\.title, options: [.initial, .new]) { [weak session] view, _ in
                let title = view.title
                Task { @MainActor in session?.updateWindowTitle(title) }
            }
        }

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let destination = navigationAction.request.url else {
                decisionHandler(.cancel)
                return
            }

            if ShellURLPolicy.allowsNavigation(
                destination,
                from: webView.url ?? initialURL,
                bundledUIRoot: ShellEnvironment.bundledDistRoot
            ) {
                decisionHandler(.allow)
                return
            }

            if navigationAction.navigationType == .linkActivated,
               ShellURLPolicy.canOpenExternally(destination) {
                NSWorkspace.shared.open(destination)
            }
            decisionHandler(.cancel)
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            NSLog("TaskWeaver UI failed to load: %@", error.localizedDescription)
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            NSLog("TaskWeaver UI navigation failed: %@", error.localizedDescription)
        }
    }
}

@MainActor
private struct WindowAccessor: NSViewRepresentable {
    let onResolve: (NSWindow) -> Void

    func makeNSView(context: Context) -> WindowResolvingView {
        let view = WindowResolvingView()
        view.onWindowChange = onResolve
        return view
    }

    func updateNSView(_ nsView: WindowResolvingView, context: Context) {
        nsView.onWindowChange = onResolve
        if let window = nsView.window {
            onResolve(window)
        }
    }
}

@MainActor
private final class WindowResolvingView: NSView {
    var onWindowChange: ((NSWindow) -> Void)?

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if let window {
            onWindowChange?(window)
        }
    }
}

enum ShellEnvironment {
    static func uiURL(shellApiBase: String, shellApiToken: String) -> URL {
        if let raw = ProcessInfo.processInfo.environment["TASKWEAVER_UI_URL"],
           let url = URL(string: raw),
           ShellURLPolicy.isTrustedUIURL(url, bundledUIRoot: bundledDistRoot) {
            return bridgeURL(url, shellApiBase: shellApiBase, shellApiToken: shellApiToken)
        }
        if let root = uiRoot,
           FileManager.default.fileExists(atPath: root.appendingPathComponent("index.html").path),
           var components = URLComponents(string: shellApiBase) {
            components.path = "/"
            components.queryItems = [URLQueryItem(name: "shellApi", value: shellApiBase)]
            if let url = components.url {
                return bridgeURL(url, shellApiBase: shellApiBase, shellApiToken: shellApiToken)
            }
        }
        var components = URLComponents(string: "http://127.0.0.1:5173/")!
        components.queryItems = [URLQueryItem(name: "shellApi", value: shellApiBase)]
        return bridgeURL(components.url!, shellApiBase: shellApiBase, shellApiToken: shellApiToken)
    }

    private static func bridgeURL(_ url: URL, shellApiBase: String, shellApiToken: String) -> URL {
        guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
        var queryItems = (components.queryItems ?? []).filter { $0.name != "shellApi" }
        queryItems.append(URLQueryItem(name: "shellApi", value: shellApiBase))
        components.queryItems = queryItems

        var fragmentComponents = URLComponents()
        fragmentComponents.percentEncodedQuery = components.percentEncodedFragment
        var fragmentItems = (fragmentComponents.queryItems ?? []).filter { $0.name != "shellToken" }
        fragmentItems.append(URLQueryItem(name: "shellToken", value: shellApiToken))
        fragmentComponents.queryItems = fragmentItems
        components.percentEncodedFragment = fragmentComponents.percentEncodedQuery
        return components.url ?? url
    }

    private static var uiRoot: URL? {
        if let bundledDistRoot { return bundledDistRoot }
        let repositoryRoot = ProcessInfo.processInfo.environment["TASKWEAVER_REPO_ROOT"]
            ?? FileManager.default.currentDirectoryPath
        return URL(fileURLWithPath: repositoryRoot, isDirectory: true)
            .appendingPathComponent("dist", isDirectory: true)
    }

    static var bundledDistRoot: URL? {
        Bundle.main.resourceURL?.appendingPathComponent("app/dist", isDirectory: true)
    }
}
