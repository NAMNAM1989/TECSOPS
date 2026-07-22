const el = document.getElementById("status");

chrome.runtime.sendMessage({ type: "PING" }, (res) => {
  const err = chrome.runtime.lastError;
  if (err || !res?.ok) {
    el.textContent = "Extension lỗi — reload tại chrome://extensions";
    el.className = "warn";
    return;
  }
  el.textContent = `Sẵn sàng · v${res.version || "?"} · chờ lệnh Điền từ Ops`;
  el.className = "ok";
});
