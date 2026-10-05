"""Exercise the actual Chromium graphics path in an independent X11 display."""
import html
import asyncio
import aiohttp
import json
import os
import re
import subprocess
import sys
import time

display = subprocess.Popen(['Xvfb', ':97', '-screen', '0', '1920x1080x24', '-nolisten', 'tcp'], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
try:
    time.sleep(1)
    env = dict(os.environ, DISPLAY=':97')
    command = ['chromium', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check', '--user-data-dir=/tmp/zh-probe-chrome', '--use-gl=angle', '--use-angle=gl-egl', '--ignore-gpu-blocklist', '--disable-software-rasterizer', '--remote-debugging-port=9222', '--remote-debugging-address=127.0.0.1', 'file:///probe/webgl-probe.html']
    log = open('/tmp/zh-probe-chrome.log', 'w+')
    browser = subprocess.Popen(command, env=env, stdout=log, stderr=log)
    async def collect():
        async with aiohttp.ClientSession() as session:
            for _ in range(100):
                try:
                    async with session.get('http://127.0.0.1:9222/json/list') as response:
                        targets = await response.json()
                    target = next(t for t in targets if t['type'] == 'page')
                    async with session.ws_connect(target['webSocketDebuggerUrl']) as ws:
                        await ws.send_json({'id':1,'method':'Runtime.evaluate','params':{'expression':'document.querySelector("#result")?.textContent','returnByValue':True}})
                        async for answer in ws:
                            value = json.loads(answer.data)
                            if value.get('id') == 1:
                                text = value.get('result',{}).get('result',{}).get('value')
                                if text:
                                    return json.loads(text)
                                break
                except (aiohttp.ClientError, StopIteration, KeyError):
                    pass
                await asyncio.sleep(.1)
        raise RuntimeError('Chromium did not return graphics results')
    try:
        report = asyncio.run(collect())
    finally:
        browser.terminate()
        browser.wait(timeout=5)
        log.seek(0)
    report['display'] = 'Independent headed Chromium in Xvfb, matching the friend session'
    report['diagnostics'] = log.read()[-4000:]
    print(json.dumps(report, indent=2))
    sys.exit(0 if report['passed'] else 2)
finally:
    display.terminate()
    display.wait(timeout=5)
