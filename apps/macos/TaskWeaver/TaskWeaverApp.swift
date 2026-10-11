import SwiftUI
import AppKit
import TWCore
import TWUI
import TWRPC

public final class AppDelegate: NSObject, NSApplicationDelegate {
    public func applicationDidFinishLaunching(_ notification: Notification) {
        ensureSingleInstance()
    }

    private func ensureSingleInstance() {
        guard let bundleId = Bundle.main.bundleIdentifier, !bundleId.isEmpty else { return }
        let currentApp = NSRunningApplication.current
        let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId)
        for app in running where app.processIdentifier != currentApp.processIdentifier {
            app.activate()
            DispatchQueue.main.async {
                NSApplication.shared.terminate(nil)
            }
            return
        }
    }
}

@main
public struct TaskWeaverApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var appModel = AppModel()

    public init() {}

    public var body: some Scene {
        WindowGroup {
            MainView()
                .environment(appModel)
                .frame(minWidth: 900, minHeight: 600)
        }
        .windowStyle(.titleBar)
        .windowToolbarStyle(.unified)
        .commands {
            SidebarCommands()
            CommandGroup(replacing: .appInfo) {
                Button("About TaskWeaver") {
                    NSApplication.shared.orderFrontStandardAboutPanel(nil)
                }
            }
        }

        Settings {
            VStack(spacing: 20) {
                Text("TaskWeaver Settings")
                    .font(.title2.bold())
                Text("配置模型与运行环境")
                    .foregroundStyle(.secondary)
            }
            .padding(40)
            .frame(width: 500, height: 350)
        }
    }
}
