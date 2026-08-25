/**
 * Offscreen CAPTCHA OCR (ddddocr common.onnx + ONNX Runtime Web).
 * Background gửi { type: "OCR_SOLVE", dataUrl, expectedLength?, minConfidence? }.
 */
(() => {
  const TARGET_HEIGHT = 64;
  const CHARSET_URL = chrome.runtime.getURL("ocr/charsets.json");
  const MODEL_URL = chrome.runtime.getURL("ocr/common.onnx");
  const WASM_PATH = chrome.runtime.getURL("ocr/");

  let session = null;
  let charsets = [];
  let initPromise = null;

  function toGrayscale(rgba) {
    const gray = new Uint8ClampedArray(rgba.length / 4);
    for (let i = 0; i < rgba.length; i += 4) {
      const a = rgba[i + 3] / 255;
      const r = rgba[i] * a + 255 * (1 - a);
      const g = rgba[i + 1] * a + 255 * (1 - a);
      const b = rgba[i + 2] * a + 255 * (1 - a);
      gray[i / 4] = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }
    return gray;
  }

  function resizeGray(data, width, height, newWidth, newHeight) {
    const result = new Uint8ClampedArray(newWidth * newHeight);
    const xRatio = width / newWidth;
    const yRatio = height / newHeight;
    for (let y = 0; y < newHeight; y += 1) {
      for (let x = 0; x < newWidth; x += 1) {
        const px = x * xRatio;
        const py = y * yRatio;
        const x1 = Math.floor(px);
        const x2 = Math.min(x1 + 1, width - 1);
        const y1 = Math.floor(py);
        const y2 = Math.min(y1 + 1, height - 1);
        const fx = px - x1;
        const fy = py - y1;
        const v1 = data[y1 * width + x1];
        const v2 = data[y1 * width + x2];
        const v3 = data[y2 * width + x1];
        const v4 = data[y2 * width + x2];
        result[y * newWidth + x] = Math.round(
          v1 * (1 - fx) * (1 - fy) +
            v2 * fx * (1 - fy) +
            v3 * (1 - fx) * fy +
            v4 * fx * fy
        );
      }
    }
    return result;
  }

  async function loadGrayFromDataUrl(dataUrl, scale = 1) {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const imageData = ctx.getImageData(0, 0, w, h);
    return {
      data: toGrayscale(imageData.data),
      width: w,
      height: h,
    };
  }

  function normalizeCaptcha(raw) {
    return String(raw || "")
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase();
  }

  function decodeOutput(output) {
    const data = output.data;
    const indices = [];
    for (let i = 0; i < data.length; i += 1) {
      const value = data[i];
      if (typeof value === "bigint") indices.push(Number(value));
      else if (typeof value === "number") indices.push(Math.round(value));
      else indices.push(0);
    }
    const result = [];
    let prev = -1;
    for (const idx of indices) {
      if (idx === prev) continue;
      prev = idx;
      if (idx <= 0 || idx >= charsets.length) continue;
      const ch = charsets[idx];
      if (ch) result.push(ch);
    }
    return normalizeCaptcha(result.join(""));
  }

  async function ensureSession() {
    if (session) return session;
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (typeof ort === "undefined") {
        throw new Error("ONNX Runtime chưa tải (ort.min.js)");
      }
      ort.env.wasm.wasmPaths = WASM_PATH;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.simd = true;
      ort.env.logLevel = "error";

      const [charsetRes, modelBuf] = await Promise.all([
        fetch(CHARSET_URL).then((r) => {
          if (!r.ok) throw new Error(`Không đọc được charsets.json (${r.status})`);
          return r.json();
        }),
        fetch(MODEL_URL).then((r) => {
          if (!r.ok) throw new Error(`Không đọc được common.onnx (${r.status})`);
          return r.arrayBuffer();
        }),
      ]);
      charsets = Array.isArray(charsetRes) ? charsetRes : charsetRes.charset || [];
      if (!charsets.length) throw new Error("charsets.json rỗng");

      session = await ort.InferenceSession.create(modelBuf, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      return session;
    })().catch((err) => {
      initPromise = null;
      session = null;
      throw err;
    });
    return initPromise;
  }

  async function classifyGray(gray) {
    await ensureSession();
    const { data, width, height } = gray;
    let targetWidth = Math.floor(width * (TARGET_HEIGHT / height));
    if (targetWidth < 1) targetWidth = 1;
    const resized = resizeGray(data, width, height, targetWidth, TARGET_HEIGHT);
    const normalized = new Float32Array(resized.length);
    for (let i = 0; i < resized.length; i += 1) {
      normalized[i] = resized[i] / 255;
    }
    const tensor = new ort.Tensor("float32", normalized, [
      1,
      1,
      TARGET_HEIGHT,
      targetWidth,
    ]);
    const results = await session.run({ input1: tensor });
    const output = results.output || results[Object.keys(results)[0]];
    return decodeOutput(output);
  }

  async function solve(dataUrl, opts = {}) {
    const expectedLength = Number(opts.expectedLength ?? 5);
    const minConfidence = Number(opts.minConfidence ?? 0.4);
    if (!dataUrl) {
      return { ok: false, error: "CAPTCHA_IMAGE_EMPTY", text: "", confidence: 0, candidates: [] };
    }

    const scales = [1, 2, 1.5];
    const readings = [];
    for (const scale of scales) {
      try {
        const gray = await loadGrayFromDataUrl(dataUrl, scale);
        const text = await classifyGray(gray);
        if (text) readings.push(text);
      } catch (err) {
        console.warn("[tecsops-ocr] variant fail", scale, err);
      }
    }

    if (!readings.length) {
      return { ok: false, error: "OCR_EMPTY", text: "", confidence: 0, candidates: [] };
    }

    const tally = new Map();
    for (const text of readings) {
      tally.set(text, (tally.get(text) || 0) + 1);
    }
    const candidates = [...tally.entries()]
      .map(([text, votes]) => ({ text, votes }))
      .sort((a, b) => b.votes - a.votes || a.text.localeCompare(b.text));

    const exact = candidates.filter((c) => c.text.length === expectedLength);
    const best = exact[0] || candidates[0];
    const confidence = best.votes / readings.length;
    const accepted =
      best.text.length === expectedLength && confidence >= minConfidence;

    return {
      ok: accepted,
      error: accepted ? "" : "OCR_LOW_CONFIDENCE",
      text: best.text,
      confidence,
      candidates,
      samples: readings.length,
      source: "extension-onnx",
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== "OCR_SOLVE") return false;
    solve(msg.dataUrl, {
      expectedLength: msg.expectedLength,
      minConfidence: msg.minConfidence,
    })
      .then(sendResponse)
      .catch((err) =>
        sendResponse({
          ok: false,
          error: "OCR_EXT_FAILED",
          text: "",
          confidence: 0,
          candidates: [],
          message: String(err?.message || err),
        })
      );
    return true;
  });

  console.info("[tecsops-ocr] offscreen ready");
})();
