"""Launch only the isolated container desktop, audio sink and LAN bridge."""
from datetime import datetime, timedelta, timezone
import ipaddress
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from urllib.request import urlopen

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

children = []
root = Path('/config')
tls = root / 'tls'
tls.mkdir(parents=True, exist_ok=True)
address = ipaddress.ip_address(os.environ['ZH_STREAM_LAN_IP'])
stream_width = int(os.environ.get('ZH_STREAM_WIDTH', '1280'))
stream_height = int(os.environ.get('ZH_STREAM_HEIGHT', '720'))
if stream_width < 800 or stream_height < 600 or stream_width % 2 or stream_height % 2:
    raise RuntimeError('Stream dimensions must be even and at least 800x600')
certificate = tls / 'cert.pem'
keyfile = tls / 'key.pem'
reuse = False
if certificate.exists() and keyfile.exists():
    cert = x509.load_pem_x509_certificate(certificate.read_bytes())
    reuse = address in cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value.get_values_for_type(x509.IPAddress) and cert.not_valid_after_utc > datetime.now(timezone.utc)
if not reuse:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'Zero Hour LAN')])
    cert = x509.CertificateBuilder().subject_name(subject).issuer_name(subject).public_key(key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(datetime.now(timezone.utc)-timedelta(minutes=5)).not_valid_after(datetime.now(timezone.utc)+timedelta(days=30)).add_extension(x509.SubjectAlternativeName([x509.IPAddress(address), x509.DNSName('localhost')]), critical=False).sign(key, hashes.SHA256())
    keyfile.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))
    certificate.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
if os.getuid() == 0:
    for path in (root, tls, certificate, keyfile):
        os.chown(path, 1000, 1000)
    os.chmod(keyfile, 0o600)
    # Xtrans insists that this shared socket directory be root-owned. Create it
    # before dropping privileges so the X server can create its private socket.
    Path('/tmp/.X11-unix').mkdir(exist_ok=True)
    os.chmod('/tmp/.X11-unix', 0o1777)
    framebuffer = Path('/tmp/zh-fb')
    framebuffer.mkdir(mode=0o700, exist_ok=True)
    os.chown(framebuffer, 1000, 1000)
    os.setgroups([])
    os.setgid(1000)
    os.setuid(1000)
os.environ.update(HOME='/config', DISPLAY=':99', XDG_RUNTIME_DIR='/tmp/zh-runtime', PULSE_RUNTIME_PATH='/tmp/zh-runtime/pulse', PULSE_SERVER='unix:/tmp/zh-runtime/pulse/native')
Path('/tmp/zh-runtime').mkdir(mode=0o700, exist_ok=True)
Path('/tmp/zh-runtime/pulse').mkdir(mode=0o700, exist_ok=True)


def start(command):
    process = subprocess.Popen(command)
    children.append(process)
    return process


def terminate_children():
    for process in reversed(children):
        if process.poll() is None:
            process.terminate()
    for process in reversed(children):
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


def stop(*args):
    terminate_children()
    sys.exit(0)


signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
try:
    start(['Xvfb', ':99', '-screen', '0', f'{stream_width}x{stream_height}x24', '-nolisten', 'tcp', '-ac', '-fbdir', '/tmp/zh-fb'])
    start(['pulseaudio','--daemonize=no','--exit-idle-time=-1','--disallow-exit'])
    for _ in range(50):
        ready = subprocess.run(['pactl','info'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if ready.returncode == 0 and Path('/tmp/.X11-unix/X99').exists():
            break
        time.sleep(.1)
    else:
        raise RuntimeError('Independent display/audio did not become ready')
    subprocess.run(['pactl','load-module','module-null-sink','sink_name=zero-hour','rate=48000','channels=2'], check=True, stdout=subprocess.DEVNULL)
    subprocess.run(['pactl','set-default-sink','zero-hour'], check=True)
    start([sys.executable, str(Path(__file__).with_name('wsl-bridge.py'))])
    for _ in range(300):
        if any(child.poll() is not None for child in children):
            raise RuntimeError('The display, audio or WebRTC service stopped before startup completed')
        try:
            with urlopen('http://127.0.0.1:8098/network-config.json', timeout=.5) as response:
                config = json.load(response)
            if config.get('runtime') == '3ccaa0e9-compiled-combined-v6-rf1' and any(
                'turn:' in ' '.join(server.get('urls', [])) for server in config.get('iceServers', [])
            ):
                break
        except (OSError, ValueError):
            pass
        time.sleep(.2)
    else:
        raise RuntimeError('The local Zero Hour site and private TURN relay did not become ready')
    browser = start(['chromium','--no-sandbox','--no-first-run','--no-default-browser-check','--user-data-dir=/config/chromium-lan','--kiosk',f'--window-size={stream_width},{stream_height}','--window-position=0,0','--use-gl=angle','--use-angle=gl-egl','--ignore-gpu-blocklist','--disable-software-rasterizer','--autoplay-policy=no-user-gesture-required','--remote-debugging-port=9222','--remote-debugging-address=127.0.0.1',os.environ.get('ZH_STREAM_START_URL','http://localhost:8098/')])
    for _ in range(100):
        if browser.poll() is not None:
            raise RuntimeError('Chromium exited before opening the Zero Hour page')
        try:
            with urlopen('http://127.0.0.1:9222/json/version', timeout=.5) as response:
                if json.load(response).get('webSocketDebuggerUrl'):
                    break
        except (OSError, ValueError):
            pass
        time.sleep(.2)
    else:
        raise RuntimeError('Chromium did not open its local browser control endpoint')
    while all(child.poll() is None for child in children):
        time.sleep(1)
    raise RuntimeError('A streaming process stopped; see Docker logs')
finally:
    terminate_children()
