import AppKit
import Foundation
import TWContract
import TWPlatform

public enum ReverseRequestHandler {
    public static func handle(
        method: String,
        params: JSONValue?
    ) async throws -> JSONValue {
        switch method {
        // --- Secrets (Keychain) ---
        case "$platform/secrets.get":
            guard case .object(let dict) = params, case .string(let key)? = dict["key"] else {
                throw NSError(domain: "TWRPC", code: -32602, userInfo: [NSLocalizedDescriptionKey: "Invalid params for secrets.get"])
            }
            if let secret = KeychainHelper.shared.get(for: key) {
                return .string(secret)
            }
            return .null

        case "$platform/secrets.set":
            guard case .object(let dict) = params,
                  case .string(let key)? = dict["key"],
                  case .string(let val)? = dict["value"] else {
                throw NSError(domain: "TWRPC", code: -32602, userInfo: [NSLocalizedDescriptionKey: "Invalid params for secrets.set"])
            }
            try KeychainHelper.shared.set(val, for: key)
            return .null

        case "$platform/secrets.delete":
            guard case .object(let dict) = params, case .string(let key)? = dict["key"] else {
                throw NSError(domain: "TWRPC", code: -32602, userInfo: [NSLocalizedDescriptionKey: "Invalid params for secrets.delete"])
            }
            try KeychainHelper.shared.delete(for: key)
            return .null

        case "$platform/secrets.list":
            let prefix: String
            if case .object(let dict) = params, case .string(let p)? = dict["prefix"] {
                prefix = p
            } else {
                prefix = ""
            }
            let list = KeychainHelper.shared.list(prefix: prefix)
            return .array(list.map { .string($0) })

        // --- UI Dialogs ---
        case "$platform/ui.pickDirectory":
            var title: String?
            var defaultPath: String?
            if case .object(let dict) = params {
                if case .string(let t)? = dict["title"] { title = t }
                if case .string(let p)? = dict["defaultPath"] { defaultPath = p }
            }
            let picked = await PlatformPanels.pickDirectory(title: title, defaultPath: defaultPath)
            return picked != nil ? .string(picked!) : .null

        case "$platform/ui.pickFiles":
            var title: String?
            var defaultPath: String?
            var allowMultiple = false
            if case .object(let dict) = params {
                if case .string(let t)? = dict["title"] { title = t }
                if case .string(let p)? = dict["defaultPath"] { defaultPath = p }
                if case .bool(let m)? = dict["allowMultiple"] { allowMultiple = m }
            }
            let picked = await PlatformPanels.pickFiles(title: title, defaultPath: defaultPath, allowMultiple: allowMultiple)
            return .array(picked.map { .string($0) })

        case "$platform/ui.showSaveDialog":
            var title: String?
            var defaultPath: String?
            if case .object(let dict) = params {
                if case .string(let t)? = dict["title"] { title = t }
                if case .string(let p)? = dict["defaultPath"] { defaultPath = p }
            }
            let path = await PlatformPanels.showSaveDialog(title: title, defaultPath: defaultPath)
            return path != nil ? .string(path!) : .null

        case "$platform/ui.showMessageBox":
            var message = ""
            var title: String?
            var buttons = ["好"]
            if case .object(let dict) = params {
                if case .string(let m)? = dict["message"] { message = m }
                if case .string(let t)? = dict["title"] { title = t }
                if case .array(let arr)? = dict["buttons"] {
                    buttons = arr.compactMap { if case .string(let s) = $0 { return s } else { return nil } }
                }
            }
            let res = await PlatformPanels.showMessageBox(title: title, message: message, buttons: buttons)
            return .object(["response": .int(res)])

        // --- Shell ---
        case "$platform/shell.openExternal":
            if case .object(let dict) = params, case .string(let urlStr)? = dict["url"], let url = URL(string: urlStr) {
                await MainActor.run {
                    _ = NSWorkspace.shared.open(url)
                }
            }
            return .null

        case "$platform/shell.openPath":
            if case .object(let dict) = params, case .string(let p)? = dict["filePath"] {
                await MainActor.run {
                    _ = NSWorkspace.shared.selectFile(p, inFileViewerRootedAtPath: "")
                }
            }
            return .string("")

        default:
            throw NSError(domain: "TWRPC", code: -32601, userInfo: [NSLocalizedDescriptionKey: "Unsupported platform method: \(method)"])
        }
    }
}
