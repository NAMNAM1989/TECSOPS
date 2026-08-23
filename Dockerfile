# TECSOPS — Node Ops runtime (Express + static + /api + socket.io).
# eSID / eCargo: Chrome Ext TCS + SCSC trên PC kho.
# Python CHỈ ở stage OCR (lấy common.onnx từ wheel ddddocr) — không Playwright,
# không dual-agent, không TCS_AGENT_* spawn.
#
# Railway: builder=DOCKERFILE. Rebuild: merge main → Railway redeploy image này.
# Docs: docs/railway-online-portal.md

# ---------------------------------------------------------------------------
# 1) OCR model — pip download wheel, extract common.onnx (~54MB, gitignored)
# ---------------------------------------------------------------------------
FROM python:3.12-slim-bookworm AS ocr

WORKDIR /ocr
COPY scripts/extract-ddddocr-onnx.py /tmp/extract-ddddocr-onnx.py
# Pin khớp requirements-server.txt cũ (A2) + charsets.json trong repo.
ARG DDDDOCR_VERSION=1.5.6
RUN pip download "ddddocr==${DDDDOCR_VERSION}" --no-deps -d /tmp/wheels \
    && python /tmp/extract-ddddocr-onnx.py /tmp/wheels /ocr/common.onnx

# ---------------------------------------------------------------------------
# 2) Build frontend + đóng gói Ext ZIP (có OCR)
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
COPY --from=ocr /ocr/common.onnx /app/chrome-extension-tcs/ocr/common.onnx

# fetch-ocr: skip python vì đã có onnx; copy ORT WASM từ onnxruntime-web.
# prebuild (trong npm run build) đóng gói ZIP TCS+SCSC vào public/downloads.
ENV EXT_OCR_REQUIRED=1
RUN npm run ext:fetch-ocr && npm run build

# ---------------------------------------------------------------------------
# 3) Runtime slim — chỉ Node + artifact cần chạy
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/chrome-extension-tcs/manifest.json ./chrome-extension-tcs/manifest.json
COPY --from=builder /app/chrome-extension-scsc/manifest.json ./chrome-extension-scsc/manifest.json
COPY --from=builder /app/railway.toml ./railway.toml
COPY --from=builder /app/nixpacks.toml ./nixpacks.toml

# PORT do Railway cấp; server bind 0.0.0.0:$PORT (mặc định 3001).
EXPOSE 3001

CMD ["node", "scripts/start-fullstack.mjs"]
