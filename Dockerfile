# TECSOPS all-in-one image cho Railway:
#   - Node server (Express + static + /api + socket.io + proxy /tcs-agent + /tcs-desktop)
#   - Agent Playwright (Chromium headed trên Xvfb) + noVNC để thao tác TCS từ Ops
# Base image của Playwright đã có Chromium + OS deps.
FROM mcr.microsoft.com/playwright/python:v1.49.1-jammy

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# Node 20 + desktop ảo (Xvfb / VNC / noVNC) cho thao tác Chrome từ máy khác
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

ENV NODE_ENV=production \
    TCS_MOCK=0 \
    TCS_VNC=1 \
    TCS_HEADLESS=0 \
    DISPLAY=:99 \
    TCS_AUTO_OPEN=1 \
    TCS_CAPTCHA_OCR=1 \
    TCS_PREFER_SESSION=1 \
    TCS_AGENT_URL=http://127.0.0.1:8765 \
    TCS_AGENT_PROXY=1 \
    TCS_NOVNC_PORT=6080 \
    TCS_VNC_PORT=5900

# PORT do Railway cấp; server bind 0.0.0.0:$PORT (mặc định 3001).
# noVNC chỉ listen 127.0.0.1:6080 — truy cập qua /tcs-desktop.
EXPOSE 3001

CMD ["node", "scripts/start-fullstack.mjs"]
