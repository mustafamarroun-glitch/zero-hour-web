"""Print a quiet readiness status for the streamed Chromium debugging endpoint."""
import json
from urllib.request import urlopen


try:
    with urlopen("http://127.0.0.1:9222/json/version", timeout=1) as response:
        ready = bool(json.load(response).get("webSocketDebuggerUrl"))
except (OSError, ValueError):
    ready = False

print("ready" if ready else "wait")
