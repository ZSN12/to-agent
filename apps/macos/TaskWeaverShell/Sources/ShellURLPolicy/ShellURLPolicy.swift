import Foundation

public enum ShellURLPolicy {
    public static func isTrustedUIURL(_ url: URL, bundledUIRoot: URL?) -> Bool {
        if url.isFileURL { return isInsideBundledUI(url, root: bundledUIRoot) }
        guard let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme),
              url.user == nil, url.password == nil,
              let host = url.host?.lowercased() else { return false }
        return ["127.0.0.1", "localhost", "::1", "[::1]"].contains(host)
    }

    public static func allowsNavigation(_ url: URL, from currentURL: URL?, bundledUIRoot: URL?) -> Bool {
        guard isTrustedUIURL(url, bundledUIRoot: bundledUIRoot) else { return false }
        guard let currentURL else { return true }
        if url.isFileURL, currentURL.isFileURL {
            return isInsideBundledUI(url, root: bundledUIRoot)
        }
        return sameOrigin(url, currentURL)
    }

    public static func canOpenExternally(_ url: URL) -> Bool {
        guard url.user == nil, url.password == nil else { return false }
        return ["http", "https", "mailto"].contains(url.scheme?.lowercased() ?? "")
    }

    private static func isInsideBundledUI(_ url: URL, root: URL?) -> Bool {
        guard url.isFileURL, let root else { return false }
        let rootPath = root.resolvingSymlinksInPath().standardizedFileURL.path
        let candidatePath = url.resolvingSymlinksInPath().standardizedFileURL.path
        return candidatePath == rootPath || candidatePath.hasPrefix(rootPath + "/")
    }

    private static func sameOrigin(_ lhs: URL, _ rhs: URL) -> Bool {
        guard let left = URLComponents(url: lhs, resolvingAgainstBaseURL: false),
              let right = URLComponents(url: rhs, resolvingAgainstBaseURL: false),
              left.scheme?.lowercased() == right.scheme?.lowercased(),
              left.host?.lowercased() == right.host?.lowercased() else { return false }
        let defaultPort = left.scheme?.lowercased() == "https" ? 443 : 80
        return (left.port ?? defaultPort) == (right.port ?? defaultPort)
    }
}
