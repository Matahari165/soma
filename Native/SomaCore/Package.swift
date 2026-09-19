// swift-tools-version: 6.2
import PackageDescription

let package = Package(
    name: "SomaCore",
    platforms: [.iOS(.v26), .macOS(.v26)],
    products: [.library(name: "SomaCore", targets: ["SomaCore"])],
    targets: [
        .target(name: "SomaCore"),
        .testTarget(name: "SomaCoreTests", dependencies: ["SomaCore"]),
    ]
)
