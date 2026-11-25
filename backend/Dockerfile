FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MALLOC_ARENA_MAX=2 \
    HF_HOME=/tmp/hf_cache \
    TORCH_HOME=/tmp/torch_cache \
    XDG_CACHE_HOME=/tmp/cache \
    AI_MOCK_MODE=false

# System dependencies untuk OpenCV, MediaPipe, LiteRT, dan pemrosesan audio (ffmpeg)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    ffmpeg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Non-root user agar aman di Koyeb / Render / Hugging Face Spaces
RUN useradd -m -u 1000 user
WORKDIR /app

# 1. Install PyTorch & Torchvision CPU-only terlebih dahulu (hindari wheel CUDA GPU yang berat)
# 2. Install sisa dependencies dari requirements.txt
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r /app/requirements.txt

# Salin kode aplikasi beserta seluruh file bobot model AI (.pth, .task, .jsonl)
COPY --chown=user:user app /app/app
COPY --chown=user:user models /app/models
COPY --chown=user:user migrations /app/migrations
COPY --chown=user:user seeds /app/seeds
COPY --chown=user:user scripts /app/scripts

RUN mkdir -p /tmp/hf_cache /tmp/torch_cache /tmp/cache && \
    chown -R user:user /app /tmp/hf_cache /tmp/torch_cache /tmp/cache

USER user

EXPOSE 8000

# Single worker + baca variabel PORT otomatis dari Koyeb / Render (fallback 8000)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
