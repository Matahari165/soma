#!/bin/zsh
set -euo pipefail

project_dir="${0:A:h:h}"
app_path="/private/tmp/soma-native-interface-derived-mac/Build/Products/Debug/Soma.app"

echo "Préparation de Soma Démo…"
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  SWIFTPM_MODULECACHE_OVERRIDE=/private/tmp/soma-native-module-cache \
  CLANG_MODULE_CACHE_PATH=/private/tmp/soma-native-clang-cache \
  /Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild \
    -quiet -project "$project_dir/Native/SomaNative.xcodeproj" \
    -scheme Soma-macOS -configuration Debug -destination 'generic/platform=macOS' \
    -derivedDataPath /private/tmp/soma-native-interface-derived-mac \
    -clonedSourcePackagesDirPath /private/tmp/soma-native-interface-packages-mac \
    CODE_SIGNING_ALLOWED=NO build

open -n "$app_path" --args --preview-data
