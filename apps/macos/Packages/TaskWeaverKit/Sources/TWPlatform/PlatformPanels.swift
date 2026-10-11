import AppKit
import Foundation

@MainActor
public enum PlatformPanels {
    public static func pickDirectory(title: String? = nil, defaultPath: String? = nil) async -> String? {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = false
        if let title = title { panel.title = title }
        if let defaultPath = defaultPath { panel.directoryURL = URL(fileURLWithPath: defaultPath) }

        let response = panel.runModal()
        if response == .OK, let url = panel.url {
            return url.path
        }
        return nil
    }

    public static func pickFiles(title: String? = nil, defaultPath: String? = nil, allowMultiple: Bool = false) async -> [String] {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = allowMultiple
        if let title = title { panel.title = title }
        if let defaultPath = defaultPath { panel.directoryURL = URL(fileURLWithPath: defaultPath) }

        let response = panel.runModal()
        if response == .OK {
            return panel.urls.map { $0.path }
        }
        return []
    }

    public static func showSaveDialog(title: String? = nil, defaultPath: String? = nil) async -> String? {
        let panel = NSSavePanel()
        if let title = title { panel.title = title }
        if let defaultPath = defaultPath { panel.directoryURL = URL(fileURLWithPath: defaultPath) }

        let response = panel.runModal()
        if response == .OK, let url = panel.url {
            return url.path
        }
        return nil
    }

    public static func showMessageBox(
        title: String? = nil,
        message: String,
        buttons: [String] = ["好"]
    ) async -> Int {
        let alert = NSAlert()
        alert.messageText = title ?? "提示"
        alert.informativeText = message
        for btn in buttons {
            alert.addButton(withTitle: btn)
        }
        let modalResponse = alert.runModal()
        // NSApplication.ModalResponse.alertFirstButtonReturn is 1000
        return modalResponse.rawValue - 1000
    }
}
