"""Native Linux lifecycle for this project's independent Zero Hour session.

Uses the installed Docker CLI and Python's standard library. It does not
install drivers, partition disks, reboot, alter firewall rules, or delete saves.
"""
import argparse
import hashlib
import ipaddress
import json
import os
import platform
import secrets
import shutil
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATE = ROOT / ".local" / "streaming"
PROJECT = "zero-hour-streaming"
NETWORKS = [ipaddress.ip_network(n) for n in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")]


def execute(args, *, timeout=90, capture=True, check=True):
    result = subprocess.run(args, cwd=ROOT, text=True, capture_output=capture, timeout=timeout, check=False)
    if check and result.returncode:
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(map(str, args[:4]))}\n{result.stderr or ''}")
    return result


def native_linux():
    if platform.system() != "Linux" or "microsoft" in platform.release().lower():
        raise RuntimeError("Boot native Linux first. This path does not use Windows/WSL's unsupported Selkies graphics bridge.")
    if not shutil.which("docker"):
        raise RuntimeError("Install Docker Engine and NVIDIA Container Toolkit on native Linux, then retry.")
    if execute(["docker", "info", "--format", "{{.OSType}}"], timeout=20).stdout.strip() != "linux":
        raise RuntimeError("A local Linux Docker engine is required.")
    # Device mounts and the published LAN address refer to this machine; a
    # remote Docker context must never receive local game files or credentials.
    context = execute(["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"], timeout=10).stdout.strip()
    endpoint = os.environ.get("DOCKER_HOST", context)
    if not endpoint.startswith("unix://"):
        raise RuntimeError("Select the local Docker Unix socket; remote Docker contexts are unsupported.")


def image_id(image, pull=False):
    result = execute(["docker", "image", "inspect", image, "--format", "{{.Id}}"], check=False)
    if result.returncode:
        if not pull:
            raise RuntimeError(f"Image {image} is not cached. Retry with --pull to fetch the required image.")
        execute(["docker", "pull", image], timeout=600, capture=False)
        result = execute(["docker", "image", "inspect", image, "--format", "{{.Id}}"])
    return result.stdout.strip()


def device_paths():
    if not Path("/dev/nvidia-modeset").exists():
        raise RuntimeError("NVIDIA's native Linux modeset device is absent. Configure the Linux NVIDIA graphics driver before retrying. CUDA-only access is insufficient.")
    return [p for p in ("/dev/nvidia-modeset", "/dev/dri") if Path(p).exists()]


