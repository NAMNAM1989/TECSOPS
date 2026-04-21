import crypto from "node:crypto";

const COOKIE_NAME = "tecsops_gate";

/** Mật khẩu truy cập trang (đặt trên Railway / .env). Để trống = tắt cổng. */
export function getSitePassword() {
  return (process.env.TECSOPS_ACCESS_PASSWORD ?? "").trim();
}

function sessionSecret() {
  const pass = getSitePassword();
  const extra = (process.env.TECSOPS_SESSION_SECRET ?? "").trim();
  if (extra) return extra;
  if (pass) return crypto.createHash("sha256").update(`${pass}|tecsops-site-pepper-v1`).digest("hex");
  return "tecsops-no-password-mode";
}

export function expectedGateCookieValue() {
  return crypto.createHmac("sha256", sessionSecret()).update("site-grant-v1").digest("base64url");
}

export function parseCookies(cookieHeader) {
  const out = Object.create(null);
  if (!cookieHeader || typeof cookieHeader !== "string") return out;
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

export function isGateCookieOk(req) {
  const cookies = parseCookies(req.headers?.cookie ?? "");
  return cookies[COOKIE_NAME] === expectedGateCookieValue();
}

/** So sánh chuỗi không phụ thuộc thời gian chạy theo độ dài (tránh timing leak độ dài). */
function timingSafeEqualUtf8(a, b) {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

const isProduction = process.env.NODE_ENV === "production";

/**
 * Đăng ký middleware + route đăng nhập khi có `TECSOPS_ACCESS_PASSWORD`.
 * Gọi ngay sau `express.json()`, trước các route `/api/*` khác.
 */
export function registerSitePasswordGate(app) {
  const pass = getSitePassword();
  if (!pass) {
    return { enabled: false };
  }

  console.info("[auth] Đã bật TECSOPS_ACCESS_PASSWORD — trang yêu cầu đăng nhập; GET /api/health vẫn không cần cookie.");

  app.post("/api/login", (req, res) => {
    const body = req.body;
    const pw = typeof body?.password === "string" ? body.password : "";
    if (!timingSafeEqualUtf8(pw, pass)) {
      return res.status(401).json({ error: "Sai mật khẩu", needLogin: true });
    }
    res.cookie(COOKIE_NAME, expectedGateCookieValue(), {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    return res.json({ ok: true });
  });

  app.post("/api/logout", (_req, res) => {
    res.clearCookie(COOKIE_NAME, {
      path: "/",
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
    });
    return res.json({ ok: true });
  });

  app.use((req, res, next) => {
    const p = req.path || "";
    if (!p.startsWith("/api")) return next();
    if (p === "/api/health" || p.startsWith("/api/health/")) return next();
    if (p === "/api/auth/gate" && req.method === "GET") return next();
    if (p === "/api/login" && req.method === "POST") return next();
    if (p === "/api/logout" && req.method === "POST") return next();
    if (!isGateCookieOk(req)) {
      return res.status(401).json({ error: "Unauthorized", needLogin: true });
    }
    return next();
  });

  return { enabled: true };
}

/** Cho Socket.IO: kiểm tra cookie trên handshake. */
export function assertSocketGateOk(socket) {
  const pass = getSitePassword();
  if (!pass) return;
  const raw = socket.request.headers?.cookie ?? "";
  const fake = { headers: { cookie: raw } };
  if (!isGateCookieOk(fake)) {
    const err = new Error("Unauthorized");
    err.data = { needLogin: true };
    throw err;
  }
}
