# TECSOPS all-in-one image cho Railway:
#   - Node server (Express + static + /api + socket.io + proxy /tcs-agent)
#   - Agent Playwright (Python, Chromium headless) — login TCS + PDF ESID
# Base image của Playwright đã có Chromium + mọi OS deps sẵn.
FROM mcr.microsoft.com/playwright/python:v1.49.1-jammy

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

# Node 20 (base image chỉ có Python)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Node deps trước (tận dụng layer cache). npm ci giữ cả devDeps để build được (tsc/vite).
COPY package.json package-lock.json ./
RUN npm ci

# Python deps cho agent (headless, không PySide6). Browsers đã có trong base image.
COPY tcs-awb-automation/requirements-server.txt tcs-awb-automation/requirements-server.txt
RUN pip install --no-cache-dir -r tcs-awb-automation/requirements-server.txt \
    && python -m playwright install chromium

# Source + build frontend
COPY . .
RUN npm run build

ENV NODE_ENV=production \
    TCS_MOCK=0 \
    TCS_HEADLESS=1 \
    TCS_AUTO_OPEN=1 \
    TCS_CAPTCHA_OCR=1 \
    TCS_PREFER_SESSION=1 \
    TCS_AGENT_URL=http://127.0.0.1:8765 \
    TCS_AGENT_PROXY=1

# PORT do Railway cấp; server bind 0.0.0.0:$PORT (mặc định 3001).
EXPOSE 3001

CMD ["node", "scripts/start-fullstack.mjs"]
