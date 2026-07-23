"""Page object: tab KHAI BÁO ESID — điền form (mặc định không HOÀN TẤT)."""
from __future__ import annotations

import re
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.browser.locators import LocatorsConfig
from app.browser.pages.awb_page import NeedsLoginError, SiteChangedError
from app.browser.pages.esid_page import EsidListPage
from app.utils.awb import digits_only

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
            try:
                if checked:
                    loc.first.check(force=True, timeout=1200)
                else:
                    loc.first.uncheck(force=True, timeout=1200)
            except Exception:
                # Một số checkbox TCS dùng input ẩn; click label/wrapper để React nhận.
                self.page.evaluate(
                    """({eid, checked}) => {
                      const el = document.getElementById(eid);
                      if (!el) return false;
                      if (!!el.checked === !!checked) return true;
                      const label = document.querySelector(`label[for="${eid}"]`)
                        || el.closest('label')
                        || el.parentElement;
                      (label || el).click();
                      return !!el.checked === !!checked;
                    }""",
                    {"eid": eid, "checked": bool(checked)},
                )
            return bool(loc.first.is_checked(timeout=500)) == bool(checked)
        except Exception:
            return False

    @staticmethod
    def _fold_text(s: str) -> str:
        """Bỏ dấu tiếng Việt + chuẩn hóa khoảng trắng (so khớp master TCS)."""
        t = unicodedata.normalize("NFD", s or "")
        t = "".join(c for c in t if unicodedata.category(c) != "Mn")
        t = t.replace("đ", "d").replace("Đ", "D")
        return re.sub(r"\s+", " ", t).strip().upper()

    @classmethod
    def _combobox_search_queries(cls, text: str) -> list[str]:
        """
        Tạo tối đa 4 truy vấn đặc trưng. Không thử tuần tự 10 token chung chung
        (LTD/TNHH/COMPANY...) vì mỗi lần remote search của TCS có thể tốn vài giây.
        """
        raw = (text or "").strip()
        if not raw:
            return []
        fold = cls._fold_text(raw)
        words = [w for w in re.split(r"[\s,/|.-]+", fold) if w]
        stop = {
            "CONG",
            "TY",
            "CO",
            "PHAN",
            "VA",
            "DICH",
            "VU",
            "CHI",
            "NHANH",
            "SO",
            "CTY",
            "CTCP",
            "TNHH",
            "LTD",
            "CO",
            "COMPANY",
        }
        distinctive = [w for w in words if len(w) >= 3 and w not in stop]
        queries: list[str] = []
        if distinctive:
            # Mã/tên riêng ở cuối (PCS, HST...) thường khớp master chính xác nhất.
            queries.append(distinctive[-1])
            queries.append(max(distinctive, key=len))
        if len(distinctive) >= 2:
            queries.append(" ".join(distinctive[-2:]))
        queries.append(raw if len(raw) <= 36 else raw[:36].rstrip())
        seen: set[str] = set()
        out: list[str] = []
        for q in queries:
            qn = cls._fold_text(q)
            if not qn or qn in seen:
                continue
            seen.add(qn)
            out.append(q.strip())
        return out[:4]

    def _visible_select_options(self):
        return self.page.locator(
            ".ant-select-dropdown:not(.ant-select-dropdown-hidden) "
            ".ant-select-item-option:not(.ant-select-item-option-disabled)"
        )

    def _pick_combobox_option(self, full_text: str) -> bool:
        """Chọn option ant-select khớp nhất (không phân biệt dấu)."""
        fold_full = self._fold_text(full_text)
        if not fold_full:
            return False
        opts = self._visible_select_options()
        try:
            n = opts.count()
        except Exception:
            return False
        if n <= 0:
            return False

        full_words = set(fold_full.split())
        try:
            labels = opts.evaluate_all(
                """els => els.slice(0, 24).map(el =>
                  (el.getAttribute('title')
                    || el.querySelector('.ant-select-item-option-content')?.textContent
                    || el.textContent || '').replace(/\\s+/g, ' ').trim()
                )"""
            )
        except Exception:
            labels = []
        best_i = -1
        best_score = 0
        for i, label in enumerate(labels):
            fold_opt = self._fold_text(label)
            if not fold_opt:
                continue
            score = 0
            if fold_opt == fold_full:
                score = 100
            elif fold_full in fold_opt or fold_opt in fold_full:
                score = 82
            else:
                opt_words = set(fold_opt.split())
                common = full_words & opt_words
                if common:
                    score = int(55 * len(common) / max(len(full_words), 1))
                    # Ưu tiên mã ngắn cuối tên (PCS, HST…)
                    if fold_full.split()[-1:] == fold_opt.split()[-1:]:
                        score += 20
                    # Token dài đặc trưng
                    for w in common:
                        if len(w) >= 5:
                            score += 3
            if score > best_score:
                best_score = score
                best_i = i

        # Một option duy nhất sau khi filter remote → chấp nhận nếu có chút liên quan
        min_score = 25 if n == 1 else 40
        if best_i >= 0 and best_score >= min_score:
            try:
                opts.nth(best_i).click(timeout=2000)
                return True
            except Exception:
                return False
        return False

    def _type_combobox_search(self, eid: str, target, query: str) -> None:
        try:
            search = self.page.locator(
                f"#{eid}.ant-select-selection-search-input, "
                f".ant-select-focused #{eid}, "
                f"input#{eid}"
            ).first
            if search.count() > 0:
                search.fill("", timeout=600)
                search.fill(query, timeout=600)
            else:
                target.fill("", timeout=600)
                target.fill(query, timeout=600)
        except Exception:
            try:
                self.page.keyboard.type(query, delay=6)
            except Exception:
                pass

    def _fill_combobox(
        self,
        eid: str,
        value: str,
        *,
        max_queries: int = 3,
        budget_ms: int = 6500,
    ) -> bool:
        """Ant Select có ngân sách thời gian cứng; không để một master treo cả job."""
        text = (value or "").strip()
        if not text:
            return False
        deadline = time.monotonic() + max(1000, budget_ms) / 1000
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
            self.page.wait_for_timeout(80)

            for query in self._combobox_search_queries(text)[:max_queries]:
                if time.monotonic() >= deadline:
                    break
                self._type_combobox_search(eid, target, query)
                try:
                    self._visible_select_options().first.wait_for(
                        state="visible",
                        timeout=max(
                            250,
                            min(1100, int((deadline - time.monotonic()) * 1000)),
                        ),
                    )
                except Exception:
                    self.page.wait_for_timeout(100)
                if self._pick_combobox_option(text):
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

    def _fill_ops_selects(
        self,
        data: dict[str, Any],
        fills: dict,
        warnings: list,
        *,
        include_destination: bool = True,
        include_payment: bool = True,
    ) -> None:
        """Chọn destination/payment có kiểm soát để không chọn lặp."""
        dest = str(data.get("dest") or "").strip().upper()
        if include_destination and dest:
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
                    ok_dest = self._fill_combobox(
                        "codFds",
                        dest,
                        max_queries=2,
                        budget_ms=3000,
                    ) or self._set_id("codFds", dest)
                    fills["codFds"] = ok_dest
                    if not ok_dest:
                        warnings.append(f"Dest {dest!r} chưa chọn được")
            except Exception:
                fills["codFds"] = self._fill_combobox(
                    "codFds",
                    dest,
                    max_queries=2,
                    budget_ms=3000,
                )

        pay = str(data.get("payment_mode") or _PAYMENT_LABEL_CACHE).strip()
        if include_payment and pay:
            payment_ok = self._fill_payment(pay)
            # Ant Select đôi lúc cập nhật label sau timeout click; xác minh
            # trạng thái cuối để tránh cảnh báo giả dù form đã là Chuyển khoản.
            if not payment_ok:
                current_payment = self._fold_text(self._read_payment_label())
                payment_ok = any(
                    token in current_payment
                    for token in ("CHUYEN KHOAN", "BANK TRANSFER")
                )
            fills["codPayMod"] = payment_ok
            if not fills["codPayMod"]:
                warnings.append(f"Thanh toán {pay!r} chưa chọn được")

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
            # Ant Select cần một click Playwright "trusted". HTMLElement.click()
            # không ổn định vì đôi lúc React không mở dropdown sau khi modal
            # chuyến bay vừa đóng.
            pay_input = self.page.locator("#codPayMod:visible")
            if pay_input.count() == 0:
                pay_input = self.page.locator("#codPayMod")
            if pay_input.count() == 0:
                return False
            pay_input.last.click(timeout=1800, force=True)
            self.page.locator(
                ".ant-select-dropdown:not(.ant-select-dropdown-hidden) "
                ".ant-select-item-option"
            ).first.wait_for(state="visible", timeout=2000)
            opts = self.page.locator(
                ".ant-select-dropdown:not(.ant-select-dropdown-hidden) "
                ".ant-select-item-option:not(.ant-select-item-option-disabled)"
            )
            labels = opts.evaluate_all(
                """els => els.map(el =>
                  (el.getAttribute('title') || el.textContent || '')
                    .replace(/\\s+/g, ' ').trim()
                )"""
            )
            folded_tokens = [self._fold_text(t) for t in tokens]
            for idx, label in enumerate(labels):
                folded_label = self._fold_text(label)
                if any(
                    token and (token in folded_label or folded_label in token)
                    for token in folded_tokens
                ):
                    opts.nth(idx).click(timeout=1200)
                    self.page.wait_for_timeout(120)
                    got = self._read_payment_label()
                    got_folded = self._fold_text(got)
                    if got and any(
                        key in got_folded
                        for key in ("chuyen khoan", "bank transfer")
                    ):
                        _PAYMENT_LABEL_CACHE = got
                        return True
        except Exception:
            pass
        if self._fill_combobox(
            "codPayMod",
            text,
            max_queries=1,
            budget_ms=2600,
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
        """#flightDate trong modal TCS hiển thị MM-DD-YYYY."""
        s = (ymd or "").strip()
        match = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
        if match:
            return f"{match.group(2)}-{match.group(3)}-{match.group(1)}"
        match = re.match(r"^(\d{2})[-/.](\d{2})[-/.](\d{4})$", s)
        if match:
            return f"{match.group(2)}-{match.group(1)}-{match.group(3)}"
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
        compact = re.sub(r"[^A-Z0-9]", "", (s or "").upper())
        match = re.match(r"^([A-Z]{2,3})0*(\d+)$", compact)
        if match:
            return f"{match.group(1)}{int(match.group(2))}"
        return compact

    @staticmethod
    def _flight_search_query(s: str) -> str:
        """Ô tìm kiếm TCS dùng mã đủ 4 số: AK523 → AK0523."""
        compact = re.sub(r"[^A-Z0-9]", "", (s or "").upper())
        match = re.match(r"^([A-Z]{2,3})0*(\d+)$", compact)
        if not match:
            return compact
        return f"{match.group(1)}{match.group(2).zfill(4)}"

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
                    const el = [...document.querySelectorAll('#' + id)].find(
                      node => !node.closest('.ant-modal, [role=dialog]')
                    );
                    return el ? String(el.value || '').trim() : '';
                  };
                  return { flightNo: g('flightNo'), datFltOri: g('datFltOri') };
                }"""
            ) or {}
        except Exception:
            return {}

    def _close_open_flight_modals(self) -> None:
        """Đóng modal chuyến bay cũ để tránh duplicate id và thao tác nhầm."""
        for _ in range(3):
            current = self.page.locator(
                ".ant-modal:visible, [role=dialog]:visible"
            ).filter(has_text=re.compile(r"Danh\s*sách\s*chuyến\s*bay|flight", re.I))
            if current.count() == 0:
                return
            try:
                close = current.last.locator(
                    ".ant-modal-close, .ant-modal-footer button"
                ).filter(has_text=re.compile(r"Cancel|Hủy|Đóng", re.I))
                if close.count() > 0:
                    close.first.evaluate("el => el.click()")
                else:
                    self.page.keyboard.press("Escape")
                self.page.wait_for_timeout(120)
            except Exception:
                try:
                    self.page.keyboard.press("Escape")
                except Exception:
                    return

    def _select_modal_flight_date(self, modal, ymd: str) -> bool:
        """Chọn ngày bằng Ant DatePicker; không gán text vào input readonly."""
        target_text = (ymd or "").strip()
        try:
            target = datetime.strptime(target_text, "%Y-%m-%d")
        except ValueError:
            return False
        date_input = modal.locator("#flightDate").first
        if date_input.count() == 0:
            return False
        try:
            current_value = date_input.input_value(timeout=500)
        except Exception:
            current_value = ""
        try:
            current = datetime.strptime(current_value, "%m-%d-%Y")
        except ValueError:
            current = datetime.now()

        try:
            date_input.click(timeout=1200, force=True)
            popup = self.page.locator(
                ".ant-picker-dropdown:not(.ant-picker-dropdown-hidden):visible"
            ).last
            popup.wait_for(state="visible", timeout=1800)

            month_delta = (
                (target.year - current.year) * 12
                + target.month
                - current.month
            )
            if abs(month_delta) > 24:
                return False
            selector = (
                ".ant-picker-header-next-btn"
                if month_delta > 0
                else ".ant-picker-header-prev-btn"
            )
            for _ in range(abs(month_delta)):
                nav = popup.locator(selector).first
                if nav.count() == 0:
                    return False
                nav.evaluate("el => el.click()")
                self.page.wait_for_timeout(80)

            cell = popup.locator(
                f"td[title='{target_text}']:not(.ant-picker-cell-disabled)"
            ).last
            if cell.count() == 0:
                return False
            cell.evaluate("el => el.click()")
            self.page.wait_for_timeout(140)
            got = date_input.input_value(timeout=500)
            return got == self._ymd_to_mdy(target_text)
        except Exception:
            return False

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

    def choose_flight(
        self,
        flight_no: str,
        flight_date: str,
        *,
        _empty_retry: bool = False,
    ) -> dict[str, Any]:
        """
        Bắt buộc điền ngày/số hiệu qua nút CHỌN CHUYẾN BAY (không gõ tay datFltOri).
        Hot-path: nếu form đã đúng flight+ngày → bỏ modal.
        """
        warnings: list[str] = []
        flight = (flight_no or "").strip()
        fdate = (flight_date or "").strip()
        want_flight = self._norm_flight(flight)
        flight_query = self._flight_search_query(flight)
        mdy = self._ymd_to_mdy(fdate)
        date_toks = self._date_tokens(fdate)
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

        self._close_open_flight_modals()

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
            ".ant-modal:visible, [role=dialog]:visible"
        ).filter(
            has_text=re.compile(r"Danh\s*sách\s*chuyến\s*bay|flight", re.I)
        ).last
        try:
            modal.wait_for(state="visible", timeout=4000)
        except Exception:
            return {
                "ok": False,
                "flight_ok": False,
                "date_ok": False,
                "warnings": ["Modal CHỌN CHUYẾN BAY không hiện"],
            }

        # Đúng quy trình TCS: ngày OPS → chuyến bay → nút search icon.
        filter_diag: dict[str, Any] = {}
        try:
            modal_date = modal.locator("#flightDate")
            modal_flight = modal.locator("#flightNo")
            date_selected = self._select_modal_flight_date(modal, fdate)
            if not date_selected:
                try:
                    self.page.keyboard.press("Escape")
                except Exception:
                    pass
                return {
                    "ok": False,
                    "flight_ok": False,
                    "date_ok": False,
                    "warnings": [
                        f"Không chọn được ngày bay {fdate!r} bằng lịch TCS"
                    ],
                    "pick": {
                        "requested": {"flight": flight_query, "date": mdy},
                        "reason": "date_picker_failed",
                    },
                }
            if flight_query and modal_flight.count() > 0:
                # Ô flight không readonly: dùng thao tác fill thật để Ant Input
                # cập nhật state; native setter có thể bị React trả về giá trị cũ.
                modal_flight.first.click(timeout=1000)
                modal_flight.first.fill(flight_query, timeout=1200)
                self.page.wait_for_timeout(80)

            search_clicked = False
            search_btn = modal.locator(
                "button.ant-input-search-button, "
                ".ant-input-search-button"
            ).first
            if search_btn.count() > 0:
                search_btn.evaluate("el => el.click()")
                search_clicked = True
            if not search_clicked:
                search_btn = modal.get_by_role(
                    "button", name=re.compile(r"search|tìm", re.I)
                ).first
                if search_btn.count() > 0:
                    search_btn.click(timeout=1200, force=True)
                    search_clicked = True
            if not search_clicked:
                warnings.append("Không thấy nút search chuyến bay (.ant-input-search-button)")

            # Ant dựng một row tạm rồi thay toàn bộ tbody khi request hoàn tất;
            # wait_for(first row) có thể bắt đúng row tạm. Poll ngay trên modal
            # đang dùng cho tới khi có row dữ liệu ổn định.
            stable_rows = 0
            last_count = 0
            for _ in range(28):
                last_count = int(
                    modal.evaluate(
                        """el => [...el.querySelectorAll(
                          '.ant-table-tbody tr, table tbody tr'
                        )].filter(tr => {
                          const t = (tr.innerText || '').trim();
                          return t.length >= 4
                            && !/ant-table-measure|ant-table-placeholder/i.test(
                              tr.className || ''
                            );
                        }).length"""
                    )
                    or 0
                )
                stable_rows = stable_rows + 1 if last_count > 0 else 0
                if stable_rows >= 2:
                    break
                self.page.wait_for_timeout(150)
            filter_diag = modal.evaluate(
                """modal => {
                  return {
                    inputs: [...modal.querySelectorAll('input')].map(el => ({
                      id: el.id || '', name: el.name || '', type: el.type || '',
                      value: String(el.value || ''), placeholder: el.placeholder || ''
                    })),
                    buttons: [...modal.querySelectorAll('button')].map(
                      el => (el.innerText || '').trim()
                    ).filter(Boolean),
                    pagination: (
                      modal.querySelector('.ant-pagination')?.innerText || ''
                    ).replace(/\\s+/g, ' ').trim(),
                    paginationHtml: String(
                      modal.querySelector('.ant-pagination')?.outerHTML || ''
                    ).slice(0, 1200)
                  };
                }"""
            ) or {}
            filter_diag["stable_row_count"] = last_count
            filter_diag["search_clicked"] = search_clicked
            filter_diag["requested_date"] = mdy
            filter_diag["requested_flight"] = flight_query
        except Exception as e:
            warnings.append(f"Chờ danh sách chuyến bay: {e}")

        pick = modal.evaluate(
            """(wrap, { wantFlight, dateToks, ddmon }) => {
              const norm = s => String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
              const normFlightsInText = s =>
                norm(s).replace(/([A-Z]{2,3})0+(\\d{2,4})/g, '$1$2');
              const rows = [...wrap.querySelectorAll(
                '.ant-table-tbody tr, table tbody tr'
              )].filter(tr => {
                const t = (tr.innerText||'').trim();
                if (!t || t.length < 4) return false;
                if (/ant-table-measure|ant-table-placeholder/i.test(tr.className||'')) return false;
                return true;
              });
              const scored = [];
              const previewRows = [];
              for (let i = 0; i < rows.length; i++) {
                const text = (rows[i].innerText || '').replace(/\\s+/g, ' ').trim();
                if (previewRows.length < 12) previewRows.push(text.slice(0, 140));
                const nf = normFlightsInText(text);
                const flightMatched = !wantFlight || nf.includes(wantFlight);
                if (!flightMatched) continue;
                let score = 0;
                if (wantFlight) score += 12;
                let dateMatched = !(ddmon || (dateToks || []).length);
                for (const tok of (dateToks || [])) {
                  if (tok && (text.includes(tok) || nf.includes(norm(tok)))) {
                    score += 10;
                    dateMatched = true;
                    break;
                  }
                }
                if (ddmon && nf.includes(norm(ddmon))) {
                  score += 6;
                  dateMatched = true;
                }
                if (!dateMatched) continue;
                scored.push({ i, score, text: text.slice(0, 140) });
              }
              scored.sort((a,b) => b.score - a.score);
              const best = scored[0];
              if (!best || best.score < 12) {
                return {
                  ok: false,
                  reason: 'no_match',
                  rows: previewRows,
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
        if isinstance(pick, dict):
            pick["requested"] = {
                "flight": flight_query,
                "date": mdy,
            }
        # Một số phiên bản TCS chỉ lưu text filter nhưng không lọc bảng. Khi đó
        # duyệt pagination (20 dòng/trang) và chỉ nhận đúng flight + ngày.
        if not pick or not pick.get("ok"):
            page_previews: list[str] = list((pick or {}).get("rows") or [])
            pagination_trace: list[dict[str, Any]] = []
            pagination_state = modal.evaluate(
                """el => ({
                  active: Number(
                    (el.querySelector('.ant-pagination-item-active')?.textContent || '0').trim()
                  ),
                  pages: [...el.querySelectorAll('.ant-pagination-item')]
                    .map(x => Number((x.textContent || '').trim()))
                    .filter(Number.isFinite)
                    .slice(0, 12)
                })"""
            ) or {}
            active_page = int(pagination_state.get("active") or 0)
            page_numbers = [
                int(n)
                for n in (pagination_state.get("pages") or [])
                if int(n) != active_page
            ]
            for page_number in page_numbers:
                try:
                    click_diag = self.page.evaluate(
                            """pageNo => {
                              const visible = el => {
                                const r = el.getBoundingClientRect();
                                const s = getComputedStyle(el);
                                return r.width > 80 && r.height > 80
                                  && s.display !== 'none'
                                  && s.visibility !== 'hidden';
                              };
                              const dialogs = [...document.querySelectorAll(
                                '.ant-modal, [role=dialog]'
                              )].filter(visible);
                              const current = dialogs[dialogs.length - 1];
                              if (!current) return {clicked:false, reason:'no_modal'};
                              const items = [...current.querySelectorAll(
                                '.ant-pagination-item'
                              )];
                              const item = items.find(el =>
                                String(el.getAttribute('title') || '').trim() === String(pageNo)
                                || String(el.textContent || '').trim() === String(pageNo)
                              );
                              const labels = items.map(el => ({
                                title: el.getAttribute('title') || '',
                                text: String(el.textContent || '').trim(),
                                cls: String(el.className || '')
                              }));
                              if (!item) return {
                                clicked:false, reason:'no_page_item', labels
                              };
                              (item.querySelector('button, a') || item).click();
                              return {clicked:true, labels};
                            }""",
                            page_number,
                        ) or {}
                    if not click_diag.get("clicked"):
                        pagination_trace.append(
                            {"page": page_number, **click_diag}
                        )
                        break
                    try:
                        self.page.wait_for_function(
                            """pageNo => {
                              const visible = el => {
                                const r = el.getBoundingClientRect();
                                const s = getComputedStyle(el);
                                return r.width > 80 && r.height > 80
                                  && s.display !== 'none'
                                  && s.visibility !== 'hidden';
                              };
                              const dialogs = [...document.querySelectorAll(
                                '.ant-modal, [role=dialog]'
                              )].filter(visible);
                              const modal = dialogs[dialogs.length - 1];
                              const active = modal?.querySelector(
                                '.ant-pagination-item-active'
                              );
                              return Number((active?.textContent || '').trim()) === pageNo;
                            }""",
                            page_number,
                            timeout=800,
                        )
                    except Exception:
                        self.page.wait_for_timeout(100)
                    page_pick = self.page.evaluate(
                        """({wantFlight, ddmon}) => {
                          const visible = el => {
                            const r = el.getBoundingClientRect();
                            const s = getComputedStyle(el);
                            return r.width > 80 && r.height > 80
                              && s.display !== 'none'
                              && s.visibility !== 'hidden';
                          };
                          const dialogs = [...document.querySelectorAll(
                            '.ant-modal, [role=dialog]'
                          )].filter(visible);
                          const modal = dialogs[dialogs.length - 1];
                          if (!modal) return {
                            ok:false, reason:'no_modal', count:0, preview:[], active:''
                          };
                          const norm = s => String(s||'').toUpperCase()
                            .replace(/[^A-Z0-9]/g,'')
                            .replace(/([A-Z]{2,3})0+(\\d{2,4})/g, '$1$2');
                          const rows = [...modal.querySelectorAll(
                            '.ant-table-tbody tr, table tbody tr'
                          )].filter(tr => {
                            const t = (tr.innerText||'').trim();
                            return t.length >= 4
                              && !/ant-table-measure|ant-table-placeholder/i.test(
                                tr.className||''
                              );
                          });
                          const preview = rows.slice(0, 4).map(
                            tr => (tr.innerText||'').replace(/\\s+/g,' ').trim().slice(0,140)
                          );
                          const active = String(
                            modal.querySelector('.ant-pagination-item-active')?.textContent || ''
                          ).trim();
                          for (let i=0; i<rows.length; i++) {
                            const text = (rows[i].innerText||'').replace(/\\s+/g,' ').trim();
                            const folded = norm(text);
                            if (wantFlight && !folded.includes(wantFlight)) continue;
                            if (ddmon && !folded.includes(norm(ddmon))) continue;
                            return {
                              ok:true, index:i, count:rows.length, score:30,
                              text:text.slice(0,140), preview, active
                            };
                          }
                          return {
                            ok:false, reason:'no_match', count:rows.length, preview, active
                          };
                        }""",
                        {"wantFlight": want_flight, "ddmon": ddmon},
                    ) or {}
                    page_previews.extend(page_pick.get("preview") or [])
                    pagination_trace.append(
                        {
                            "page": page_number,
                            "clicked": True,
                            "active": page_pick.get("active"),
                            "count": page_pick.get("count"),
                            "preview": (page_pick.get("preview") or [])[:2],
                        }
                    )
                    if page_pick.get("ok"):
                        pick = page_pick
                        pick["pagination_page"] = page_number
                        pick["pagination_trace"] = pagination_trace
                        break
                except Exception as e:
                    warnings.append(f"Duyệt trang chuyến bay {page_number}: {e}")
                    break
            if isinstance(pick, dict) and not pick.get("ok"):
                pick["pagination_preview"] = page_previews[:24]
                pick["pagination_trace"] = pagination_trace
        if not pick or not pick.get("ok"):
            if isinstance(pick, dict):
                pick["filter_diag"] = filter_diag
            reason = (pick or {}).get("reason") or "unknown"
            row_count = int((pick or {}).get("count") or 0)
            if row_count == 0 and not _empty_retry:
                try:
                    self.page.keyboard.press("Escape")
                    self.page.wait_for_timeout(250)
                except Exception:
                    pass
                return self.choose_flight(
                    flight_no,
                    flight_date,
                    _empty_retry=True,
                )
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
        if pick.get("pagination_page"):
            modal = self.page.locator(
                ".ant-modal-wrap:not(.ant-modal-wrap-hidden) .ant-modal:visible, "
                "[role=dialog]:visible"
            ).last
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
            pick["radio_state"] = modal.evaluate(
                """(wrap, idx) => {
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
        pick["ok_btn"] = modal.evaluate(
            """wrap => {
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
        native_confirm = {
            "seen": False,
            "accepted": False,
            "message": "",
            "error": "",
        }

        def _accept_flight_dialog(dialog) -> None:
            """Accept window.confirm do nút Ok của modal chuyến bay phát sinh."""
            native_confirm["seen"] = True
            try:
                native_confirm["message"] = str(dialog.message or "")
                dialog.accept()
                native_confirm["accepted"] = True
            except Exception as exc:
                native_confirm["error"] = str(exc)[:240]

        try:
            # Playwright sẽ tự dismiss native window.confirm nếu không có
            # handler. Phải đăng ký trước khi bấm Ok, nếu không modal danh
            # sách đóng nhưng TCS không ghi chuyến bay vào form.
            self.page.once("dialog", _accept_flight_dialog)
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

        # Popup «Thông báo»: Bạn có đồng ý chọn chuyến bay này? → Đồng ý.
        # Popup được render bất đồng bộ, vì vậy phải đợi nó xuất hiện thay vì
        # kiểm tra một lần ngay sau khi bấm Ok.
        agree_clicked = bool(native_confirm["accepted"])
        agree_modal_closed = bool(native_confirm["accepted"])
        pick["native_confirm"] = native_confirm
        if not agree_clicked:
            try:
                confirm_modal = self.page.locator(
                    ".ant-modal-confirm:visible, "
                    ".ant-modal-wrap:not(.ant-modal-wrap-hidden) .ant-modal:visible"
                ).filter(
                    has_text=re.compile(
                        r"(Bạn\s+có\s+đồng\s+ý.*chuyến\s+bay|"
                        r"đồng\s+ý\s+chọn\s+chuyến\s+bay|Thông\s+báo)",
                        re.I,
                    )
                )
                confirm_modal.last.wait_for(state="visible", timeout=4200)
                dialog = confirm_modal.last
                agree = dialog.get_by_role(
                    "button", name=re.compile(r"^Đồng\s*ý$", re.I)
                )
                if agree.count() == 0:
                    agree = dialog.locator(
                        ".ant-modal-confirm-btns button.ant-btn-primary, "
                        ".ant-modal-footer button.ant-btn-primary"
                    )
                if agree.count() == 0:
                    agree = dialog.locator("button").filter(
                        has_text=re.compile(r"Đồng\s*ý", re.I)
                    )
                if agree.count() == 0:
                    warnings.append(
                        "Không thấy đúng nút Đồng ý trong hộp xác nhận chuyến bay"
                    )
                else:
                    agree.last.click(timeout=2500, force=True)
                    agree_clicked = True
                    try:
                        dialog.wait_for(state="hidden", timeout=3600)
                        agree_modal_closed = True
                    except Exception:
                        warnings.append(
                            "Đã bấm Đồng ý nhưng hộp xác nhận chuyến bay chưa đóng"
                        )
            except Exception as e:
                warnings.append(f"Không xử lý được popup Đồng ý chuyến bay: {e}")

        pick["agree_clicked"] = agree_clicked
        pick["agree_modal_closed"] = agree_modal_closed
        if not agree_clicked:
            warnings.append("TCS chưa xác nhận Đồng ý chọn chuyến bay")

        try:
            if agree_modal_closed:
                modal.wait_for(state="hidden", timeout=2800)
                modal_closed = True
        except Exception:
            # Không dùng Escape ở đây: nó có thể hủy chính popup Đồng ý và làm
            # quy trình trông như thành công dù TCS chưa ghi nhận chuyến bay.
            modal_closed = False

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
            "ok": bool(
                flight_ok
                and date_ok
                and confirmed
                and agree_clicked
                and agree_modal_closed
            ),
            "flight_ok": flight_ok,
            "date_ok": date_ok,
            "confirmed": confirmed,
            "agree_clicked": agree_clicked,
            "agree_modal_closed": agree_modal_closed,
            "modal_closed": modal_closed,
            "warnings": warnings,
            "values": vals,
            "pick": pick,
        }

    def fill_declare(self, data: dict[str, Any], *, submit: bool = False) -> dict[str, Any]:
        """
        Điền form từ payload Ops. Mặc định submit=False: không tick đồng ý, không HOÀN TẤT.

        Thứ tự tối ưu:
        1) CHỌN CHUYẾN BAY trước — TCS có thể dựng/reset phần còn lại của form
        2) Party master (Shipper/Agent/CNEE) — giữ dữ liệu TCS tự điền
        3) Chuyển khoản + Kho hàng TECS
        4) AWB/destination/pcs/goods và các text không thuộc master
        5) Người khai
        """
        t_all = time.perf_counter()
        timings: dict[str, Any] = {}

        self.goto_declare_tab()
        if not self._on_declare_form():
            raise SiteChangedError("Chưa vào form KHAI BÁO ESID — dừng để tránh gõ vào ô tìm danh sách")

        fills: dict[str, Any] = {}
        warnings: list[str] = []
        diagnostics: dict[str, Any] = {}

        awb = "".join(c for c in str(data.get("awb") or "") if c.isdigit())[:11]
        if len(awb) != 11:
            raise SiteChangedError("AWB phải đủ 11 số")

        # 1) Chuyến bay luôn trước mọi dữ liệu khác.
        flight = str(data.get("flight_no") or data.get("flight") or "").strip()
        fdate_ymd = str(data.get("flight_date") or "").strip()
        choose_flight = bool(data.get("choose_flight", True))
        t0 = time.perf_counter()
        if choose_flight and (flight or fdate_ymd):
            cf = self.choose_flight(flight, fdate_ymd)
            diagnostics["flight"] = cf
            fills["choose_flight"] = cf.get("ok", False)
            fills["choose_flight_skipped"] = bool(cf.get("skipped"))
            fills["flightNo"] = cf.get("flight_ok", False)
            fills["datFltOri"] = cf.get("date_ok", False)
            for w in cf.get("warnings") or []:
                warnings.append(w)
        else:
            fills["flightNo"] = self._set_id("flightNo", flight)
            fdate = self._ymd_to_dmy(fdate_ymd)
            if fdate:
                fills["datFltOri"] = self._set_id("datFltOri", fdate)
                if not fills["datFltOri"]:
                    warnings.append("Không điền được ngày bay")
        timings["flight_ms"] = int((time.perf_counter() - t0) * 1000)
        if (
            choose_flight
            and (flight or fdate_ymd)
            and not fills.get("choose_flight")
        ):
            timings["total_ms"] = int((time.perf_counter() - t_all) * 1000)
            return {
                "ok": False,
                "awb": awb,
                "submitted": False,
                "fills": fills,
                "values": (diagnostics.get("flight") or {}).get("values") or {},
                "warnings": warnings,
                "timings": timings,
                "diagnostics": diagnostics,
                "message": (
                    "TCS chưa xác nhận và lưu chuyến bay — dừng trước khi điền "
                    "các trường còn lại"
                ),
            }

        # 2) Chỉ chọn master party. TCS tự điền địa chỉ/liên hệ chuẩn từ danh mục.
        t0 = time.perf_counter()
        party_master = [
            ("shipper_name", "shipperId"),
            ("agent_name", "agentId"),
            ("consignee_name", "consigneeId"),
        ]
        party_timings: dict[str, int] = {}
        for key, eid in party_master:
            val = str(data.get(key) or "").strip()
            if not val:
                continue
            party_started = time.perf_counter()
            ok = self._fill_combobox(
                eid,
                val,
                max_queries=2,
                budget_ms=3500,
            )
            fills[eid] = ok
            party_timings[eid] = int((time.perf_counter() - party_started) * 1000)
            if not ok:
                warnings.append(
                    f"Không chọn được master #{eid} trong 3.5s — để trống, không ghi đè text"
                )
            else:
                self.page.wait_for_timeout(120)
        timings["party_ms"] = int((time.perf_counter() - t0) * 1000)
        timings["party_fields_ms"] = party_timings

        # 3) Mặc định nghiệp vụ: chuyển khoản và Kho hàng TECS.
        t0 = time.perf_counter()
        # Master combobox có thể để lại dropdown/lớp phủ trong lúc React cập nhật;
        # đóng trước khi mở payment để click không bị chặn.
        try:
            self.page.keyboard.press("Escape")
            self.page.wait_for_timeout(60)
        except Exception:
            pass
        self._fill_ops_selects(
            data,
            fills,
            warnings,
            include_destination=False,
            include_payment=True,
        )
        if data.get("tecs_warehouse", True):
            fills["shcCod002"] = self._set_checkbox("shcCod002", True)
            if not fills["shcCod002"]:
                warnings.append("Chưa chọn được Kho hàng TECS (#shcCod002)")
        if data.get("consol"):
            fills["shcConsol"] = self._set_checkbox("shcConsol", True)
        timings["defaults_ms"] = int((time.perf_counter() - t0) * 1000)

        # 4) Text nhanh + destination. Không ghi đè dữ liệu party nếu master đã chọn.
        t0 = time.perf_counter()
        self._fill_ops_text(data, awb, fills, warnings)
        self._fill_ops_selects(
            data,
            fills,
            warnings,
            include_destination=True,
            include_payment=False,
        )
        passthrough_text = [
            ("notify_remark", "desRmk001"),
            ("other_request", "shcOthReq"),
        ]
        for key, eid in passthrough_text:
            val = str(data.get(key) or "").strip()
            if val:
                fills[eid] = self._set_id(eid, val)
        timings["ops_text_ms"] = int((time.perf_counter() - t0) * 1000)

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
                'totalOfHawbs','natureOfGoods','codPayMod','shipperId','agentId','consigneeId',
                'addressShp','addressAgt','addressCne','shcCod002',
                'shpRegNam','shpRegTel','shpRegIdx','agreeConfirm'];
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
            if not fills.get("flightNo") or not fills.get("datFltOri"):
                ok_core = False
                warnings.append(
                    "Chuyến bay và ngày bay bắt buộc qua CHỌN CHUYẾN BAY — chưa chọn đúng"
                )
        return {
            "ok": ok_core,
            "awb": awb,
            "submitted": submitted,
            "fills": fills,
            "values": values,
            "warnings": warnings,
            "timings": timings,
            "diagnostics": diagnostics,
            "message": (
                "Đã điền form KHAI BÁO ESID (chưa HOÀN TẤT)"
                if not submitted
                else "Đã gửi HOÀN TẤT"
            ),
        }

    def read_form_awb(self) -> str:
        """Đọc AWB (11 số) từ form KHAI BÁO đang mở."""
        try:
            raw = self.page.evaluate(
                """() => {
                  const pick = (id) => {
                    const nodes = [...document.querySelectorAll('#' + id)];
                    for (const n of nodes) {
                      if (n.closest('.ant-modal')) continue;
                      return String(n.value || '').trim();
                    }
                    return '';
                  };
                  return (pick('codAwbPfx') + pick('codAwbNum')).replace(/\\D/g, '');
                }"""
            )
            return digits_only(str(raw or ""))
        except Exception:
            return ""

    def capture_preview(self, docs_dir: Path, awb: str) -> dict[str, Any]:
        """Screenshot viewport form → lưu dưới output/docs, trả preview_file/url."""
        docs_dir = Path(docs_dir)
        docs_dir.mkdir(parents=True, exist_ok=True)
        awb_d = digits_only(awb) or "unknown"
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        name = f"{awb_d}_ESID_DECLARE_PREVIEW_{stamp}.png"
        path = docs_dir / name
        try:
            # Cuộn lên đầu form khai báo để ảnh thấy AWB/chuyến bay
            try:
                self.page.evaluate(
                    """() => {
                      const el = document.querySelector('#codAwbPfx')
                        || document.querySelector('#codAwbNum');
                      if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
                      else window.scrollTo(0, 0);
                    }"""
                )
                self.page.wait_for_timeout(120)
            except Exception:
                pass
            self.page.screenshot(path=str(path), full_page=False)
            if not path.is_file() or path.stat().st_size < 100:
                return {"preview_file": None, "preview_url": None, "preview_error": "Screenshot rỗng"}
            return {
                "preview_file": name,
                "preview_url": f"/docs?file={name}",
            }
        except Exception as e:
            return {
                "preview_file": None,
                "preview_url": None,
                "preview_error": str(e)[:200],
            }

    def submit_open_declare(self, expected_awb: str) -> dict[str, Any]:
        """
        Tick đồng ý + HOÀN TẤT trên form đang mở (không điền lại).
        Bắt buộc AWB trên form khớp expected_awb.
        """
        warnings: list[str] = []
        awb_exp = digits_only(expected_awb)
        if len(awb_exp) != 11:
            return {
                "ok": False,
                "error": "VALIDATION",
                "message": "AWB phải đủ 11 số",
                "awb": awb_exp,
                "submitted": False,
                "warnings": warnings,
            }

        form_awb = self.read_form_awb()
        if len(form_awb) != 11:
            return {
                "ok": False,
                "error": "NO_FORM",
                "message": "Không thấy form KHAI BÁO đang mở — hãy Điền lại trước khi HOÀN TẤT",
                "awb": awb_exp,
                "form_awb": form_awb,
                "submitted": False,
                "warnings": warnings,
            }
        if form_awb != awb_exp:
            return {
                "ok": False,
                "error": "AWB_MISMATCH",
                "message": f"Form đang mở AWB {form_awb}, không khớp {awb_exp} — hủy HOÀN TẤT",
                "awb": awb_exp,
                "form_awb": form_awb,
                "submitted": False,
                "warnings": warnings,
            }

        if not self._on_declare_form():
            return {
                "ok": False,
                "error": "NO_FORM",
                "message": "Không còn ở form KHAI BÁO — hãy Điền lại trước khi HOÀN TẤT",
                "awb": awb_exp,
                "form_awb": form_awb,
                "submitted": False,
                "warnings": warnings,
            }

        ok_agree = self._set_checkbox("agreeConfirm", True)
        if not ok_agree:
            warnings.append("Không tick được #agreeConfirm")

        submitted = False
        try:
            btn = self.page.get_by_role("button", name=re.compile(r"HOÀN\s*TẤT", re.I))
            btn.first.click(timeout=5000)
            submitted = True
            self.page.wait_for_timeout(600)
        except Exception as e:
            warnings.append(f"Không bấm HOÀN TẤT: {e}")
            submitted = False

        try:
            blob = self.page.evaluate(
                "() => (document.body && document.body.innerText || '').slice(0, 4000)"
            )
            if re.search(r"đã đăng ký|da dang ky", str(blob or ""), re.I):
                warnings.append("TCS cảnh báo AWB đã đăng ký — kiểm tra danh sách ESID")
        except Exception:
            pass

        return {
            "ok": submitted,
            "awb": awb_exp,
            "form_awb": form_awb,
            "submitted": submitted,
            "agree_ticked": ok_agree,
            "warnings": warnings,
            "message": "Đã gửi HOÀN TẤT trên TCS" if submitted else "HOÀN TẤT thất bại",
            "error": None if submitted else "SUBMIT_FAILED",
        }
