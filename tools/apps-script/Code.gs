/**
 * TECSOPS — đẩy thay đổi Google Sheet «BOOK HẰNG NGÀY» lên web trong vài giây.
 *
 * Script Properties (Project Settings → Script properties):
 *   WEBHOOK_URL   https://<domain-tecsops>/api/sheets/book/webhook
 *   SHEET_SECRET  trùng giá trị env SHEET_WEBHOOK_SECRET trên Railway
 *
 * Chạy `setup()` một lần để cài trigger «On edit» + «On change».
 * Xem tools/apps-script/README.md.
 */

var COLS = 12; // A..L
var MAX_ROWS_PER_REQUEST = 200;
var MAX_BODY_CHARS = 200 * 1024; // server chặn 256 KB
var DEBOUNCE_MS = 2000;
var LOG_SHEET = "_sync_log";
var LOG_MAX_ROWS = 500;
var PENDING_KEY = "tecsops_pending_rows";
var LAST_EDIT_KEY = "tecsops_last_edit";
var CACHE_TTL_S = 600;
var SESSION_TAB_RE = /(^|\D)\d{1,2}\s*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i;

/* ───────────────────────── Trigger ───────────────────────── */

/** Trigger cài đặt «On edit» (không dùng simple onEdit vì cần UrlFetchApp). */
function onEditInstallable(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  if (!isSessionTab_(sheet)) return;

  var first = e.range.getRow();
  var last = Math.min(e.range.getLastRow(), first + 2000);
  var stamp = String(Date.now()) + ":" + Math.random();

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return; // auto-sync phía server sẽ bắt lại
  try {
    var cache = CacheService.getScriptCache();
    var pending = readPending_(cache);
    var key = String(sheet.getSheetId());
    var list = pending[key] || [];
    for (var r = first; r <= last; r++) {
      if (list.indexOf(r) < 0) list.push(r);
    }
    pending[key] = list;
    cache.put(PENDING_KEY, JSON.stringify(pending), CACHE_TTL_S);
    cache.put(LAST_EDIT_KEY, stamp, CACHE_TTL_S);
  } finally {
    lock.releaseLock();
  }

  // Gom các lần gõ nhanh: chỉ lần sửa cuối cùng trong ~2 s mới gửi.
  Utilities.sleep(DEBOUNCE_MS);
  if (CacheService.getScriptCache().get(LAST_EDIT_KEY) !== stamp) return;
  flushPending_();
}

/** Trigger cài đặt «On change»: chèn/xoá dòng, dán, sắp xếp → gửi lại cả tab. */
function onChangeInstallable(e) {
  if (e && e.changeType === "EDIT") return; // onEditInstallable đã xử lý
  if (e && e.changeType === "FORMAT") return;
  var sheet = SpreadsheetApp.getActiveSheet();
  if (!isSessionTab_(sheet)) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    pushFullTab_(sheet);
  } finally {
    lock.releaseLock();
  }
}

/* ───────────────────────── Setup / test ───────────────────────── */

/** Chạy một lần: xoá trigger cũ của script này rồi cài lại «On edit» + «On change». */
function setup() {
  var cfg = config_();
  var ss = SpreadsheetApp.getActive();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction();
    if (fn === "onEditInstallable" || fn === "onChangeInstallable") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("onEditInstallable").forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger("onChangeInstallable").forSpreadsheet(ss).onChange().create();
  Logger.log("Đã cài trigger. Webhook: " + cfg.url);
}

/** Gửi thử dòng đang chọn trên tab hiện tại; nếu server cần, gửi cả tab. */
function testPush() {
  var sheet = SpreadsheetApp.getActiveSheet();
  if (!isSessionTab_(sheet)) {
    Logger.log("Tab «" + sheet.getName() + "» không phải tab ngày (vd. «NGÀY 14 OCT»).");
    return;
  }
  var row = sheet.getActiveRange() ? sheet.getActiveRange().getRow() : 2;
  var res = pushRows_(sheet, [row]);
  Logger.log("Kết quả: " + JSON.stringify(res));
}

/** Gửi lại cả tab đang mở (dùng tay khi nghi ngờ lệch). */
function pushActiveTab() {
  var res = pushFullTab_(SpreadsheetApp.getActiveSheet());
  Logger.log("Kết quả: " + JSON.stringify(res));
}

