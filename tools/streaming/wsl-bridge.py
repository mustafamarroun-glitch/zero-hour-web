"""One independent LAN WebRTC session: X11 capture, NVENC, Opus and XTest.

Runs inside the project container, never captures or injects into Windows.
aioice/aiortc are pinned because the single-port LAN binding uses their internal
protocol interfaces. No public STUN/TURN, clipboard, shell or file-download API.
"""
import asyncio
import base64
from concurrent.futures import ThreadPoolExecutor
from fractions import Fraction
import hmac
import ipaddress
import json
import logging
import mmap
import os
from pathlib import Path
import struct
import subprocess
import ssl
import time

import av
from aiohttp import web
from aioice import Candidate
from aioice.ice import Connection, StunProtocol, candidate_foundation, candidate_priority
from aiortc import MediaStreamTrack, RTCBundlePolicy, RTCConfiguration, RTCPeerConnection, RTCRtpSender, RTCSessionDescription, VideoStreamTrack
from Xlib import X, XK, display
from Xlib.ext import xtest
import nvenc

LAN_IP = os.environ['ZH_STREAM_LAN_IP']
STREAM_WIDTH = int(os.environ.get('ZH_STREAM_WIDTH', '1280'))
STREAM_HEIGHT = int(os.environ.get('ZH_STREAM_HEIGHT', '720'))
UDP_PORT = 50000
USERNAME = 'saddam'
if not ipaddress.ip_address(LAN_IP).is_private:
    raise RuntimeError('A private LAN IPv4 address is required')
PASSWORD = Path('/run/secrets/stream-password').read_text().strip()
if len(PASSWORD) < 4:
    raise RuntimeError('The streaming password must have at least four characters')
ROOT = Path(__file__).parent
PEERS = set()
INPUT = None
VIDEO = None
FRAME_BYTES = 960 * 2 * 2


async def lan_candidates(self, component, addresses, timeout=5):
    # Bind the same single UDP port Compose publishes; advertise the Windows LAN
    # address instead of an unreachable Docker bridge IP. MAX_BUNDLE ensures one
    # transport for video, audio and input. One connected friend is enforced.
    if component != 1:
        raise RuntimeError('Unexpected unbundled ICE component')
    transport, protocol = await asyncio.get_running_loop().create_datagram_endpoint(
        lambda: StunProtocol(self), local_addr=('0.0.0.0', UDP_PORT))
    protocol.local_candidate = Candidate(foundation=candidate_foundation('host', 'udp', LAN_IP),
        component=1, transport='udp', priority=candidate_priority(1, 'host'), host=LAN_IP, port=UDP_PORT, type='host')
    self._protocols.append(protocol)
    return [protocol.local_candidate]


class DesktopVideo(VideoStreamTrack):
    def __init__(self):
        super().__init__()
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='zh-capture')
        self.framebuffer_file = None
        self.framebuffer = None
        self.framebuffer_offset = None
        self.framebuffer_stride = None
        self.start_time = None
        self.frames = 0
        self.capture_ms = 0

    def capture(self):
        if self.framebuffer is None:
            self.framebuffer_file = open('/tmp/zh-fb/Xvfb_screen0', 'rb', buffering=0)
            self.framebuffer = mmap.mmap(self.framebuffer_file.fileno(), 0, access=mmap.ACCESS_READ)
            header = struct.unpack('>25I', self.framebuffer[:100])
            header_size, width, height = header[0], header[4], header[5]
            bits, stride = header[11], header[12]
            masks = header[14:17]
            if (width, height, bits, masks) != (STREAM_WIDTH,STREAM_HEIGHT,32,(0xFF0000,0xFF00,0xFF)):
                raise RuntimeError(f'Unsupported Xvfb framebuffer: {width}x{height}x{bits}, masks={masks!r}')
            self.framebuffer_offset = header_size + header[19] * 12
            self.framebuffer_stride = stride
        started = time.perf_counter()
        pixels = memoryview(self.framebuffer)[self.framebuffer_offset:self.framebuffer_offset+self.framebuffer_stride*STREAM_HEIGHT]
        frame = av.VideoFrame(STREAM_WIDTH, STREAM_HEIGHT, 'bgr0')
        frame.planes[0].update(pixels)
        pixels.release()
        self.capture_ms = (time.perf_counter() - started) * 1000
        return frame

    async def recv(self):
        now = time.monotonic()
        if self.start_time is None:
            self.start_time = now
        # Never build a queue of old frames. Capture the current screen once
        # the next frame is due; timestamp gaps expose capture/encode stalls.
        due = self.start_time + self.frames / 60
        await asyncio.sleep(max(0, due - now))
        frame = await asyncio.get_running_loop().run_in_executor(self.executor, self.capture)
        frame.pts = round((time.monotonic() - self.start_time) * 90000)
        frame.time_base = Fraction(1, 90000)
        self.frames = max(self.frames + 1, int((time.monotonic() - self.start_time) * 60))
        return frame

    def stop(self):
        super().stop()
        def close():
            if self.framebuffer:
                self.framebuffer.close()
            if self.framebuffer_file:
                self.framebuffer_file.close()
        self.executor.submit(close)
        self.executor.shutdown(wait=False)


