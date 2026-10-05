"""Ask the installed Selkies pipeline for real rendering/encoder support.

Run in a disposable GPU-enabled container. No retail files, browser profiles,
ports, or display sessions are shared with this probe. JSON is the only stdout.
"""
import contextlib
import glob
import io
import json
import os
import subprocess
import sys
from datetime import datetime, timezone


def run_probe():
    report = {
        "schema": 1,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "status": "blocked",
        "scope": "Selkies rendering and encoder capability; not a 60 FPS gameplay benchmark",
        "devices": {
            "dri": glob.glob("/dev/dri/renderD*"),
            "wslBridge": os.path.exists("/dev/dxg"),
            "nvidiaModeset": os.path.exists("/dev/nvidia-modeset"),
        },
        "rendering": {},
        "encoders": {},
        "blockers": [],
    }
    try:
        gpu = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,driver_version,memory.total", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=15, check=False,
        )
        report["nvidia"] = {"exitCode": gpu.returncode, "output": gpu.stdout.strip(), "error": gpu.stderr.strip()}
    except (OSError, subprocess.TimeoutExpired) as error:
        report["nvidia"] = {"error": str(error)}
    # The extension writes native diagnostics to stderr. Keep that separate from
    # machine-readable stdout; the launcher saves both without hiding failures.
    try:
        import pixelflux
        report["pipeline"] = pixelflux.__file__
        with contextlib.redirect_stdout(io.StringIO()):
            report["rendering"] = pixelflux.probe_wayland_gpu(auto_gpu="nvidia")
            report["encoders"] = pixelflux.hardware_encoders(encode_node_index=-2, auto_gpu="nvidia")
    except Exception as error:
        report["blockers"].append(f"Cannot probe the installed Selkies pipeline: {error}")
    rendering = report["rendering"]
    renderer = str(rendering.get("renderer", ""))
    if not rendering.get("accelerated") or not renderer or any(word in renderer.lower() for word in ("swiftshader", "llvmpipe", "softpipe", "software")):
        report["blockers"].append("Selkies has no verified hardware rendering/capture path: " + str(rendering.get("error") or renderer or "no accelerated renderer"))
    if report["encoders"].get("h264") != "nvenc":
        report["blockers"].append("Selkies did not expose an NVIDIA NVENC H.264 encoder. CPU encoding is not accepted.")
    if report["devices"]["wslBridge"] and not report["devices"]["dri"]:
        report["platformNote"] = "WSL exposes /dev/dxg, but the Linux DRM render nodes used by this Selkies pipeline are absent."
    if not report["blockers"]:
        report["status"] = "capability-passed"
    return report


if __name__ == "__main__":
    result = run_probe()
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["status"] == "capability-passed" else 2)