def gpu_check(image, devices):
    STATE.mkdir(parents=True, exist_ok=True)
    args = ["docker", "run", "--rm", "--network", "none", "--gpus", "all", "--env", "NVIDIA_DRIVER_CAPABILITIES=all"]
    for device in devices:
        args += ["--device", device]
    args += ["--mount", f"type=bind,source={ROOT / 'tools' / 'streaming'},target=/probe,readonly", "--entrypoint", "python3", image, "/probe/gpu-probe.py"]
    result = execute(args, check=False, timeout=60)
    (STATE / "gpu-probe-stderr.log").write_text(result.stderr, encoding="utf-8")
    try:
        report = json.loads(result.stdout)
    except ValueError as error:
        (STATE / "gpu-probe-stdout.log").write_text(result.stdout, encoding="utf-8")
        raise RuntimeError("GPU probe failed to produce JSON; inspect .local/streaming/gpu-probe-stderr.log") from error
    report["imageId"] = image
    (STATE / "gpu-probe.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    if result.returncode or report.get("status") != "capability-passed":
        raise RuntimeError("GPU capability gate failed; no friend session started.\n" + "\n".join(report.get("blockers", [])))
    return report


def check_engine():
    manifest = json.loads((ROOT / "docs" / "foundation-manifest.json").read_text(encoding="utf-8"))
    files = [item for item in manifest["files"] if item["path"].startswith("dist-threaded-release/")]
    if not any(item["path"].endswith(".wasm") for item in files):
        raise RuntimeError("Engine checksum manifest has no WASM artifact.")
    for item in files:
        file = ROOT / "public" / item["path"]
        checksum = hashlib.sha256()
        with file.open("rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                checksum.update(block)
        if checksum.hexdigest() != item.get("publishedSha256", item["sha256"]):
            raise RuntimeError(f"Reviewed engine checksum mismatch: {item['path']}")
    return len(files)


def lan_address(requested=None):
    if requested:
        address = ipaddress.IPv4Address(requested)
    else:
        route = json.loads(execute(["ip", "-j", "-4", "route", "get", "1.1.1.1"]).stdout)
        address = ipaddress.IPv4Address(route[0]["prefsrc"])
    if not any(address in network for network in NETWORKS):
        raise RuntimeError("Select this laptop's private LAN IPv4 address using --lan-address.")
    interfaces = json.loads(execute(["ip", "-j", "-4", "address", "show"]).stdout)
    local = {info["local"] for item in interfaces for info in item.get("addr_info", []) if info.get("family") == "inet"}
    if str(address) not in local:
        raise RuntimeError("The selected address does not belong to this Linux host.")
    return str(address)


def game_directory(value):
    directory = Path(value).expanduser().resolve(strict=True)
    if not directory.is_dir():
        raise RuntimeError("--game-directory must name the local Zero Hour Data directory.")
    if any(c in str(directory) for c in ("'", "\n", "\r", ",")):
        raise RuntimeError("The mount path cannot contain apostrophes, commas, or line breaks.")
    files = {file.name.lower(): file for file in directory.iterdir() if file.is_file()}
    for name in ("inizh.big", "w3dzh.big", "englishzh.big"):
        if name not in files or files[name].stat().st_size < 8:
            raise RuntimeError(f"Required Zero Hour archive missing: {name}")
    return directory


def compose(arguments, *, check=True, capture=False, timeout=90):
    return execute(["docker", "compose", "--project-name", PROJECT, "--env-file", str(STATE / "compose.env"), "--file", str(ROOT / "compose.streaming.yaml"), "--file", str(STATE / "compose.linux.json"), *arguments], capture=capture, check=check, timeout=timeout)


def install_site_dependencies(image):
    runtime = STATE / "runtime"
    runtime.mkdir(parents=True, exist_ok=True)
    lock = ROOT / "package-lock.json"
    stamp = runtime / "dependency-lock.sha256"
    digest = hashlib.sha256(lock.read_bytes()).hexdigest()
    if stamp.exists() and stamp.read_text() == digest and (runtime / "node_modules" / "ws" / "package.json").exists():
        return
    execute([
        "docker", "run", "--rm", "--user", f"{os.getuid()}:{os.getgid()}",
        "--env", "npm_config_cache=/tmp/npm-cache", "--workdir", "/work",
        "--mount", f"type=bind,source={runtime},target=/work",
        "--mount", f"type=bind,source={ROOT / 'package.json'},target=/work/package.json,readonly",
        "--mount", f"type=bind,source={lock},target=/work/package-lock.json,readonly",
        image, "npm", "ci", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund",
    ], capture=False, timeout=300)
    stamp.write_text(digest, encoding="ascii")


def write_configuration(image, site_image, turn_image, directory, address, devices):
    (STATE / "compose.env").write_text(
        f"ZH_STREAM_IMAGE={image}\nZH_STREAM_SITE_IMAGE={site_image}\nZH_STREAM_TURN_IMAGE={turn_image}\nZH_STREAM_LAN_IP={address}\nZH_STREAM_TURN_URL=turn:{address}:3478?transport=udp\nZH_STREAM_TURN_SECRET_FILE=/run/secrets/turn-secret\nZH_STREAM_GAME_DIR='{directory}'\n", encoding="utf-8",
    )
    # The exact same native GPU devices are used by the probe and friend session.
    # The Linux runtime uses its own dependencies instead of Windows node_modules.
    override = {"services": {
        "friend": {"devices": [f"{d}:{d}" for d in devices]},
        "site": {"volumes": [{"type": "bind", "source": str(STATE / "runtime" / "node_modules"), "target": "/app/node_modules", "read_only": True}]},
    }}
    (STATE / "compose.linux.json").write_text(json.dumps(override, indent=2), encoding="utf-8")


def write_turn_configuration(address):
    container_id = compose(["ps", "-q", "friend"]).stdout.strip()
    if not container_id:
        raise RuntimeError("The streaming browser container is not running; cannot configure the private TURN relay.")
    internal = execute(["docker", "inspect", "--format", "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}", container_id]).stdout.strip()
    try:
        internal = ipaddress.IPv4Address(internal)
    except ipaddress.AddressValueError as error:
        raise RuntimeError("Docker did not report the streaming container IPv4 address required for TURN NAT mapping.") from error
    secret = (STATE / "turn-secret").read_text(encoding="ascii").strip()
    if len(secret) < 32:
        raise RuntimeError("The private TURN secret is missing or too short.")
    config = [
        "fingerprint", "use-auth-secret", f"static-auth-secret={secret}", "realm=zero-hour-web",
        "listening-ip=127.0.0.1", f"listening-ip={internal}", f"relay-ip={internal}", f"external-ip={address}/{internal}",
        f"allowed-peer-ip={address}", f"allowed-peer-ip={internal}",
        "listening-port=3478", "min-port=49160", "max-port=49223",
        "no-tcp", "no-tls", "no-tcp-relay", "no-multicast-peers", "stale-nonce=600", "log-file=stdout",
    ]
    (STATE / "turnserver.conf").write_text("\n".join(config) + "\n", encoding="ascii")
    (STATE / "turnserver.conf").chmod(0o600)


def start(args):
    native_linux()
    address = lan_address(args.lan_address)
    directory = game_directory(args.game_directory)
    devices = device_paths()
    count = check_engine()
    image = image_id(args.image, args.pull)
    gpu_check(image, devices)
    if args.command == "check":
        print(f"GPU rendering/NVENC capability and {count} engine checksums passed. No session started. 60 FPS acceptance is still pending.")
        return
    site_image = image_id(args.site_image, args.pull)
    turn_image = image_id(args.turn_image, args.pull)
    install_site_dependencies(site_image)
    (STATE / "friend").mkdir(parents=True, exist_ok=True)
    password = STATE / "password"
    if not password.exists():
        with password.open("x", encoding="ascii") as file:
            file.write("0000")
    elif password.read_text(encoding="ascii").strip() != "0000":
        password.write_text("0000", encoding="ascii")
    password.chmod(0o600)
    turn_secret = STATE / "turn-secret"
    if not turn_secret.exists():
        turn_secret.write_text(secrets.token_urlsafe(48), encoding="ascii")
    if len(turn_secret.read_text(encoding="ascii").strip()) < 32:
        raise RuntimeError("The private TURN secret is too short.")
    turn_secret.chmod(0o600)
    turn_config = STATE / "turnserver.conf"
    if not turn_config.exists():
        turn_config.write_text("listening-ip=127.0.0.1\n", encoding="ascii")
        turn_config.chmod(0o600)
    write_configuration(image, site_image, turn_image, directory, address, devices)
    compose(["config", "--quiet"])
    compose(["up", "-d", "friend", "site"])
    write_turn_configuration(address)
    compose(["up", "-d", "--force-recreate", "turn"])
    turn_id = compose(["ps", "-q", "turn"]).stdout.strip()
    if not turn_id or execute(["docker", "inspect", "--format", "{{.State.Running}}", turn_id]).stdout.strip() != "true":
        compose(["logs", "--tail", "40", "--no-color", "turn"], check=False)
        raise RuntimeError("The private TURN relay did not stay running; inspect the project turn service logs.")
    deadline = time.monotonic() + 60
    ready = False
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen("http://127.0.0.1:8098/network-config.json", timeout=2) as response:
                config = json.load(response)
                ready = config.get("runtime") == "3ccaa0e9-compiled-combined-v6" and any("turn:" in " ".join(server.get("urls", [])) for server in config.get("iceServers", []))
            if ready:
                break
        except (OSError, ValueError):
            pass
        time.sleep(1)
    if not ready:
        # Leave all profile data intact; stop only this project's services.
        compose(["stop", "--timeout", "20"], check=False)
        raise RuntimeError("The local game server did not become ready. Project services were stopped; inspect the logs with the status command.")
    (STATE / "connection.json").write_text(json.dumps({"host": "http://localhost:8098/", "friend": f"https://{address}:3001/", "username": "commander", "target": "720p60", "bitrate": "8Mbps", "acceptance": "pending"}, indent=2), encoding="utf-8")
    print(f"You: http://localhost:8098/\nFriend: https://{address}:3001/\nUsername: commander\nPrivate password file: {password}")
    print("Inside the streamed browser import /mnt/zero-hour. Set both game sessions to 1280 x 720 and join the same room.\nServices started; actual GPU game rendering, 60 FPS, Mac decoding and latency still need verification.")
    if not args.no_browser:
        webbrowser.open("http://localhost:8098/")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("check", "start", "stop", "status", "measure"))
    parser.add_argument("--game-directory")
    parser.add_argument("--lan-address")
    parser.add_argument("--image", default="lscr.io/linuxserver/chromium:latest")
    parser.add_argument("--site-image", default="node:22-bookworm-slim")
    parser.add_argument("--turn-image", default="ghcr.io/coturn/coturn:4.18.0-r0")
    parser.add_argument("--pull", action="store_true", help="Fetch required images if missing; downloaded IDs are then pinned")
    parser.add_argument("--no-browser", action="store_true")
    parser.add_argument("--seconds", type=int, default=60)
    args = parser.parse_args()
    try:
        if args.command in ("check", "start"):
            if not args.game_directory:
                parser.error("check/start requires --game-directory")
            start(args)
        else:
            native_linux()
            if not (STATE / "compose.env").exists() or not (STATE / "compose.linux.json").exists():
                print("No native Linux Zero Hour streaming session is configured.")
                return
            if args.command == "stop":
                compose(["stop", "--timeout", "20"])
                print("Only Zero Hour streaming was stopped. Profiles, game files and saves are retained.")
            elif args.command == "measure":
                if not 10 <= args.seconds <= 1800:
                    raise RuntimeError("Choose --seconds between 10 and 1800.")
                result = compose(["exec", "-T", "site", "node", "/app/tools/streaming/collect-performance.mjs", str(args.seconds)], capture=True, timeout=args.seconds + 45)
                report = json.loads(result.stdout)
                evidence = STATE / "friend-engine-performance.json"
                evidence.write_text(json.dumps(report, indent=2), encoding="utf-8")
                print(f"Friend engine presented FPS: {report['presentedEngineFps']:.1f}; hardware renderer: {report['hardwareRenderer']}; active multiplayer: {report['activeMultiplayer']}")
                print(f"Saved {evidence}. Stream FPS, Mac decoding and latency require separate measurements.")
            else:
                compose(["ps"])
                compose(["logs", "--tail", "60", "--no-color"])
    except (RuntimeError, OSError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
        print(f"Zero Hour streaming: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
