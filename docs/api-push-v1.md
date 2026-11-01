# TECSOPS Push API v1

TECSOPS chủ động đẩy thay đổi shipments ngay sau khi mutation **COMMIT** vào Postgres
(độ trễ thường < 100 ms). App ngoài không cần poll.

Hai kênh, dùng chung một định dạng sự kiện:

| Kênh | Khi nào dùng |
|---|---|
| **SSE** `GET /api/v1/stream/shipments` | App giữ kết nối mở (frontend, worker, dashboard). Nhanh nhất, tự nối lại. |
| **Webhook** (`TECSOPS_WEBHOOK_URLS`) | App là server có URL public, không muốn giữ kết nối. |

Quy trình chuẩn cho app ngoài:

1. Tải snapshot ban đầu qua Export API (`GET /api/v1/export/shipments?sessionDate=...`), lưu `stateVersion`.
2. Mở SSE với `?since=<stateVersion>` (hoặc nhận webhook).
3. Áp dụng `upserted` (ghi đè theo `id`) và `removed` (xóa theo `id`).
4. Gặp sự kiện `resync` → quay lại bước 1.

## Định dạng sự kiện `shipments.changed`

```json
{
  "type": "shipments.changed",
  "eventId": "1234",
  "apiVersion": "v1",
  "schemaVersion": 1,
  "stateVersion": 1234,
  "occurredAt": "2026-10-14T08:00:00.000Z",
  "sessionDates": ["2026-10-14"],
  "upserted": [{ "id": "…", "awb": "618-54405131", "status": "…", "...": "DTO giống Export API" }],
  "removed": [{ "id": "…", "sessionDate": "2026-10-14", "warehouse": "TECS-TCS", "awb": "…" }],
  "customersChanged": false
}
```

- `stateVersion` tăng đơn điệu; dùng làm `eventId`. Bỏ qua sự kiện có `stateVersion` ≤ bản app đang có.
- `upserted` chứa bản ghi đầy đủ (view `core` mặc định, `full` nếu yêu cầu) — không cần gọi lại API.
- Khi `customersChanged = true`, sự kiện kèm `customers` (danh sách khách mới nhất).
- Mutation không đổi shipments/customers (ví dụ chỉ đổi nhãn hãng bay) không sinh sự kiện, nên `stateVersion` có thể nhảy cóc.

## SSE

```
GET /api/v1/stream/shipments?sessionDate=2026-10-14&warehouse=TECS-TCS&view=core&since=1230
Authorization: Bearer <TECSOPS_APP_TOKEN>
```

| Tham số | Ý nghĩa |
|---|---|
| `sessionDate` | Chỉ nhận shipments của ngày (YYYY-MM-DD). Bỏ trống = mọi ngày. |
| `warehouse` | `TECS-TCS`, `TECS-SCSC`, `TCS`, `SCSC`. |
| `view` | `core` (mặc định) hoặc `full`. |
| `since` | Replay các sự kiện sau `stateVersion` này. Header `Last-Event-ID` có cùng tác dụng (EventSource tự gửi khi nối lại). |

Các sự kiện trên stream:

- `ready` — gửi ngay khi kết nối: `{ stateVersion, filter }`.
- `shipments.changed` — như trên, có `id:` = `stateVersion`.
- `resync` — server không còn đủ lịch sử (buffer 500 sự kiện hoặc server vừa khởi động lại). Tải lại snapshot.
- Heartbeat `: ping` mỗi 25 giây để giữ kết nối qua proxy.

### Node.js / server (có header Authorization)

```js
import { EventSource } from "eventsource"; // npm i eventsource

const base = process.env.TECSOPS_API_BASE;
const token = process.env.TECSOPS_APP_TOKEN;
let stateVersion = await loadSnapshot(); // từ GET /api/v1/export/shipments

const es = new EventSource(`${base}/api/v1/stream/shipments?since=${stateVersion}`, {
  fetch: (url, init) =>
    fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } }),
});

es.addEventListener("shipments.changed", (msg) => {
  const ev = JSON.parse(msg.data);
  if (ev.stateVersion <= stateVersion) return;
  for (const s of ev.upserted) db.upsertShipment(s);
  for (const r of ev.removed) db.deleteShipment(r.id);
  stateVersion = ev.stateVersion;
});

es.addEventListener("resync", async () => {
  stateVersion = await loadSnapshot();
});
```

Trình duyệt: `EventSource` gốc không gửi được header `Authorization`. Hãy đi qua backend
của app (proxy) để không lộ token ra frontend.

### curl

```bash
curl -N -H "Authorization: Bearer $TECSOPS_APP_TOKEN" \
  "$TECSOPS_API_BASE/api/v1/stream/shipments?sessionDate=2026-10-14"
```

## Webhook

Cấu hình trên service TECSOPS (Railway Variables):

```
TECSOPS_WEBHOOK_URLS=https://other-app.example.com/webhooks/tecsops
TECSOPS_WEBHOOK_SECRET=<chuỗi ngẫu nhiên dài>
TECSOPS_WEBHOOK_VIEW=core   # hoặc full
```

Mỗi sự kiện → `POST` JSON (body = sự kiện ở trên) với header:

| Header | Giá trị |
|---|---|
| `X-TECSOPS-Event` | `shipments.changed` |
| `X-TECSOPS-Event-Id` | `stateVersion` |
| `X-TECSOPS-Timestamp` | Unix giây |
| `X-TECSOPS-Signature` | `sha256=` + hex HMAC-SHA256(secret, `${timestamp}.${rawBody}`) |

- Trả 2xx trong 5 giây. Lỗi/timeout → retry sau 1 s, 4 s, 15 s rồi bỏ.
- Sự kiện gửi tuần tự theo từng URL (đúng thứ tự `stateVersion`).
- Dùng `X-TECSOPS-Event-Id` để chống xử lý trùng. Nếu thấy nhảy cóc bất thường hoặc nghi mất sự kiện, gọi Export API để đối soát.

### Xác thực chữ ký (Express)

```js
import crypto from "node:crypto";
import express from "express";

app.post("/webhooks/tecsops", express.raw({ type: "application/json" }), (req, res) => {
  const ts = req.get("X-TECSOPS-Timestamp");
  const sig = req.get("X-TECSOPS-Signature") || "";
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", process.env.TECSOPS_WEBHOOK_SECRET)
      .update(`${ts}.${req.body}`)
      .digest("hex");
  const ok =
    sig.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return res.sendStatus(401);

  const ev = JSON.parse(req.body);
  // upsert ev.upserted, xóa ev.removed …
  res.sendStatus(204);
});
```

## Giới hạn

- Event bus nằm trong bộ nhớ của một replica (giống Socket.IO hiện tại). Khi scale nhiều replica cần
  chuyển sang Postgres `LISTEN/NOTIFY` hoặc Redis.
- Buffer replay giữ 500 sự kiện gần nhất; restart server → client nhận `resync`.
