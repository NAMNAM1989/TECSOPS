"""Page object: tab KHAI BÁO ESID — điền form (mặc định không HOÀN TẤT)."""
from __future__ import annotations

import re
import time
from typing import Any

from app.browser.locators import LocatorsConfig
from app.browser.pages.awb_page import NeedsLoginError, SiteChangedError
from app.browser.pages.esid_page import EsidListPage

ESID_HOME = "https://www.tcs.com.vn/Esid/Export"

# Cache nhãn thanh toán đã chọn thành công trên session (tránh mở select lại)
_PAYMENT_LABEL_CACHE: str = "Chuyển khoản/Bank transfer"


class EsidDeclarePage:
    def __init__(self, page, locators: LocatorsConfig) -> None:
        self.page = page
        self.locators = locators

    def _cfg(self) -> dict[str, Any]:
        return self.locators.data.get("esid_declare") or {}

    def goto_declare_tab(self) -> None:
        """
        Nhảy thẳng tab KHAI BÁO ESID — không đụng ô tìm AWB trên DANH SÁCH.
        """
        url = (self.page.url or "").lower()
        if "awblogin" in url or "checkoutlogin" in url:
            raise NeedsLoginError("Cần đăng nhập trước khi khai báo ESID")

        # Đã ở form khai báo (có #shipperId / #codAwbPfx) → thôi
        if self._on_declare_form():
            return

        # Vào /Esid/Export rồi bấm tab ngay — không search list
        if "/esid/" not in url:
            self.page.goto(ESID_HOME, wait_until="commit", timeout=20000)
            try:
                self.page.wait_for_load_state("domcontentloaded", timeout=4000)
            except Exception:
                pass
            self.page.wait_for_timeout(150)

        if not self._click_declare_tab():
            # Thử lại: reload Export rồi click
            try:
                self.page.goto(ESID_HOME, wait_until="commit", timeout=15000)
                self.page.wait_for_timeout(200)
            except Exception:
                pass
            if not self._click_declare_tab():
                raise SiteChangedError("Không mở được tab KHAI BÁO ESID")

        # Chờ form khai báo (không nhầm ô AWB# của danh sách)
        try:
            self.page.locator("#shipperId, #codAwbPfx").first.wait_for(
                state="visible", timeout=12000
            )
        except Exception as e:
            raise SiteChangedError(f"Form khai báo ESID không hiện: {e}") from e
        if not self._on_declare_form():
            raise SiteChangedError("Đã bấm tab nhưng chưa vào form KHAI BÁO ESID")

    def _on_declare_form(self) -> bool:
        """True khi đang ở form khai báo (có shipperId hoặc codAwbPfx visible)."""
        try:
            return bool(
                self.page.evaluate(
                    """() => {
                      const ids = ['shipperId', 'codAwbPfx', 'consigneeId'];
                      for (const id of ids) {
                        const el = document.getElementById(id);
                        if (!el) continue;
                        const r = el.getBoundingClientRect();
                        if (r.width > 0 && r.height > 0) return true;
                      }
                      // Tab active?
                      const tab = [...document.querySelectorAll('.ant-tabs-tab-active, [role=tab][aria-selected=true]')]
                        .find(t => /KHAI\\s*B[ÁA]O\\s*ESID/i.test((t.innerText||'').trim()));
                      return !!tab && !!document.getElementById('codAwbNum');
                    }"""
                )
            )
        except Exception:
            return False

    def _click_declare_tab(self) -> bool:
        pat = re.compile(r"KHAI\s*BÁO\s*ESID", re.I)
        try:
            tab = self.page.get_by_role("tab", name=pat)
            if tab.count() > 0 and tab.first.is_visible(timeout=600):
                tab.first.click(timeout=3000, no_wait_after=True)
                self.page.wait_for_timeout(350)
                return self._on_declare_form() or True
        except Exception:
            pass
        try:
            clicked = bool(
                self.page.evaluate(
                    """() => {
                      const nodes = [...document.querySelectorAll(
                        '.ant-tabs-tab, [role=tab], a, button, span'
                      )];
                      const el = nodes.find(n => {
                        const t = (n.innerText || '').trim();
                        return t.length < 40 && /KHAI\\s*B[ÁA]O\\s*ESID/i.test(t);
                      });
                      if (!el) return false;
                      el.scrollIntoView({ block: 'center' });
                      el.click();
                      return true;
                    }"""
                )
            )
            if clicked:
                self.page.wait_for_timeout(400)
                return True
        except Exception:
            pass
        return False

    def _active_pane(self):
        """Tabpane form KHAI BÁO (có #shipperId/#codAwbPfx) — không lấy pane danh sách."""
        try:
            # Pane chứa ô khai báo
            pane = self.page.locator(
                ".ant-tabs-tabpane-active:has(#codAwbPfx), "
                ".ant-tabs-tabpane-active:has(#shipperId), "
                ".ant-tabs-tabpane:not(.ant-tabs-tabpane-hidden):has(#codAwbPfx)"
            )
            if pane.count() > 0:
                return pane.first
        except Exception:
            pass
        return self.page.locator(".ant-tabs-tabpane-active").first

    def _set_id(self, eid: str, value: str) -> bool:
        if value is None:
            return False
        text = str(value).strip()
        if text == "":
            return False
        if eid.startswith("search-form") or eid in {"awbNum", "awbFirst", "awbLast"}:
            return False
        try:
            idx = int(
                self.page.evaluate(
                    """(eid) => {
                      const nodes = [...document.querySelectorAll('#' + eid)];
                      for (let i = 0; i < nodes.length; i++) {
                        const el = nodes[i];
                        if (el.closest('.ant-modal')) continue;
                        const f = el.closest('form');
                        const fid = ((f && f.id) || '') + ' ' + ((f && f.className) || '');
                        if (/search-form|form-date/i.test(fid)) continue;
                        const r = el.getBoundingClientRect();
                        if (r.width < 1 || r.height < 1) continue;
                        if (el.disabled) continue;
                        return i;
                      }
                      for (let i = 0; i < nodes.length; i++) {
                        if (!nodes[i].closest('.ant-modal')) return i;
                      }
                      return nodes.length ? 0 : -1;
                    }""",
                    eid,
                )
            )
            if idx < 0:
                return False
            loc = self.page.locator(f"#{eid}").nth(idx)
            try:
                loc.scroll_into_view_if_needed(timeout=1500)
            except Exception:
                pass
            try:
                if loc.is_disabled(timeout=200):
                    return False
            except Exception:
                pass
            if not loc.is_visible(timeout=2000):
                try:
                    loc.evaluate("el => el.scrollIntoView({block:'center'})")
                except Exception:
                    pass
                if not loc.is_visible(timeout=800):
                    return False
            EsidListPage._set_react_input(loc, text)
            got = ""
            try:
                got = (loc.input_value(timeout=500) or "").strip()
            except Exception:
                pass
            if got != text:
                try:
                    loc.click(timeout=1000)
                    loc.fill(text)
                    loc.press("Tab")
                    got = (loc.input_value(timeout=400) or "").strip()
                except Exception:
                    pass
            return got == text or got.endswith(text) or text in got
        except Exception:
            return False

    def _set_checkbox(self, eid: str, checked: bool) -> bool:
        try:
            loc = self._active_pane().locator(f"#{eid}")
            if loc.count() == 0:
                loc = self.page.locator(f"#{eid}")
            if loc.count() == 0:
                return False
            now = loc.first.is_checked()
            if bool(now) == bool(checked):
                return True
            if checked:
                loc.first.check(force=True)
            else:
                loc.first.uncheck(force=True)
            return True
        except Exception:
            return False

    def _fill_combobox(self, eid: str, value: str) -> bool:
        """Ant Select search: gõ → chọn option khớp (substring OK)."""
        text = (value or "").strip()
        if not text:
            return False
        try:
            # Ô ant-select: input#id hoặc #id trong .ant-select
            loc = self._active_pane().locator(f"#{eid}")
            if loc.count() == 0:
                loc = self.page.locator(f"#{eid}")
            if loc.count() == 0:
                # Đôi khi id nằm trên .ant-select
                loc = self.page.locator(f".ant-select#{eid} input, [id='{eid}'] input")
            if loc.count() == 0:
                return False
            target = loc.first
            try:
                target.scroll_into_view_if_needed(timeout=1200)
            except Exception:
                pass
            # Click vào select wrapper (input readonly hay bị span title chắn)
            try:
                wrap = self.page.locator(
                    f".ant-select:has(#{eid}), .ant-select#{eid}"
                ).first
                if wrap.count() > 0:
                    wrap.click(timeout=2000, force=True)
                else:
                    target.click(timeout=2000, force=True)
            except Exception:
                try:
                    target.click(timeout=2000, force=True)
                except Exception:
                    pass
            self.page.wait_for_timeout(60)
            try:
                search = self.page.locator(
                    f"#{eid}.ant-select-selection-search-input, "
                    f".ant-select-focused #{eid}, "
                    f"input#{eid}"
                ).first
                if search.count() > 0:
                    search.fill("")
                    search.fill(text)
                else:
                    target.fill("")
                    target.fill(text)
            except Exception:
                self.page.keyboard.type(text, delay=8)
            try:
                self.page.locator(
                    ".ant-select-dropdown:not(.ant-select-dropdown-hidden) "
                    ".ant-select-item-option"
                ).first.wait_for(state="visible", timeout=1800)
            except Exception:
                self.page.wait_for_timeout(180)
            opt = self.page.locator(
                ".ant-select-dropdown:not(.ant-select-dropdown-hidden) "
                ".ant-select-item-option:not(.ant-select-item-option-disabled)"
            ).filter(has_text=re.compile(re.escape(text[:20]), re.I))
            if opt.count() == 0:
                token = text.split("/")[0].strip()
                if token and token != text:
                    opt = self.page.locator(
                        ".ant-select-dropdown:not(.ant-select-dropdown-hidden) "
                        ".ant-select-item-option:not(.ant-select-item-option-disabled)"
                    ).filter(has_text=re.compile(re.escape(token[:16]), re.I))
            if opt.count() > 0:
                opt.first.click(timeout=2000)
                return True
            any_opt = self.page.locator(
                ".ant-select-dropdown:not(.ant-select-dropdown-hidden) "
                ".ant-select-item-option:not(.ant-select-item-option-disabled)"
            )
            if any_opt.count() > 0 and len(text) <= 4:
                hit = any_opt.filter(has_text=re.compile(rf"\b{re.escape(text)}\b", re.I))
                if hit.count() > 0:
                    hit.first.click(timeout=1500)
                    return True
            try:
                self.page.keyboard.press("Escape")
            except Exception:
                pass
            return False
        except Exception:
            return False

    def _fill_ops_text(self, data: dict[str, Any], awb: str, fills: dict, warnings: list) -> None:
        """AWB / pcs / HAWB / goods — text nhanh."""
        fills["codAwbPfx"] = self._set_id("codAwbPfx", awb[:3])
        fills["codAwbNum"] = self._set_id("codAwbNum", awb[3:])
        if not fills["codAwbPfx"] or not fills["codAwbNum"]:
            warnings.append(
                f"AWB chưa điền đủ (pfx={fills.get('codAwbPfx')} num={fills.get('codAwbNum')})"
            )

        pcs = data.get("pcs")
        if pcs is None or str(pcs).strip() == "":
            pcs_s = "0"
        else:
            try:
                pcs_s = str(int(float(pcs)))
            except Exception:
                pcs_s = "0"
        fills["qtyPcs"] = self._set_id("qtyPcs", pcs_s)
        if not fills["qtyPcs"]:
            warnings.append("Không điền được số kiện (qtyPcs)")

        hawbs = data.get("total_hawbs")
        if hawbs is None or str(hawbs).strip() == "":
            hawbs = 0
        try:
            hawbs_s = str(int(float(hawbs)))
        except Exception:
            hawbs_s = "0"
        fills["totalOfHawbs"] = self._set_id("totalOfHawbs", hawbs_s)

        goods = str(data.get("nature_of_goods") or "").strip()
        if goods:
            fills["natureOfGoods"] = self._set_id("natureOfGoods", goods)
            if not fills["natureOfGoods"]:
                warnings.append("Không điền được loại hàng (natureOfGoods)")

    def _fill_ops_selects(self, data: dict[str, Any], fills: dict, warnings: list) -> None:
        """Dest + payment — gọi 1 lần sau chọn chuyến."""
        dest = str(data.get("dest") or "").strip().upper()
        if dest:
            try:
                cur = self.page.evaluate(
                    """() => {
                      const el = [...document.querySelectorAll('#codFds')].find(e => !e.closest('.ant-modal'));
                      if (!el) return '';
                      const item = el.closest('.ant-select')?.querySelector('.ant-select-selection-item');
                      return ((item && (item.getAttribute('title')||item.textContent)) || el.value || '').trim();
                    }"""
                )
                if cur and dest.upper() in str(cur).upper():
                    fills["codFds"] = True
                else:
                    ok_dest = self._fill_combobox("codFds", dest) or self._set_id("codFds", dest)
                    fills["codFds"] = ok_dest
                    if not ok_dest:
                        warnings.append(f"Dest {dest!r} chưa chọn được")
            except Exception:
                fills["codFds"] = self._fill_combobox("codFds", dest)

        pay = str(data.get("payment_mode") or _PAYMENT_LABEL_CACHE).strip()
        if pay:
            fills["codPayMod"] = self._fill_payment(pay)
            if not fills["codPayMod"]:
                warnings.append(f"Thanh toán {pay!r} chưa chọn được")

    def _fill_ops_block(
        self,
        data: dict[str, Any],
        awb: str,
        fills: dict,
        warnings: list,
        *,
        lite: bool = False,
    ) -> None:
        self._fill_ops_text(data, awb, fills, warnings)
        if not lite:
            self._fill_ops_selects(data, fills, warnings)

    def _read_payment_label(self) -> str:
        try:
            return str(
                self.page.evaluate(
                    """() => {
                      const wrap = document.querySelector('.ant-select:has(#codPayMod)')
                        || document.querySelector('#codPayMod')?.closest('.ant-select');
                      const item = wrap && wrap.querySelector('.ant-select-selection-item');
                      return item ? (item.getAttribute('title') || item.textContent || '').trim() : '';
                    }"""
                )
                or ""
            )
        except Exception:
            return ""

    def _fill_payment(self, pay: str) -> bool:
        """Chọn thanh toán nhanh — cache nhãn session + 1 lần mở select."""
        global _PAYMENT_LABEL_CACHE
        text = (pay or _PAYMENT_LABEL_CACHE or "").strip()
        if not text:
            return False
        cur = self._read_payment_label()
        want_keys = ("chuyển khoản", "bank transfer", "chuyen khoan")
        if cur:
            cl = cur.lower()
            if any(k in cl for k in want_keys) or text[:12].lower() in cl:
                _PAYMENT_LABEL_CACHE = cur
                return True
        tokens: list[str] = []
        for t in (_PAYMENT_LABEL_CACHE, text, "Chuyển khoản", "Bank transfer"):
            if t and t not in tokens:
                tokens.append(t)
            for part in re.split(r"[/]", t or ""):
                p = part.strip()
                if p and p not in tokens:
                    tokens.append(p)
        try:
            wrap = self.page.locator(".ant-select:has(#codPayMod)").first
            if wrap.count() == 0:
                wrap = self.page.locator("#codPayMod").first
            wrap.click(timeout=1200, force=True)
            self.page.locator(
                ".ant-select-dropdown:not(.ant-select-dropdown-hidden) "
                ".ant-select-item-option"
            ).first.wait_for(state="visible", timeout=2000)
            for tok in tokens:
                opt = self.page.locator(
                    ".ant-select-dropdown:not(.ant-select-dropdown-hidden) "
                    ".ant-select-item-option:not(.ant-select-item-option-disabled)"
                ).filter(has_text=re.compile(re.escape(tok[:24]), re.I))
                if opt.count() > 0:
                    opt.first.click(timeout=1200)
                    got = self._read_payment_label()
                    if got:
                        _PAYMENT_LABEL_CACHE = got
                    return True
        except Exception:
            pass
        if self._fill_combobox("codPayMod", text) or self._fill_combobox(
            "codPayMod", "Chuyển khoản"
        ):
            got = self._read_payment_label()
            if got:
                _PAYMENT_LABEL_CACHE = got
            return True
        return False

    @staticmethod
    def _ymd_to_dmy(ymd: str) -> str:
        s = (ymd or "").strip()
        if re.match(r"^\d{2}-\d{2}-\d{4}$", s):
            return s
        parts = s.split("-")
        if len(parts) == 3 and len(parts[0]) == 4:
            return f"{parts[2]}-{parts[1]}-{parts[0]}"
        return s

    @staticmethod
    def _ymd_to_mdy(ymd: str) -> str:
        """Modal CHỌN CHUYẾN BAY dùng #flightDate dạng MM-DD-YYYY."""
        s = (ymd or "").strip()
        m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
        if m:
            return f"{m.group(2)}-{m.group(3)}-{m.group(1)}"
        m = re.match(r"^(\d{2})-(\d{2})-(\d{4})$", s)
        if m:
            return f"{m.group(2)}-{m.group(1)}-{m.group(3)}"
        return s

    @staticmethod
    def _ymd_to_ddmonyyyy(ymd: str) -> str:
        """Dòng bảng modal: 21JUL2026."""
        months = (
            "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
            "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
        )
        s = (ymd or "").strip()
        y = mo = d = ""
        m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
        if m:
            y, mo, d = m.group(1), m.group(2), m.group(3)
        else:
            m = re.match(r"^(\d{2})-(\d{2})-(\d{4})$", s)
            if m:
                d, mo, y = m.group(1), m.group(2), m.group(3)
        if not (y and mo and d):
            return ""
        try:
            mon = months[int(mo) - 1]
        except Exception:
            return ""
        return f"{d}{mon}{y}"

    @staticmethod
    def _norm_flight(s: str) -> str:
        return re.sub(r"[^A-Z0-9]", "", (s or "").upper())

    @staticmethod
    def _date_tokens(ymd_or_dmy: str) -> set[str]:
        """Các dạng ngày để khớp text modal (YYYY-MM-DD / DD-MM-YYYY / 21JUL2026)."""
        s = (ymd_or_dmy or "").strip()
        out: set[str] = set()
        if not s:
            return out
        out.add(s)
        m = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
        if m:
            y, mo, d = m.group(1), m.group(2), m.group(3)
            out.update(
                {
                    f"{d}-{mo}-{y}",
                    f"{d}/{mo}/{y}",
                    f"{mo}-{d}-{y}",
                    f"{y}{mo}{d}",
                }
            )
            mon = EsidDeclarePage._ymd_to_ddmonyyyy(s)
            if mon:
                out.add(mon)
            return out
        m = re.match(r"^(\d{2})[-/.](\d{2})[-/.](\d{4})$", s)
        if m:
            d, mo, y = m.group(1), m.group(2), m.group(3)
            ymd = f"{y}-{mo}-{d}"
            out.update({ymd, f"{d}-{mo}-{y}", f"{mo}-{d}-{y}"})
            mon = EsidDeclarePage._ymd_to_ddmonyyyy(ymd)
            if mon:
                out.add(mon)
        return out

    def _read_flight_fields(self) -> dict[str, str]:
        try:
            return self.page.evaluate(
                """() => {
                  const g = id => {
                    const el = document.getElementById(id);
                    return el ? String(el.value || '').trim() : '';
                  };
                  return { flightNo: g('flightNo'), datFltOri: g('datFltOri') };
                }"""
            ) or {}
        except Exception:
            return {}

    def _flight_fields_match(self, flight_no: str, flight_date: str) -> bool:
        """True khi form đã có đúng flight + ngày (bỏ qua modal)."""
        vals = self._read_flight_fields()
        want_flight = self._norm_flight(flight_no)
        got_f = self._norm_flight(vals.get("flightNo") or "")
        got_d = (vals.get("datFltOri") or "").strip()
        if not got_f or not got_d:
            return False
        if want_flight and want_flight not in got_f:
            return False
        date_toks = self._date_tokens(flight_date)
        if not date_toks:
            return True
        gd_norm = re.sub(r"[^0-9A-Z]", "", got_d.upper())
        ddmon = self._ymd_to_ddmonyyyy(flight_date)
        if ddmon and ddmon.upper() in gd_norm:
            return True
        return any(
            tok in got_d or re.sub(r"[^0-9A-Z]", "", tok.upper()) in gd_norm
            for tok in date_toks
        )

    def choose_flight(self, flight_no: str, flight_date: str) -> dict[str, Any]:
        """
        Bắt buộc điền ngày/số hiệu qua nút CHỌN CHUYẾN BAY (không gõ tay datFltOri).
        Hot-path: nếu form đã đúng flight+ngày → bỏ modal.
        """
        warnings: list[str] = []
        flight = (flight_no or "").strip()
        fdate = (flight_date or "").strip()
        want_flight = self._norm_flight(flight)
        date_toks = self._date_tokens(fdate)
        mdy = self._ymd_to_mdy(fdate)
        ddmon = self._ymd_to_ddmonyyyy(fdate)

        if self._flight_fields_match(flight, fdate):
            vals = self._read_flight_fields()
            return {
                "ok": True,
                "flight_ok": True,
                "date_ok": True,
                "skipped": True,
                "confirmed": False,
                "agree_clicked": False,
                "modal_closed": True,
                "warnings": [],
                "values": vals,
                "pick": {"skipped": True},
            }

        clicked = False
        try:
            btn = self.page.get_by_role(
                "button", name=re.compile(r"CHỌN\s*CHUYẾN\s*BAY", re.I)
            )
            if btn.count() > 0 and btn.first.is_visible(timeout=800):
                btn.first.click(timeout=4000)
                clicked = True
        except Exception:
            pass
        if not clicked:
            try:
                clicked = bool(
                    self.page.evaluate(
                        """() => {
                          const nodes = [...document.querySelectorAll('button, a, span')];
                          const el = nodes.find(n => {
                            const t = (n.innerText || '').trim();
                            return t.length < 40 && /CH[ỌO]N\\s*CHUY[ẾE]N\\s*BAY/i.test(t);
                          });
                          if (!el) return false;
                          el.click();
                          return true;
                        }"""
                    )
                )
            except Exception:
                clicked = False
        if not clicked:
            return {
                "ok": False,
                "flight_ok": False,
                "date_ok": False,
                "warnings": ["Không bấm được nút CHỌN CHUYẾN BAY"],
            }

        self.page.wait_for_timeout(200)
        modal = self.page.locator(
            ".ant-modal-wrap:not(.ant-modal-wrap-hidden) .ant-modal, "
            ".ant-modal-root .ant-modal:visible, "
            "[role=dialog]"
        ).first
        try:
            modal.wait_for(state="visible", timeout=8000)
        except Exception:
            return {
                "ok": False,
                "flight_ok": False,
                "date_ok": False,
                "warnings": ["Modal CHỌN CHUYẾN BAY không hiện"],
            }

        # Lọc trong modal: #flightDate (MM-DD-YYYY) + #flightNo
        try:
            modal_flight = modal.locator("#flightNo")
            modal_date = modal.locator("#flightDate")
            if mdy and modal_date.count() > 0:
                EsidListPage._set_react_input(modal_date, mdy)
                try:
                    modal_date.first.press("Enter")
                except Exception:
                    pass
            if flight and modal_flight.count() > 0:
                EsidListPage._set_react_input(modal_flight, flight)
                try:
                    modal_flight.first.press("Enter")
                except Exception:
                    pass
            find_btn = modal.get_by_role(
                "button", name=re.compile(r"TÌM|SEARCH|TRA\s*CỨU", re.I)
            )
            if find_btn.count() > 0 and find_btn.first.is_visible(timeout=200):
                find_btn.first.click(timeout=1500)
            # Chờ bảng có dòng (thay sleep cố định)
            try:
                modal.locator(".ant-table-tbody tr").first.wait_for(
                    state="visible", timeout=4000
                )
            except Exception:
                self.page.wait_for_timeout(300)
        except Exception as e:
            warnings.append(f"Lọc modal: {e}")

        pick = self.page.evaluate(
            """({ wantFlight, dateToks, ddmon }) => {
              const wrap = [...document.querySelectorAll(
                '.ant-modal-wrap:not(.ant-modal-wrap-hidden) .ant-modal, [role=dialog]'
              )].find(el => {
                const r = el.getBoundingClientRect();
                return r.width > 80 && r.height > 80;
              });
              if (!wrap) return { ok: false, reason: 'no_modal' };
              const norm = s => String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
              const rows = [...wrap.querySelectorAll(
                '.ant-table-tbody tr, table tbody tr'
              )].filter(tr => {
                const t = (tr.innerText||'').trim();
                if (!t || t.length < 4) return false;
                if (/ant-table-measure|ant-table-placeholder/i.test(tr.className||'')) return false;
                return true;
              });
              const scored = [];
              for (let i = 0; i < rows.length; i++) {
                const text = (rows[i].innerText || '').replace(/\\s+/g, ' ').trim();
                const nf = norm(text);
                let score = 0;
                if (wantFlight && nf.includes(wantFlight)) score += 12;
                for (const tok of (dateToks || [])) {
                  if (tok && (text.includes(tok) || nf.includes(norm(tok)))) {
                    score += 10;
                    break;
                  }
                }
                if (ddmon && nf.includes(norm(ddmon))) score += 6;
                scored.push({ i, score, text: text.slice(0, 140) });
              }
              scored.sort((a,b) => b.score - a.score);
              const best = scored[0];
              if (!best || best.score < 12) {
                return {
                  ok: false,
                  reason: 'no_match',
                  rows: scored.slice(0, 12),
                  count: rows.length
                };
              }
              return {
                ok: true,
                score: best.score,
                text: best.text,
                index: best.i,
                count: rows.length
              };
            }""",
            {
                "wantFlight": want_flight,
                "dateToks": list(date_toks),
                "ddmon": ddmon,
            },
        )
        if not pick or not pick.get("ok"):
            reason = (pick or {}).get("reason") or "unknown"
            warnings.append(
                f"Không khớp chuyến bay trong modal ({reason}, rows={(pick or {}).get('count')})"
            )
            try:
                self.page.keyboard.press("Escape")
            except Exception:
                pass
            return {
                "ok": False,
                "flight_ok": False,
                "date_ok": False,
                "warnings": warnings,
                "pick": pick,
            }

        # Click wrapper Ant Design để React nhận onChange (không check() native)
        row_idx = int(pick.get("index") or 0)
        radio_ok = False
        try:
            rows_loc = modal.locator(
                ".ant-table-tbody > tr.ant-table-row, .ant-table-tbody tr"
            )
            if rows_loc.count() == 0:
                rows_loc = modal.locator("table tbody tr")
            target = rows_loc.nth(row_idx)
            for sel in (".ant-radio-wrapper", ".ant-radio", "td >> nth=0"):
                loc = target.locator(sel)
                if loc.count() == 0:
                    continue
                try:
                    loc.first.click(timeout=2000)
                    radio_ok = True
                    break
                except Exception:
                    continue
            if not radio_ok:
                target.click(timeout=2000)
                radio_ok = True
            self.page.wait_for_timeout(120)
            pick["radio_state"] = self.page.evaluate(
                """(idx) => {
                  const wrap = [...document.querySelectorAll(
                    '.ant-modal-wrap:not(.ant-modal-wrap-hidden) .ant-modal'
                  )][0];
                  if (!wrap) return {};
                  const rows = [...wrap.querySelectorAll('.ant-table-tbody tr')].filter(tr =>
                    !/ant-table-measure|ant-table-placeholder/i.test(tr.className||'')
                  );
                  const tr = rows[idx];
                  if (!tr) return { missing: true };
                  const inp = tr.querySelector('input[type=radio]');
                  return {
                    checked: !!(inp && inp.checked),
                    wrapperChecked: !!tr.querySelector(
                      '.ant-radio-wrapper-checked, .ant-radio-checked'
                    ),
                    rowClass: String(tr.className || '').slice(0, 80),
                  };
                }""",
                row_idx,
            )
            # Double-click chỉ khi radio chưa selected
            st = pick.get("radio_state") or {}
            if not (st.get("checked") or st.get("wrapperChecked")):
                try:
                    target.dblclick(timeout=1500)
                    self.page.wait_for_timeout(200)
                except Exception:
                    pass
        except Exception as e:
            warnings.append(f"Chọn radio: {e}")
            radio_ok = False

        if not radio_ok:
            warnings.append("Không chọn được radio chuyến bay")
            try:
                self.page.keyboard.press("Escape")
            except Exception:
                pass
            return {
                "ok": False,
                "flight_ok": False,
                "date_ok": False,
                "warnings": warnings,
                "pick": pick,
            }

        self.page.wait_for_timeout(200)
        # Footer Cancel / Ok — dump trạng thái trước khi bấm
        pick["ok_btn"] = self.page.evaluate(
            """() => {
              const wrap = [...document.querySelectorAll(
                '.ant-modal-wrap:not(.ant-modal-wrap-hidden) .ant-modal'
              )][0];
              if (!wrap) return null;
              const btns = [...wrap.querySelectorAll('.ant-modal-footer button')];
              return btns.map(b => ({
                text: (b.innerText||'').trim(),
                disabled: !!b.disabled,
                aria: b.getAttribute('aria-disabled'),
                cls: String(b.className||'').slice(0, 100),
              }));
            }"""
        )
        confirmed = False
        modal_closed = False
        try:
            try:
                self.page.keyboard.press("Tab")
            except Exception:
                pass
            self.page.wait_for_timeout(100)
            ok_btn = self.page.locator(
                ".ant-modal-wrap:not(.ant-modal-wrap-hidden) .ant-modal-footer button"
            ).filter(has_text=re.compile(r"^Ok$", re.I))
            if ok_btn.count() > 0:
                box = ok_btn.first.bounding_box()
                if box:
                    self.page.mouse.click(
                        box["x"] + box["width"] / 2,
                        box["y"] + box["height"] / 2,
                    )
                else:
                    ok_btn.first.click(timeout=3000, force=True)
                confirmed = True
                self.page.wait_for_timeout(250)
        except Exception as e:
            warnings.append(f"Không bấm Ok modal: {e}")

        # Popup «Thông báo»: Bạn có đồng ý chọn chuyến bay này? → Đồng ý
        agree_clicked = False
        try:
            agree = self.page.get_by_role(
                "button", name=re.compile(r"^Đồng\s*ý$", re.I)
            )
            if agree.count() == 0:
                agree = self.page.locator(
                    ".ant-modal-confirm .ant-btn-primary, "
                    ".ant-modal-wrap:not(.ant-modal-wrap-hidden) button"
                ).filter(has_text=re.compile(r"^Đồng\s*ý$", re.I))
            if agree.count() > 0:
                agree.last.wait_for(state="visible", timeout=3500)
                agree.last.click(timeout=2500)
                agree_clicked = True
                self.page.wait_for_timeout(350)
            else:
                self.page.wait_for_timeout(350)
                agree = self.page.get_by_role(
                    "button", name=re.compile(r"Đồng\s*ý", re.I)
                )
                if agree.count() > 0:
                    agree.last.click(timeout=2500)
                    agree_clicked = True
                    self.page.wait_for_timeout(350)
        except Exception as e:
            warnings.append(f"Popup Đồng ý: {e}")

        pick["agree_clicked"] = agree_clicked
        if not confirmed and not agree_clicked:
            warnings.append("Không bấm được Ok / Đồng ý trên modal chuyến bay")

        try:
            self.page.locator(
                ".ant-modal-wrap:not(.ant-modal-wrap-hidden) .ant-modal"
            ).first.wait_for(state="hidden", timeout=8000)
            modal_closed = True
        except Exception:
            # Đóng confirm nếu còn
            try:
                self.page.keyboard.press("Escape")
                self.page.wait_for_timeout(300)
            except Exception:
                pass

        pick["modal_closed"] = modal_closed

        vals = self.page.evaluate(
            """() => {
              const g = id => {
                for (const el of document.querySelectorAll('#' + id)) {
                  if (el.closest('.ant-modal')) continue;
                  const r = el.getBoundingClientRect();
                  if (r.width < 1) continue;
                  return String(el.value || '').trim();
                }
                return '';
              };
              return { flightNo: g('flightNo'), datFltOri: g('datFltOri') };
            }"""
        ) or {}
        got_f = self._norm_flight(vals.get("flightNo") or "")
        got_d = (vals.get("datFltOri") or "").strip()
        flight_ok = bool(want_flight and want_flight in got_f) or (
            bool(got_f) and not want_flight
        )
        date_ok = False
        if got_d:
            if not date_toks:
                date_ok = True
            else:
                gd_norm = re.sub(r"[^0-9A-Z]", "", got_d.upper())
                date_ok = any(
                    tok in got_d or re.sub(r"[^0-9A-Z]", "", tok.upper()) in gd_norm
                    for tok in date_toks
                )
                if not date_ok and ddmon and ddmon.upper() in gd_norm:
                    date_ok = True

        if not flight_ok:
            warnings.append(
                f"Sau chọn chuyến: flightNo={vals.get('flightNo')!r} (muốn {flight!r})"
            )
        if not date_ok:
            warnings.append(
                f"Sau chọn chuyến: datFltOri={got_d!r} (muốn {fdate!r}) — ngày bay bắt buộc qua modal"
            )

        return {
            "ok": bool(flight_ok and date_ok and (confirmed or agree_clicked)),
            "flight_ok": flight_ok,
            "date_ok": date_ok,
            "confirmed": confirmed,
            "agree_clicked": agree_clicked,
            "modal_closed": modal_closed,
            "warnings": warnings,
            "values": vals,
            "pick": pick,
        }

    def fill_declare(self, data: dict[str, Any], *, submit: bool = False) -> dict[str, Any]:
        """
        Điền form từ payload Ops. Mặc định submit=False: không tick đồng ý, không HOÀN TẤT.

        Thứ tự tối ưu:
        1) Text ops (AWB/pcs/HAWB/goods)
        2) CHỌN CHUYẾN BAY (hot-path nếu đã đúng)
        3) Dest + payment (1 lần)
        4) Party (Shipper/Agent/CNEE)
        5) Người khai
        """
        t_all = time.perf_counter()
        timings: dict[str, int] = {}

        self.goto_declare_tab()
        if not self._on_declare_form():
            raise SiteChangedError("Chưa vào form KHAI BÁO ESID — dừng để tránh gõ vào ô tìm danh sách")

        fills: dict[str, Any] = {}
        warnings: list[str] = []

        awb = "".join(c for c in str(data.get("awb") or "") if c.isdigit())[:11]
        if len(awb) != 11:
            raise SiteChangedError("AWB phải đủ 11 số")

        # 1) Text ops nhanh
        t0 = time.perf_counter()
        self._fill_ops_text(data, awb, fills, warnings)
        timings["ops_text_ms"] = int((time.perf_counter() - t0) * 1000)

        # 2) Chuyến bay trước dest/payment (tránh chọn payment 2 lần)
        flight = str(data.get("flight_no") or data.get("flight") or "").strip()
        fdate_ymd = str(data.get("flight_date") or "").strip()
        choose_flight = bool(data.get("choose_flight", True))
        t0 = time.perf_counter()
        if choose_flight and (flight or fdate_ymd):
            cf = self.choose_flight(flight, fdate_ymd)
            fills["choose_flight"] = cf.get("ok", False)
            fills["choose_flight_skipped"] = bool(cf.get("skipped"))
            fills["flightNo"] = cf.get("flight_ok", False)
            fills["datFltOri"] = cf.get("date_ok", False)
            for w in cf.get("warnings") or []:
                warnings.append(w)
            # Modal có thể xóa text — điền lại AWB/pcs
            self._fill_ops_text(data, awb, fills, warnings)
        else:
            fills["flightNo"] = self._set_id("flightNo", flight)
            fdate = self._ymd_to_dmy(fdate_ymd)
            if fdate:
                fills["datFltOri"] = self._set_id("datFltOri", fdate)
                if not fills["datFltOri"]:
                    warnings.append("Không điền được ngày bay")
        timings["flight_ms"] = int((time.perf_counter() - t0) * 1000)

        # 3) Dest + payment một lần
        t0 = time.perf_counter()
        self._fill_ops_selects(data, fills, warnings)
        timings["selects_ms"] = int((time.perf_counter() - t0) * 1000)

        # 4) Party (combobox chậm — sau flight/payment)
        t0 = time.perf_counter()
        party_map = [
            ("shipper_name", "shipperId", True),
            ("shipper_address", "addressShp", False),
            ("shipper_tel", "telShp", False),
            ("shipper_email", "emailShp", False),
            ("shipper_fax", "faxShp", False),
            ("agent_name", "agentId", True),
            ("agent_address", "addressAgt", False),
            ("agent_tel", "telAgt", False),
            ("agent_email", "emailAgt", False),
            ("agent_fax", "faxAgt", False),
            ("agent_vat", "vatAgt", False),
            ("consignee_name", "consigneeId", True),
            ("consignee_address", "addressCne", False),
            ("consignee_tel", "telCne", False),
            ("consignee_email", "emailCne", False),
            ("consignee_fax", "faxCne", False),
            ("consignee_vat", "vatCne", False),
            ("notify_name", "notifyId", True),
            ("notify_address", "addressNtf", False),
            ("notify_tel", "telNtf", False),
            ("notify_email", "emailNtf", False),
            ("notify_fax", "faxNtf", False),
            ("notify_remark", "desRmk001", False),
            ("other_request", "shcOthReq", False),
        ]
        for key, eid, is_combo in party_map:
            val = str(data.get(key) or "").strip()
            if not val:
                continue
            if is_combo:
                ok = self._fill_combobox(eid, val)
                fills[eid] = ok
                if not ok:
                    warnings.append(f"Combobox #{eid} chưa chọn master cho {val!r}")
            else:
                fills[eid] = self._set_id(eid, val)
        timings["party_ms"] = int((time.perf_counter() - t0) * 1000)

        if data.get("tecs_warehouse", True):
            fills["shcCod002"] = self._set_checkbox("shcCod002", True)
        if data.get("consol"):
            fills["shcConsol"] = self._set_checkbox("shcConsol", True)

        # 5) Người khai
        reg_name = str(data.get("registrant_name") or "").strip()
        reg_tel = str(data.get("registrant_tel") or "").strip()
        reg_cccd = str(data.get("registrant_cccd") or "").strip()
        fills["shpRegNam"] = self._set_id("shpRegNam", reg_name)
        fills["shpRegTel"] = self._set_id("shpRegTel", reg_tel)
        fills["shpRegIdx"] = self._set_id("shpRegIdx", reg_cccd)

        # An toàn: bỏ tick đồng ý trừ khi submit
        self._set_checkbox("agreeConfirm", False)

        submitted = False
        if submit:
            if not (reg_name and reg_tel and reg_cccd):
                warnings.append("SUBMIT yêu cầu đủ người khai (tên/tel/CCCD) — đã bỏ qua HOÀN TẤT")
            else:
                self._set_checkbox("agreeConfirm", True)
                try:
                    btn = self.page.get_by_role("button", name=re.compile(r"HOÀN\s*TẤT", re.I))
                    btn.first.click(timeout=4000)
                    submitted = True
                    self.page.wait_for_timeout(500)
                except Exception as e:
                    warnings.append(f"Không bấm HOÀN TẤT: {e}")
                    submitted = False

        # Đọc lại giá trị chính
        values = self.page.evaluate(
            """() => {
              const ids = ['codAwbPfx','codAwbNum','flightNo','datFltOri','codFds','qtyPcs',
                'totalOfHawbs','natureOfGoods','codPayMod',
                'addressShp','addressAgt','shpRegNam','shpRegTel','shpRegIdx','agreeConfirm'];
              const out = {};
              for (const id of ids) {
                const nodes = [...document.querySelectorAll('#' + id)];
                let el = null;
                for (const n of nodes) {
                  if (n.closest('.ant-modal')) continue;
                  el = n; break;
                }
                if (!el) { out[id] = null; continue; }
                if (el.type === 'checkbox') out[id] = !!el.checked;
                else out[id] = String(el.value || '');
                if (!out[id] && el.closest && el.closest('.ant-select')) {
                  const sel = el.closest('.ant-select');
                  const item = sel && sel.querySelector('.ant-select-selection-item');
                  if (item) out[id] = (item.textContent || '').trim();
                }
              }
              return out;
            }"""
        )

        try:
            blob = self.page.evaluate("() => (document.body && document.body.innerText || '').slice(0, 4000)")
            if re.search(r"đã đăng ký|da dang ky", str(blob or ""), re.I):
                warnings.append("TCS cảnh báo AWB đã đăng ký — kiểm tra danh sách ESID")
        except Exception:
            pass

        timings["total_ms"] = int((time.perf_counter() - t_all) * 1000)

        ok_core = bool(fills.get("codAwbPfx") and fills.get("codAwbNum"))
        if choose_flight and (flight or fdate_ymd):
            if not fills.get("datFltOri"):
                ok_core = False
                warnings.append("Ngày bay bắt buộc qua CHỌN CHUYẾN BAY — chưa chọn được")
        return {
            "ok": ok_core,
            "awb": awb,
            "submitted": submitted,
            "fills": fills,
            "values": values,
            "warnings": warnings,
            "timings": timings,
            "message": (
                "Đã điền form KHAI BÁO ESID (chưa HOÀN TẤT)"
                if not submitted
                else "Đã gửi HOÀN TẤT"
            ),
        }