/* ───────────────────────── Gửi dữ liệu ───────────────────────── */

function flushPending_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    var cache = CacheService.getScriptCache();
    var pending = readPending_(cache);
    cache.remove(PENDING_KEY);
    var ss = SpreadsheetApp.getActive();
    Object.keys(pending).forEach(function (gid) {
      var sheet = sheetByGid_(ss, Number(gid));
      if (!sheet || !pending[gid].length) return;
      pushRows_(sheet, pending[gid]);
    });
  } finally {
    lock.releaseLock();
  }
}

/** Gửi các dòng đã sửa (bỏ dòng trống / tiêu đề / header). */
function pushRows_(sheet, rowNumbers) {
  var sorted = rowNumbers
    .filter(function (n) { return n >= 1 && n <= sheet.getMaxRows(); })
    .sort(function (a, b) { return a - b; });
  if (!sorted.length) return null;
  var first = sorted[0];
  var last = sorted[sorted.length - 1];
  var block = readBlock_(sheet, first, last - first + 1);
  var rows = [];
  sorted.forEach(function (n) {
    var values = block[n - first];
    if (!values || isTitleOrHeader_(values)) return;
    rows.push({ rowNumber: n, values: values });
  });
  if (!rows.length) return null;

  var lastRes = null;
  var chunks = chunkRows_(rows);
  for (var i = 0; i < chunks.length; i++) {
    lastRes = postJson_(sheet, {
      sheetId: SpreadsheetApp.getActive().getId(),
      gid: String(sheet.getSheetId()),
      tabName: sheet.getName(),
      mode: "rows",
      rows: chunks[i],
      editedAt: new Date().toISOString(),
    });
    if (lastRes && lastRes.needFullTab) return pushFullTab_(sheet);
  }
  return lastRes;
}

/** Gửi cả tab (gồm dòng tiêu đề khối để server biết TCS/SCSC) theo lô ≤ 200 dòng. */
function pushFullTab_(sheet) {
  if (!isSessionTab_(sheet)) return null;
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return null;
  var block = readBlock_(sheet, 1, lastRow);
  var rows = [];
  for (var i = 0; i < block.length; i++) {
    if (block[i].join("").trim()) rows.push({ rowNumber: i + 1, values: block[i] });
  }
  var chunks = chunkRows_(rows);
  if (!chunks.length) chunks = [[]];
  var batchId = Utilities.getUuid();
  var lastRes = null;
  for (var c = 0; c < chunks.length; c++) {
    lastRes = postJson_(sheet, {
      sheetId: SpreadsheetApp.getActive().getId(),
      gid: String(sheet.getSheetId()),
      tabName: sheet.getName(),
      mode: "full",
      batchId: batchId,
      batchIndex: c,
      batchCount: chunks.length,
      rows: chunks[c],
      editedAt: new Date().toISOString(),
    });
    if (!lastRes) break; // lô lỗi → các lô sau sẽ bị server từ chối; auto-sync bắt lại
  }
  return lastRes;
}

/** POST JSON, thử lại 3 lần (1 s, 2 s, 4 s). Lỗi cuối cùng ghi vào `_sync_log`. */
function postJson_(sheet, payload) {
  var cfg = config_();
  var body = JSON.stringify(payload);
  var rowsLabel = payload.rows.length
    ? payload.rows[0].rowNumber + "–" + payload.rows[payload.rows.length - 1].rowNumber
    : "-";
  var lastCode = 0;
  var lastText = "";
  for (var attempt = 0; attempt < 3; attempt++) {
    try {
      var res = UrlFetchApp.fetch(cfg.url, {
        method: "post",
        contentType: "application/json",
        headers: { "X-Sheet-Secret": cfg.secret },
        payload: body,
        muteHttpExceptions: true,
        followRedirects: true,
      });
      lastCode = res.getResponseCode();
      lastText = res.getContentText().slice(0, 300);
      if (lastCode >= 200 && lastCode < 300) {
        try {
          return JSON.parse(res.getContentText());
        } catch (parseErr) {
          return { ok: true };
        }
      }
      // 400/401/413/503: cấu hình sai — thử lại không giúp gì.
      if (lastCode === 400 || lastCode === 401 || lastCode === 413 || lastCode === 503) break;
    } catch (err) {
      lastCode = -1;
      lastText = String(err && err.message ? err.message : err).slice(0, 300);
    }
    Utilities.sleep(1000 * Math.pow(2, attempt));
  }
  logError_(sheet.getName(), rowsLabel, lastCode, lastText);
  return null;
}

