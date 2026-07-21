from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


# Selector UI TCS (không secret) — đủ để Railway/container chạy PDF ESID
# khi discovery_artifacts/ chưa mount. Cập nhật khi TCS đổi DOM.
DEFAULT_LOCATORS: dict[str, Any] = {
    "version": 2,
    "base_url": "https://www.tcs.com.vn/AwbLogin",
    "login": {
        "confirmed": True,
        "username": {"by": "id", "value": "basic_username"},
        "password": {"by": "id", "value": "basic_password"},
        "captcha": {"by": "id", "value": "basic_captchaCode"},
        "submit": {"by": "role", "role": "button", "name": "Đăng nhập"},
        "login_url_substr": "awblogin",
    },
    "awb_lookup": {
        "confirmed": True,
        "home_url": "https://www.tcs.com.vn/Awb/Agent",
        "awb_mode": "split",
        "awb_first": {"by": "id", "value": "awbFirst"},
        "awb_last": {"by": "id", "value": "awbLast"},
        "awb_input": None,
        "submit": {"by": "role", "role": "button", "name": "KIỂM TRA"},
        "status_text": None,
        "download_button": None,
        "print_button": {"by": "role", "role": "button", "name": "IN"},
        "arrival_notice_tab": {"by": "text", "value": "PHIẾU THÔNG BÁO HÀNG ĐẾN"},
        "completed_keywords": [
            "đã hoàn tất thủ tục hải quan",
            "hoàn tất thủ tục hải quan",
            "đã hoàn tất",
            "finish",
        ],
        "reception_keywords": [
            "hoàn thành tiếp nhận",
            "đã tiếp nhận",
            "ngày tiếp nhận",
            "thông tin tiếp nhận",
        ],
        "not_completed_keywords": [
            "chưa được hoàn tất thủ tục hải quan",
            "chưa hoàn tất thủ tục",
            "chưa hoàn thành",
            "chua hoan thanh",
            "pending",
            "đang xử lý",
            "không tìm thấy",
            "not found",
        ],
        "result_ready_selector": "#awbFirst",
        "notes": "/Awb/Agent — awbFirst+awbLast+KIỂM TRA",
    },
    "esid_list": {
        "confirmed": True,
        "home_url": "https://www.tcs.com.vn/Esid/Export",
        "tab": {"by": "text", "value": "DANH SÁCH ESID"},
        "awb_first": {"by": "placeholder", "value": "Prefix"},
        "awb_last": {"by": "placeholder", "value": "AWB#"},
        "date_from": {"by": "id", "value": "search-form_dateSearch"},
        "date_to": {"by": "placeholder", "value": "Ngày kết thúc"},
        "date_format": "DD-MM-YYYY",
        "submit": {"by": "role", "role": "button", "name": "TÌM KIẾM"},
        "print_button": {"by": "role", "role": "button", "name": "IN"},
        "reception_status": "Hoàn thành tiếp nhận",
        "notes": "PDF ESID: danh sách → AWB# → IN → lưu file",
    },
    # Live probe 2026-07-20 — cùng URL /Esid/Export, tab KHAI BÁO ESID.
    # REGISTER vẫn khóa; dry-fill OK. Chi tiết: discovery_artifacts/esid_declare_locators.json
    "esid_declare": {
        "confirmed": True,
        "home_url": "https://www.tcs.com.vn/Esid/Export",
        "tab": {"by": "text", "value": "KHAI BÁO ESID"},
        "awb_prefix": {"by": "id", "value": "codAwbPfx"},
        "awb_number": {"by": "id", "value": "codAwbNum"},
        "flight_no": {"by": "id", "value": "flightNo"},
        "flight_date": {"by": "id", "value": "datFltOri"},
        "dest_code": {"by": "id", "value": "codFds"},
        "pcs": {"by": "id", "value": "qtyPcs"},
        "shipper_name": {"by": "id", "value": "shipperId"},
        "shipper_address": {"by": "id", "value": "addressShp"},
        "consignee_name": {"by": "id", "value": "consigneeId"},
        "consignee_address": {"by": "id", "value": "addressCne"},
        "nature_of_goods": {"by": "id", "value": "natureOfGoods"},
        "agree": {"by": "id", "value": "agreeConfirm"},
        "registrant_name": {"by": "id", "value": "shpRegNam"},
        "registrant_tel": {"by": "id", "value": "shpRegTel"},
        "registrant_id": {"by": "id", "value": "shpRegIdx"},
        "choose_flight": {"by": "role", "role": "button", "name": "CHỌN CHUYẾN BAY"},
        "submit": {"by": "role", "role": "button", "name": "HOÀN TẤT"},
        "notes": "Dry-fill only; không submit. Combobox shipper/agent/cnee cần chọn master TCS.",
    },
}


@dataclass
class LocatorRef:
    by: str
    value: str = ""
    role: str = ""
    name: str = ""

    @classmethod
    def from_dict(cls, raw: Any) -> LocatorRef | None:
        if not raw or not isinstance(raw, dict):
            return None
        return cls(
            by=str(raw.get("by") or ""),
            value=str(raw.get("value") or ""),
            role=str(raw.get("role") or ""),
            name=str(raw.get("name") or ""),
        )


