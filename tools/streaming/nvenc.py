"""NVENC-only H.264 encoder for the pinned aiortc 1.14 packetizer.

CPU readback/upload bypasses the CUDA/EGL interop unavailable under WSL.
An NVENC failure propagates; there is deliberately no software encoder fallback.
"""
from fractions import Fraction
import os
import time

import av
from aiortc.codecs.h264 import H264Encoder

METRICS = {'encoder':'h264_nvenc', 'encodedFrames':0, 'lastEncodeMs':0, 'error':None}


class NvencEncoder(H264Encoder):
    def __init__(self):
        super().__init__()
        self._bitrate = int(os.environ.get('ZH_STREAM_BITRATE', '8000000'))

    @property
    def target_bitrate(self):
        return self._bitrate

    @target_bitrate.setter
    def target_bitrate(self, bitrate):
        self._bitrate = max(2_000_000, min(int(bitrate), 25_000_000))

    def _encode_frame(self, frame, force_keyframe):
        if self.codec and (frame.width != self.codec.width or frame.height != self.codec.height):
            self.codec = None
        if self.codec is None:
            self.codec = av.CodecContext.create('h264_nvenc', 'w')
            self.codec.width, self.codec.height = frame.width, frame.height
            # Xvfb's memory-mapped framebuffer is BGR0. NVENC accepts that
            # format directly, so avoid a full-frame CPU color conversion.
            self.codec.pix_fmt = 'bgr0'
            self.codec.framerate = Fraction(60, 1)
            self.codec.time_base = Fraction(1, 90000)
            self.codec.bit_rate = self.target_bitrate
            self.codec.gop_size = 60
            self.codec.max_b_frames = 0
            self.codec.options = {'preset':'p1', 'tune':'ull', 'profile':'baseline', 'level':'4.2', 'rc':'cbr', 'zerolatency':'1', 'delay':'0', 'rc-lookahead':'0', 'forced-idr':'1'}
            self.codec.open()
        self.codec.bit_rate = self.target_bitrate
        # Xvfb/XWD capture is BGR0 in system memory. Keep it in that format for
        # NVENC; there is no CUDA/EGL interop or software encoder fallback.
        if frame.format.name != 'bgr0':
            frame = frame.reformat(format='bgr0')
        frame.pict_type = av.video.frame.PictureType.I if force_keyframe else av.video.frame.PictureType.NONE
        started = time.perf_counter()
        try:
            data = b''.join(bytes(packet) for packet in self.codec.encode(frame))
        except Exception as error:
            METRICS['error'] = str(error)
            raise
        METRICS['lastEncodeMs'] = (time.perf_counter() - started) * 1000
        if data:
            METRICS['encodedFrames'] += 1
            yield from self._split_bitstream(data)


def install():
    # aiortc pins this factory in the sender module; patch only H.264 selection.
    import aiortc.rtcrtpsender as sender
    original = sender.get_encoder
    def factory(codec):
        if codec.mimeType.lower() == 'video/h264':
            return NvencEncoder()
        if codec.mimeType.lower().startswith('video/'):
            raise RuntimeError(f'Only hardware H.264 is enabled for this stream; negotiated {codec.mimeType}')
        return original(codec)
    sender.get_encoder = factory


def smoke_test():
    encoder = NvencEncoder()
    width = int(os.environ.get('ZH_STREAM_WIDTH', '1280'))
    height = int(os.environ.get('ZH_STREAM_HEIGHT', '720'))
    frame = av.VideoFrame(width, height, 'bgr0')
    for plane in frame.planes:
        plane.update(bytes(plane.buffer_size))
    frame.pts, frame.time_base = 0, Fraction(1, 90000)
    payloads, _ = encoder.encode(frame, True)
    if not payloads:
        raise RuntimeError('NVENC did not produce an immediate H.264 frame')
    return {'encoder':'h264_nvenc', 'payloads':len(payloads), 'passed':True}


if __name__ == '__main__':
    import json
    print(json.dumps(smoke_test()))
