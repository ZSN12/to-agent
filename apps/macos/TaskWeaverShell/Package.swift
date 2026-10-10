// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TaskWeaverShell",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "TaskWeaverShell", targets: ["TaskWeaverShell"]),
    ],
    targets: [
        .executableTarget(
            name: "TaskWeaverShell",
            path: "Sources/TaskWeaverShell"
        ),
    ]
)
