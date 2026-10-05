"""Regression checks for unsafe GPU fallback and non-native hosting.

These mocks verify gate behavior only, and never count as GPU/gameplay proof.
"""
import importlib.util
import subprocess
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


probe = module("zh_probe", "gpu-probe.py")
manager = module("zh_streaming", "streaming.py")


class CapabilityGate(unittest.TestCase):
    def check_pipeline(self, rendering, encoders):
        runtime = types.SimpleNamespace(__file__="fixture", probe_wayland_gpu=lambda **kwargs: rendering, hardware_encoders=lambda **kwargs: encoders)
        with patch.dict(sys.modules, {"pixelflux": runtime}), patch.object(probe.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "NVIDIA GPU visible", "")):
            return probe.run_probe()

    def test_gpu_visibility_does_not_authorize_cpu_rendering(self):
        report = self.check_pipeline({"accelerated": True, "renderer": "llvmpipe"}, {"h264": "nvenc"})
        self.assertEqual(report["status"], "blocked")

    def test_hardware_renderer_does_not_authorize_software_encoding(self):
        report = self.check_pipeline({"accelerated": True, "renderer": "NVIDIA GPU"}, {"h264": "x264"})
        self.assertEqual(report["status"], "blocked")

    def test_driver_detection_alone_cannot_pass(self):
        report = self.check_pipeline({"accelerated": False, "error": "No render node"}, {})
        self.assertEqual(report["status"], "blocked")
        self.assertEqual(len(report["blockers"]), 2)

    def test_capability_pass_never_claims_gameplay_acceptance(self):
        report = self.check_pipeline({"accelerated": True, "renderer": "NVIDIA GPU"}, {"h264": "nvenc"})
        self.assertEqual(report["status"], "capability-passed")
        self.assertIn("not a 60 FPS", report["scope"])

    def test_windows_and_wsl_are_refused_before_any_docker_mutation(self):
        for system, release in (("Windows", "11"), ("Linux", "6.6-microsoft-standard-WSL2")):
            with patch.object(manager.platform, "system", return_value=system), patch.object(manager.platform, "release", return_value=release), patch.object(manager, "execute") as command:
                with self.assertRaises(RuntimeError):
                    manager.native_linux()
                command.assert_not_called()


if __name__ == "__main__":
    unittest.main()
