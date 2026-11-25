from fastapi import APIRouter, Query
from fastapi.responses import HTMLResponse

router = APIRouter(tags=["Live Camera View"])

CAMERA_VIEW_HTML = """<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Isyarat Kita - Live Camera</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000000;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      user-select: none;
      -webkit-user-select: none;
    }
    #stage {
      position: relative;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: #000000;
      border: 3px solid rgba(255, 255, 255, 0.18);
      transition: border-color 120ms ease;
    }
    #stage.hand-detected {
      border-color: #22C55E;
      border-width: 4px;
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      background: #000000;
    }
    video.mirrored {
      transform: scaleX(-1);
    }
    canvas {
      display: none;
    }
    #error-box {
      position: absolute;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      padding: 20px;
      text-align: center;
      background: rgba(15, 23, 42, 0.92);
      color: #F8FAFC;
      font-size: 13px;
      line-height: 1.5;
    }
    #error-box.visible {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    #retry-btn {
      border: none;
      border-radius: 12px;
      background: #0D9488;
      color: #FFFFFF;
      font-weight: 700;
      padding: 10px 18px;
      font-size: 13px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="stage">
    <video id="video" autoplay playsinline muted></video>
    <canvas id="canvas"></canvas>
    <div id="error-box">
      <div id="error-msg">Tidak dapat mengakses kamera.</div>
      <button id="retry-btn" type="button">Coba Lagi</button>
    </div>
  </div>

  <script>
    (function () {
      const params = new URLSearchParams(window.location.search);
      const initialFacing = params.get("facing") === "environment" ? "environment" : "user";
      const initialActive = params.get("active") !== "0";

      const CAPTURE_INTERVAL_MS = 400;
      const JPEG_QUALITY = 0.7;

      const stage = document.getElementById("stage");
      const video = document.getElementById("video");
      const canvas = document.getElementById("canvas");
      const ctx = canvas.getContext("2d");
      const errorBox = document.getElementById("error-box");
      const errorMsg = document.getElementById("error-msg");
      const retryBtn = document.getElementById("retry-btn");

      let currentFacing = initialFacing;
      let isActive = initialActive;
      let inFlight = false;
      let currentStream = null;
      let loopTimer = null;

      function postToNative(payload) {
        try {
          if (window.ReactNativeWebView && typeof window.ReactNativeWebView.postMessage === "function") {
            window.ReactNativeWebView.postMessage(JSON.stringify(payload));
          }
        } catch (e) {}
      }

      function showError(msg) {
        errorMsg.textContent = msg;
        errorBox.classList.add("visible");
        postToNative({ type: "camera_error", message: msg });
      }

      function hideError() {
        errorBox.classList.remove("visible");
      }

      function stopStream() {
        if (currentStream) {
          currentStream.getTracks().forEach((t) => {
            try { t.stop(); } catch (e) {}
          });
          currentStream = null;
        }
      }

      async function startCamera(facing) {
        currentFacing = facing === "environment" ? "environment" : "user";
        hideError();
        stopStream();

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          const detail =
            "Origin tidak aman (isSecureContext=" +
            String(window.isSecureContext) +
            ", origin=" +
            window.location.origin +
            "). Gunakan HTTPS (Cloudflare Tunnel / ngrok / Hugging Face Spaces) agar getUserMedia diizinkan.";
          console.error("[CAMERA_VIEW] getUserMedia unavailable:", detail);
          showError(
            "Browser/WebView tidak mengizinkan getUserMedia pada origin ini (" +
              window.location.origin +
              "). Gunakan URL https:// agar kamera aktif."
          );
          return;
        }

        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: { ideal: currentFacing },
              width: { ideal: 640 },
              height: { ideal: 480 },
            },
          });
          currentStream = stream;
          video.srcObject = stream;
          if (currentFacing === "user") {
            video.classList.add("mirrored");
          } else {
            video.classList.remove("mirrored");
          }
          await video.play();
          postToNative({ type: "camera_ready", facing: currentFacing });
          scheduleNext(250);
        } catch (err) {
          const errName = (err && err.name) ? String(err.name) : "UnknownError";
          const errMessage = (err && err.message) ? String(err.message) : "Gagal membuka kamera.";
          console.error("[CAMERA_VIEW] getUserMedia error:", errName, errMessage, err);
          showError("Gagal membuka kamera [" + errName + "]: " + errMessage);
        }
      }

      function scheduleNext(delayMs) {
        if (loopTimer) clearTimeout(loopTimer);
        loopTimer = setTimeout(captureAndSend, delayMs);
      }

      async function captureAndSend() {
        if (!isActive || inFlight || !currentStream || video.readyState < 2) {
          if (!isActive) {
            stage.classList.remove("hand-detected");
          }
          scheduleNext(CAPTURE_INTERVAL_MS);
          return;
        }

        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        if (vw <= 0 || vh <= 0) {
          scheduleNext(CAPTURE_INTERVAL_MS);
          return;
        }

        const maxSide = 640;
        const scale = Math.min(1, maxSide / Math.max(vw, vh));
        canvas.width = Math.max(1, Math.round(vw * scale));
        canvas.height = Math.max(1, Math.round(vh * scale));
        ctx.save();
        if (currentFacing === "user") {
          // Identik 1:1 dengan Google Colab Testing_V_03_BISINDO.ipynb (mirror horizontal kamera depan)
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        inFlight = true;

        try {
          const resp = await fetch("/api/predict-sign", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ image_base64: dataUrl }),
          });
          if (!resp.ok) {
            throw new Error("HTTP " + resp.status);
          }
          const data = await resp.json();
          const handsCount = Number(data.hands_detected || (data.hand_found ? 1 : 0));
          if (isActive && handsCount > 0) {
            stage.classList.add("hand-detected");
          } else {
            stage.classList.remove("hand-detected");
          }
          postToNative({
            type: "prediction",
            detected: Boolean(data.detected),
            hand_found: Boolean(data.hand_found),
            hands_detected: handsCount,
            letter: data.letter || null,
            confidence: Number(data.confidence || 0),
            mode: data.mode || "model",
          });
        } catch (err) {
          stage.classList.remove("hand-detected");
          postToNative({
            type: "predict_error",
            message: (err && err.message) ? err.message : "Gagal memprediksi frame.",
          });
        } finally {
          inFlight = false;
          scheduleNext(CAPTURE_INTERVAL_MS);
        }
      }

      // Kontrol cepat dari React Native tanpa reload halaman
      window.setDetectionActive = function (active) {
        isActive = Boolean(active);
        if (!isActive) {
          stage.classList.remove("hand-detected");
        }
      };

      window.setCameraFacing = function (facing) {
        if (facing !== currentFacing) {
          startCamera(facing);
        }
      };

      retryBtn.addEventListener("click", function () {
        startCamera(currentFacing);
      });

      startCamera(currentFacing);
    })();
  </script>
</body>
</html>
"""


@router.get("/camera-view", response_class=HTMLResponse)
def camera_view(
    facing: str = Query(default="user", pattern="^(user|environment)$"),
) -> HTMLResponse:
    """Halaman live stream kamera HTML5 getUserMedia + <canvas> untuk WebView mobile & browser."""
    _ = facing
    return HTMLResponse(
        content=CAMERA_VIEW_HTML,
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate",
        },
    )
