"""Read-only probe using the installed Codex app-server. Run inside the project."""
import json
import base64
from pathlib import Path
from queue import Queue
import shutil
import subprocess
import sys
from threading import Thread
import time

ROOT = Path(__file__).resolve().parents[1]


def main():
    args = [shutil.which("codex") or "codex", "app-server", "--stdio"]
    with (ROOT / "local/codex-check.stderr.log").open("w", encoding="utf-8") as log:
        proc = subprocess.Popen(args, cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=log, encoding="utf-8", bufsize=1)
        events = Queue()
        def read():
            for line in proc.stdout:
                events.put(json.loads(line))
            events.put(None)
        Thread(target=read, daemon=True).start()
        def request(method, params, ident):
            payload = {"method": method, "params": params}
            if ident is not None:
                payload["id"] = ident
            proc.stdin.write(json.dumps(payload) + "\n")
            proc.stdin.flush()
            if ident is None:
                return
            end = time.monotonic() + 120
            while time.monotonic() < end:
                response = events.get(timeout=max(0.1, end-time.monotonic()))
                if response is None:
                    raise RuntimeError("Codex closed. See local/codex-check.stderr.log.")
                if response.get("id") == ident and "method" not in response:
                    if "error" in response:
                        raise RuntimeError(response["error"])
                    return response["result"]
            raise TimeoutError(method)
        try:
            request("initialize", {"clientInfo": {"name":"worldstudio-check","version":"1"},
                                   "capabilities":{"experimentalApi":True}}, 1)
            request("initialized", {}, None)
            thread = request("thread/start", {"cwd":str(ROOT),"ephemeral":True}, 2)["thread"]["id"]
            status = request("mcpServerStatus/list", {"threadId":thread,"serverName":"worldstudio"}, 3)
            tools = next((s["tools"] for s in status["data"] if s["name"] == "worldstudio"), {})
            if not tools:
                raise RuntimeError("Codex did not discover World Studio tools")
            def call(name, arguments, ident):
                return request("mcpServer/tool/call", {"threadId":thread,"server":"worldstudio",
                               "tool":name,"arguments":arguments}, ident)
            result = call("get_status", {}, 4)
            summary = {"client":"Codex app-server", "count":len(tools), "tools":sorted(tools),
                       "get_status":result.get("structuredContent", result.get("content"))}
            if not result.get("isError") and "--capture" in sys.argv:
                self = call("get_self", {}, 5)["structuredContent"]
                summary["observer"] = {k:self[k] for k in ["x","y","z","yaw","pitch","dimension","gameMode"]}
                shot = call("screenshot", {}, 6)
                image = next(c for c in shot["content"] if c["type"] == "image")
                raw = base64.b64decode(image["data"], validate=True)
                assert raw.startswith(b"\x89PNG\r\n\x1a\n")
                outfile = ROOT / "local/codex-frame.png"
                outfile.write_bytes(raw)
                summary["image"] = {"bytes":len(raw), "width":int.from_bytes(raw[16:20],"big"),
                                    "height":int.from_bytes(raw[20:24],"big")}
            print(json.dumps(summary, indent=2))
            return int(bool(result.get("isError")))
        finally:
            proc.stdin.close()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.terminate()
                proc.wait(timeout=10)

if __name__ == "__main__":
    sys.exit(main())
