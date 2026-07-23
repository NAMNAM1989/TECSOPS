const el = document.getElementById("status");

chrome.runtime.sendMessage({ type: "PING" }, (res) => {
  const err = chrome.runtime.lastError;
  if (err || !res?.ok) {
    el.textContent = "Extension lỗi — reload tại chrome://extensions";
    el.className = "warn";
    return;
  }
  const ws = res.workspace || {};
  el.textContent = `Sẵn sàng · v${res.version || "?"} · ${
    ws.logged_in ? "đã login" : "chờ Đồng bộ TCS từ Ops"
  }`;
  el.className = "ok";
});
