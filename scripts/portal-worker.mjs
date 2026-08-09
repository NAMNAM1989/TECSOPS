/**
 * Worker máy kho — poll Railway/local Ops, chạy agent Playwright cho kho TCS.
 *
 * Env:
 *   OPS_API_BASE=https://your-app.up.railway.app   (hoặc http://127.0.0.1:3001)
 *   PORTAL_WORKER_SECRET=...                       (trùng server)
 *   TCS_AGENT_URL=http://127.0.0.1:8765            (agent đã login user kho TCS)
 *   PORTAL_WAREHOUSE=TCS
 */
import "../server/loadEnv.mjs";

const OPS_API_BASE = String(process.env.OPS_API_BASE || "http://127.0.0.1:3001")
  .trim()
  .replace(/\/$/, "");
const SECRET = String(process.env.PORTAL_WORKER_SECRET || "").trim();
const AGENT = String(process.env.TCS_AGENT_URL || "http://127.0.0.1:8765")
  .trim()
  .replace(/\/$/, "");
const WAREHOUSE = String(process.env.PORTAL_WAREHOUSE || "TCS").trim().toUpperCase();
const WORKER_ID = `pc-${process.env.COMPUTERNAME || process.env.HOSTNAME || "local"}`;
const POLL_MS = Number(process.env.PORTAL_WORKER_POLL_MS || 2000);

if (!SECRET) {
  console.error("[portal-worker] Thiếu PORTAL_WORKER_SECRET");
  process.exit(1);
}

function headers(json = true) {
  const h = {
    "x-portal-worker-secret": SECRET,
    "x-worker-id": WORKER_ID,
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

async function opsFetch(path, opts = {}) {
  const res = await fetch(`${OPS_API_BASE}${path}`, {
    ...opts,
    headers: { ...headers(Boolean(opts.body)), ...(opts.headers || {}) },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(body?.error || body?.message || `HTTP ${res.status}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function agentFetch(path, opts = {}) {
  const res = await fetch(`${AGENT}${path}`, {
    ...opts,
    headers: {
      Accept: "application/json",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    const err = new Error(body?.message || body?.error || `Agent HTTP ${res.status}`);
    err.body = body;
    throw err;
  }
  return body;
}

async function heartbeat() {
  let loggedIn = false;
  let message = "Agent offline";
  try {
    const h = await agentFetch("/health");
    loggedIn = Boolean(h?.session?.logged_in);
    message = loggedIn
      ? "Agent online · đã ĐN cổng TCS"
      : h?.session?.message || "Agent online · chưa ĐN";
  } catch (e) {
    message = `Agent không phản hồi (${AGENT}): ${e.message}`;
  }
  await opsFetch("/api/portal-worker/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      warehouse: WAREHOUSE,
      worker_id: WORKER_ID,
      logged_in: loggedIn,
      message,
      meta: { agent: AGENT },
    }),
  });
  return loggedIn;
}

async function runLogin(job) {
  const visible = job.payload?.visible !== false;
  const opened = await agentFetch("/session/open", {
    method: "POST",
    body: JSON.stringify({ visible, headed: visible, show_browser: visible }),
  });
  if (!opened?.logged_in && !opened?.open) {
    throw new Error(opened?.message || "Không mở được session agent");
  }
  if (!opened.logged_in) {
    throw new Error(
      opened.message ||
        "Agent mở Chrome nhưng chưa login — nhập CAPTCHA trên máy kho rồi thử ĐN lại."
    );
  }
  return {
    result: {
      logged_in: true,
      message: "Đã ĐN trên máy kho (agent)",
      session: opened,
    },
  };
}

async function runScan(job) {
  const sessionDate = String(job.payload?.session_date || "").trim();
  const awbs = Array.isArray(job.payload?.awbs) ? job.payload.awbs : [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    throw new Error("scan cần session_date YYYY-MM-DD");
  }
  const res = await agentFetch("/workspace/bootstrap", {
    method: "POST",
    body: JSON.stringify({
      warehouse: WAREHOUSE,
      session_date: sessionDate,
      awbs,
      visible: true,
    }),
  });
  return {
    result: {
      ready: res.ready || [],
      items: res.items || [],
      list_total: res.list_total ?? res.total,
      reception_total: res.reception_total,
      message: res.message || "Quét xong",
      logged_in: Boolean(res.logged_in ?? res.session?.logged_in),
    },
  };
}

async function runPdf(job) {
  const awb = String(job.payload?.awb || "").replace(/\D/g, "").slice(0, 11);
  if (awb.length !== 11) throw new Error("pdf cần AWB 11 số");
  const res = await agentFetch("/jobs", {
    method: "POST",
    body: JSON.stringify({
      warehouse: WAREHOUSE,
      dry_run: false,
      mock: false,
      force: Boolean(job.payload?.force),
      session_date: "",
      rows: [
        {
          stt: 1,
          awb,
          action: "DOWNLOAD",
          document_type: "ESID",
          shipment_id: job.payload?.shipment_id || "",
        },
      ],
    }),
  });
  const row0 = (res.results || [])[0] || {};
  if (row0.normalized_status !== "DOWNLOADED") {
    throw new Error(row0.error_message || row0.tcs_status_raw || "DOWNLOAD thất bại");
  }
  const pdfName =
    String(row0.pdf_name || "").replace(/^.*[/\\]/, "") ||
    `${awb.slice(0, 3)}-${awb.slice(3)}_ESID.pdf`;
  const docRes = await fetch(`${AGENT}/docs?file=${encodeURIComponent(pdfName)}`);
  if (!docRes.ok) throw new Error(`Không tải PDF từ agent (${docRes.status})`);
  const buf = Buffer.from(await docRes.arrayBuffer());
  if (buf.length < 100) throw new Error("PDF rỗng từ agent");
  return {
    result: {
      pdf_name: pdfName,
      awb,
      cache_hit: Boolean(res.cache_hit || row0.cache_hit),
      message: `Đã lấy ${pdfName}`,
    },
    artifact_base64: buf.toString("base64"),
    artifact_name: pdfName,
    content_type: "application/pdf",
  };
}

async function handleJob(job) {
  console.info(`[portal-worker] claim ${job.type} ${job.id}`);
  try {
    let out;
    if (job.type === "login") out = await runLogin(job);
    else if (job.type === "scan") out = await runScan(job);
    else if (job.type === "pdf") out = await runPdf(job);
    else throw new Error(`Unknown type ${job.type}`);

    await opsFetch(`/api/portal-worker/jobs/${job.id}/complete`, {
      method: "POST",
      body: JSON.stringify(out),
    });
    console.info(`[portal-worker] done ${job.id}`);
  } catch (e) {
    console.error(`[portal-worker] fail ${job.id}:`, e.message);
    await opsFetch(`/api/portal-worker/jobs/${job.id}/fail`, {
      method: "POST",
      body: JSON.stringify({ error: e.message }),
    }).catch(() => {});
  }
}

async function loop() {
  console.info(
    `[portal-worker] OPS=${OPS_API_BASE} AGENT=${AGENT} WH=${WAREHOUSE} id=${WORKER_ID}`
  );
  for (;;) {
    try {
      await heartbeat();
      const claimed = await opsFetch(
        `/api/portal-worker/claim?warehouse=${encodeURIComponent(WAREHOUSE)}&worker_id=${encodeURIComponent(WORKER_ID)}`
      );
      if (claimed?.job) {
        await handleJob(claimed.job);
        continue;
      }
    } catch (e) {
      console.warn("[portal-worker]", e.message);
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

loop().catch((e) => {
  console.error("[portal-worker] fatal", e);
  process.exit(1);
});
