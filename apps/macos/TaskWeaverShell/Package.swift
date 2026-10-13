// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TaskWeaverShell",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "TaskWeaverShell", targets: ["TaskWeaverShell"]),
        .executable(name: "TaskWeaverKeychain", targets: ["TaskWeaverKeychain"]),
        .library(name: "ShellURLPolicy", targets: ["ShellURLPolicy"]),
    ],
    targets: [
        .target(name: "ShellURLPolicy"),
        .executableTarget(
            name: "TaskWeaverShell",
            dependencies: ["ShellURLPolicy"],
            path: "Sources/TaskWeaverShell"
        ),
        .executableTarget(
            name: "TaskWeaverKeychain",
            path: "Sources/TaskWeaverKeychain"
        ),
        .testTarget(name: "ShellURLPolicyTests", dependencies: ["ShellURLPolicy"]),
    ]
)
