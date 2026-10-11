import Foundation
import XCTest
@testable import ShellURLPolicy

final class ShellURLPolicyTests: XCTestCase {
    func testUIEntryOnlyAcceptsLoopbackOrBundledFiles() throws {
        let root = URL(fileURLWithPath: "/Applications/TaskWeaver.app/Contents/Resources/app/dist", isDirectory: true)
        XCTAssertTrue(ShellURLPolicy.isTrustedUIURL(URL(string: "http://127.0.0.1:5173/")!, bundledUIRoot: root))
        XCTAssertTrue(ShellURLPolicy.isTrustedUIURL(URL(string: "https://localhost:5173/")!, bundledUIRoot: root))
        XCTAssertTrue(ShellURLPolicy.allowsNavigation(URL(string: "http://127.0.0.1:5173/")!, from: nil, bundledUIRoot: root))
        XCTAssertTrue(ShellURLPolicy.isTrustedUIURL(root.appendingPathComponent("index.html"), bundledUIRoot: root))
        XCTAssertFalse(ShellURLPolicy.isTrustedUIURL(URL(string: "https://example.com/")!, bundledUIRoot: root))
        XCTAssertFalse(ShellURLPolicy.isTrustedUIURL(URL(string: "http://user:pass@127.0.0.1:5173/")!, bundledUIRoot: root))
        XCTAssertFalse(ShellURLPolicy.isTrustedUIURL(URL(fileURLWithPath: "/tmp/index.html"), bundledUIRoot: root))
    }

    func testMainFrameNavigationStaysOnCurrentOrigin() {
        let root = URL(fileURLWithPath: "/Applications/TaskWeaver.app/Contents/Resources/app/dist", isDirectory: true)
        let current = URL(string: "http://127.0.0.1:5173/?shellApi=http://127.0.0.1:43120")!
        XCTAssertTrue(ShellURLPolicy.allowsNavigation(URL(string: "http://127.0.0.1:5173/settings")!, from: current, bundledUIRoot: root))
        XCTAssertFalse(ShellURLPolicy.allowsNavigation(URL(string: "http://127.0.0.1:43120/")!, from: current, bundledUIRoot: root))
        XCTAssertFalse(ShellURLPolicy.allowsNavigation(URL(string: "https://127.0.0.1:5173/")!, from: current, bundledUIRoot: root))
    }

    func testFileNavigationCannotEscapeBundledDirectoryThroughSymlink() throws {
        let temporaryRoot = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let bundledRoot = temporaryRoot.appendingPathComponent("dist", isDirectory: true)
        let outsideRoot = temporaryRoot.appendingPathComponent("outside", isDirectory: true)
        try FileManager.default.createDirectory(at: bundledRoot, withIntermediateDirectories: true)
        try FileManager.default.createDirectory(at: outsideRoot, withIntermediateDirectories: true)
        let escapedFile = outsideRoot.appendingPathComponent("secret.html")
        try Data("secret".utf8).write(to: escapedFile)
        try FileManager.default.createSymbolicLink(at: bundledRoot.appendingPathComponent("escape.html"), withDestinationURL: escapedFile)
        defer { try? FileManager.default.removeItem(at: temporaryRoot) }

        XCTAssertFalse(ShellURLPolicy.allowsNavigation(bundledRoot.appendingPathComponent("escape.html"), from: bundledRoot.appendingPathComponent("index.html"), bundledUIRoot: bundledRoot))
    }

    func testOnlySafeWebLinksCanOpenExternally() {
        XCTAssertTrue(ShellURLPolicy.canOpenExternally(URL(string: "https://example.com/help")!))
        XCTAssertTrue(ShellURLPolicy.canOpenExternally(URL(string: "mailto:support@example.com")!))
        XCTAssertFalse(ShellURLPolicy.canOpenExternally(URL(string: "javascript:alert(1)")!))
        XCTAssertFalse(ShellURLPolicy.canOpenExternally(URL(string: "https://user:pass@example.com/")!))
    }
}
