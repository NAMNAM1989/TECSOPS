from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


DEFAULT_LOCATORS: dict[str, Any] = {
    "version": 1,
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
        "confirmed": False,
        "awb_input": None,
        "submit": None,
        "status_text": None,
        "download_button": None,
        "print_button": None,
        "completed_keywords": ["đã hoàn tất thủ tục hải quan", "hoàn tất thủ tục hải quan"],
        "reception_keywords": ["hoàn thành tiếp nhận", "ngày tiếp nhận", "đã tiếp nhận"],
        "not_completed_keywords": ["chưa hoàn thành", "chua hoan thanh", "pending", "đang xử lý"],
        "result_ready_selector": None,
        "notes": "Điền sau discovery bước lookup_sample / download_or_print. Đặt confirmed=true khi đã xác nhận.",
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
