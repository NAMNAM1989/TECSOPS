export const BASE_URL = String(process.env.BASE_URL || "http://127.0.0.1:3001").replace(
  /\/$/,
  "",
);

export function isLocalBaseUrl(baseUrl = BASE_URL) {
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(baseUrl);
}

export function assertMutationAllowed(baseUrl = BASE_URL) {
  if (process.env.E2E_ALLOW_MUTATION !== "1") {
    throw new Error("Mutation E2E bị khóa. Chỉ bật bằng E2E_ALLOW_MUTATION=1 trên DB test.");
  }
  if (!isLocalBaseUrl(baseUrl) && process.env.E2E_ALLOW_REMOTE_MUTATION !== "1") {
    throw new Error(
      "Không mutation trên URL remote. Chỉ staging được phép với E2E_ALLOW_REMOTE_MUTATION=1.",
    );
  }
}

export async function loginIfConfigured(context, baseUrl = BASE_URL) {
  const token = String(process.env.TECSOPS_APP_TOKEN || "").trim();
  if (!token) return;
  const response = await context.request.post(`${baseUrl}/api/auth/login`, {
    data: { token },
  });
  if (!response.ok()) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`Đăng nhập E2E thất bại: ${String(body?.error || response.status())}`);
  }
}

export function isE2eMarker(value) {
  return /^E2E-[A-Z0-9][A-Z0-9_-]*-\d{10,}$/i.test(String(value || "").trim());
}

export async function readJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok()) {
    throw new Error(`HTTP ${response.status()}: ${String(body?.error || response.statusText())}`);
  }
  return body;
}
