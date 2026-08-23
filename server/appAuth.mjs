import crypto from "node:crypto";

const COOKIE_NAME = "tecsops_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;

function parseCookies(raw) {
  const out = {};
  for (const part of String(raw || "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function bearerToken(header) {
  const match = /^Bearer\s+(.+)$/i.exec(String(header || "").trim());
  return match?.[1]?.trim() || "";
}

export function createAppAuth({
  token = process.env.TECSOPS_APP_TOKEN?.trim() || "",
  isProduction = process.env.NODE_ENV === "production",
  cookieSecure =
    process.env.TECSOPS_COOKIE_SECURE === "0" ? false : isProduction,
  /** Cho phép khởi động production khi chưa có token (hoặc môi trường non-prod). */
  allowUnauthenticated =
    process.env.TECSOPS_ALLOW_UNAUTHENTICATED === "1" || !isProduction,
  /**
   * Tắt hẳn gate login (site thử nghiệm). Chỉ bật bằng
   * TECSOPS_ALLOW_UNAUTHENTICATED=1 — giữ TECSOPS_APP_TOKEN để bật lại dễ.
   */
  disableLoginGate = process.env.TECSOPS_ALLOW_UNAUTHENTICATED === "1",
} = {}) {
  if (token && token.length < 24) {
    throw new Error("TECSOPS_APP_TOKEN phải dài tối thiểu 24 ký tự.");
  }
  if (isProduction && !token && !allowUnauthenticated) {
    throw new Error(
      "Production bắt buộc TECSOPS_APP_TOKEN; chỉ bypass tạm bằng TECSOPS_ALLOW_UNAUTHENTICATED=1.",
    );
  }

  const required = Boolean(token) && !disableLoginGate;
  const sessionValue = required ? digest(`tecsops-session-v1:${token}`) : "";

  function tokenFromRequest(req) {
    return (
      bearerToken(req.get?.("authorization")) ||
      String(req.get?.("x-tecsops-token") || "").trim()
    );
  }

  function sessionFromRequest(req) {
    return String(req.get?.("x-tecsops-session") || "").trim();
  }

  function isAuthenticatedRequest(req) {
    if (!required) return true;
    const direct = tokenFromRequest(req);
    if (direct && safeEqual(direct, token)) return true;
    const sessionHeader = sessionFromRequest(req);
    if (sessionValue && sessionHeader && safeEqual(sessionHeader, sessionValue)) {
      return true;
    }
    const cookies = parseCookies(req.headers?.cookie);
    return Boolean(cookies[COOKIE_NAME] && safeEqual(cookies[COOKIE_NAME], sessionValue));
  }

  function requireAuth(req, res, next) {
    if (isAuthenticatedRequest(req)) {
      next();
      return;
    }
    res.status(401).json({
      error: "Phiên TECSOPS chưa được xác thực.",
      code: "AUTH_REQUIRED",
    });
  }

  function socketMiddleware(socket, next) {
    if (!required) {
      next();
      return;
    }
    const request = socket.request || {};
    const cookies = parseCookies(request.headers?.cookie);
    const handshakeToken = String(socket.handshake?.auth?.token || "").trim();
    if (
      (cookies[COOKIE_NAME] && safeEqual(cookies[COOKIE_NAME], sessionValue)) ||
      (handshakeToken && safeEqual(handshakeToken, token))
    ) {
      next();
      return;
    }
    next(new Error("AUTH_REQUIRED"));
  }

  function registerRoutes(app) {
    app.get("/api/auth/status", (req, res) => {
      res.json({
        ok: true,
        required,
        authenticated: isAuthenticatedRequest(req),
        allowUnauthenticated: !required,
      });
    });

    app.post("/api/auth/login", (req, res) => {
      if (!required) {
        res.json({ ok: true, required: false, authenticated: true });
        return;
      }
      const supplied = String(req.body?.token || "").trim();
      if (!supplied || !safeEqual(supplied, token)) {
        res.status(401).json({
          error: "Mã truy cập không đúng.",
          code: "AUTH_INVALID",
        });
        return;
      }
      const cookie = [
        `${COOKIE_NAME}=${encodeURIComponent(sessionValue)}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Strict",
        `Max-Age=${SESSION_TTL_SECONDS}`,
        ...(cookieSecure ? ["Secure"] : []),
      ].join("; ");
      res.setHeader("Set-Cookie", cookie);
      res.json({ ok: true, required: true, authenticated: true });
    });

    /**
     * Phiên cho Chrome Ext (background không gửi cookie SameSite).
     * Chỉ trả session digest khi đã đăng nhập — Ext gửi lại `x-tecsops-session`.
     */
    app.get("/api/auth/bridge", (req, res) => {
      if (!required) {
        res.json({ ok: true, required: false, session: "" });
        return;
      }
      if (!isAuthenticatedRequest(req)) {
        res.status(401).json({
          error: "Phiên TECSOPS chưa được xác thực.",
          code: "AUTH_REQUIRED",
        });
        return;
      }
      res.json({ ok: true, required: true, session: sessionValue });
    });

    app.post("/api/auth/logout", (_req, res) => {
      res.setHeader(
        "Set-Cookie",
        `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${
          cookieSecure ? "; Secure" : ""
        }`,
      );
      res.json({ ok: true });
    });
  }

  return {
    required,
    isAuthenticatedRequest,
    requireAuth,
    socketMiddleware,
    registerRoutes,
  };
}
