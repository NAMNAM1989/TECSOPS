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
            awb_ref = self.esid_ref("awb_last")
            inp = self._resolve(awb_ref) if awb_ref else self.page.get_by_placeholder("AWB#")
            return inp.first.is_visible(timeout=800)
        except Exception:
            return False

    def _click_list_tab(self) -> None:
        try:
            tab = self.page.get_by_text("DANH SÁCH ESID", exact=False)
            if tab.count() > 0 and tab.first.is_visible(timeout=400):
                tab.first.click(timeout=1500, no_wait_after=True)
                self.page.wait_for_timeout(50)
                self._detail_awb = None
        except Exception:
            pass

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
        self.page.wait_for_timeout(100)
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
    def _ymd_to_dmy(ymd: str) -> str:
        parts = ymd.strip().split("-")
        if len(parts) != 3:
            raise SiteChangedError(f"Ngày không hợp lệ (YYYY-MM-DD): {ymd}")
        return f"{parts[2]}-{parts[1]}-{parts[0]}"

    def set_flight_date_range(self, ymd_from: str, ymd_to: str | None = None) -> None:
        """Ant Design range: #search-form_dateSearch + placeholder Ngày kết thúc (DD-MM-YYYY)."""
        dmy_from = self._ymd_to_dmy(ymd_from)
        dmy_to = self._ymd_to_dmy(ymd_to or ymd_from)
        start = self.page.locator("#search-form_dateSearch")
        try:
            start.first.wait_for(state="visible", timeout=10000)
        except Exception as e:
            raise SiteChangedError(f"Không thấy ô Ngày bắt đầu: {e}") from e
        start.first.click()
        start.first.fill("")
        start.first.fill(dmy_from)
        self.page.keyboard.press("Enter")
        self.page.wait_for_timeout(150)
        end = self.page.get_by_placeholder("Ngày kết thúc")
        end.first.click()
        end.first.fill("")
        end.first.fill(dmy_to)
        self.page.keyboard.press("Enter")
        self.page.wait_for_timeout(150)
        try:
            self.page.keyboard.press("Escape")
        except Exception:
            pass

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
        self.clear_awb_filters()
        self.set_flight_date_range(ymd, ymd_to)
        submit_ref = self.esid_ref("submit")
        try:
            if submit_ref:
                self._resolve(submit_ref).first.click()
            else:
                self.page.get_by_role("button", name=re.compile(r"TÌM KIẾM|Tim kiem", re.I)).first.click()
        except Exception as e:
            raise SiteChangedError(f"Không bấm TÌM KIẾM: {e}") from e
        self._wait_search_results("")
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
        blob = f"{status or ''} {text or ''}".lower()
        if RECEPTION_STATUS.lower() in blob or "hoàn thành tiếp nhận" in blob or "hoan thanh tiep nhan" in blob:
            return True
        return ("hoàn thành" in blob or "hoan thanh" in blob) and (
            "tiếp nhận" in blob or "tiep nhan" in blob
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
            token = self._digits(str(item.get("awb") or ""))
            matched: str | None = None
            if token in ops_set:
                matched = token
            elif len(token) >= 8:
                last8 = token[-8:]
                for ops in ops_norm:
                    if ops[3:] == last8 or ops.endswith(last8):
                        matched = ops
                        break
            if matched and matched not in seen:
                seen.add(matched)
                ready.append({**item, "awb": matched, "awb_last8": matched[3:], "ready": True})
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
                        "raw": "Không có trên danh sách Hoàn thành tiếp nhận (theo ngày)",
                    }
                )
        return ready, items

    def scan_by_flight_date(self, ymd: str, ops_awbs: list[str]) -> dict[str, Any]:
        """Một lần lọc ngày → đọc bảng → khớp Ops. Nhanh hơn quét từng AWB."""
        self.search_by_flight_date(ymd)
        rows = self.list_row_statuses()
        reception: list[dict[str, Any]] = []
        for r in rows:
            if not self._blob_is_reception(r.get("status") or "", r.get("text") or ""):
                continue
            token = self._digits(r.get("awb") or "")
            reception.append(
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
        ready, items = self.match_reception_to_ops(reception, ops_awbs)
        return {
            "reception_all": reception,
            "ready": ready,
            "items": items,
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
                    state="detached", timeout=8000
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
        ok = self._wait_search_results(last8, timeout_ms=12000)
        if not ok:
            # React form chưa nhận giá trị — set lại + bấm tìm lần 2
            try:
                self._set_react_input(
                    self._resolve(awb_ref) if awb_ref else self.page.get_by_placeholder("AWB#"),
                    last8,
                )
                _click_search()
                ok = self._wait_search_results(last8, timeout_ms=12000)
            except Exception:
                ok = False
        if not ok:
            # Vẫn không thấy last8 trong bảng → để prepare đọc rows + diag
            self.page.wait_for_timeout(300)

    def list_row_statuses(self) -> list[dict[str, str]]:
        """Đọc các dòng bảng ESID (awb/esid, status)."""
        return self.page.evaluate(
            """() => {
              const rows = [...document.querySelectorAll('table tbody tr, .ant-table-tbody tr')];
              return rows.map(tr => {
                const cells = [...tr.querySelectorAll('td')].map(td => (td.innerText||'').trim().replace(/\\s+/g,' '));
                const text = (tr.innerText||'').trim().replace(/\\s+/g,' ');
                let status = '';
                for (const c of cells) {
                  const low = c.toLowerCase();
                  if (low.includes('tiếp nhận') || low.includes('tiep nhan') || low.includes('hoàn thành') || low.includes('hoan thanh')) {
                    status = c;
                    break;
                  }
                }
                if (!status && cells.length) status = cells[cells.length - 1] || '';
                if (!status && /hoàn thành tiếp nhận/i.test(text)) status = 'Hoàn thành tiếp nhận';
                return {
                  awb: cells[0] || '',
                  flight: cells[1] || '',
                  flight_date: cells[2] || '',
                  esid: cells[3] || '',
                  status,
                  text: text.slice(0, 240)
                };
              }).filter(r => r.text);
            }"""
        )

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
            if RECEPTION_STATUS.lower() in f"{r.get('status') or ''} {r.get('text') or ''}".lower()
        ]
        pick = reception[0] if reception else matched[0]
        blob = f"{pick.get('status') or ''} {pick.get('text') or ''}".lower()
        # Khớp linh hoạt: đủ cụm, hoặc có cả «hoàn thành» + «tiếp nhận»
        ready = (
            RECEPTION_STATUS.lower() in blob
            or "hoàn thành tiếp nhận" in blob
            or "hoan thanh tiep nhan" in blob
            or (
                ("hoàn thành" in blob or "hoan thanh" in blob)
                and ("tiếp nhận" in blob or "tiep nhan" in blob)
            )
        )
        if ready:
            norm = NormalizedStatus.RECEPTION_COMPLETED
        elif "hoàn thành" in blob or "hoan thanh" in blob:
            norm = NormalizedStatus.COMPLETED
        else:
            norm = NormalizedStatus.NOT_COMPLETED
        base.update(
            {
                "ready": ready,
                "normalized_status": norm.value,
                "tcs_status": pick.get("status") or (RECEPTION_STATUS if ready else ""),
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

    def _pdf_from_page(self, page, dest_path: Path) -> Path:
        """
        Lưu PDF khớp Chrome «Save as PDF»:
        - tôn trọng @page { size: A4 } (preferCSSPageSize)
        - không dùng Letter mặc định của page.pdf
        """
        dest_path.parent.mkdir(parents=True, exist_ok=True)
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
        self.page.wait_for_timeout(350)

        bill = None
        deadline = time.time() + 8.0
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
        """Chỉ trả iframe/popup ĐÃ là phiếu ESID — không trả shell UI."""
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

    def _pdf_from_frame_html(
        self, frame, dest_path: Path, *, title: str | None = None
    ) -> Path:
        """In PDF từ HTML iframe phiếu — A4 + CSS đầy đủ (khớp Chrome Save as PDF)."""
        try:
            html = self._serialize_bill_html(frame)
        except SiteChangedError:
            raise
        except Exception as e:
            raise SiteChangedError(f"Không đọc được HTML frame in: {e}") from e
        if not html or len(html) < 120:
            raise SiteChangedError("Frame in rỗng")
        # Debug: TCS_DIAG_PDF=1 → ghi HTML/text phiếu cạnh PDF để đối chiếu
        import os

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
        ctx = self.page.context
        tmp = ctx.new_page()
        try:
            # viewport gần khổ in A4 (px @ 96dpi) — giảm lệch layout
            try:
                tmp.set_viewport_size({"width": 794, "height": 1123})
            except Exception:
                pass
            tmp.set_content(html, wait_until="load")
            try:
                tmp.wait_for_load_state("networkidle", timeout=8000)
            except Exception:
                pass
            try:
                tmp.evaluate("() => (document.fonts && document.fonts.ready) || Promise.resolve()")
            except Exception:
                pass
            tmp.wait_for_timeout(200)
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
            return self._pdf_from_page(tmp, dest_path)
        finally:
            try:
                tmp.close()
            except Exception:
                pass

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
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        title = (pdf_title or dest_path.stem or "ESID").strip()
        self._set_document_title(self.page, title)

        self._install_print_hooks()
        context = self.page.context
        pages_before = list(context.pages)

        self._click_in_button()
        # Cho TCS kịp ghi phiếu vào iframe about:blank trước khi đọc
        self.page.wait_for_timeout(350)

        popup = None
        deadline = time.time() + max(8.0, timeout_ms / 1000)
        while time.time() < deadline:
            rich = self._richest_print_frame()
            if rich is not None:
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
            self.page.wait_for_timeout(80)

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
        from app.utils.awb import safe_filename_awb

        _ = session_date
        hot = skip_prepare or self._detail_ready_for(awb_digits)
        if hot and self._in_button_visible():
            pass
        else:
            self.prepare_esid_detail(awb_digits, session_date=None)
        title = f"{safe_filename_awb(awb_digits)}_ESID"
        path = self.click_print_download(
            dest_path, timeout_ms=10000, pdf_title=title
        )
        try:
            self.page.keyboard.press("Escape")
        except Exception:
            pass
        try:
            self._dismiss_os_print_dialog()
        except Exception:
            pass
        self._detail_awb = awb_digits
        return path
