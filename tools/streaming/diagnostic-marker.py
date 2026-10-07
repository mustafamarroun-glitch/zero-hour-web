"""Opt-in 48px video probe; never writes the desktop/game framebuffer."""
import time


def valid_nonce(value):
    return type(value) is int and 1 <= value <= 65535


def paint_marker(plane, stride, nonce):
    """Paint only a copied BGR0 video plane, before encoding."""
    pixels = memoryview(plane)
    for y in range(48):
        row = bytearray()
        for x in range(48):
            white = x < 4 or y < 4 or x >= 44 or y >= 44
            if 8 <= x < 40 and 8 <= y < 40:
                bit = ((y - 8) // 8) * 4 + (x - 8) // 8
                white = bool(nonce & (1 << bit))
            row.extend(bytes((255, 255, 255, 0)) if white else bytes((0, 0, 0, 0)))
        pixels[y * stride:y * stride + 48 * 4] = row


class DiagnosticMarker:
    def __init__(self):
        self.probe = None

    def handle(self, data):
        if data.get('type') == 'diagnostic-probe' and valid_nonce(data.get('nonce')):
            self.probe = (data['nonce'], time.monotonic() + 2)
            return True
        if data.get('type') == 'diagnostic-clear':
            self.probe = None
            return True
        return False

    def paint(self, plane, stride):
        probe = self.probe
        if probe and time.monotonic() < probe[1]:
            paint_marker(plane, stride, probe[0])
