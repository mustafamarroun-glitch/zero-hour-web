"""Actual NVENC/AAC fragmented-MP4 preflight inside the running desktop.

Reads a short live isolated desktop capture, decodes it using FFmpeg and
checks audio/video output. No network receiver or actual game is exercised.
"""
import asyncio
from importlib import import_module
import json
import os
import subprocess

transport = import_module('internet-transport')


async def check(quality='low'):
    os.environ.setdefault('PULSE_SERVER', 'unix:/tmp/zh-runtime/pulse/native')
    command, width, height, bitrate, fps = transport.quality_command(int(os.environ.get('ZH_STREAM_WIDTH', '1280')),
                                        int(os.environ.get('ZH_STREAM_HEIGHT', '720')), quality)
    command[-3:-3] = ['-t', '2']
    process = await asyncio.create_subprocess_exec(*command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        data, errors = await asyncio.wait_for(process.communicate(), 20)
    except BaseException:
        process.kill()
        await process.wait()
        raise
    if process.returncode:
        raise RuntimeError(errors.decode(errors='replace'))
    mime = transport.mime_type(data)
    result = subprocess.run(['ffprobe','-v','error','-count_frames','-show_streams','-of','json','pipe:0'], input=data, capture_output=True, timeout=10)
    streams = json.loads(result.stdout)['streams']
    print(json.dumps({'streams':[{key:stream.get(key) for key in ('codec_name','start_time','duration','nb_read_frames')} for stream in streams]}), flush=True)
    assert {stream['codec_name'] for stream in streams} == {'h264', 'aac'}, streams
    video = next(stream for stream in streams if stream['codec_name'] == 'h264')
    assert int(video.get('nb_read_frames', '0')) >= fps, 'Video timestamps did not advance across the preflight window'
    assert (video['width'], video['height']) == (width, height), 'Wrong transmitted resolution'
    decoded = subprocess.run(['ffmpeg','-v','error','-i','pipe:0','-f','null','-'], input=data, capture_output=True, timeout=15)
    if decoded.returncode:
        raise RuntimeError(decoded.stderr.decode(errors='replace'))
    print(json.dumps({'passed': True, 'quality': quality, 'width': width, 'height': height, 'targetFps': fps, 'encoder': 'h264_nvenc', 'mime': mime, 'bytes': len(data),
                      'scope': 'Two-second local desktop MP4 encode/decode only; remote playback unverified'}))


if __name__ == '__main__':
    import sys
    asyncio.run(check(sys.argv[1] if len(sys.argv) > 1 else 'low'))
