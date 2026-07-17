from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any


class Action(str, Enum):
    LOOKUP = "LOOKUP"
    REGISTER = "REGISTER"
    DOWNLOAD = "DOWNLOAD"
    PRINT = "PRINT"


class NormalizedStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    # TCS đã có ngày tiếp nhận (THÔNG TIN TIẾP NHẬN) — đủ điều kiện tải phiếu
    RECEPTION_COMPLETED = "RECEPTION_COMPLETED"
    NOT_COMPLETED = "NOT_COMPLETED"
    DOWNLOADED = "DOWNLOADED"
    PRINTED = "PRINTED"
    SKIPPED_DUPLICATE = "SKIPPED_DUPLICATE"
    NEEDS_LOGIN = "NEEDS_LOGIN"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    SITE_CHANGED = "SITE_CHANGED"
    FAILED = "FAILED"


@dataclass
class AwbJobRow:
    stt: int
    awb_raw: str
    awb_digits: str
    awb_display: str
    action: Action
    flight_date: str = ""
    flight_no: str = ""
    pcs: int | None = None
    gross_weight: float | None = None
    document_type: str = "AWB"
    print_copies: int = 1
    note: str = ""
    shipment_id: str = ""
    warehouse: str = "TECS-TCS"
    ops_status: str = ""
    validation_error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["action"] = self.action.value
        return d


@dataclass
class AwbJobResult:
    stt: int
    awb: str
    action: str
    tcs_status_raw: str = ""
    normalized_status: str = NormalizedStatus.PENDING.value
    document_type: str = "AWB"
    downloaded_file: str = ""
    print_status: str = ""
    start_time: str = ""
    end_time: str = ""
    duration_seconds: float = 0.0
    retry_count: int = 0
    error_code: str = ""
    error_message: str = ""
    shipment_id: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class BatchJob:
    job_id: str
    source: str  # excel | ops
    warehouse: str = "TECS-TCS"
    dry_run: bool = False
    mock: bool = False
    rows: list[AwbJobRow] = field(default_factory=list)
    confirm_register: bool = False
    # Ngày phiên Ops YYYY-MM-DD — lọc ESID theo ngày khi DOWNLOAD/PRINT
    session_date: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "source": self.source,
            "warehouse": self.warehouse,
            "dry_run": self.dry_run,
            "mock": self.mock,
            "confirm_register": self.confirm_register,
            "session_date": self.session_date,
            "rows": [r.to_dict() for r in self.rows],
        }