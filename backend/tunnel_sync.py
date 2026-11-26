import json
import re
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

RENDER_UPDATE_URL = "https://isyarat-kita.onrender.com/update-url"
SECRET_KEY = "isyarat-kita-rahasia"
LOCAL_BACKEND_URL = "http://127.0.0.1:8000"
KEEP_ALIVE_INTERVAL_SEC = 600  # 10 menit
HTTP_TIMEOUT_SEC = 60

URL_PATTERN = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")

current_url: str | None = None
url_lock = threading.Lock()


def send_to_render(url: str, reason: str = "sync") -> bool:
    payload = json.dumps({"url": url, "secret": SECRET_KEY}).encode("utf-8")
    req = urllib.request.Request(
        RENDER_UPDATE_URL,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "IsyaratKita-TunnelSync/1.0",
        },
        method="POST",
    )
    try:
        print(
            f"[SYNC] Mengirim URL ({reason}) ke {RENDER_UPDATE_URL} -> {url} ...",
            flush=True,
        )
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT_SEC) as res:
            body = res.read().decode("utf-8", errors="replace").strip()
            print(
                f"[SYNC] Berhasil kirim ke Render (HTTP {res.status}): {url} | {body}",
                flush=True,
            )
            return True
    except urllib.error.HTTPError as exc:
        err_body = exc.read().decode("utf-8", errors="replace").strip()
        print(
            f"[SYNC ERROR] HTTP {exc.code} saat kirim ke Render: {err_body or exc.reason}",
            flush=True,
        )
    except Exception as exc:
        print(f"[SYNC ERROR] Gagal kirim ke Render: {exc}", flush=True)
    return False


def keep_alive_loop() -> None:
    while True:
        time.sleep(KEEP_ALIVE_INTERVAL_SEC)
        with url_lock:
            active_url = current_url
        if active_url:
            send_to_render(active_url, reason="keep-alive 10m")


def main() -> int:
    global current_url

    print(
        f"[SYNC] Memulai Cloudflare Tunnel -> {LOCAL_BACKEND_URL} (Render Router: {RENDER_UPDATE_URL})",
        flush=True,
    )
    cmd = [
        "cloudflared",
        "tunnel",
        "--config",
        "NUL",
        "--url",
        LOCAL_BACKEND_URL,
    ]

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
        )
    except FileNotFoundError:
        print(
            "[SYNC ERROR] Perintah 'cloudflared' tidak ditemukan di PATH. "
            "Pastikan cloudflared sudah terinstal.",
            flush=True,
        )
        return 1

    threading.Thread(target=keep_alive_loop, daemon=True).start()

    try:
        assert process.stdout is not None
        for line in process.stdout:
            print(line, end="", flush=True)
            match = URL_PATTERN.search(line)
            if match:
                found_url = match.group(0).rstrip("/")
                with url_lock:
                    is_new = found_url != current_url
                    if is_new:
                        current_url = found_url
                if is_new:
                    print(f"\n>>> TUNNEL DITEMUKAN: {found_url} <<<\n", flush=True)
                    ok = send_to_render(found_url, reason="initial")
                    if not ok:
                        print(
                            "[SYNC] Mencoba ulang kirim ke Render dalam 5 detik...",
                            flush=True,
                        )
                        time.sleep(5)
                        send_to_render(found_url, reason="retry")
    except KeyboardInterrupt:
        print("\n[SYNC] Dihentikan oleh pengguna. Menutup cloudflared...", flush=True)
        process.terminate()
    finally:
        try:
            process.wait(timeout=5)
        except Exception:
            process.kill()

    return process.returncode or 0


if __name__ == "__main__":
    sys.exit(main())
