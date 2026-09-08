#!/bin/bash

set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Mineradio native helpers can only be built on macOS" >&2
  exit 69
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
repo_dir="$(cd "${script_dir}/.." && pwd -P)"
helper_name="safe-storage-recovery"
source_file="${script_dir}/native/safe-storage-recovery.cc"
output_file="${1:-${script_dir}/native/safe-storage-recovery.node}"
if [[ "${1:-}" == "--handoff" ]]; then
  helper_name="safe-storage-handoff"
  source_file="${repo_dir}/desktop/native/safe-storage-handoff.cc"
  output_file="${2:-${repo_dir}/desktop/native/safe-storage-handoff.node}"
fi

find_node_headers() {
  local candidate=""
  if [[ -n "${NODE_HEADERS_DIR:-}" ]]; then
    candidate="${NODE_HEADERS_DIR}"
    if [[ -f "${candidate}/node_api.h" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  fi

  local node_binary=""
  node_binary="$(command -v node || true)"
  if [[ -n "${node_binary}" ]]; then
    candidate="$(cd "$(dirname "${node_binary}")/../include/node" 2>/dev/null && pwd -P || true)"
    if [[ -n "${candidate}" && -f "${candidate}/node_api.h" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  fi

  local cached_header=""
  cached_header="$(find "${HOME}/Library/Caches/node-gyp" -path '*/include/node/node_api.h' -type f 2>/dev/null \
    | /usr/bin/sort -V | /usr/bin/tail -n 1 || true)"
  if [[ -n "${cached_header}" ]]; then
    dirname "${cached_header}"
    return 0
  fi
  return 1
}

node_headers="$(find_node_headers || true)"
if [[ -z "${node_headers}" ]]; then
  echo "node_api.h was not found; set NODE_HEADERS_DIR to a Node include directory" >&2
  exit 69
fi
if [[ ! -f "${source_file}" ]]; then
  echo "missing native helper source: ${source_file}" >&2
  exit 66
fi

output_dir="$(dirname "${output_file}")"
mkdir -p "${output_dir}"
output_dir="$(cd "${output_dir}" && pwd -P)"
output_file="${output_dir}/$(basename "${output_file}")"

build_lock="${TMPDIR:-/tmp}/mineradio-native-helper-build-$(/usr/bin/id -u).lock"
lock_owned=""
for _ in {1..300}; do
  if /usr/bin/shlock -p "$$" -f "${build_lock}"; then
    lock_owned="yes"
    break
  fi
  /bin/sleep 0.05
done
if [[ -z "${lock_owned}" ]]; then
  echo "timed out waiting for the native helper build lock" >&2
  exit 75
fi

build_dir="$(mktemp -d "${TMPDIR:-/tmp}/mineradio-${helper_name}.XXXXXX")"
install_tmp=""
cleanup() {
  rm -rf "${build_dir}"
  if [[ -n "${install_tmp}" && -e "${install_tmp}" ]]; then rm -f "${install_tmp}"; fi
  if [[ -n "${lock_owned}" && -f "${build_lock}" && "$(<"${build_lock}")" == "$$" ]]; then
    rm -f "${build_lock}"
  fi
}
trap cleanup EXIT INT TERM HUP

common_flags=(
  -std=c++17
  -bundle
  -fno-exceptions
  -fno-rtti
  -fvisibility=hidden
  -DNAPI_VERSION=8
  -mmacosx-version-min=12.0
  -Wall
  -Wextra
  -Werror=return-type
  -Werror=implicit-function-declaration
  -Wno-deprecated-declarations
  -I "${node_headers}"
  -framework Security
  -framework CoreFoundation
  -undefined dynamic_lookup
)

for architecture in arm64 x86_64; do
  xcrun clang++ -arch "${architecture}" "${common_flags[@]}" \
    "${source_file}" -o "${build_dir}/${helper_name}-${architecture}.node"
done

install_tmp="$(mktemp "${output_file}.tmp.XXXXXX")"
rm -f "${install_tmp}"
xcrun lipo -create \
  "${build_dir}/${helper_name}-arm64.node" \
  "${build_dir}/${helper_name}-x86_64.node" \
  -output "${install_tmp}"
chmod 0500 "${install_tmp}"
/usr/bin/codesign --force --sign - --timestamp=none \
  --identifier "com.mineradio.${helper_name}" "${install_tmp}"
mv -f "${install_tmp}" "${output_file}"
install_tmp=""

/usr/bin/file "${output_file}"
/usr/bin/shasum -a 256 "${output_file}"
