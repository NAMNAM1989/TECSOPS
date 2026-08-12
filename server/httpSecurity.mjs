const DEFAULT_MUTATION_RATE_LIMIT_MAX = 300;
const DEFAULT_MUTATION_RATE_LIMIT_WINDOW_MS = 60_000;

function positiveInteger(raw, fallback) {
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function applySecurityHeaders({ isProduction = false } = {}) {
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' ws: wss:",
    "frame-src 'self' blob:",
  ].join("; ");

  return (_req, res, next) => {
    res.setHeader("Content-Security-Policy", contentSecurityPolicy);
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (isProduction) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  };
}

export function createRateLimit({
  max = 60,
  windowMs = 60_000,
  now = () => Date.now(),
  error = "Quá nhiều yêu cầu. Vui lòng thử lại sau.",
  code = "RATE_LIMITED",
} = {}) {
  const buckets = new Map();
  let requestsSinceSweep = 0;

  return (req, res, next) => {
    const timestamp = now();
    const key = String(req.ip || req.socket?.remoteAddress || "unknown");
    let bucket = buckets.get(key);
    if (!bucket || timestamp >= bucket.resetAt) {
      bucket = { count: 0, resetAt: timestamp + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    requestsSinceSweep += 1;
    if (requestsSinceSweep >= 1000) {
      requestsSinceSweep = 0;
      for (const [bucketKey, value] of buckets) {
        if (timestamp >= value.resetAt) buckets.delete(bucketKey);
      }
    }

    if (bucket.count > max) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((bucket.resetAt - timestamp) / 1000),
      );
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        error,
        code,
      });
      return;
    }
    next();
  };
}

export function createMutationRateLimit({
  max = positiveInteger(
    process.env.MUTATION_RATE_LIMIT_MAX,
    DEFAULT_MUTATION_RATE_LIMIT_MAX,
  ),
  windowMs = positiveInteger(
    process.env.MUTATION_RATE_LIMIT_WINDOW_MS,
    DEFAULT_MUTATION_RATE_LIMIT_WINDOW_MS,
  ),
  now = () => Date.now(),
} = {}) {
  return createRateLimit({
    max,
    windowMs,
    now,
    error: "Quá nhiều yêu cầu cập nhật. Vui lòng thử lại sau.",
    code: "MUTATION_RATE_LIMITED",
  });
}

export function mutationErrorPayload(
  error,
  { isProduction = false, fallback = "Mutation failed" } = {},
) {
  if (isProduction) {
    return { error: fallback, code: "MUTATION_REJECTED" };
  }
  const detail =
    error && typeof error === "object" && "message" in error
      ? String(error.message)
      : String(error);
  return { error: detail || fallback, code: "MUTATION_REJECTED" };
}
