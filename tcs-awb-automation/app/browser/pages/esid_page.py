"""Danh sách ESID (/Esid/Export) → chi tiết → nút IN → PDF."""
from __future__ import annotations

import base64
import re
from pathlib import Path
from typing import Any

from app.browser.locators import LocatorRef, LocatorsConfig
from app.browser.pages.awb_page import NeedsLoginError, SiteChangedError
from app.data.models import NormalizedStatus


RECEPTION_STATUS = "Hoàn thành tiếp nhận"


class EsidListPage:
    def __init__(self, page, locators: LocatorsConfig) -> None:
        self.page = page
        self.locators = locators
        self._list_date_ymd: str | None = None

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
            if tab.count() > 0 and tab.first.is_visible(timeout=600):
                tab.first.click(timeout=2000)
                self.page.wait_for_timeout(150)
        except Exception:
            pass

    def goto_list(self, *, force: bool = False) -> None:
        """Vào Danh sách ESID — bỏ qua reload nếu đã ở đúng màn."""
        if not force and self._on_esid_list():
            self._click_list_tab()
            return
        home = self._cfg().get("home_url") or "https://www.tcs.com.vn/Esid/Export"
        self.page.goto(home, wait_until="domcontentloaded", timeout=60000)
        self.page.wait_for_timeout(250)
        self._click_list_tab()

    def _wait_search_results(self, last8: str = "") -> None:
        """Chờ bảng kết quả thay vì networkidle (thường chậm 5–15s)."""
        try:
            self.page.wait_for_function(
                """(last8) => {
                  const rows = document.querySelectorAll('table tbody tr, .ant-table-tbody tr');
                  if (!rows.length) return false;
                  const blob = [...rows].slice(0, 20).map(r => (r.innerText||'')).join(' ');
                  if (last8 && blob.includes(last8)) return true;
                  return /hoàn thành|tiếp nhận|không có|no data|empty|awb|esid/i.test(blob);
                }""",
                arg=last8 or "",
                timeout=15000,
            )
        except Exception:
            self.page.wait_for_timeout(500)

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
        self._list_date_ymd = None
        self.goto_list(force=force_reload)
        self.clear_date_filters()
        # Ô AWB# (8 số cuối) — placeholder quan sát thật
        awb_ref = self.esid_ref("awb_last")
        try:
            if awb_ref:
                inp = self._resolve(awb_ref)
            else:
                inp = self.page.get_by_placeholder("AWB#")
            inp.first.wait_for(state="visible", timeout=12000)
            inp.first.fill("")
            inp.first.fill(last8)
        except Exception as e:
            # Input biến mất (SPA) → reload 1 lần
            if not force_reload:
                self.search_by_awb_last8(awb_digits, force_reload=True)
                return
            raise SiteChangedError(f"Không điền được ô AWB#: {e}") from e

        # Prefix 3 số nếu có (tùy chọn)
        try:
            prefix_ref = self.esid_ref("awb_first")
            if prefix_ref:
                self._resolve(prefix_ref).first.fill(awb_digits[:3])
            else:
                pref = self.page.get_by_placeholder(re.compile(r"prefix", re.I))
                if pref.count() > 0:
                    pref.first.fill(awb_digits[:3])
        except Exception:
            pass

        submit_ref = self.esid_ref("submit")
        try:
            if submit_ref:
                self._resolve(submit_ref).first.click()
            else:
                self.page.get_by_role("button", name=re.compile(r"TÌM KIẾM|Tim kiem", re.I)).first.click()
        except Exception as e:
            raise SiteChangedError(f"Không bấm TÌM KIẾM: {e}") from e
        self._wait_search_results(last8)

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
        last8 = awb_digits[3:]
        return [
            r
            for r in rows
            if last8 in (r.get("awb") or "")
            or awb_digits in (r.get("awb") or "")
            or last8 in (r.get("text") or "")
        ]

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
        """Bấm dòng chi tiết (ưu tiên trạng thái Hoàn thành tiếp nhận)."""
        rows_loc = self.page.locator("table tbody tr, .ant-table-tbody tr")
        last8 = awb_digits[3:]
        n = rows_loc.count()
        target = None
        fallback = None
        for i in range(n):
            row = rows_loc.nth(i)
            try:
                text = (row.inner_text(timeout=2000) or "").strip()
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
        target.click()
        try:
            self.page.get_by_role("button", name=re.compile(r"^IN$", re.I)).first.wait_for(
                state="visible", timeout=8000
            )
        except Exception:
            try:
                self.page.wait_for_load_state("domcontentloaded", timeout=4000)
            except Exception:
                self.page.wait_for_timeout(200)

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
        """Lưu PDF trang hiện tại (page.pdf có timeout)."""
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        self._dismiss_os_print_dialog()
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass
        page.wait_for_timeout(200)
        try:
            page.emulate_media(media="print")
        except Exception:
            pass
        try:
            page.pdf(path=str(dest_path), print_background=True)
        except Exception:
            # Fallback CDP trên cùng thread (không dùng thread pool — Playwright sync)
            try:
                cdp = page.context.new_cdp_session(page)
                try:
                    result = cdp.send(
                        "Page.printToPDF",
                        {"printBackground": True, "preferCSSPageSize": True},
                    )
                    data = base64.b64decode(result.get("data") or "")
                    if len(data) < 100:
                        raise SiteChangedError("printToPDF trả về rỗng")
                    dest_path.write_bytes(data)
                finally:
                    try:
                        cdp.detach()
                    except Exception:
                        pass
            except SiteChangedError:
                raise
            except Exception as e:
                raise SiteChangedError(
                    f"Không lưu được PDF (đóng hộp in hệ thống nếu đang mở): {e}"
                ) from e
        finally:
            try:
                page.emulate_media(media=None)
            except Exception:
                pass
        if not dest_path.exists() or dest_path.stat().st_size < 100:
            raise SiteChangedError("PDF rỗng sau khi lưu")
        return dest_path

    def _scroll_to_in_button(self):
        try:
            self.page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
        except Exception:
            pass
        btn = self._find_print_button()
        try:
            btn.first.scroll_into_view_if_needed(timeout=3000)
        except Exception:
            pass
        self.page.wait_for_timeout(150)
        return btn

    def _in_button_visible(self) -> bool:
        try:
            btn = self.page.get_by_role("button", name=re.compile(r"^IN$", re.I))
            return btn.count() > 0 and btn.first.is_visible(timeout=800)
        except Exception:
            return False

    def prepare_esid_detail(self, awb_digits: str, *, session_date: str | None = None) -> None:
        """
        Danh sách ESID → nhập 8 số cuối ô AWB# → TÌM KIẾM → mở dòng (nếu chưa thấy nút IN).
        Fallback lọc ngày phiên chỉ khi AWB# không ra dòng.
        """
        url = (self.page.url or "").lower()
        if "awblogin" in url or "checkoutlogin" in url:
            raise NeedsLoginError("Cần đăng nhập trước khi vào ESID")
        if len(awb_digits) != 11:
            raise SiteChangedError("AWB phải đủ 11 chữ số")
        try:
            self._dismiss_os_print_dialog()
            self.page.keyboard.press("Escape")
            self.page.wait_for_timeout(150)
        except Exception:
            pass

        # Về tab danh sách rồi nhập AWB# (đúng quy trình user)
        self.goto_list(force=False)
        self.search_by_awb_last8(awb_digits)
        matched = self._match_rows_for_awb(awb_digits, self.list_row_statuses())

        if not matched and session_date:
            self.clear_awb_filters()
            self.search_by_flight_date(session_date)
            matched = self._match_rows_for_awb(awb_digits, self.list_row_statuses())

        if not matched:
            raise SiteChangedError(
                f"Không thấy dòng ESID cho AWB …{awb_digits[3:]} sau khi tìm AWB#"
                + (f" / ngày {session_date}" if session_date else "")
            )

        # Nếu sau tìm kiếm đã có nút IN (chi tiết hiện sẵn) → không cần bấm dòng
        if self._in_button_visible():
            return
        try:
            self.open_detail_row(awb_digits, require_reception=True)
        except SiteChangedError:
            self.open_detail_row(awb_digits, require_reception=False)

    def fire_in_dialog(self, *, suggest_pdf_filename: str | None = None) -> None:
        """Đã ở màn có nút IN → đặt tên file gợi ý (nếu có) → bấm IN mở hộp Save/In."""
        if suggest_pdf_filename:
            try:
                # Chrome «Save as PDF» dùng title làm tên file mặc định
                self.page.evaluate(
                    """(name) => {
                      document.title = name;
                      const t = document.querySelector('title');
                      if (t) t.textContent = name;
                    }""",
                    suggest_pdf_filename,
                )
            except Exception:
                pass
        btn = self._scroll_to_in_button()
        btn.first.click(timeout=4000, no_wait_after=True)
        self.page.wait_for_timeout(400)

    def click_in_for_user_print(
        self,
        awb_digits: str,
        *,
        session_date: str | None = None,
        suggest_pdf_filename: str | None = None,
        skip_prepare: bool = False,
    ) -> None:
        """
        Danh sách → AWB# 8 số → kéo xuống bấm IN → hộp thoại in/Save PDF (user tự bấm).
        skip_prepare=True: hot-path (đã prepare) — chỉ fire IN nếu nút còn visible.
        """
        if skip_prepare:
            if not self._in_button_visible():
                raise SiteChangedError("Hot-path miss: không còn nút IN — cần prepare lại")
            self.fire_in_dialog(suggest_pdf_filename=suggest_pdf_filename)
            return
        self.prepare_esid_detail(awb_digits, session_date=session_date)
        self.fire_in_dialog(suggest_pdf_filename=suggest_pdf_filename)

    def click_print_download(self, dest_path: Path, *, timeout_ms: int = 8000) -> Path:
        """
        PDF ESID (đúng hướng Save as PDF):
        Đã ở màn có nút IN → kéo xuống cuối → bấm IN → lấy file PDF
        (download / tab in / CDP printToPDF = Save as PDF, không chụp màn hình trước khi bấm IN).
        """
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        # Chặn hộp in OS treo agent; vẫn gọi print layout rồi Save-as-PDF qua CDP
        try:
            self.page.evaluate(
                """() => {
                  window.__tcsPrintInvoked = false;
                  window.print = () => { window.__tcsPrintInvoked = true; };
                }"""
            )
        except Exception:
            pass

        btn = self._scroll_to_in_button()
        pages_before = list(self.page.context.pages)
        download = None
        try:
            with self.page.expect_download(timeout=timeout_ms) as di:
                btn.first.click(timeout=4000, no_wait_after=True)
            download = di.value
        except Exception:
            try:
                btn.first.click(timeout=4000, no_wait_after=True)
            except Exception:
                pass

        if download is not None:
            download.save_as(str(dest_path))
            if dest_path.exists() and dest_path.stat().st_size > 100:
                return dest_path

        self.page.wait_for_timeout(600)

        # Tab/popup mới sau khi bấm IN (bản in / PDF)
        popup = None
        for _ in range(12):
            for p in self.page.context.pages:
                if p not in pages_before and p != self.page:
                    popup = p
                    break
            if popup is not None:
                break
            self.page.wait_for_timeout(150)
        if popup is not None:
            try:
                popup.wait_for_load_state("domcontentloaded", timeout=8000)
            except Exception:
                pass
            try:
                path = self._pdf_from_page(popup, dest_path)
                try:
                    popup.close()
                except Exception:
                    pass
                if path.exists() and path.stat().st_size > 100:
                    return path
            except Exception:
                pass

        # Save as PDF qua CDP trên trang sau khi bấm IN (nội dung phiếu in)
        for _ in range(2):
            self._dismiss_os_print_dialog()
            try:
                self.page.keyboard.press("Escape")
            except Exception:
                pass
            self.page.wait_for_timeout(150)
        return self._pdf_from_page(self.page, dest_path)

    def download_awb_pdf(
        self,
        awb_digits: str,
        dest_path: Path,
        *,
        session_date: str | None = None,
    ) -> Path:
        """
        Legacy (script): tự lấy PDF sau IN.
        Ops/agent thật dùng click_in_for_user_print — user tự Save trên hộp thoại.
        """
        self.prepare_esid_detail(awb_digits, session_date=session_date or None)
        path = self.click_print_download(dest_path)
        try:
            self._click_list_tab()
            self.page.wait_for_timeout(150)
        except Exception:
            pass
        return path