@dataclass
class LocatorsConfig:
    path: Path
    data: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def load(cls, path: Path) -> LocatorsConfig:
        if path.exists():
            data = json.loads(path.read_text(encoding="utf-8"))
        else:
            data = json.loads(json.dumps(DEFAULT_LOCATORS))
        return cls(path=path, data=data)

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8")

    @property
    def login_confirmed(self) -> bool:
        return bool((self.data.get("login") or {}).get("confirmed"))

    @property
    def awb_lookup_confirmed(self) -> bool:
        return bool((self.data.get("awb_lookup") or {}).get("confirmed"))

    def login_ref(self, key: str) -> LocatorRef | None:
        return LocatorRef.from_dict((self.data.get("login") or {}).get(key))

    def awb_ref(self, key: str) -> LocatorRef | None:
        return LocatorRef.from_dict((self.data.get("awb_lookup") or {}).get(key))

    def completed_keywords(self) -> list[str]:
        return list((self.data.get("awb_lookup") or {}).get("completed_keywords") or [])

    def not_completed_keywords(self) -> list[str]:
        return list((self.data.get("awb_lookup") or {}).get("not_completed_keywords") or [])

    @property
    def esid_list_confirmed(self) -> bool:
        return bool((self.data.get("esid_list") or {}).get("confirmed"))

    def esid_ref(self, key: str) -> LocatorRef | None:
        return LocatorRef.from_dict((self.data.get("esid_list") or {}).get(key))


def locators_path(settings_discovery_dir: Path) -> Path:
    return settings_discovery_dir / "locators.json"


def ensure_default_locators(path: Path) -> LocatorsConfig:
    cfg = LocatorsConfig.load(path)
    if not path.exists():
        cfg.data = json.loads(json.dumps(DEFAULT_LOCATORS))
        cfg.save()
    return cfg


def suggest_awb_locators_from_elements(inputs: list[dict[str, Any]]) -> dict[str, Any]:
    """Gợi ý locator từ DOM discovery — không tự confirmed trừ khi đủ tín hiệu rõ."""
    awb_input = None
    awb_first = None
    awb_last = None
    submit = None
    download_btn = None
    print_btn = None
    status_hint = None

    for el in inputs:
        text = " ".join(
            str(x or "")
            for x in (el.get("text"), el.get("placeholder"), el.get("aria"), el.get("name"), el.get("id"))
        ).lower()
        tag = (el.get("tag") or "").upper()
        eid = (el.get("id") or "").strip()
        eid_l = eid.lower()
        if tag == "INPUT":
            if eid_l in {"awbfirst", "awb_first", "prefix"} or "awbfirst" in eid_l:
                awb_first = {"by": "id", "value": eid}
            elif eid_l in {"awblast", "awb_last", "serial"} or "awblast" in eid_l:
                awb_last = {"by": "id", "value": eid}
            elif any(k in text for k in ("awb", "mawb", "vận đơn", "van don", "air waybill")):
                if eid:
                    awb_input = {"by": "id", "value": eid}
                elif el.get("name"):
                    awb_input = {"by": "css", "value": f'input[name="{el["name"]}"]'}
                elif el.get("placeholder"):
                    awb_input = {"by": "placeholder", "value": el["placeholder"]}
        if tag == "BUTTON" and any(
            k in text for k in ("tra cứu", "tra cuu", "search", "tìm", "tim", "lookup", "kiểm tra", "kiem tra")
        ):
            submit = {"by": "role", "role": "button", "name": (el.get("text") or "KIỂM TRA")[:40]}
        if tag == "BUTTON" and any(k in text for k in ("tải", "tai", "download", "pdf", "xuất", "xuat")):
            download_btn = {"by": "role", "role": "button", "name": (el.get("text") or "Tải")[:40]}
        if tag == "BUTTON" and any(k in text for k in ("in ", "print", "in ấn", "in an", "in awb", "phiếu")):
            print_btn = {"by": "role", "role": "button", "name": (el.get("text") or "In")[:40]}
        if any(k in text for k in ("hoàn thành", "hoan thanh", "trạng thái", "trang thai", "status")):
            if eid:
                status_hint = {"by": "id", "value": eid}
            elif el.get("text"):
                status_hint = {"by": "text", "value": el["text"][:60]}

    split = bool(awb_first and awb_last and submit)
    confirmed = split or bool(awb_input and submit)
    return {
        "confirmed": confirmed,
        "awb_mode": "split" if split else "single",
        "awb_first": awb_first,
        "awb_last": awb_last,
        "awb_input": awb_input,
        "submit": submit,
        "status_text": status_hint,
        "download_button": download_btn,
        "print_button": print_btn,
        "completed_keywords": ["đã hoàn tất thủ tục hải quan", "hoàn tất thủ tục hải quan"],
        "reception_keywords": ["hoàn thành tiếp nhận", "ngày tiếp nhận", "đã tiếp nhận"],
        "not_completed_keywords": ["chưa hoàn thành", "chua hoan thanh", "pending", "đang xử lý"],
        "result_ready_selector": None,
        "home_url": "https://www.tcs.com.vn/Awb/Agent",
        "notes": "Gợi ý từ discovery; kiểm tra tay trước khi dùng production.",
    }
