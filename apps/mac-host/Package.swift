// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "LanDualControlMacHost",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "lan-dual-mac-host", targets: ["MacHost"])
    ],
    targets: [
        .executableTarget(
            name: "MacHost",
            path: "Sources/MacHost"
        )
    ]
)

