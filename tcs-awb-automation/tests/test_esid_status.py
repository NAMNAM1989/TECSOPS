from app.browser.pages.esid_page import RECEPTION_STATUS
from app.data.models import NormalizedStatus
from app.services.awb_service import map_tcs_status_to_normalized


def test_reception_status_string():
    assert "tiếp nhận" in RECEPTION_STATUS.lower()


def test_map_esid_status_line():
    raw = "ESID AWB=18010359322 status=Hoàn thành tiếp nhận flight=KE0476"
    assert map_tcs_status_to_normalized(raw) == NormalizedStatus.RECEPTION_COMPLETED
