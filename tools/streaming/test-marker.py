"""Verify the host marker without an X server, GPU or player files."""
import importlib.util
from pathlib import Path
import time
import unittest

spec = importlib.util.spec_from_file_location('marker', Path(__file__).with_name('diagnostic-marker.py'))
marker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(marker)


class MarkerChecks(unittest.TestCase):
    def test_only_video_corner_changes_and_bits_survive(self):
        stride = 256 * 4
        plane = bytearray([64]) * (stride * 64)
        marker.paint_marker(plane, stride, 43210)
        self.assertEqual(plane[48*stride:], bytes([64]) * (16*stride))
        for row in range(48):
            self.assertEqual(plane[row*stride+192:(row+1)*stride], bytes([64])*(stride-192))
        decoded = sum((plane[(12+bit//4*8)*stride+(12+bit%4*8)*4] > 200) << bit for bit in range(16))
        self.assertEqual(decoded,43210)

    def test_untrusted_messages_and_expiration(self):
        probe=marker.DiagnosticMarker()
        for nonce in (None,0,65536,-1,True,'123'):
            self.assertFalse(probe.handle({'type':'diagnostic-probe','nonce':nonce}))
        self.assertTrue(probe.handle({'type':'diagnostic-probe','nonce':123}))
        self.assertTrue(probe.handle({'type':'diagnostic-clear'}))
        self.assertIsNone(probe.probe)
        probe.probe=(123,time.monotonic()-1)
        plane=bytearray(48*48*4);probe.paint(plane,48*4)
        self.assertEqual(plane,bytearray(len(plane)))


if __name__=='__main__':
    unittest.main()
