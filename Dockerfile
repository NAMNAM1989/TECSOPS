# TECSOPS all-in-one image cho Railway (online, không máy kho):
#   - Node server (Express + static + /api + socket.io + proxy /tcs-agent)
#   - Agent Playwright — Đăng Nhập TCS / Quét / Điền / PDF từ Ops qua /tcs-agent (Chrome on-demand)
# Mount volume: browser_profile_hub + browser_profile_tcs (+ output) để giữ session.
FROM mcr.microsoft.com/playwright/python:v1.49.1-jammy

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# Node 20 + fonts (PDF / Chromium)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends \
      nodejs \
      fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Node deps trước (tận dụng layer cache). npm ci giữ cả devDeps để build được (tsc/vite).
COPY package.json package-lock.json ./
RUN npm ci

# Python deps cho agent. Browsers đã có trong base image.
COPY tcs-awb-automation/requirements-server.txt tcs-awb-automation/requirements-server.txt
RUN pip install --no-cache-dir -r tcs-awb-automation/requirements-server.txt \
    && python -m playwright install chromium

# Source + build frontend.
# OCR Ext (common.onnx + ORT WASM) — lấy từ ddddocr/pip + onnxruntime-web trước khi package ZIP.
COPY . .
RUN npm run ext:fetch-ocr && npm run build

# API-first — Chrome chỉ mở khi user bấm Đăng Nhập TCS / Quét (hoặc POST /session/open).
# Dual :8766 chỉ khi Railway set TCS_AGENT_DUAL=1 (không tự bật vì có user/pass).
ENV NODE_ENV=production \
    TCS_MOCK=0 \
    TCS_HEADLESS=1 \
    TCS_AUTO_OPEN=0 \
    TCS_CAPTCHA_OCR=1 \
    TCS_PREFER_SESSION=1 \
    TCS_AGENT_DUAL=0 \
    TCS_AGENT_URL=http://127.0.0.1:8765 \
    TCS_AGENT_URL_TCS=http://127.0.0.1:8766 \
    TCS_AGENT_PROXY=1 \
    TCS_BROWSER_PROFILE=/app/tcs-awb-automation/browser_profile/hub \
    TCS_BROWSER_PROFILE_TCS=/app/tcs-awb-automation/browser_profile/tcs \
    TCS_OUTPUT_DIR=/app/tcs-awb-automation/browser_profile/output

# PORT do Railway cấp; server bind 0.0.0.0:$PORT (mặc định 3001).
EXPOSE 3001

CMD ["node", "scripts/start-fullstack.mjs"]
