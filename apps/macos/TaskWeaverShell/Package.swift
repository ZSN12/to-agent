// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TaskWeaverShell",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "TaskWeaverShell", targets: ["TaskWeaverShell"]),
        .library(name: "ShellURLPolicy", targets: ["ShellURLPolicy"]),
    ],
    targets: [
        .target(name: "ShellURLPolicy"),
        .executableTarget(
            name: "TaskWeaverShell",
            dependencies: ["ShellURLPolicy"],
            path: "Sources/TaskWeaverShell"
        ),
        .testTarget(name: "ShellURLPolicyTests", dependencies: ["ShellURLPolicy"]),
    ]
)