/* ───────────────────────── Tiện ích ───────────────────────── */

function config_() {
  var props = PropertiesService.getScriptProperties();
  var url = String(props.getProperty("WEBHOOK_URL") || "").trim();
  var secret = String(props.getProperty("SHEET_SECRET") || "").trim();
  if (!url || !secret) {
    throw new Error("Thiếu Script Property WEBHOOK_URL hoặc SHEET_SECRET.");
  }
  return { url: url, secret: secret };
}

function isSessionTab_(sheet) {
  if (!sheet) return false;
  var name = String(sheet.getName() || "");
  if (name.charAt(0) === "_") return false;
  var plain = name.normalize ? name.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : name;
  return SESSION_TAB_RE.test(plain);
}

function sheetByGid_(ss, gid) {
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === gid) return sheets[i];
  }
  return null;
}

function readPending_(cache) {
  try {
    return JSON.parse(cache.get(PENDING_KEY) || "{}") || {};
  } catch (e) {
    return {};
  }
}

/**
 * Đọc A..L. Số giữ nguyên (AWB 11 số không bị định dạng 6.18E+10),
 * ngày/giờ lấy chữ hiển thị như trên Sheet.
 */
function readBlock_(sheet, startRow, numRows) {
  var range = sheet.getRange(startRow, 1, numRows, COLS);
  var raw = range.getValues();
  var shown = range.getDisplayValues();
  var out = [];
  for (var r = 0; r < raw.length; r++) {
    var row = [];
    for (var c = 0; c < COLS; c++) {
      var v = raw[r][c];
      if (v instanceof Date) row.push(String(shown[r][c]));
      else if (typeof v === "number") row.push(String(v));
      else row.push(String(v == null ? "" : v));
    }
    out.push(row);
  }
  return out;
}

function normText_(s) {
  var t = String(s || "");
  if (t.normalize) t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return t.toLowerCase();
}

/** Dòng tiêu đề khối («VLC-TECS», «CẬP NHẬT DANH SÁCH…») hoặc header «AWB/BOOKING». */
function isTitleOrHeader_(values) {
  var joined = normText_(values.join(" "));
  if (!joined.trim()) return true;
  if (joined.indexOf("cap nhat danh sach hang len san bay") >= 0) return true;
  if (joined.indexOf("vlc-tecs") >= 0) return true;
  var b = normText_(values[1]);
  return b.indexOf("awb") >= 0 && b.indexOf("booking") >= 0;
}

/** Chia lô theo số dòng và kích thước JSON. */
function chunkRows_(rows) {
  var chunks = [];
  var cur = [];
  var size = 0;
  rows.forEach(function (row) {
    var len = JSON.stringify(row).length;
    if (cur.length && (cur.length >= MAX_ROWS_PER_REQUEST || size + len > MAX_BODY_CHARS)) {
      chunks.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(row);
    size += len;
  });
  if (cur.length) chunks.push(cur);
  return chunks;
}

/** Ghi lỗi vào sheet ẩn `_sync_log` (thời gian, tab, dòng, mã lỗi, chi tiết). */
function logError_(tabName, rowsLabel, code, detail) {
  try {
    var ss = SpreadsheetApp.getActive();
    var log = ss.getSheetByName(LOG_SHEET);
    if (!log) {
      log = ss.insertSheet(LOG_SHEET);
      log.appendRow(["Thời gian", "Tab", "Dòng", "Mã lỗi", "Chi tiết"]);
      log.hideSheet();
    }
    log.appendRow([new Date(), tabName, rowsLabel, code, detail]);
    var extra = log.getLastRow() - 1 - LOG_MAX_ROWS;
    if (extra > 0) log.deleteRows(2, extra);
  } catch (e) {
    Logger.log("Không ghi được _sync_log: " + e);
  }
}
