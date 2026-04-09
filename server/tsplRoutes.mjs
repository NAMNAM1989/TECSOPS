import { buildTspl } from "./tsplBuild.mjs";
import { sendRawToPrinter } from "./tsplTcp.mjs";

/**
 * TSPL_ALLOWED_HOSTS: danh sách IP được phép (vd. "192.168.1.50,10.0.0.5").
 * Rỗng → từ chối in mạng (chỉ cho phép /api/tspl/build để tải file).
 */
function isHostAllowed(host) {
  const raw = (process.env.TSPL_ALLOWED_HOSTS ?? "").trim();
  if (!raw) return false;
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
  return set.has(host);
}

function normalizeBody(body) {
  if (!body || typeof body !== "object") throw new Error("Invalid JSON body");
  return body;
}

export function registerTsplRoutes(app) {
  app.post("/api/tspl/build", (req, res) => {
    try {
      const body = normalizeBody(req.body);
      const tspl = buildTspl(body);
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(tspl);
    } catch (e) {
      res.status(400).json({ error: String(e.message) });
    }
  });

  app.post("/api/tspl/print", async (req, res) => {
    try {
      const body = normalizeBody(req.body);
      const host = String(body.host ?? "").trim();
      const port = Number(body.port ?? 9100);
      if (!host) {
        res.status(400).json({ error: "Missing host" });
        return;
      }
      if (!isHostAllowed(host)) {
        res.status(403).json({
          error:
            "TSPL network print disabled or host not in TSPL_ALLOWED_HOSTS. Set env TSPL_ALLOWED_HOSTS=comma,separated,ips",
        });
        return;
      }
      const { host: _h, port: _p, ...labelFields } = body;
      const tspl = buildTspl(labelFields);
      await sendRawToPrinter(host, port, Buffer.from(tspl, "utf8"));
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e.message) });
    }
  });
}
