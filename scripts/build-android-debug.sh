#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
android_dir="$repo_root/apps/mobile/android"

default_java_home="${HOME}/.local/jdks/temurin-17"
default_sdk_root="${HOME}/Android/Sdk"

export JAVA_HOME="${JAVA_HOME:-$default_java_home}"
export ANDROID_HOME="${ANDROID_HOME:-$default_sdk_root}"
export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export PATH="${JAVA_HOME}/bin:${ANDROID_SDK_ROOT}/platform-tools:${PATH}"

if [[ ! -x "${JAVA_HOME}/bin/java" ]]; then
  printf 'JAVA_HOME is not usable: %s\n' "$JAVA_HOME" >&2
  exit 1
fi

if [[ ! -d "${ANDROID_SDK_ROOT}" ]]; then
  printf 'ANDROID_SDK_ROOT is not usable: %s\n' "$ANDROID_SDK_ROOT" >&2
  exit 1
fi

sdk_dir_escaped="${ANDROID_SDK_ROOT//\\/\\\\}"
sdk_dir_escaped="${sdk_dir_escaped//:/\\:}"
cat > "${android_dir}/local.properties" <<EOF
sdk.dir=${sdk_dir_escaped}
EOF

cd "${android_dir}"
./gradlew assembleDebug
