const el = document.getElementById("ver");

function showWarn(text) {
  el.textContent = text;
  el.className = "warn";
}

try {
  if (!chrome.runtime?.id) {
    showWarn("Extension lỗi — reload tại chrome://extensions rồi mở lại popup");
  } else {
    chrome.runtime.sendMessage({ type: "PING" }, (res) => {
      const err = chrome.runtime.lastError;
      if (err || !res?.ok) {
        showWarn(
          err?.message?.includes("context invalidated")
            ? "Ext vừa Reload — đóng popup, F5 Ops, mở lại"
            : "Extension lỗi — reload tại chrome://extensions"
        );
        return;
      }
      const ws = res.workspace || {};
      el.textContent = `Kho TCS · v${res.version || "?"} · ${
        ws.logged_in ? "đã login" : "chờ Đồng bộ từ Ops"
      }`;
      el.className = "ok";
    });
  }
} catch {
  showWarn("Extension context lỗi — reload Ext rồi F5 Ops");
}
