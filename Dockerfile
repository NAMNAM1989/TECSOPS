# TECSOPS — Node Ops only (Express + static + /api + socket.io).
# eSID / eCargo: Chrome Ext TCS + SCSC trên PC kho. Không Playwright/Python.
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# OCR Ext (common.onnx + ORT WASM) — lấy trước khi package ZIP.
COPY . .
RUN npm run ext:fetch-ocr && npm run build

ENV NODE_ENV=production

# PORT do Railway cấp; server bind 0.0.0.0:$PORT (mặc định 3001).
EXPOSE 3001

CMD ["node", "scripts/start-fullstack.mjs"]
