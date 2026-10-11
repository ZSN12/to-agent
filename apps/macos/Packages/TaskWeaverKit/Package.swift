// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "TaskWeaverKit",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "TaskWeaver", targets: ["TaskWeaver"]),
        .library(name: "TWContract", targets: ["TWContract"]),
        .library(name: "TWPlatform", targets: ["TWPlatform"]),
        .library(name: "TWRPC", targets: ["TWRPC"]),
        .library(name: "TWCore", targets: ["TWCore"]),
        .library(name: "TWMarkdown", targets: ["TWMarkdown"]),
        .library(name: "TWUI", targets: ["TWUI"]),
    ],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "TaskWeaver",
            dependencies: ["TWUI", "TWCore", "TWPlatform", "TWRPC"]
        ),
        .target(
            name: "TWContract",
            dependencies: []
        ),
        .target(
            name: "TWPlatform",
            dependencies: []
        ),
        .target(
            name: "TWRPC",
            dependencies: ["TWContract", "TWPlatform"]
        ),
        .target(
            name: "TWCore",
            dependencies: ["TWContract", "TWRPC", "TWPlatform"]
        ),
        .target(
            name: "TWMarkdown",
            dependencies: []
        ),
        .target(
            name: "TWUI",
            dependencies: ["TWCore", "TWMarkdown"]
        ),
        .executableTarget(
            name: "TaskWeaverTests",
            dependencies: ["TWCore", "TWRPC", "TWPlatform", "TWMarkdown", "TWContract", "TWUI"]
        ),
    ]
)
