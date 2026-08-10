"""Danh sách ESID (/Esid/Export) → chi tiết → nút IN → PDF."""
from __future__ import annotations

import base64
import re
import time
from pathlib import Path
from typing import Any

from app.browser.locators import LocatorRef, LocatorsConfig
from app.browser.pages.awb_page import NeedsLoginError, SiteChangedError
from app.data.models import NormalizedStatus

# Nội dung trang shell TCS (không phải phiếu in)
_SITE_CHROME_MARKERS = (
    "giới thiệu",
    "danh sách esid",
    "khai báo esid",
    "đăng ký xe",
    "hotline",
    "tìm kiếm",
    "đăng xuất",
    "awb login",
)
# Marker MẠNH của phiếu in thật — không dùng "esid"/"awb" đơn lẻ (có trên UI list)
_ESID_BILL_MARKERS = (
    "shipper's instruction",
    "shippers instruction",
    "instruction for despatch",
    "hướng dẫn gửi hàng",
    "so khong van don",
    "số không vận đơn",
    "air waybill",
    "người gửi hàng",
    "người nhận hàng",
    "consignee",
    "shipper name",
    "airport of departure",
    "airport of destination",
)


RECEPTION_STATUS = "Hoàn thành tiếp nhận"


class EsidListPage:
    def __init__(self, page, locators: LocatorsConfig) -> None:
        self.page = page
        self.locators = locators
        self._list_date_ymd: str | None = None
        # AWB đang mở chi tiết (nút IN) — hot-path PDF/In gần tức thời
        self._detail_awb: str | None = None
        self._print_hooks_installed: bool = False
        self._print_scratch = None  # tab tái dùng khi in PDF từ iframe

    def _cfg(self) -> dict[str, Any]:
        return self.locators.data.get("esid_list") or {}

    def _resolve(self, ref: LocatorRef | None):
        if ref is None or not ref.by:
            raise SiteChangedError("Thiếu locator ESID")
        p = self.page
        by = ref.by.lower()
        if by == "id":
            return p.locator(f"#{ref.value}")
        if by == "css":
            return p.locator(ref.value)
        if by == "placeholder":
            return p.get_by_placeholder(ref.value)
        if by == "role":
            return p.get_by_role(ref.role or "button", name=ref.name or ref.value)
        if by == "text":
            return p.get_by_text(ref.value, exact=False)
        raise SiteChangedError(f"Kiểu locator ESID không hỗ trợ: {ref.by}")

    def esid_ref(self, key: str) -> LocatorRef | None:
        return LocatorRef.from_dict(self._cfg().get(key))

    def _on_esid_list(self) -> bool:
        url = (self.page.url or "").lower()
        if "/esid/" not in url:
            return False
        try:
            # Tab KHAI BÁO cũng có ô AWB — bắt buộc thấy bộ lọc ngày của DANH SÁCH
            date = self.page.locator("#search-form_dateSearch")
            if date.count() == 0 or not date.first.is_visible(timeout=800):
                return False
            awb_ref = self.esid_ref("awb_last")
            inp = self._resolve(awb_ref) if awb_ref else self.page.get_by_placeholder("AWB#")
            return inp.first.is_visible(timeout=800)
        except Exception:
            return False

    def _click_list_tab(self) -> None:
        """Ép tab DANH SÁCH ESID (sau KHAI BÁO / chi tiết / warm declare)."""
        finders = (
            lambda: self.page.get_by_role(
                "tab", name=re.compile(r"DANH\s*S[ÁA]CH\s*ESID", re.I)
            ),
            lambda: self.page.locator(".ant-tabs-tab").filter(
                has_text=re.compile(r"DANH\s*S[ÁA]CH\s*ESID", re.I)
            ),
            lambda: self.page.get_by_text("DANH SÁCH ESID", exact=False),
        )
        for finder in finders:
            try:
                tab = finder()
                if tab.count() == 0:
                    continue
                tab.first.click(timeout=2000, force=True, no_wait_after=True)
                self.page.wait_for_timeout(120)
                self._detail_awb = None
                return
            except Exception:
                continue

    def _date_start_locator(self):
        """Ô Ngày bắt đầu — id chính + fallback placeholder / RangePicker."""
        selectors = (
            "#search-form_dateSearch",
            "input[placeholder*='Ngày bắt đầu']",
            "input[placeholder*='Ngay bat dau']",
            "input[id*='dateSearch']",
            ".ant-picker input",
        )
        for sel in selectors:
            try:
                loc = self.page.locator(sel)
                if loc.count() == 0:
                    continue
                # Ưu tiên ô visible; nếu chỉ attached thì vẫn dùng (Ant readonly).
                try:
                    if loc.first.is_visible(timeout=400):
                        return loc.first
                except Exception:
                    pass
                return loc.first
            except Exception:
                continue
        return None

    def _ensure_list_search_form(self, *, timeout_ms: int = 15000) -> Any:
        """Đảm bảo đang ở tab danh sách và thấy bộ lọc ngày."""
        deadline = time.time() + max(2.0, timeout_ms / 1000)
        last_force = 0.0
        while time.time() < deadline:
            self._click_list_tab()
            loc = self._date_start_locator()
            if loc is not None:
                try:
                    loc.scroll_into_view_if_needed(timeout=800)
                except Exception:
                    pass
                try:
                    if loc.is_visible(timeout=600):
                        return loc
                except Exception:
                    pass
                # attached nhưng Ant đang ẩn tạm — vẫn dùng để gán React value
                return loc
            now = time.time()
            if now - last_force > 2.0:
                self.goto_list(force=True)
                last_force = now
            else:
                self.page.wait_for_timeout(200)
        diag = {}
        try:
            diag = self.page.evaluate(
                """() => ({
                  url: location.href,
                  tabs: [...document.querySelectorAll('.ant-tabs-tab')]
                    .map((t) => (t.textContent || '').trim()).filter(Boolean).slice(0, 8),
                  inputs: [...document.querySelectorAll('input')].slice(0, 16).map((i) => ({
                    id: i.id || '',
                    ph: i.getAttribute('placeholder') || '',
                    type: i.type || '',
                    vis: !!(i.offsetWidth || i.offsetHeight || i.getClientRects().length)
                  }))
                })"""
            )
        except Exception as e:
            diag = {"eval_error": str(e)[:120]}
        raise SiteChangedError(
            f"Không thấy ô Ngày bắt đầu trên danh sách ESID: {diag}"
        )

    def goto_list(self, *, force: bool = False) -> None:
        """Vào Danh sách ESID — bỏ qua reload nếu đã ở đúng màn."""
        if not force and self._on_esid_list():
            self._click_list_tab()
            return
        home = self._cfg().get("home_url") or "https://www.tcs.com.vn/Esid/Export"
        # TCS có request giữ DOMContentLoaded gần 60s; chỉ cần navigation commit,
        # search_by_awb_last8 sẽ chờ đúng ô AWB# sau đó.
        self.page.goto(home, wait_until="commit", timeout=15000)
        try:
            self.page.wait_for_load_state("domcontentloaded", timeout=3000)
        except Exception:
            pass
        self.page.wait_for_timeout(150)
        self._click_list_tab()

    def _wait_search_results(self, last8: str = "", *, timeout_ms: int = 8000) -> bool:
        """
        Chờ bảng kết quả. Khi có last8: BẮT BUỘC thấy last8 trong bảng
        (không chấp nhận list mặc định chỉ vì có chữ «Hoàn thành»).
        """
        try:
            self.page.wait_for_function(
                """(last8) => {
                  const rows = [...document.querySelectorAll(
                    '.ant-table-tbody tr, table tbody tr'
                  )].filter(r => r.querySelectorAll('td').length >= 3);
                  if (!rows.length) {
                    return /không có|no data|empty/i.test(document.body.innerText||'');
                  }
                  const blob = rows.slice(0, 30).map(r => (r.innerText||'')).join(' ');
                  if (last8) return blob.includes(last8);
                  return /hoàn thành|tiếp nhận|không có|no data|empty/i.test(blob);
                }""",
                arg=last8 or "",
                timeout=timeout_ms,
            )
            return True
        except Exception:
            self.page.wait_for_timeout(200)
            return False

    @staticmethod
    def _set_react_input(locator, value: str) -> None:
        """Gán giá trị input Ant/React — fill() thường không cập nhật form store."""
        locator.first.wait_for(state="visible", timeout=8000)
        locator.first.click(timeout=2000)
        try:
            locator.first.fill("")
        except Exception:
            pass
        ok = locator.first.evaluate(
            """(el, v) => {
              const proto = window.HTMLInputElement.prototype;
              const desc = Object.getOwnPropertyDescriptor(proto, 'value');
              const set = desc && desc.set;
              const last = el.value;
              if (set) set.call(el, v);
              else el.value = v;
              const tracker = el._valueTracker;
              if (tracker && typeof tracker.setValue === 'function') {
                try { tracker.setValue(last); } catch (e) {}
              }
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return String(el.value || '') === String(v);
            }""",
            value,
        )
        if not ok:
            locator.first.fill(value)
        try:
            locator.first.press("Tab")
        except Exception:
            pass

    def _detail_ready_for(self, awb_digits: str) -> bool:
        """True khi đang ở chi tiết đúng AWB và còn nút IN (hot-path)."""
        if len(awb_digits) != 11:
            return False
        if self._detail_awb == awb_digits and self._in_button_visible():
            return True
        if not self._in_button_visible():
            return False
        # Không khớp chỉ bằng last8 — ô AWB# trên form list cũng chứa last8
        display = f"{awb_digits[:3]}-{awb_digits[3:]}"
        try:
            blob = self.page.evaluate(
                """() => {
                  // Bỏ giá trị input tìm kiếm — tránh false hot-path
                  const clone = document.body ? document.body.innerText : '';
                  return (clone || '').slice(0, 6000);
                }"""
            )
        except Exception:
            return False
        text = str(blob or "")
        if awb_digits in text or display in text:
            self._detail_awb = awb_digits
            return True
        return False

    def _clear_date_filters_fast(self) -> None:
        """
        Xóa lọc ngày bay trước khi tìm AWB#.
        Ant Design RangePicker ẩn nút X tới khi hover — gán value='' không đủ.
        """
        try:
            # Hover từng picker để hiện .ant-picker-clear rồi bấm
            pickers = self.page.locator(".ant-picker")
            for i in range(min(pickers.count(), 4)):
                try:
                    pk = pickers.nth(i)
                    if not pk.is_visible(timeout=200):
                        continue
                    pk.hover(timeout=800)
                    clr = pk.locator(".ant-picker-clear")
                    if clr.count() > 0:
                        clr.first.click(timeout=800, force=True)
                except Exception:
                    pass
            # Ctrl+A + Delete trên ô ngày
            for sel in ("#search-form_dateSearch",):
                try:
                    loc = self.page.locator(sel)
                    if loc.count() == 0 or not loc.first.is_visible(timeout=200):
                        continue
                    loc.first.click(timeout=500)
                    loc.first.press("Control+A")
                    loc.first.press("Backspace")
                    loc.first.fill("")
                except Exception:
                    pass
            try:
                end = self.page.get_by_placeholder(re.compile(r"k[eế]t\s*th[uú]c", re.I))
                if end.count() > 0 and end.first.is_visible(timeout=200):
                    end.first.click(timeout=500)
                    end.first.press("Control+A")
                    end.first.press("Backspace")
                    end.first.fill("")
            except Exception:
                pass
            try:
                self.page.keyboard.press("Escape")
            except Exception:
                pass
            self.page.evaluate(
                """() => {
                  for (const c of document.querySelectorAll('.ant-picker-clear')) {
                    try { c.dispatchEvent(new MouseEvent('click', { bubbles: true })); } catch (e) {}
                  }
                }"""
            )
        except Exception:
            pass
        self._list_date_ymd = None

    def _diag_search_state(self, awb_digits: str) -> dict[str, Any]:
        """Snapshot form + bảng khi không thấy dòng — ghi file để debug."""
        info: dict[str, Any] = {"awb": awb_digits}
        try:
            info["form"] = self.page.evaluate(
                """() => {
                  const val = (sel) => {
                    const el = document.querySelector(sel);
                    return el ? String(el.value||'') : null;
                  };
                  const byPh = (re) => {
                    const el = [...document.querySelectorAll('input')].find(i => re.test(i.placeholder||''));
                    return el ? String(el.value||'') : null;
                  };
                  return {
                    url: location.href,
                    date_start: val('#search-form_dateSearch'),
                    date_end: byPh(/kết thúc|ket thuc/i),
                    awb: byPh(/AWB#/i),
                    prefix: byPh(/prefix/i),
                    picker_texts: [...document.querySelectorAll('.ant-picker')].map(
                      p => (p.innerText||'').trim().slice(0, 80)
                    ),
                  };
                }"""
            )
        except Exception as e:
            info["form_err"] = str(e)[:200]
        try:
            info["rows"] = self.list_row_statuses()[:15]
            info["row_count"] = len(info["rows"])
        except Exception as e:
            info["rows_err"] = str(e)[:200]
        try:
            out = Path("output") / "diag_search"
            out.mkdir(parents=True, exist_ok=True)
            stamp = time.strftime("%Y%m%d_%H%M%S")
            shot = out / f"{awb_digits}_{stamp}.png"
            self.page.screenshot(path=str(shot), full_page=True)
            info["screenshot"] = str(shot)
            (out / f"{awb_digits}_{stamp}.json").write_text(
                __import__("json").dumps(info, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception as e:
            info["save_err"] = str(e)[:200]
        return info

    @staticmethod
    def _normalize_flight_date_to_ymd(raw: str) -> str | None:
        """Chuẩn hóa cột ngày bay TCS (DD-MM-YYYY / DD/MM/YYYY / YYYY-MM-DD) → YYYY-MM-DD."""
        s = (raw or "").strip()
        if not s:
            return None
        m = re.match(r"^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$", s)
        if m:
            day, month, year = m.groups()
            return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        m = re.match(r"^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$", s)
        if m:
            year, month, day = m.groups()
            return f"{year}-{month.zfill(2)}-{day.zfill(2)}"
        return None

    @classmethod
    def _row_matches_session_date(cls, row: dict[str, str], ymd: str) -> bool:
        """True khi cột ngày bay khớp ngày phiên Ops (bỏ qua nếu ô trống)."""
        if not ymd:
            return True
        normalized = cls._normalize_flight_date_to_ymd(str(row.get("flight_date") or ""))
        if not normalized:
            return True
        return normalized == ymd

    @staticmethod
    def _ymd_to_dmy(ymd: str) -> str:
        parts = ymd.strip().split("-")
        if len(parts) != 3:
            raise SiteChangedError(f"Ngày không hợp lệ (YYYY-MM-DD): {ymd}")
        return f"{parts[2]}-{parts[1]}-{parts[0]}"

    def set_flight_date_range(self, ymd_from: str, ymd_to: str | None = None) -> None:
        """
        Ant Design RangePicker: luôn lọc đúng 1 ngày Ops (from = to).
        Không để RangePicker tự rộng thành đầu tháng → cuối tháng.
        """
        # Đồng bộ Ops chỉ quét đúng ngày phiên — bỏ khoảng nhiều ngày nếu caller gửi lệch.
        ymd = str(ymd_from or "").strip()
        ymd_to_s = str(ymd_to or ymd).strip() or ymd
        if ymd_to_s != ymd:
            ymd_to_s = ymd
        dmy = self._ymd_to_dmy(ymd)

        last_start, last_end = "", ""
        for _attempt in range(3):
            self._clear_date_filters_fast()
            if self._pick_single_day_range(ymd):
                last_start, last_end = self._read_date_filter_values()
                if self._date_vals_match_dmy(last_start, last_end, dmy):
                    return
            # Fallback gõ text — ép cả 2 ô cùng ngày
            start = self._ensure_list_search_form(timeout_ms=12000)
            self._set_react_input(start, dmy)
            self.page.wait_for_timeout(50)
            end = self.page.get_by_placeholder("Ngày kết thúc")
            self._set_react_input(end, dmy)
            self.page.wait_for_timeout(40)
            self._set_react_input(end, dmy)
            try:
                self.page.keyboard.press("Escape")
            except Exception:
                pass
            self.page.wait_for_timeout(60)
            last_start, last_end = self._read_date_filter_values()
            if self._date_vals_match_dmy(last_start, last_end, dmy):
                return

        raise SiteChangedError(
            f"Bộ lọc ngày chưa khớp {dmy!r} (start={last_start!r}, end={last_end!r}) "
            "— chỉ quét đúng 1 ngày phiên Ops"
        )

    @staticmethod
    def _date_vals_match_dmy(start_val: str, end_val: str, dmy: str) -> bool:
        s = (start_val or "").replace("/", "-")
        e = (end_val or "").replace("/", "-")
        return bool(s and e and dmy in s and dmy in e)

    def _pick_single_day_range(self, ymd: str) -> bool:
        """Click cùng 1 ô ngày 2 lần trên RangePicker (from = to)."""
        try:
            start = self.page.locator("#search-form_dateSearch")
            if start.count() == 0:
                return False
            start.first.click(timeout=2000)
            popup = self.page.locator(
                ".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)"
            ).last
            popup.wait_for(state="visible", timeout=2500)
            cell = popup.locator(
                f"td[title='{ymd}']:not(.ant-picker-cell-disabled)"
            ).last
            if cell.count() == 0:
                # Thử chuyển tháng gần đúng bằng gõ rồi mở lại
                return False
            cell.evaluate("el => el.click()")
            self.page.wait_for_timeout(120)
            popup = self.page.locator(
                ".ant-picker-dropdown:not(.ant-picker-dropdown-hidden)"
            ).last
            cell2 = popup.locator(
                f"td[title='{ymd}']:not(.ant-picker-cell-disabled)"
            ).last
            if cell2.count() == 0:
                return False
            cell2.evaluate("el => el.click()")
            self.page.wait_for_timeout(140)
            try:
                self.page.keyboard.press("Escape")
            except Exception:
                pass
            return True
        except Exception:
            return False

    def _read_date_filter_values(self) -> tuple[str, str]:
        try:
            vals = self.page.evaluate(
                """() => {
                  const startEl = document.querySelector('#search-form_dateSearch');
                  const endEl = [...document.querySelectorAll('input')].find((input) =>
                    /kết thúc|ket thuc/i.test(input.getAttribute('placeholder') || '')
                  );
                  return {
                    start: startEl ? String(startEl.value || '').trim() : '',
                    end: endEl ? String(endEl.value || '').trim() : '',
                  };
                }"""
            )
            return str(vals.get("start") or ""), str(vals.get("end") or "")
        except Exception:
            return "", ""

    def _assert_date_filter_applied(self, ymd: str) -> None:
        """Đảm bảo form đã giữ đúng 1 ngày (from=to) trước khi lật trang."""
        dmy = self._ymd_to_dmy(ymd)
        start_val, end_val = self._read_date_filter_values()
        if not self._date_vals_match_dmy(start_val, end_val, dmy):
            raise SiteChangedError(
                f"Bộ lọc ngày chưa khớp {dmy!r} (start={start_val!r}, end={end_val!r}) "
                "— chỉ quét đúng 1 ngày phiên Ops"
            )

    def clear_awb_filters(self) -> None:
        for ph in ("AWB#", "Prefix"):
            try:
                inp = self.page.get_by_placeholder(ph)
                if inp.count() > 0:
                    inp.first.fill("")
            except Exception:
                pass

    def clear_date_filters(self) -> None:
        """Xóa ngày bay để tìm theo AWB# không bị lệch filter ngày cũ."""
        try:
            start = self.page.locator("#search-form_dateSearch")
            if start.count() > 0 and start.first.is_visible(timeout=800):
                start.first.fill("")
        except Exception:
            pass
        try:
            end = self.page.get_by_placeholder("Ngày kết thúc")
            if end.count() > 0 and end.first.is_visible(timeout=800):
                end.first.fill("")
        except Exception:
            pass
        try:
            self.page.keyboard.press("Escape")
            self.page.wait_for_timeout(100)
            self.page.keyboard.press("Escape")
        except Exception:
            pass
        self._list_date_ymd = None

    def search_by_flight_date(self, ymd: str, *, ymd_to: str | None = None) -> None:
        """Lọc Danh sách ESID theo ngày bay (1 ngày Ops = from=to)."""
        self.goto_list(force=False)
        # Sau Điền / warm declare / PDF: ép lại DANH SÁCH + bộ lọc ngày
        self._ensure_list_search_form(timeout_ms=12000)
        self.clear_awb_filters()
        self.set_flight_date_range(ymd, ymd_to)
        # Nút primary TÌM KIẾM (force — tránh overlay Ant Form)
        try:
            primary = self.page.locator("button.ant-btn-primary").filter(
                has_text=re.compile(r"TÌM\s*KIẾM|Tim\s*kiem", re.I)
            )
            if primary.count() > 0:
                primary.first.click(timeout=4000, force=True)
            else:
                submit_ref = self.esid_ref("submit")
                if submit_ref:
                    self._resolve(submit_ref).first.click(timeout=4000, force=True)
                else:
                    self.page.get_by_role(
                        "button", name=re.compile(r"TÌM KIẾM|Tim kiem", re.I)
                    ).first.click(timeout=4000, force=True)
        except Exception as e:
            raise SiteChangedError(f"Không bấm TÌM KIẾM: {e}") from e
        self._wait_search_results("", timeout_ms=6000)
        self._assert_date_filter_applied(ymd)
        self._list_date_ymd = ymd

    def ensure_date_filtered_list(self, ymd: str) -> None:
        """Giữ danh sách đã lọc theo ngày — tránh TÌM KIẾM lại mỗi AWB khi tải hàng loạt."""
        on_detail = False
        try:
            on_detail = self.page.get_by_role("button", name=re.compile(r"^IN$", re.I)).count() > 0
        except Exception:
            pass
        if on_detail:
            self._click_list_tab()
            self.page.wait_for_timeout(200)
        if self._list_date_ymd == ymd and self._on_esid_list():
            return
        self.search_by_flight_date(ymd)

    @staticmethod
    def _blob_is_reception(status: str, text: str) -> bool:
        """
        Chỉ True khi có cụm đúng «Hoàn thành tiếp nhận» (hoặc không dấu).
        Không tách «hoàn thành» + «tiếp nhận» — dễ khớp nhầm cột/header.
        """
        blob = f"{status or ''} {text or ''}".lower()
        return (
            RECEPTION_STATUS.lower() in blob
            or "hoàn thành tiếp nhận" in blob
            or "hoan thanh tiep nhan" in blob
        )

    @staticmethod
    def _digits(s: str) -> str:
        return "".join(c for c in (s or "") if c.isdigit())

    def list_reception_items(self) -> list[dict[str, Any]]:
        """Mọi dòng bảng hiện tại có trạng thái Hoàn thành tiếp nhận."""
        rows = self.list_row_statuses()
        out: list[dict[str, Any]] = []
        for r in rows:
            if not self._blob_is_reception(r.get("status") or "", r.get("text") or ""):
                continue
            token = self._digits(r.get("awb") or "")
            out.append(
                {
                    "awb": token or (r.get("awb") or "").strip(),
                    "awb_last8": token[-8:] if len(token) >= 8 else token,
                    "ready": True,
                    "normalized_status": NormalizedStatus.RECEPTION_COMPLETED.value,
                    "tcs_status": r.get("status") or RECEPTION_STATUS,
                    "flight": r.get("flight") or "",
                    "flight_date": r.get("flight_date") or "",
                    "esid_code": r.get("esid") or "",
                    "raw": (r.get("text") or "")[:400],
                    "error": "",
                }
            )
        return out

    def match_reception_to_ops(
        self, reception: list[dict[str, Any]], ops_awbs: list[str]
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """
        Khớp dòng ESID ready với AWB Ops (11 số).
        Trả (ready_matched, all_reception_annotated).
        """
        ops_norm: list[str] = []
        for a in ops_awbs:
            d = self._digits(a)[:11]
            if len(d) == 11:
                ops_norm.append(d)
        ops_set = set(ops_norm)
        ready: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in reception:
            # Chỉ khớp lô đã xác nhận tiếp nhận (agent đã lọc); ưu tiên đủ 11 số
            if not item.get("ready") and item.get("normalized_status") != NormalizedStatus.RECEPTION_COMPLETED.value:
                continue
            if not self._blob_is_reception(
                str(item.get("tcs_status") or ""), str(item.get("raw") or "")
            ):
                # Cho phép khi tcs_status đã gán đúng RECEPTION_STATUS
                ts = str(item.get("tcs_status") or "")
                if RECEPTION_STATUS.lower() not in ts.lower() and "hoan thanh tiep nhan" not in ts.lower():
                    continue
            token = self._digits(str(item.get("awb") or ""))
            matched: str | None = None
            if len(token) >= 11 and token[:11] in ops_set:
                matched = token[:11]
            elif len(token) >= 8:
                last8 = token[-8:]
                candidates = [ops for ops in ops_norm if ops[3:] == last8]
                # Chỉ last8 khi khớp đúng 1 Ops AWB — tránh gán nhầm
                if len(candidates) == 1:
                    matched = candidates[0]
            if matched and matched not in seen:
                seen.add(matched)
                ready.append(
                    {
                        **item,
                        "awb": matched,
                        "awb_last8": matched[3:],
                        "ready": True,
                        "normalized_status": NormalizedStatus.RECEPTION_COMPLETED.value,
                        "tcs_status": RECEPTION_STATUS,
                    }
                )
        # items: mỗi ops AWB — ready nếu khớp
        items: list[dict[str, Any]] = []
        ready_set = {r["awb"] for r in ready}
        for ops in ops_norm:
            if ops in ready_set:
                hit = next(r for r in ready if r["awb"] == ops)
                items.append(hit)
            else:
                items.append(
                    {
                        "awb": ops,
                        "awb_last8": ops[3:],
                        "ready": False,
                        "normalized_status": NormalizedStatus.NOT_COMPLETED.value,
                        "tcs_status": "",
                        "error": "NOT_IN_RECEPTION_LIST",
                        # Tránh cụm «Hoàn thành tiếp nhận» trong raw — FE từng regex nhầm
                        "raw": "Không thấy trên TCS (ngày phiên) với trạng thái tiếp nhận xong",
                    }
                )
        return ready, items

    def scan_by_flight_date(self, ymd: str, ops_awbs: list[str]) -> dict[str, Any]:
        """Một lần lọc ngày → đọc các trang (chỉ dòng đúng ngày) → khớp Ops."""
        self.search_by_flight_date(ymd)
        self._prefer_large_page_size()
        rows = self.list_all_row_statuses(max_pages=40, session_ymd=ymd)
        reception: list[dict[str, Any]] = []
        for r in rows:
            if not self._blob_is_reception(r.get("status") or "", r.get("text") or ""):
                continue
            token = self._digits(r.get("awb") or "")
            if len(token) < 8:
                continue
            reception.append(
                {
                    "awb": token[:11] if len(token) >= 11 else token,
                    "awb_last8": token[-8:] if len(token) >= 8 else token,
                    "ready": True,
                    "normalized_status": NormalizedStatus.RECEPTION_COMPLETED.value,
                    "tcs_status": RECEPTION_STATUS,
                    "flight": r.get("flight") or "",
                    "flight_date": r.get("flight_date") or "",
                    "esid_code": r.get("esid") or "",
                    "raw": (r.get("text") or "")[:400],
                    "error": "",
                }
            )
        ready, items = self.match_reception_to_ops(reception, ops_awbs)
        return {
            "reception_all": reception,
            "ready": ready,
            "items": items,
            # Dùng nội bộ cho workspace PDF cache-first. Không giữ element handle
            # vì DOM Ant Table có thể render lại sau mỗi lần chuyển trang.
            "index_rows": rows,
            "list_total": len(rows),
            "reception_total": len(reception),
        }

    def search_by_awb_last8(self, awb_digits: str, *, force_reload: bool = False) -> None:
        if len(awb_digits) != 11:
            raise SiteChangedError("AWB phải đủ 11 chữ số")
        last8 = awb_digits[3:]
        prefix = awb_digits[:3]
        self._detail_awb = None
        self.goto_list(force=force_reload)
        self._clear_date_filters_fast()
        awb_ref = self.esid_ref("awb_last")
        try:
            if awb_ref:
                inp = self._resolve(awb_ref)
            else:
                inp = self.page.get_by_placeholder("AWB#")
            self._set_react_input(inp, last8)
            got = ""
            try:
                got = (inp.first.input_value(timeout=500) or "").strip()
            except Exception:
                pass
            if got != last8:
                raise SiteChangedError(
                    f"Ô AWB# không giữ đủ 8 số (cần {last8!r}, được {got!r})"
                )
        except SiteChangedError:
            raise
        except Exception as e:
            if not force_reload:
                self.search_by_awb_last8(awb_digits, force_reload=True)
                return
            raise SiteChangedError(f"Không điền được ô AWB#: {e}") from e

        try:
            prefix_ref = self.esid_ref("awb_first")
            if prefix_ref:
                self._set_react_input(self._resolve(prefix_ref), prefix)
            else:
                pref = self.page.get_by_placeholder(re.compile(r"prefix", re.I))
                if pref.count() > 0:
                    self._set_react_input(pref, prefix)
        except Exception:
            pass

        def _click_search() -> None:
            # Chờ hết loading từ lần tìm trước (nút primary có ant-btn-loading)
            try:
                self.page.locator("button.ant-btn-loading").first.wait_for(
                    state="detached", timeout=4000
                )
            except Exception:
                pass
            # Ưu tiên nút primary có chữ TÌM KIẾM — tránh nhầm #search-form_awbNum
            primary = self.page.locator("button.ant-btn-primary").filter(
                has_text=re.compile(r"TÌM\s*KIẾM|Tim\s*kiem", re.I)
            )
            if primary.count() > 0:
                primary.first.click(timeout=5000, force=True)
                return
            submit_ref = self.esid_ref("submit")
            if submit_ref:
                self._resolve(submit_ref).first.click(timeout=5000, force=True)
                return
            self.page.get_by_role(
                "button", name=re.compile(r"^TÌM\s*KIẾM$|^Tim\s*kiem$", re.I)
            ).first.click(timeout=5000, force=True)

        try:
            _click_search()
        except Exception as e:
            raise SiteChangedError(f"Không bấm TÌM KIẾM: {e}") from e
        ok = self._wait_search_results(last8, timeout_ms=7000)
        if not ok:
            # React form chưa nhận giá trị — set lại + bấm tìm lần 2
            try:
                self._set_react_input(
                    self._resolve(awb_ref) if awb_ref else self.page.get_by_placeholder("AWB#"),
                    last8,
                )
                _click_search()
                ok = self._wait_search_results(last8, timeout_ms=7000)
            except Exception:
                ok = False
        if not ok:
            # Vẫn không thấy last8 trong bảng → để prepare đọc rows + diag
            self.page.wait_for_timeout(150)

    def list_row_statuses(self) -> list[dict[str, str]]:
        """Đọc các dòng bảng ESID (awb/esid, status) — trang hiện tại."""
        return self.page.evaluate(
            """() => {
              const rows = [...document.querySelectorAll(
                '.ant-table-tbody tr, table tbody tr'
              )].filter(tr => tr.querySelectorAll('td').length >= 3);
              return rows.map(tr => {
                const cells = [...tr.querySelectorAll('td')].map(td =>
                  (td.innerText||'').trim().replace(/\\s+/g,' ')
                );
                const text = (tr.innerText||'').trim().replace(/\\s+/g,' ');
                let status = '';
                // Ưu tiên ô đúng cụm «Hoàn thành tiếp nhận» — không lấy «Hoàn thành» đơn
                for (const c of cells) {
                  const low = c.toLowerCase();
                  if (low.includes('hoàn thành tiếp nhận') || low.includes('hoan thanh tiep nhan')) {
                    status = c;
                    break;
                  }
                }
                if (!status && cells.length) {
                  // Cột trạng thái thường là cột cuối có chữ
                  for (let i = cells.length - 1; i >= 0; i--) {
                    const c = cells[i] || '';
                    if (c.length >= 4 && /[a-zA-Zà-ỹÀ-Ỹ]/.test(c)) {
                      status = c;
                      break;
                    }
                  }
                }
                return {
                  awb: cells[0] || '',
                  flight: cells[1] || '',
                  flight_date: cells[2] || '',
                  esid: cells[3] || '',
                  status,
                  text: text.slice(0, 240)
                };
              }).filter(r => r.text && !/^\\d+$/.test(r.text.replace(/\\s/g,'').slice(0,20)));
            }"""
        )

    def _prefer_large_page_size(self) -> None:
        """Chọn page size lớn nhất (100) để giảm số lần lật trang khi quét."""
        try:
            changer = self.page.locator(".ant-pagination-options-size-changer")
            if changer.count() == 0 or not changer.first.is_visible(timeout=400):
                return
            changer.first.click(timeout=800)
            self.page.wait_for_timeout(80)
            for label in ("100 / page", "100/page", "100"):
                opt = self.page.get_by_text(label, exact=False)
                if opt.count() > 0 and opt.first.is_visible(timeout=300):
                    opt.first.click(timeout=800)
                    self.page.wait_for_timeout(200)
                    return
            try:
                self.page.keyboard.press("Escape")
            except Exception:
                pass
        except Exception:
            pass

    def _pagination_next(self) -> bool:
        """Bấm trang kế. True nếu còn trang."""
        try:
            nxt = self.page.locator(
                ".ant-pagination-next:not(.ant-pagination-disabled)"
            )
            if nxt.count() == 0 or not nxt.first.is_visible(timeout=200):
                return False
            before = ""
            try:
                rows = self.list_row_statuses()
                before = (rows[0].get("awb") if rows else "") or ""
            except Exception:
                pass
            nxt.first.click(timeout=1500)
            # Chờ bảng đổi
            for _ in range(25):
                self.page.wait_for_timeout(60)
                try:
                    rows = self.list_row_statuses()
                    after = (rows[0].get("awb") if rows else "") or ""
                    if after and after != before:
                        return True
                except Exception:
                    pass
            return True
        except Exception:
            return False

    def _pagination_current(self) -> int:
        try:
            active = self.page.locator(".ant-pagination-item-active")
            if active.count() > 0:
                raw = (
                    active.first.get_attribute("title")
                    or active.first.inner_text(timeout=400)
                    or ""
                )
                return max(1, int(str(raw).strip()))
        except Exception:
            pass
        return 1

    def _goto_page_number(self, target_page: int) -> bool:
        """Đi tới page bảng đã cache; fallback trả False để caller tìm AWB."""
        target = max(1, int(target_page or 1))
        current = self._pagination_current()
        if current == target:
            return True
        direction = (
            ".ant-pagination-next:not(.ant-pagination-disabled)"
            if target > current
            else ".ant-pagination-prev:not(.ant-pagination-disabled)"
        )
        for _ in range(min(40, abs(target - current) + 2)):
            current = self._pagination_current()
            if current == target:
                return True
            control = self.page.locator(direction)
            if control.count() == 0:
                break
            before = current
            try:
                control.first.click(timeout=1200)
            except Exception:
                break
            for _ in range(25):
                self.page.wait_for_timeout(60)
                current = self._pagination_current()
                if current != before:
                    break
        return self._pagination_current() == target

    def list_all_row_statuses(
        self, *, max_pages: int = 40, session_ymd: str | None = None
    ) -> list[dict[str, str]]:
        """Đọc các trang kết quả ESID sau khi đã lọc ngày — chỉ giữ dòng đúng ngày phiên."""
        all_rows: list[dict[str, str]] = []
        seen_keys: set[str] = set()
        for page_i in range(max(1, max_pages)):
            rows = self.list_row_statuses()
            current_page = self._pagination_current()
            kept_on_page = 0
            for r in rows:
                if session_ymd and not self._row_matches_session_date(r, session_ymd):
                    continue
                key = f"{r.get('awb')}|{r.get('esid')}|{r.get('flight_date')}|{r.get('status')}"
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                all_rows.append({**r, "page_number": current_page})
                kept_on_page += 1
            # Trang có dữ liệu nhưng không dòng nào đúng ngày → dừng (tránh lật cả kho)
            if session_ymd and rows and kept_on_page == 0:
                break
            if page_i + 1 >= max_pages:
                break
            if not self._pagination_next():
                break
        return all_rows

    def _match_rows_for_awb(self, awb_digits: str, rows: list[dict[str, str]]) -> list[dict[str, str]]:
        """Ưu tiên khớp đủ 11 số / prefix+last8; fallback last8 trong ô AWB hoặc text dòng."""
        last8 = awb_digits[3:]
        prefix = awb_digits[:3]
        exact: list[dict[str, str]] = []
        by_last8: list[dict[str, str]] = []
        for r in rows:
            awb_cell = r.get("awb") or ""
            text = r.get("text") or ""
            digits = self._digits(awb_cell)
            if awb_digits in awb_cell or awb_digits in text or digits == awb_digits:
                exact.append(r)
                continue
            if len(digits) >= 11 and digits[:11] == awb_digits:
                exact.append(r)
                continue
            if len(digits) >= 8 and digits[-8:] == last8:
                # Ưu tiên cùng prefix 3 số nếu ô có đủ
                if len(digits) >= 11 and digits[:3] == prefix:
                    exact.append(r)
                else:
                    by_last8.append(r)
                continue
            if last8 in awb_cell or last8 in text:
                by_last8.append(r)
        return exact or by_last8

    def inspect_awb(self, awb_digits: str) -> dict[str, Any]:
        """Tra 1 AWB trên ESID — trả thông tin dòng + ready nếu Hoàn thành tiếp nhận."""
        self.search_by_awb_last8(awb_digits)
        rows = self.list_row_statuses()
        matched = self._match_rows_for_awb(awb_digits, rows)
        base: dict[str, Any] = {
            "awb": awb_digits,
            "awb_last8": awb_digits[3:],
            "ready": False,
            "normalized_status": NormalizedStatus.NOT_COMPLETED.value,
            "tcs_status": "",
            "flight": "",
            "flight_date": "",
            "esid_code": "",
            "raw": "",
            "error": "",
        }
        if not matched:
            base["raw"] = "ESID: không tìm thấy dòng"
            base["error"] = "NOT_FOUND"
            return base
        reception = [
            r
            for r in matched
            if self._blob_is_reception(r.get("status") or "", r.get("text") or "")
        ]
        pick = reception[0] if reception else matched[0]
        ready = bool(reception) and self._blob_is_reception(
            pick.get("status") or "", pick.get("text") or ""
        )
        if ready:
            norm = NormalizedStatus.RECEPTION_COMPLETED
            tcs_status = RECEPTION_STATUS
        else:
            blob = f"{pick.get('status') or ''} {pick.get('text') or ''}".lower()
            if "hoàn thành" in blob or "hoan thanh" in blob:
                norm = NormalizedStatus.COMPLETED
            else:
                norm = NormalizedStatus.NOT_COMPLETED
            tcs_status = pick.get("status") or ""
        base.update(
            {
                "ready": ready,
                "normalized_status": norm.value,
                "tcs_status": tcs_status,
                "flight": pick.get("flight") or "",
                "flight_date": pick.get("flight_date") or "",
                "esid_code": pick.get("esid") or "",
                "raw": (pick.get("text") or "")[:400],
            }
        )
        return base

    def scan_awbs(self, awb_digits_list: list[str]) -> list[dict[str, Any]]:
        """Quét nhiều AWB trên Danh sách ESID (tuần tự)."""
        out: list[dict[str, Any]] = []
        for awb in awb_digits_list:
            digits = "".join(c for c in awb if c.isdigit())[:11]
            if len(digits) != 11:
                out.append(
                    {
                        "awb": digits,
                        "ready": False,
                        "normalized_status": NormalizedStatus.VALIDATION_ERROR.value,
                        "error": "BAD_AWB",
                    }
                )
                continue
            try:
                out.append(self.inspect_awb(digits))
            except NeedsLoginError:
                raise
            except Exception as e:
                out.append(
                    {
                        "awb": digits,
                        "awb_last8": digits[3:],
                        "ready": False,
                        "normalized_status": NormalizedStatus.FAILED.value,
                        "error": str(e)[:200],
                    }
                )
        return out

    def read_reception_status(self, awb_digits: str) -> tuple[str, NormalizedStatus]:
        info = self.inspect_awb(awb_digits)
        raw = info.get("raw") or info.get("tcs_status") or ""
        try:
            return str(raw)[:800], NormalizedStatus(info["normalized_status"])
        except Exception:
            return str(raw)[:800], NormalizedStatus.NOT_COMPLETED

    def open_detail_row(self, awb_digits: str, *, require_reception: bool = True) -> None:
        """Bấm dòng chi tiết — JS click nhanh; fallback duyệt Playwright nếu cần."""
        last8 = awb_digits[3:]
        prefer_reception = bool(require_reception)
        clicked = False
        try:
            clicked = bool(
                self.page.evaluate(
                    """({ last8, awb, preferReception }) => {
                      const rows = [...document.querySelectorAll('table tbody tr, .ant-table-tbody tr')];
                      const match = (tr) => {
                        const t = (tr.innerText || '');
                        return t.includes(awb) || t.includes(last8);
                      };
                      const isReception = (tr) => /hoàn thành tiếp nhận|hoan thanh tiep nhan/i.test(tr.innerText||'');
                      let row = preferReception ? rows.find(tr => match(tr) && isReception(tr)) : null;
                      if (!row) row = rows.find(match);
                      if (!row) return false;
                      row.scrollIntoView({ block: 'center' });
                      row.click();
                      return true;
                    }""",
                    {"last8": last8, "awb": awb_digits, "preferReception": prefer_reception},
                )
            )
        except Exception:
            clicked = False
        if not clicked:
            # Fallback cũ (chậm hơn) khi DOM lệch
            rows_loc = self.page.locator("table tbody tr, .ant-table-tbody tr")
            n = rows_loc.count()
            target = None
            fallback = None
            for i in range(min(n, 40)):
                row = rows_loc.nth(i)
                try:
                    text = (row.inner_text(timeout=800) or "").strip()
                except Exception:
                    continue
                if last8 not in text and awb_digits not in text:
                    continue
                if self._blob_is_reception("", text):
                    target = row
                    break
                if fallback is None:
                    fallback = row
            if target is None and not require_reception:
                target = fallback
            if target is None:
                raise SiteChangedError(
                    f"Không thấy dòng ESID cho AWB …{last8}"
                    + (" với trạng thái Hoàn thành tiếp nhận" if require_reception else "")
                )
            target.click(no_wait_after=True)
        try:
            self.page.get_by_role("button", name=re.compile(r"^IN$", re.I)).first.wait_for(
                state="visible", timeout=5000
            )
        except Exception:
            self.page.wait_for_timeout(150)
        self._detail_awb = awb_digits

    def _find_print_button(self):
        print_ref = self.esid_ref("print_button")
        btn = None
        if print_ref:
            try:
                btn = self._resolve(print_ref)
            except Exception:
                btn = None
        if btn is None or btn.count() == 0:
            btn = self.page.get_by_role("button", name=re.compile(r"^IN$", re.I))
        if btn.count() == 0:
            btn = self.page.get_by_role("button", name="IN")
        if btn.count() == 0:
            raise SiteChangedError("Không thấy nút IN trên trang chi tiết ESID")
        return btn

    @staticmethod
    def _dismiss_os_print_dialog() -> None:
        """Đóng hộp in Windows (Escape) — Playwright keyboard không luôn tới dialog OS."""
        try:
            import ctypes

            user32 = ctypes.windll.user32  # type: ignore[attr-defined]
            vk_escape = 0x1B
            keyeventf_keyup = 0x0002
            for _ in range(2):
                user32.keybd_event(vk_escape, 0, 0, 0)
                user32.keybd_event(vk_escape, 0, keyeventf_keyup, 0)
        except Exception:
            pass

    def _pdf_from_page(self, page, dest_path: Path, *, dismiss_escape: bool = True) -> Path:
        """
        Lưu PDF khớp Chrome «Save as PDF»:
        - tôn trọng @page { size: A4 } (preferCSSPageSize)
        - không dùng Letter mặc định của page.pdf
        """
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        if dismiss_escape:
            try:
                page.keyboard.press("Escape")
            except Exception:
                pass
        try:
            page.emulate_media(media="print")
        except Exception:
            pass
        last_err: Exception | None = None
        try:
            # 1) CDP — gần Chrome Save as PDF nhất
            try:
                cdp = page.context.new_cdp_session(page)
                try:
                    result = cdp.send(
                        "Page.printToPDF",
                        {
                            "printBackground": True,
                            "preferCSSPageSize": True,
                            "paperWidth": 8.27,
                            "paperHeight": 11.69,
                            "marginTop": 0,
                            "marginBottom": 0,
                            "marginLeft": 0,
                            "marginRight": 0,
                        },
                    )
                    data = base64.b64decode(result.get("data") or "")
                    if len(data) >= 100:
                        dest_path.write_bytes(data)
                        return dest_path
                    raise SiteChangedError("printToPDF trả về rỗng")
                finally:
                    try:
                        cdp.detach()
                    except Exception:
                        pass
            except SiteChangedError:
                raise
            except Exception as e:
                last_err = e
            # 2) Fallback Playwright page.pdf — vẫn ép A4 + CSS page size
            try:
                page.pdf(
                    path=str(dest_path),
                    print_background=True,
                    prefer_css_page_size=True,
                    format="A4",
                    margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
                )
            except Exception as e:
                last_err = e
                raise SiteChangedError(
                    f"Không lưu được PDF (đóng hộp in hệ thống nếu đang mở): {e}"
                ) from e
        finally:
            try:
                page.emulate_media(media=None)
            except Exception:
                pass
        if not dest_path.exists() or dest_path.stat().st_size < 100:
            raise SiteChangedError(
                f"PDF rỗng sau khi lưu{f' ({last_err})' if last_err else ''}"
            )
        return dest_path

    def _bill_html_fast(self, frame) -> str:
        """HTML phiếu nhanh: canvas→img + content(); bỏ walk cssRules (chậm)."""
        try:
            frame.evaluate(
                """() => {
                  for (const c of [...document.querySelectorAll('canvas')]) {
                    try {
                      const img = document.createElement('img');
                      img.src = c.toDataURL('image/png');
                      img.setAttribute('style', c.getAttribute('style') || '');
                      if (c.width) img.width = c.width;
                      if (c.height) img.height = c.height;
                      c.replaceWith(img);
                    } catch (e) {}
                  }
                  if (!document.querySelector('base')) {
                    const b = document.createElement('base');
                    b.href = 'https://www.tcs.com.vn/';
                    (document.head || document.documentElement).prepend(b);
                  }
                  if (!document.querySelector('style[data-tcs-page]')) {
                    const st = document.createElement('style');
                    st.setAttribute('data-tcs-page', '1');
                    st.textContent = '@media print { @page { size: A4 portrait; margin: 0; } html, body { margin: 0; } }';
                    (document.head || document.documentElement).appendChild(st);
                  }
                }"""
            )
        except Exception:
            pass
        try:
            html = frame.content()
        except Exception as e:
            raise SiteChangedError(f"Không đọc được HTML frame in: {e}") from e
        if not html or len(str(html)) < 120:
            raise SiteChangedError("Frame in rỗng")
        return str(html)

    def _ensure_print_scratch_page(self):
        """Tái dùng 1 tab in — tránh new_page mỗi lần (~100–300ms)."""
        page = getattr(self, "_print_scratch", None)
        try:
            if page is not None and not page.is_closed():
                return page
        except Exception:
            pass
        page = self.page.context.new_page()
        try:
            page.set_viewport_size({"width": 794, "height": 1123})
        except Exception:
            pass
        self._print_scratch = page
        return page

    def _serialize_bill_html(self, frame) -> str:
        """
        HTML phiếu để in lại cho khớp Chrome:
        - canvas (QR) → img data-URL (content() làm mất bitmap canvas)
        - CSS/img tương đối → URL tuyệt đối + inline cssRules
        - giữ @media print / @page A4
        """
        html = frame.evaluate(
            """() => {
              const ORIGIN = 'https://www.tcs.com.vn';
              const abs = (u) => {
                if (!u) return u;
                const s = String(u);
                if (/^(data:|blob:|https?:)/i.test(s)) return s;
                try { return new URL(s, ORIGIN + '/').href; } catch (e) { return s; }
              };
              // QR trên canvas — chuyển img trước khi lấy HTML
              for (const c of [...document.querySelectorAll('canvas')]) {
                try {
                  const img = document.createElement('img');
                  img.src = c.toDataURL('image/png');
                  img.setAttribute('style', c.getAttribute('style') || '');
                  if (c.width) img.width = c.width;
                  if (c.height) img.height = c.height;
                  c.replaceWith(img);
                } catch (e) {}
              }
              for (const el of document.querySelectorAll('link[href], script[src], img[src]')) {
                const attr = el.hasAttribute('href') ? 'href' : 'src';
                const v = el.getAttribute(attr);
                if (v) el.setAttribute(attr, abs(v));
              }
              let cssText = '';
              for (const sheet of document.styleSheets) {
                try {
                  cssText += [...sheet.cssRules].map(r => r.cssText).join('\\n') + '\\n';
                } catch (e) {}
              }
              let head = document.head;
              if (!head) {
                head = document.createElement('head');
                document.documentElement.insertBefore(head, document.body);
              }
              if (!head.querySelector('base')) {
                const b = document.createElement('base');
                b.href = ORIGIN + '/';
                head.insertBefore(b, head.firstChild);
              }
              if (cssText && !head.querySelector('style[data-tcs-inline]')) {
                const st = document.createElement('style');
                st.setAttribute('data-tcs-inline', '1');
                st.textContent = cssText;
                head.appendChild(st);
              }
              if (!/size\\s*:\\s*A4/i.test(head.innerHTML || '')) {
                const st = document.createElement('style');
                st.textContent = '@media print { @page { size: A4 portrait; margin: 0; } html, body { margin: 0; } }';
                head.appendChild(st);
              }
              return '<!DOCTYPE html>' + document.documentElement.outerHTML;
            }"""
        )
        if not html or len(str(html)) < 120:
            try:
                html = frame.content()
            except Exception as e:
                raise SiteChangedError(f"Không đọc được HTML frame in: {e}") from e
        return str(html)

    def _scroll_to_in_button(self):
        btn = self._find_print_button()
        try:
            btn.first.scroll_into_view_if_needed(timeout=1500)
        except Exception:
            try:
                self.page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
            except Exception:
                pass
        return btn

    def _in_button_visible(self) -> bool:
        try:
            btn = self.page.get_by_role("button", name=re.compile(r"^IN$", re.I))
            return btn.count() > 0 and btn.first.is_visible(timeout=250)
        except Exception:
            return False

    def prepare_esid_detail(self, awb_digits: str, *, session_date: str | None = None) -> None:
        """
        Mở phiếu ESID (1 AWB): danh sách → AWB# 8 số → TÌM KIẾM → nút IN.
        Hot: nếu đã đúng chi tiết AWB + IN → return ngay (~0ms).
        """
        _ = session_date
        url = (self.page.url or "").lower()
        if "awblogin" in url or "checkoutlogin" in url:
            raise NeedsLoginError("Cần đăng nhập trước khi vào ESID")
        if len(awb_digits) != 11:
            raise SiteChangedError("AWB phải đủ 11 chữ số")

        # Đã mở đúng phiếu → gần tức thời
        if self._detail_ready_for(awb_digits):
            return

        # Đang ở chi tiết AWB khác → về list nhanh
        if self._in_button_visible():
            self._click_list_tab()
            self._detail_awb = None

        self.search_by_awb_last8(awb_digits)

        if self._in_button_visible():
            self._detail_awb = awb_digits
            return

        matched = self._match_rows_for_awb(awb_digits, self.list_row_statuses())
        if not matched:
            # Thử lại: clear ngày kỹ hơn + tìm lại (Ant picker hay giữ ngày mặc định)
            try:
                self.clear_date_filters()
                self.search_by_awb_last8(awb_digits, force_reload=True)
                matched = self._match_rows_for_awb(awb_digits, self.list_row_statuses())
            except Exception:
                matched = []
        if not matched:
            diag = self._diag_search_state(awb_digits)
            form = diag.get("form") or {}
            raise SiteChangedError(
                f"Không thấy dòng ESID cho AWB …{awb_digits[3:]} sau khi tìm AWB# (8 số). "
                f"date={form.get('date_start')!r}/{form.get('date_end')!r} "
                f"awb_input={form.get('awb')!r} rows={diag.get('row_count')} "
                f"shot={diag.get('screenshot') or ''}"
            )
        self.open_detail_row(awb_digits, require_reception=False)
        # Chi tiết/drawer TCS đôi khi render nút IN chậm hơn click dòng
        for _ in range(25):
            if self._in_button_visible():
                break
            self.page.wait_for_timeout(80)
        if not self._in_button_visible():
            try:
                self.page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
            except Exception:
                pass
            self.page.wait_for_timeout(200)
        if not self._in_button_visible():
            raise SiteChangedError("Đã mở dòng nhưng không thấy nút IN")
        self._detail_awb = awb_digits

    def prepare_esid_detail_cached(
        self,
        awb_digits: str,
        *,
        page_number: int,
    ) -> bool:
        """
        Mở chi tiết từ index của lần quét ngày. Trả False khi cache/DOM stale;
        caller sẽ fallback sang prepare_esid_detail (tìm AWB#).
        """
        if len(awb_digits) != 11:
            return False
        try:
            if self._detail_ready_for(awb_digits):
                return True
            if self._in_button_visible():
                self._click_list_tab()
                self._detail_awb = None
            self.goto_list(force=False)
            if not self._goto_page_number(page_number):
                return False
            matched = self._match_rows_for_awb(awb_digits, self.list_row_statuses())
            if not matched:
                return False
            self.open_detail_row(awb_digits, require_reception=False)
            return self._in_button_visible()
        except Exception:
            return False

    def _set_document_title(self, target, title: str) -> None:
        if not title:
            return
        try:
            target.evaluate(
                """(name) => {
                  document.title = name;
                  const t = document.querySelector('title');
                  if (t) t.textContent = name;
                }""",
                title,
            )
        except Exception:
            pass

    def fire_in_dialog(self, *, suggest_pdf_filename: str | None = None) -> None:
        """
        Bấm IN → chờ phiếu ESID trong iframe → đặt tên AWB → in đúng phiếu
        (không in shell «GIỚI THIỆU / Hotline»).
        """
        title = (suggest_pdf_filename or "").strip()
        # Chặn print sớm trên shell; phiếu thật nằm iframe about:blank
        self._install_print_hooks()
        self._set_document_title(self.page, title)
        self._click_in_button()
        self.page.wait_for_timeout(40)

        bill = None
        deadline = time.time() + 5.0
        while time.time() < deadline:
            bill = self._richest_print_frame()
            if bill is not None:
                break
            # Popup phiếu?
            for p in self.page.context.pages:
                if p == self.page:
                    continue
                try:
                    sample = p.evaluate(
                        "() => (document.body && document.body.innerText || '').trim()"
                    )
                except Exception:
                    sample = ""
                if self._text_looks_like_esid_doc(sample or ""):
                    self._set_document_title(p, title)
                    try:
                        p.evaluate(
                            """() => {
                              try { delete window.print; } catch (e) {}
                              window.focus();
                              window.print();
                            }"""
                        )
                        return
                    except Exception:
                        pass
            self.page.wait_for_timeout(80)

        if bill is None:
            # Hiếm: phiếu render thẳng vào trang (không iframe)
            try:
                main_sample = self.page.evaluate(
                    "() => (document.body && document.body.innerText || '').trim()"
                )
            except Exception:
                main_sample = ""
            if self._text_looks_like_esid_doc(main_sample or ""):
                bill = self.page.main_frame
            else:
                raise SiteChangedError(
                    "Sau IN không thấy phiếu ESID để in. Không mở hộp in trên trang web."
                )

        self._set_document_title(bill, title)
        # Gỡ stub print trên frame phiếu rồi gọi print thật
        try:
            bill.evaluate(
                """() => {
                  try { delete window.print; } catch (e) {}
                  window.focus();
                  window.print();
                }"""
            )
        except Exception as e:
            raise SiteChangedError(f"Không mở hộp in trên phiếu ESID: {e}") from e

    def click_in_for_user_print(
        self,
        awb_digits: str,
        *,
        session_date: str | None = None,
        suggest_pdf_filename: str | None = None,
        skip_prepare: bool = False,
    ) -> None:
        """
        Danh sách → AWB# 8 số → IN → hộp thoại in/Save PDF trên phiếu thật.
        Tên file mặc định = {AWB}_ESID (Chrome Save as PDF dùng document.title).
        """
        from app.utils.awb import safe_filename_awb

        _ = session_date
        title = (suggest_pdf_filename or "").strip() or f"{safe_filename_awb(awb_digits)}_ESID"
        if (skip_prepare or self._detail_ready_for(awb_digits)) and self._in_button_visible():
            self.fire_in_dialog(suggest_pdf_filename=title)
            return
        self.prepare_esid_detail(awb_digits, session_date=None)
        self.fire_in_dialog(suggest_pdf_filename=title)

    def _text_looks_like_site_chrome(self, text: str) -> bool:
        low = (text or "").lower()
        hits = sum(1 for m in _SITE_CHROME_MARKERS if m in low)
        return hits >= 2

    def _text_looks_like_esid_doc(self, text: str) -> bool:
        """True chỉ khi giống phiếu ESID in — từ chối shell web có chữ ESID/AWB."""
        raw = (text or "").strip()
        if len(raw) < 120:
            return False
        if self._text_looks_like_site_chrome(raw):
            return False
        low = raw.lower()
        # Bỏ dấu tiếng Việt thô để khớp không dấu
        low_ascii = (
            low.replace("ố", "o")
            .replace("ồ", "o")
            .replace("ộ", "o")
            .replace("ớ", "o")
            .replace("ờ", "o")
            .replace("ự", "u")
            .replace("ư", "u")
            .replace("đ", "d")
        )
        hits = sum(1 for m in _ESID_BILL_MARKERS if m in low or m in low_ascii)
        return hits >= 2 or (hits >= 1 and len(raw) >= 280)

    def _frame_inner_text(self, frame) -> str:
        try:
            return str(frame.evaluate("() => (document.body && document.body.innerText || '').trim()") or "")
        except Exception:
            return ""

    def _richest_print_frame(self):
        """Chỉ trả iframe/popup ĐÃ là phiếu ESID — một evaluate thay vì N round-trip."""
        try:
            info = self.page.evaluate(
                """() => {
                  const markers = [
                    'shipper', 'consignee', 'air waybill', 'instruction',
                    'nguoi gui', 'người gửi', 'nguoi nhan', 'người nhận',
                    'san bay', 'sân bay', 'khong van don', 'không vận đơn'
                  ];
                  const chrome = ['giới thiệu', 'danh sách esid', 'hotline', 'tìm kiếm', 'đăng xuất'];
                  let best = null;
                  let bestScore = 0;
                  const frames = window.frames;
                  for (let i = 0; i < frames.length; i++) {
                    try {
                      const doc = frames[i].document;
                      if (!doc || !doc.body) continue;
                      const text = (doc.body.innerText || '').trim();
                      if (text.length < 120) continue;
                      const low = text.toLowerCase();
                      const chromeHits = chrome.filter((m) => low.includes(m)).length;
                      if (chromeHits >= 2) continue;
                      const hits = markers.filter((m) => low.includes(m)).length;
                      if (hits < 1 && text.length < 280) continue;
                      const score = text.length + hits * 1000;
                      if (score > bestScore) {
                        bestScore = score;
                        best = i;
                      }
                    } catch (e) {}
                  }
                  return best;
                }"""
            )
            if info is None:
                return None
            frames = [fr for fr in self.page.frames if fr != self.page.main_frame]
            # Playwright frame order may not match window.frames index exactly —
            # fallback: score by text as before but only candidates with content
            if isinstance(info, int) and 0 <= info < len(self.page.frames):
                # window.frames[i] corresponds roughly to child frames
                child = [fr for fr in self.page.frames if fr != self.page.main_frame]
                if info < len(child):
                    fr = child[info]
                    if self._text_looks_like_esid_doc(self._frame_inner_text(fr)):
                        return fr
        except Exception:
            pass
        best = None
        best_score = 0
        for fr in self.page.frames:
            if fr == self.page.main_frame:
                continue
            text = self._frame_inner_text(fr)
            if not self._text_looks_like_esid_doc(text):
                continue
            score = len(text) + 1000
            if score > best_score:
                best_score = score
                best = fr
        return best

    def _pdf_from_frame_isolate(self, frame, dest_path: Path, *, title: str | None = None) -> Path | None:
        """
        In thẳng iframe trên trang cha (ẩn UI khác) — bỏ serialize + new_page.
        Trả None nếu không đủ tin cậy → caller fallback HTML.
        """
        try:
            frame.evaluate(
                """() => {
                  for (const c of [...document.querySelectorAll('canvas')]) {
                    try {
                      const img = document.createElement('img');
                      img.src = c.toDataURL('image/png');
                      img.setAttribute('style', c.getAttribute('style') || '');
                      if (c.width) img.width = c.width;
                      if (c.height) img.height = c.height;
                      c.replaceWith(img);
                    } catch (e) {}
                  }
                }"""
            )
        except Exception:
            pass
        try:
            handle = frame.frame_element()
        except Exception:
            return None
        token = None
        try:
            token = self.page.evaluate(
                """(iframe) => {
                  const key = '__tcsPdfIso';
                  if (window[key]) return null;
                  const marks = [];
                  const remember = (el) => {
                    if (!el || el.nodeType !== 1) return;
                    marks.push({
                      el,
                      css: el.getAttribute('style'),
                      display: el.style.display,
                    });
                  };
                  const hide = (el) => {
                    remember(el);
                    el.style.setProperty('display', 'none', 'important');
                  };
                  for (const child of [...document.body.children]) {
                    if (child === iframe || child.contains(iframe)) continue;
                    hide(child);
                  }
                  remember(iframe);
                  iframe.style.cssText =
                    'position:fixed!important;inset:0!important;width:100vw!important;' +
                    'height:100vh!important;border:0!important;z-index:2147483647!important;' +
                    'display:block!important;background:#fff!important';
                  window[key] = marks;
                  return marks.length;
                }""",
                handle,
            )
            if not token:
                return None
            if title:
                self._set_document_title(self.page, title)
            # Kiểm tra nhanh text trên frame trước khi in
            sample = self._frame_inner_text(frame)
            if not self._text_looks_like_esid_doc(sample or ""):
                return None
            return self._pdf_from_page(self.page, dest_path, dismiss_escape=False)
        except Exception:
            return None
        finally:
            try:
                self.page.evaluate(
                    """() => {
                      const key = '__tcsPdfIso';
                      const marks = window[key];
                      if (!marks) return;
                      for (const m of marks) {
                        try {
                          if (m.css == null) m.el.removeAttribute('style');
                          else m.el.setAttribute('style', m.css);
                        } catch (e) {}
                      }
                      delete window[key];
                    }"""
                )
            except Exception:
                pass

    def _pdf_from_frame_html(
        self, frame, dest_path: Path, *, title: str | None = None
    ) -> Path:
        """In PDF từ iframe phiếu — serialize HTML đầy đủ + scratch page tái dùng."""
        import os

        t0 = time.perf_counter()
        timing = os.environ.get("TCS_PDF_TIMING", "").strip() in {"1", "true", "yes"}
        # Luôn full serialize (CSS + canvas→img) — fast HTML dễ mất layout / giống ảnh
        mode = "full"
        try:
            html = self._serialize_bill_html(frame)
        except SiteChangedError:
            raise
        except Exception as e:
            raise SiteChangedError(f"Không đọc được HTML frame in: {e}") from e
        if not html or len(html) < 120:
            raise SiteChangedError("Frame in rỗng")

        if os.environ.get("TCS_DIAG_PDF", "").strip() in {"1", "true", "yes"}:
            try:
                dest_path.with_suffix(".frame.html").write_text(
                    html, encoding="utf-8", errors="replace"
                )
                dest_path.with_suffix(".frame.txt").write_text(
                    self._frame_inner_text(frame), encoding="utf-8", errors="replace"
                )
            except Exception:
                pass

        t_html = time.perf_counter()
        tmp = self._ensure_print_scratch_page()
        try:
            # commit = nhanh hơn domcontentloaded; phiếu tĩnh sau IN
            tmp.set_content(html, wait_until="commit")
            try:
                tmp.evaluate(
                    """() => Promise.race([
                      (document.fonts && document.fonts.ready) || Promise.resolve(),
                      new Promise((r) => setTimeout(r, 120)),
                    ])"""
                )
            except Exception:
                pass
            if title:
                self._set_document_title(tmp, title)
            sample = ""
            try:
                sample = tmp.evaluate(
                    "() => (document.body && document.body.innerText || '').trim()"
                )
            except Exception:
                pass
            if not self._text_looks_like_esid_doc(sample or ""):
                raise SiteChangedError(
                    "Frame sau IN không phải phiếu ESID (có vẻ là giao diện web). Không lưu PDF."
                )
            path = self._pdf_from_page(tmp, dest_path, dismiss_escape=False)
            if timing:
                t1 = time.perf_counter()
                print(
                    f"[pdf-timing] mode={mode} html_ms={(t_html - t0) * 1000:.0f} "
                    f"print_ms={(t1 - t_html) * 1000:.0f} total_ms={(t1 - t0) * 1000:.0f} "
                    f"bytes={path.stat().st_size if path.exists() else 0}"
                )
            return path
        except Exception:
            # Scratch page có thể lỗi — đóng để tạo lại lần sau
            try:
                if getattr(self, "_print_scratch", None) is not None:
                    self._print_scratch.close()
            except Exception:
                pass
            self._print_scratch = None
            raise

    def _install_print_hooks(self) -> None:
        """Chặn OS print; giữ window.open để bắt cửa sổ/iframe phiếu."""
        if self._print_hooks_installed:
            try:
                # Chỉ reset flag — không gắn lại hook mỗi lần IN
                self.page.evaluate(
                    "() => { window.__tcsPrintInvoked = false; window.__tcsOpened = []; }"
                )
                return
            except Exception:
                self._print_hooks_installed = False
        try:
            self.page.evaluate(
                """() => {
                  window.__tcsPrintInvoked = false;
                  window.__tcsOpened = [];
                  if (window.__tcsHooksReady) return;
                  const wo = window.open;
                  window.open = function(url, name, features) {
                    const w = wo.call(this, url, name, features);
                    try { window.__tcsOpened.push(String(url||'')); } catch (e) {}
                    if (w) {
                      try { w.print = function() { window.__tcsPrintInvoked = true; }; } catch (e) {}
                    }
                    return w;
                  };
                  window.print = function() { window.__tcsPrintInvoked = true; };
                  window.__tcsHooksReady = true;
                }"""
            )
            self._print_hooks_installed = True
        except Exception:
            pass

    def _click_in_button(self) -> None:
        try:
            btn = self._scroll_to_in_button()
            btn.first.click(timeout=4000, no_wait_after=True)
            return
        except Exception:
            pass
        ok = self.page.evaluate(
            """() => {
              const el = [...document.querySelectorAll('button,a,input,[role=button]')]
                .find(e => /^(IN|In)$/.test((e.innerText||e.value||'').trim())
                  && (e.offsetParent || e.getClientRects().length));
              if (!el) return false;
              el.scrollIntoView({block:'center'});
              el.click();
              return true;
            }"""
        )
        if not ok:
            raise SiteChangedError("Không bấm được nút IN")

    def click_print_download(
        self,
        dest_path: Path,
        *,
        timeout_ms: int = 10000,
        pdf_title: str | None = None,
    ) -> Path:
        """
        Bấm IN → chỉ lưu PDF khi bắt được phiếu ESID thật (iframe/popup).
        KHÔNG bao giờ page.pdf trang shell TCS.
        """
        import os

        dest_path.parent.mkdir(parents=True, exist_ok=True)
        title = (pdf_title or dest_path.stem or "ESID").strip()
        self._set_document_title(self.page, title)

        self._install_print_hooks()
        context = self.page.context
        pages_before = list(context.pages)

        self._click_in_button()
        # Cho TCS kịp ghi phiếu vào iframe — ngắn, rồi poll nhanh
        self.page.wait_for_timeout(40)

        popup = None
        deadline = time.time() + max(5.0, timeout_ms / 1000)
        while time.time() < deadline:
            rich = self._richest_print_frame()
            if rich is not None:
                # Không dùng isolate (printToPDF trang cha) — dễ ra PDF «ảnh»
                # (raster iframe). Luôn serialize HTML phiếu → scratch page.
                return self._pdf_from_frame_html(rich, dest_path, title=title)
            if popup is None:
                for p in context.pages:
                    if p not in pages_before and p != self.page:
                        popup = p
                        break
            if popup is not None:
                try:
                    sample = popup.evaluate(
                        "() => (document.body && document.body.innerText || '').trim()"
                    )
                except Exception:
                    sample = ""
                if self._text_looks_like_esid_doc(sample or ""):
                    break
                # Popup chưa có phiếu — tiếp tục chờ / tìm iframe
                popup = None
            self.page.wait_for_timeout(25)

        if popup is not None:
            try:
                popup.wait_for_load_state("domcontentloaded", timeout=4000)
            except Exception:
                pass
            for _ in range(30):
                try:
                    sample = popup.evaluate(
                        "() => (document.body && document.body.innerText || '').trim()"
                    )
                    if self._text_looks_like_esid_doc(sample or ""):
                        break
                except Exception:
                    sample = ""
                self.page.wait_for_timeout(80)
            try:
                sample = popup.evaluate(
                    "() => (document.body && document.body.innerText || '').trim()"
                )
            except Exception:
                sample = ""
            if not self._text_looks_like_esid_doc(sample or ""):
                try:
                    popup.close()
                except Exception:
                    pass
                raise SiteChangedError(
                    "Popup sau IN không phải phiếu ESID (giao diện web). Không lưu PDF."
                )
            try:
                popup.evaluate(
                    """(name) => { document.title = name; }""",
                    title,
                )
            except Exception:
                pass
            path = self._pdf_from_page(popup, dest_path)
            try:
                popup.close()
            except Exception:
                pass
            if path.exists() and path.stat().st_size > 100:
                return path

        rich = self._richest_print_frame()
        if rich is not None:
            return self._pdf_from_frame_html(rich, dest_path, title=title)

        try:
            main_sample = self.page.evaluate(
                "() => (document.body && document.body.innerText || '').trim().slice(0, 1200)"
            )
        except Exception:
            main_sample = ""
        self._dismiss_os_print_dialog()
        raise SiteChangedError(
            "Sau IN không thấy phiếu ESID trong iframe/popup. "
            "Không lưu PDF trang web. "
            f"Mẫu trang: {(main_sample or '')[:160]!r}"
        )

    def download_awb_pdf(
        self,
        awb_digits: str,
        dest_path: Path,
        *,
        session_date: str | None = None,
        skip_prepare: bool = False,
    ) -> Path:
        """
        PDF ESID = mở phiếu (AWB# 8 số) → bấm IN → lưu file phiếu (đặt tên theo AWB).
        """
        import os

        from app.utils.awb import safe_filename_awb

        _ = session_date
        timing = os.environ.get("TCS_PDF_TIMING", "").strip() in {"1", "true", "yes"}
        t0 = time.perf_counter()
        hot = skip_prepare or self._detail_ready_for(awb_digits)
        if hot and self._in_button_visible():
            pass
        else:
            self.prepare_esid_detail(awb_digits, session_date=None)
        t_prep = time.perf_counter()
        title = f"{safe_filename_awb(awb_digits)}_ESID"
        path = self.click_print_download(
            dest_path, timeout_ms=8000, pdf_title=title
        )
        # Sticky detail: không Escape đóng phiếu — lần tải AWB này sau gần tức thì
        try:
            self._dismiss_os_print_dialog()
        except Exception:
            pass
        self._detail_awb = awb_digits
        if timing:
            print(
                f"[pdf-timing] awb=…{awb_digits[-8:]} hot={hot} "
                f"prepare_ms={(t_prep - t0) * 1000:.0f} "
                f"print_ms={(time.perf_counter() - t_prep) * 1000:.0f} "
                f"total_ms={(time.perf_counter() - t0) * 1000:.0f}"
            )
        return path