class DesktopAudio(MediaStreamTrack):
    """Read the private PulseAudio sink monitor through the system FFmpeg."""
    kind = 'audio'

    def __init__(self):
        super().__init__()
        self.process = subprocess.Popen([
            'ffmpeg','-nostdin','-hide_banner','-loglevel','error',
            '-f','pulse','-i','zero-hour.monitor','-vn','-acodec','pcm_s16le',
            '-ar','48000','-ac','2','-f','s16le','-blocksize',str(FRAME_BYTES),'pipe:1'
        ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='zh-audio')
        self.samples = 0

    def read(self):
        data = self.process.stdout.read(FRAME_BYTES)
        if len(data) != FRAME_BYTES:
            error = self.process.stderr.read(2048).decode(errors='replace')
            raise RuntimeError(f'PulseAudio capture ended: {error or "no PCM samples received"}')
        return data

    async def recv(self):
        data = await asyncio.get_running_loop().run_in_executor(self.executor, self.read)
        frame = av.AudioFrame(format='s16', layout='stereo', samples=960)
        frame.sample_rate = 48000
        frame.planes[0].update(data)
        frame.pts = self.samples
        frame.time_base = Fraction(1,48000)
        self.samples += 960
        return frame

    def stop(self):
        super().stop()
        if self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                self.process.kill()
        self.executor.shutdown(wait=False, cancel_futures=True)


class RemoteInput:
    def __init__(self):
        self.x = display.Display(':99')
        self.keys = set()
        self.buttons = set()

    def release(self):
        for code in self.keys:
            xtest.fake_input(self.x, X.KeyRelease, code)
        for button in self.buttons:
            xtest.fake_input(self.x, X.ButtonRelease, button)
        self.keys.clear()
        self.buttons.clear()
        self.x.sync()

    def handle(self, message):
        if not isinstance(message, str) or len(message) > 512:
            return
        data = json.loads(message)
        kind = data.get('type')
        if kind == 'release':
            self.release()
        elif kind == 'move':
            xtest.fake_input(self.x, X.MotionNotify, x=max(0,min(1919,int(data['x']))), y=max(0,min(1079,int(data['y']))))
        elif kind == 'button':
            button = {0:1, 1:2, 2:3}.get(data.get('button'))
            if button:
                down = data.get('down') is True
                xtest.fake_input(self.x, X.ButtonPress if down else X.ButtonRelease, button)
                self.buttons.add(button) if down else self.buttons.discard(button)
        elif kind == 'wheel':
            button = 4 if data.get('delta',0) < 0 else 5
            xtest.fake_input(self.x, X.ButtonPress, button)
            xtest.fake_input(self.x, X.ButtonRelease, button)
        elif kind == 'key':
            code = str(data.get('code',''))
            mapping = {'ArrowLeft':'Left','ArrowRight':'Right','ArrowUp':'Up','ArrowDown':'Down','Escape':'Escape','Enter':'Return','NumpadEnter':'KP_Enter','Space':'space','Tab':'Tab','Backspace':'BackSpace','Delete':'Delete','Home':'Home','End':'End','PageUp':'Prior','PageDown':'Next','ShiftLeft':'Shift_L','ShiftRight':'Shift_R','ControlLeft':'Control_L','ControlRight':'Control_R','AltLeft':'Alt_L','AltRight':'Alt_R','MetaLeft':'Super_L','MetaRight':'Super_R','Minus':'minus','Equal':'equal','BracketLeft':'bracketleft','BracketRight':'bracketright','Semicolon':'semicolon','Quote':'apostrophe','Comma':'comma','Period':'period','Slash':'slash','Backslash':'backslash','Backquote':'grave'}
            symbol = mapping.get(code)
            if code.startswith('Key') and len(code) == 4 and code[-1].isalpha():
                symbol = code[-1].lower()
            elif code.startswith('Digit') and len(code) == 6 and code[-1].isdigit():
                symbol = code[-1]
            elif code.startswith('F') and code[1:].isdigit() and 1 <= int(code[1:]) <= 12:
                symbol = code
            key = self.x.keysym_to_keycode(XK.string_to_keysym(symbol)) if symbol else 0
            if key:
                down = data.get('down') is True
                xtest.fake_input(self.x, X.KeyPress if down else X.KeyRelease, key)
                self.keys.add(key) if down else self.keys.discard(key)
        self.x.flush()


@web.middleware
async def authenticate(request, handler):
    expected = base64.b64encode((USERNAME + ':' + PASSWORD).encode()).decode()
    supplied = request.headers.get('Authorization', '')
    if not hmac.compare_digest(supplied, 'Basic ' + expected):
        return web.Response(status=401, headers={'WWW-Authenticate':'Basic realm="Zero Hour"'}, text='Use the private streaming credentials.')
    if request.method == 'POST' and request.headers.get('Origin') != f'https://{request.host}':
        raise web.HTTPForbidden(text='Open the connection page directly.')
    response = await handler(request)
    response.headers['Cache-Control'] = 'no-store'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    return response


async def offer(request):
    global INPUT, VIDEO
    if PEERS:
        raise web.HTTPConflict(text='A friend is already connected. Disconnect that session first.')
    try:
        body = await request.json()
    except (ValueError, TypeError):
        raise web.HTTPBadRequest(text='Invalid connection request')
    if not isinstance(body, dict) or body.get('type') != 'offer' or not isinstance(body.get('sdp'), str) or len(body['sdp']) > 65536:
        raise web.HTTPBadRequest(text='Invalid connection request')
    pc = RTCPeerConnection(RTCConfiguration(iceServers=[], bundlePolicy=RTCBundlePolicy.MAX_BUNDLE))
    PEERS.add(pc)
    input_handler = RemoteInput()
    video = DesktopVideo()
    INPUT, VIDEO = input_handler, video
    audio = None

    async def cleanup():
        input_handler.release()
        video.stop()
        if audio:
            audio.stop()
        await pc.close()
        PEERS.discard(pc)

    @pc.on('connectionstatechange')
    async def changed():
        if pc.connectionState == 'failed':
            await pc.close()
        if pc.connectionState == 'closed':
            input_handler.release()
            if video.readyState != 'ended':
                video.stop()
            if audio:
                audio.stop()
            PEERS.discard(pc)

    async def connection_timeout():
        await asyncio.sleep(25)
        if pc.connectionState not in ('connected', 'closed'):
            await cleanup()
    asyncio.create_task(connection_timeout())

    @pc.on('datachannel')
    def channel_created(channel):
        @channel.on('message')
        def message(data):
            try:
                input_handler.handle(data)
            except (ValueError, TypeError, KeyError):
                pass
        @channel.on('close')
        def channel_closed():
            input_handler.release()

    try:
        await pc.setRemoteDescription(RTCSessionDescription(sdp=body['sdp'], type='offer'))
        pc.addTrack(video)
        for transceiver in pc.getTransceivers():
            if transceiver.kind == 'video':
                transceiver.setCodecPreferences([codec for codec in RTCRtpSender.getCapabilities('video').codecs if codec.mimeType.lower() == 'video/h264'])
        audio = DesktopAudio()
        pc.addTrack(audio)
        await pc.setLocalDescription(await pc.createAnswer())
        return web.json_response({'sdp':pc.localDescription.sdp, 'type':pc.localDescription.type})
    except Exception:
        await cleanup()
        raise


async def stop_session(request):
    for peer in list(PEERS):
        await peer.close()
    return web.json_response({'disconnected':True})


async def metrics(request):
    return web.json_response({'encoding':nvenc.METRICS, 'captureMs':VIDEO.capture_ms if VIDEO else None,
        'connected':any(peer.connectionState == 'connected' for peer in PEERS),
        'scope':'Stream transport only; actual game FPS and Mac input-to-picture delay require separate measurements'})


async def shutdown(app):
    for peer in list(PEERS):
        await peer.close()


if __name__ == '__main__':
    logging.basicConfig(level=logging.WARNING)
    nvenc.smoke_test()
    nvenc.METRICS['encodedFrames'] = 0
    nvenc.install()
    Connection.get_component_candidates = lan_candidates
    app = web.Application(middlewares=[authenticate], client_max_size=100_000)
    app.router.add_get('/', lambda request: web.FileResponse(ROOT / 'client.html'))
    app.router.add_get('/client.mjs', lambda request: web.FileResponse(ROOT / 'client.mjs'))
    app.router.add_get('/font.woff2', lambda request: web.FileResponse('/app/public/fonts/rajdhani.woff2'))
    app.router.add_get('/metrics', metrics)
    app.router.add_post('/offer', offer)
    app.router.add_post('/disconnect', stop_session)
    app.on_shutdown.append(shutdown)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain('/config/tls/cert.pem', '/config/tls/key.pem')
    web.run_app(app, host='0.0.0.0', port=3001, ssl_context=context, access_log=None)
