#!/usr/bin/env bash
set -euo pipefail
mode="${1:-optimized}"
case "$mode" in optimized|baseline) ;; *) echo 'Use optimized or baseline' >&2; exit 1;; esac
source_dir=/work/source/NewShoes-main
if [[ ! -d "$source_dir" ]]; then
    python3 /tools/prepare-source.py /workspace/source.zip /tools/replay-frame-flush.patch /work/source
fi
cd "$source_dir/WebAssembly"
export BUILD_TYPE=Release
export CNC_BUILD_DIR=local-build/wasm-threaded-release
export CNC_DIST_DIR="local-build/dist-${mode}"
export CNC_PORT_THREADS=1
export CNC_BUILD_TARGETS=cnc-port
export CMAKE_CXX_FLAGS="-O2 -ffile-prefix-map=${source_dir}=."
if [[ "$mode" == baseline ]]; then
    export CMAKE_CXX_FLAGS="${CMAKE_CXX_FLAGS} -DCNC_WEB_REPLAY_FLUSH_BASELINE=1"
fi
export WASM_EXCEPTIONS=1
export CMAKE_BUILD_PARALLEL_LEVEL=4
bash tools/build_wasm.sh
mkdir -p "/workspace/dist-${mode}"
cp "$CNC_DIST_DIR"/cnc-port.{js,wasm,worker.js} "/workspace/dist-${mode}/"
sha256sum "/workspace/dist-${mode}"/cnc-port.* > "/workspace/dist-${mode}/SHA256SUMS.txt"
