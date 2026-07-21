# TECSOPS all-in-one image cho Railway:
#   - Node server (Express + static + /api + socket.io + proxy /tcs-agent)
#   - Agent Playwright headless (mặc định) — nhập liệu API-first từ Ops
#   - noVNC tùy chọn: set TCS_VNC=1 để /tcs-desktop (sửa tay, chậm hơn)
FROM mcr.microsoft.com/playwright/python:v1.49.1-jammy

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# Node 20 + gói desktop ảo (chỉ dùng khi TCS_VNC=1)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends \
      nodejs \
      xvfb \
      fluxbox \
      x11vnc \
      novnc \
      websockify \
      fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Node deps trước (tận dụng layer cache). npm ci giữ cả devDeps để build được (tsc/vite).
COPY package.json package-lock.json ./
RUN npm ci

# Python deps cho agent. Browsers đã có trong base image.
COPY tcs-awb-automation/requirements-server.txt tcs-awb-automation/requirements-server.txt
RUN pip install --no-cache-dir -r tcs-awb-automation/requirements-server.txt \
    && python -m playwright install chromium

# Source + build frontend
COPY . .
RUN npm run build

# API-first: headless nhanh. Bật desktop: TCS_VNC=1 TCS_HEADLESS=0 DISPLAY=:99
ENV NODE_ENV=production \
    TCS_MOCK=0 \
    TCS_VNC=0 \
    TCS_HEADLESS=1 \
    TCS_AUTO_OPEN=1 \
    TCS_CAPTCHA_OCR=1 \
    TCS_PREFER_SESSION=1 \
    TCS_AGENT_URL=http://127.0.0.1:8765 \
    TCS_AGENT_PROXY=1 \
    TCS_NOVNC_PORT=6080 \
    TCS_VNC_PORT=5900

# PORT do Railway cấp; server bind 0.0.0.0:$PORT (mặc định 3001).
# noVNC (nếu bật) chỉ listen 127.0.0.1:6080 — truy cập qua /tcs-desktop.
EXPOSE 3001

CMD ["node", "scripts/start-fullstack.mjs"]
