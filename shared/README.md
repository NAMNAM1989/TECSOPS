# Shared (server + client)

Nguồn sự thật cho logic dùng chung giữa Node (`server/`) và Vite (`src/`).

- `awbFormat.mjs` — format / digits AWB
- `airlineLabelDefaults.mjs` — map prefix → tên hãng
- `shipmentWorkflowStatus.mjs` — derive / migrate / patch trạng thái lô

`server/*` và `src/*` chỉ re-export (typed wrapper phía TS). Sửa quy tắc tại đây, không nhân bản.
