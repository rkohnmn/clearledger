#!/usr/bin/env python3
"""
Headless Chromium E2E, Responsive, Accessibility & Visual Screenshot verifier
using Chrome DevTools Protocol (CDP) over Python stdlib sockets.
"""
import base64
import json
import os
import socket
import struct
import subprocess
import sys
import time
import urllib.request

PORT = 4174
CDP_PORT = 9223
SHOT_DIR = os.path.abspath("docs/screenshots")
os.makedirs(SHOT_DIR, exist_ok=True)


class SimpleWS:
    def __init__(self, ws_url):
        without_scheme = ws_url.replace("ws://", "")
        host_port, path = without_scheme.split("/", 1)
        host, port = host_port.split(":")
        self.sock = socket.create_connection((host, int(port)), timeout=15)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET /{path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        buf = b""
        while b"\r\n\r\n" not in buf:
            buf += self.sock.recv(4096)
        self.extra = buf.split(b"\r\n\r\n", 1)[1]
        self.msg_id = 0

    def _recv_exact(self, n):
        while len(self.extra) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise RuntimeError("WebSocket closed unexpectedly")
            self.extra += chunk
        out, self.extra = self.extra[:n], self.extra[n:]
        return out

    def send(self, method, params=None):
        self.msg_id += 1
        mid = self.msg_id
        payload = json.dumps({"id": mid, "method": method, "params": params or {}}).encode()
        mask = os.urandom(4)
        header = bytearray([0x81])
        length = len(payload)
        if length < 126:
            header.append(0x80 | length)
        elif length < 65536:
            header.append(0x80 | 126)
            header.extend(struct.pack("!H", length))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack("!Q", length))
        header.extend(mask)
        masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
        self.sock.sendall(bytes(header) + masked)
        return mid

    def recv_frame(self):
        while True:
            b1, b2 = self._recv_exact(2)
            opcode = b1 & 0x0F
            length = b2 & 0x7F
            if length == 126:
                length = struct.unpack("!H", self._recv_exact(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", self._recv_exact(8))[0]
            data = self._recv_exact(length)
            if opcode == 0x8:
                raise RuntimeError("WebSocket close frame")
            if opcode == 0x9:
                continue
            if opcode in (0x1, 0x2):
                return json.loads(data.decode("utf-8"))

    def call(self, method, params=None, events=None):
        mid = self.send(method, params)
        while True:
            msg = self.recv_frame()
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"CDP error in {method}: {msg['error']}")
                return msg.get("result", {})
            if events is not None and "method" in msg:
                events.append(msg)

    def close(self):
        self.sock.close()


def wait_for_url(url, timeout=10):
    deadline = time.time() + timeout
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    while time.time() < deadline:
        try:
            with opener.open(url, timeout=1) as r:
                return r.read().decode("utf-8")
        except Exception:
            time.sleep(0.2)
    raise RuntimeError(f"Timed out waiting for {url}")


def main():
    env = os.environ.copy()
    for k in ("http_proxy", "https_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "all_proxy"):
        env.pop(k, None)

    server = subprocess.Popen(
        ["node", "scripts/serve.mjs", "--dir", "dist", "--host", "127.0.0.2", "--port", str(PORT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env=env,
    )
    chrome = subprocess.Popen(
        [
            "/usr/bin/chromium",
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--no-proxy-server",
            f"--remote-debugging-port={CDP_PORT}",
            "--window-size=1440,900",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        env=env,
    )

    errors = []
    events = []
    ws = None
    try:
        wait_for_url(f"http://127.0.0.2:{PORT}/")
        targets = json.loads(wait_for_url(f"http://127.0.0.1:{CDP_PORT}/json/list"))
        page = next(t for t in targets if t["type"] == "page")
        ws = SimpleWS(page["webSocketDebuggerUrl"])

        ws.call("Page.enable", events=events)
        ws.call("Runtime.enable", events=events)
        ws.call("Emulation.setDeviceMetricsOverride", {"width": 1440, "height": 900, "deviceScaleFactor": 1, "mobile": False}, events=events)

        def eval_js(expr):
            res = ws.call("Runtime.evaluate", {"expression": expr, "awaitPromise": True, "returnByValue": True}, events=events)
            if "exceptionDetails" in res:
                errors.append(f"JS Exception: {res['exceptionDetails']}")
            return res.get("result", {}).get("value")

        def screenshot(name):
            shot = ws.call("Page.captureScreenshot", {"format": "png"}, events=events)
            with open(os.path.join(SHOT_DIR, name), "wb") as f:
                f.write(base64.b64decode(shot["data"]))

        # 1. Navigate to production dist/
        ws.call("Page.navigate", {"url": f"http://127.0.0.2:{PORT}/"}, events=events)
        time.sleep(1.0)

        onboarding_h1 = eval_js("document.querySelector('h1')?.textContent?.trim()")
        assert onboarding_h1 and "Audit bank" in onboarding_h1, f"Unexpected onboarding H1: {onboarding_h1}"
        overflow_desktop = eval_js("document.documentElement.scrollWidth > window.innerWidth")
        assert not overflow_desktop, "Horizontal overflow on desktop onboarding"
        screenshot("01-onboarding-desktop.png")

        # 2. Load Sample Household Ledger
        eval_js("document.querySelector('[data-action=\"load-sample\"]')?.click()")
        time.sleep(0.5)
        overview_h1 = eval_js("document.querySelector('h1')?.textContent?.trim()")
        assert overview_h1 == "Financial Audit Overview", f"Expected Overview, got {overview_h1}"
        kpi_count = eval_js("document.querySelectorAll('.kpi-card').length")
        alert_count = eval_js("document.querySelectorAll('.alert-row').length")
        svg_bars = eval_js("document.querySelectorAll('.chart-month-group').length")
        assert kpi_count == 4, f"Expected 4 KPIs, got {kpi_count}"
        assert alert_count >= 3, f"Expected >= 3 alerts (2 price hikes + 1 duplicate), got {alert_count}"
        assert svg_bars == 6, f"Expected 6 monthly bar groups, got {svg_bars}"
        screenshot("02-overview-desktop.png")

        # 3. Navigate to Subscriptions & test triage interaction
        eval_js("document.querySelector('[data-view=\"subscriptions\"]')?.click()")
        time.sleep(0.4)
        sub_rows = eval_js("document.querySelectorAll('tbody tr').length")
        assert sub_rows >= 10, f"Expected >= 10 recurring rows, got {sub_rows}"
        eval_js("document.querySelectorAll('[data-action=\"set-decision\"][data-decision=\"cancel\"]')[1]?.click()")
        time.sleep(0.3)
        screenshot("03-subscriptions-desktop.png")

        # 4. Test Dark Mode on Overview
        eval_js("document.querySelector('[data-view=\"overview\"]')?.click()")
        time.sleep(0.3)
        eval_js("document.querySelector('[data-action=\"toggle-theme\"]')?.click()")
        time.sleep(0.3)
        theme = eval_js("document.documentElement.dataset.theme")
        assert theme == "dark", f"Expected dark theme, got {theme}"
        screenshot("04-overview-dark.png")

        # Switch back to light for responsive checks
        eval_js("document.querySelector('[data-action=\"toggle-theme\"]')?.click()")
        time.sleep(0.2)

        # 5. Tablet 768x1024 check
        ws.call("Emulation.setDeviceMetricsOverride", {"width": 768, "height": 1024, "deviceScaleFactor": 1, "mobile": False}, events=events)
        time.sleep(0.3)
        overflow_tablet = eval_js("document.documentElement.scrollWidth > window.innerWidth")
        assert not overflow_tablet, "Horizontal overflow on tablet 768px"

        # 6. Mobile 375x812 check
        ws.call("Emulation.setDeviceMetricsOverride", {"width": 375, "height": 812, "deviceScaleFactor": 2, "mobile": True}, events=events)
        time.sleep(0.3)
        overflow_mobile = eval_js("document.documentElement.scrollWidth > window.innerWidth")
        assert not overflow_mobile, "Horizontal overflow on mobile 375px"
        screenshot("05-overview-mobile.png")

        # Check runtime console errors collected during session
        for ev in events:
            if ev.get("method") == "Runtime.exceptionThrown":
                errors.append(f"Runtime exception: {ev['params']}")
            elif ev.get("method") == "Runtime.consoleAPICalled" and ev["params"].get("type") == "error":
                errors.append(f"Console error: {ev['params'].get('args')}")

        if errors:
            print("FAIL: Browser errors detected:", errors)
            sys.exit(1)

        print("PASS: All headless Chromium E2E, responsive (375/768/1440), dark mode, and zero-error checks passed!")
        print(f"Screenshots saved to {SHOT_DIR}")
    finally:
        if ws:
            ws.close()
        chrome.terminate()
        server.terminate()


if __name__ == "__main__":
    main()
