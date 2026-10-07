"""NVENC + AAC fragmented MP4 over authenticated HTTPS WebSocket.

This transport traverses HTTP tunnels without exposing UDP or requiring a
public TURN account. It has more buffering than the LAN WebRTC transport.
Only the isolated X11 desktop and its PulseAudio monitor are captured.
"""
import asyncio
import json
import os
import struct
import time

from aiohttp import web, WSMsgType

SESSIONS = set()
METRICS = {'transport': 'https-websocket', 'encoder': 'h264_nvenc', 'bytesSent': 0,
           'startedAt': None, 'error': None}


def encoder_command(width, height, bitrate, fps=30):
    return ['ffmpeg', '-nostdin', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:2', '-stats_period', '1',
            '-thread_queue_size', '8', '-f', 'x11grab', '-draw_mouse', '1',
            '-framerate', str(fps), '-video_size', f'{width}x{height}', '-i', ':99.0',
            '-thread_queue_size', '8', '-probesize', '32', '-analyzeduration', '0',
            '-f', 'pulse', '-sample_rate', '48000', '-channels', '2', '-i', 'zero-hour.monitor',
            '-map', '0:v:0', '-map', '1:a:0',
            '-vf', f'setpts=N/({fps}*TB)', '-af', 'asetpts=N/SR/TB', '-r', str(fps), '-c:v', 'h264_nvenc',
            '-preset', 'p1', '-tune', 'ull', '-profile:v', 'baseline',
            '-level:v', '4.2', '-pix_fmt', 'yuv420p', '-bf', '0', '-g', str(fps),
            '-b:v', str(bitrate), '-maxrate', str(bitrate), '-bufsize', str(bitrate // 4),
            '-rc', 'cbr', '-rc-lookahead', '0', '-zerolatency', '1', '-delay', '0',
            '-c:a', 'aac', '-b:a', '64k', '-ar', '48000', '-ac', '2',
            '-movflags', 'empty_moov+default_base_moof', '-frag_duration', '100000',
            '-flush_packets', '1', '-f', 'mp4', 'pipe:1']


def quality_command(width, height, quality):
    profiles = {'low': (350_000, 30), 'balanced': (1_000_000, 30),
                'fast': (int(os.environ.get('ZH_INTERNET_BITRATE', '2000000')), 60)}
    if quality not in profiles:
        raise ValueError('Unsupported Internet quality')
    bitrate, fps = profiles[quality]
    output_width, output_height = (854, 480) if quality == 'low' else (width, height)
    command = encoder_command(width, height, bitrate, fps)
    if quality == 'low':
        command[command.index('-vf') + 1] += ',scale=854:480'
    return command, output_width, output_height, bitrate, fps


async def read_box(reader):
    header = await reader.readexactly(8)
    size, kind = struct.unpack('>I4s', header)
    if size == 1:
        extended = await reader.readexactly(8)
        size = struct.unpack('>Q', extended)[0]
        header += extended
    if size < len(header) or size > 4 * 1024 * 1024:
        raise ValueError('Invalid or oversized MP4 fragment')
    return kind, header + await reader.readexactly(size - len(header))


def mime_type(initialization):
    # avcC starts with configurationVersion, profile, compatibility, level.
    offset = initialization.find(b'avcC')
    if offset < 4 or len(initialization) < offset + 8 or initialization[offset + 4] != 1:
        raise ValueError('The GPU encoder did not supply H.264 configuration')
    return 'video/mp4; codecs="avc1.' + initialization[offset+5:offset+8].hex() + ', mp4a.40.2"'


async def serve(request, peers, input_factory, width, height, password):
    if len(password) < 24:
        raise web.HTTPServiceUnavailable(text='Start Internet streaming to create a private password.')
    if peers or SESSIONS:
        raise web.HTTPConflict(text='A player is already connected. Disconnect that session first.')
    quality = request.query.get('quality', 'low')
    try:
        command, output_width, output_height, bitrate, fps = quality_command(width, height, quality)
    except ValueError:
        raise web.HTTPBadRequest(text='Choose a supported Internet quality preset.')
    socket = web.WebSocketResponse(heartbeat=15, max_msg_size=512, compress=False)
    if not socket.can_prepare(request).ok:
        raise web.HTTPBadRequest(text='A WebSocket connection is required.')
    # Reserve before await: two simultaneous upgrades cannot both capture.
    SESSIONS.add(socket)
    process = None
    controls = None
    tasks = []
    METRICS.update(bytesSent=0, encodedFrames=0, startedAt=time.monotonic(), error=None,
                   width=output_width, height=output_height, targetFps=fps, targetBitrate=bitrate, quality=quality)
    try:
        await socket.prepare(request)
        controls = input_factory()
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, limit=4*1024*1024)

        async def transmit():
            initialization = b''
            ready = False
            while not socket.closed:
                kind, box = await asyncio.wait_for(read_box(process.stdout), timeout=10)
                if not ready:
                    initialization += box
                    if len(initialization) > 1024*1024:
                        raise ValueError('Oversized MP4 initialization')
                    if kind != b'moov':
                        continue
                    await socket.send_json({'type': 'ready', 'mime': mime_type(initialization),
                                            'width': output_width, 'height': output_height, 'targetFps': fps})
                    box = initialization
                    ready = True
                # Backpressure must stop a slow connection, never queue stale video.
                await asyncio.wait_for(socket.send_bytes(box), timeout=2)
                METRICS['bytesSent'] += len(box)

        async def receive():
            async for message in socket:
                if message.type == WSMsgType.TEXT:
                    try:
                        command = json.loads(message.data)
                        if not isinstance(command, dict):
                            continue
                        if command.get('type') == 'ping':
                            await socket.send_json({'type': 'pong', 'id': command.get('id')})
                        else:
                            if command.get('type') == 'move':
                                command['x'] = float(command['x']) * width / output_width
                                command['y'] = float(command['y']) * height / output_height
                            controls.handle(json.dumps(command))
                    except (ValueError, TypeError, KeyError, OverflowError):
                        pass
                elif message.type in (WSMsgType.CLOSE, WSMsgType.ERROR):
                    break

        async def read_errors():
            # Drain stderr continuously so encoder errors cannot block the pipe.
            recent = b''
            while chunk := await process.stderr.readline():
                if chunk.startswith(b'frame='):
                    try:
                        METRICS['encodedFrames'] = int(chunk.split(b'=', 1)[1])
                    except ValueError:
                        pass
                elif b'=' not in chunk:
                    recent = (recent + chunk)[-4096:]
            return recent.decode(errors='replace')

        stderr_task = asyncio.create_task(read_errors())
        tasks = [asyncio.create_task(transmit()), asyncio.create_task(receive()), stderr_task]
        done, _ = await asyncio.wait(tasks[:2], return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
    except (Exception, asyncio.CancelledError) as error:
        METRICS['error'] = type(error).__name__
        print('Internet transport stopped:', type(error).__name__, flush=True)
        if not socket.closed:
            try:
                await asyncio.wait_for(socket.send_json({'type': 'error', 'message':
                    'Streaming stopped. Reconnect; the host can check its Internet encoder log.'}), 1)
            except (Exception, asyncio.CancelledError):
                pass
    finally:
        if controls:
            controls.close()
        diagnostic = tasks[-1].result() if tasks and tasks[-1].done() and not tasks[-1].cancelled() else None
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        if process and process.returncode is None:
            process.terminate()
            try:
                # Drain pipes after cancelling their readers. Waiting on an
                # encoder with a full unread stdout can otherwise deadlock.
                _, stderr = await asyncio.wait_for(process.communicate(), 3)
                diagnostic = stderr.decode(errors='replace') or diagnostic
            except asyncio.TimeoutError:
                process.kill()
                await asyncio.wait_for(process.communicate(), 3)
        if diagnostic:
            print('Internet encoder:', diagnostic, flush=True)
        SESSIONS.discard(socket)
        try:
            await asyncio.wait_for(socket.close(), 1)
        except (Exception, asyncio.CancelledError):
            pass
    return socket
