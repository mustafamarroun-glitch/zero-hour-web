"""Verify that the local Coturn service accepts the web app's short-lived credentials."""
import asyncio
import json
import urllib.request

from aiortc import RTCConfiguration, RTCIceServer, RTCPeerConnection, RTCSessionDescription


def relay_only(description):
    lines = []
    for line in description.sdp.splitlines():
        if line.startswith("a=candidate:") and " typ relay " not in f" {line} ":
            continue
        lines.append(line)
    return RTCSessionDescription(sdp="\r\n".join(lines) + "\r\n", type=description.type)


async def main():
    with urllib.request.urlopen("http://127.0.0.1:8098/network-config.json", timeout=3) as response:
        config = json.load(response)
    server = next((item for item in config.get("iceServers", []) if item.get("urls")), None)
    if not server or not server.get("username") or not server.get("credential"):
        raise RuntimeError("The game site did not provide temporary TURN credentials.")
    urls = server["urls"] if isinstance(server["urls"], list) else [server["urls"]]
    turn_url = next((url for url in urls if url.startswith("turn:127.0.0.1:")), None)
    if not turn_url:
        raise RuntimeError("The Docker browser does not have its loopback TURN URL.")

    ice_server = RTCIceServer(
        urls=turn_url, username=server["username"], credential=server["credential"],
    )
    first = RTCPeerConnection(RTCConfiguration(iceServers=[ice_server]))
    second = RTCPeerConnection(RTCConfiguration(iceServers=[ice_server]))
    opened = asyncio.Event()
    echoed = asyncio.Event()
    channel = first.createDataChannel("turn-health")

    @channel.on("open")
    def on_open():
        opened.set()
        channel.send("ping")

    @channel.on("message")
    def on_message(message):
        if message == "pong":
            echoed.set()

    @second.on("datachannel")
    def on_datachannel(remote):
        @remote.on("message")
        def reply(message):
            if message == "ping":
                remote.send("pong")

    try:
        await first.setLocalDescription(await first.createOffer())
        first_sdp = relay_only(first.localDescription)
        await second.setRemoteDescription(first_sdp)
        await second.setLocalDescription(await second.createAnswer())
        second_sdp = relay_only(second.localDescription)
        await first.setRemoteDescription(second_sdp)

        def relayed_ports(description):
            ports = []
            for line in description.sdp.splitlines():
                if line.startswith("a=candidate:"):
                    fields = line.split()
                    if len(fields) > 7 and fields[7] == "relay":
                        ports.append(int(fields[5]))
            return ports

        relay_ports = relayed_ports(first.localDescription) + relayed_ports(second.localDescription)
        if not relay_ports:
            raise RuntimeError("Coturn did not return a relayed ICE candidate.")
        if any(not 21000 <= port <= 21063 for port in relay_ports):
            raise RuntimeError("Coturn allocated a port outside the published UDP relay range.")
        await asyncio.wait_for(opened.wait(), timeout=20)
        await asyncio.wait_for(echoed.wait(), timeout=10)
        print(f"TURN data-channel passed: relay-only ICE connected and exchanged a message using {len(relay_ports)} allocated candidate(s).")
    finally:
        await first.close()
        await second.close()


asyncio.run(main())
