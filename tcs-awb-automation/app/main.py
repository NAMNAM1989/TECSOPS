from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Cho phép chạy: python -m app.main từ thư mục tcs-awb-automation
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.config import ensure_runtime_dirs, load_settings
from app.data.repository import Repository
from app.services.batch_service import BatchService
from app.services.excel_service import create_import_template, excel_to_validated_rows
from app.utils.logging_setup import setup_logging


def cmd_template(args: argparse.Namespace) -> int:
    settings = load_settings()
    ensure_runtime_dirs(settings)
    path = Path(args.out) if args.out else settings.templates_dir / "AWB_IMPORT_TEMPLATE.xlsx"
    create_import_template(path)
    print(f"Created {path}")
    return 0


def cmd_validate(args: argparse.Namespace) -> int:
    rows = excel_to_validated_rows(Path(args.excel))
    bad = [r for r in rows if r.validation_error]
    print(json.dumps({"total": len(rows), "errors": len(bad), "rows": [r.to_dict() for r in rows]}, ensure_ascii=False, indent=2))
    return 1 if bad else 0


def cmd_run(args: argparse.Namespace) -> int:
    settings = load_settings()
    ensure_runtime_dirs(settings)
    log = setup_logging(settings.logs_dir)
    repo = Repository(settings.db_path)
    batch = BatchService(settings, repo)
    rows = excel_to_validated_rows(Path(args.excel))
    job = batch.create_job_from_rows(
        rows,
        source="excel",
        dry_run=not args.print_real,
        mock=args.mock or settings.mock,
        confirm_register=args.confirm_register,
    )
    log.info("Start job %s mock=%s dry_run=%s", job.job_id, job.mock, job.dry_run)
    results, report = batch.run(job)
    _print_json({"job_id": job.job_id, "report": str(report), "results": [r.to_dict() for r in results]})
    return 0


def cmd_run_job_json(args: argparse.Namespace) -> int:
    from app.services.awb_service import validate_ops_payload

    settings = load_settings()
    ensure_runtime_dirs(settings)
    payload = json.loads(Path(args.job).read_text(encoding="utf-8"))
    rows = validate_ops_payload(payload)
    repo = Repository(settings.db_path)
    batch = BatchService(settings, repo)
    job = batch.create_job_from_rows(
        rows,
        source=str(payload.get("source") or "ops"),
        dry_run=bool(payload.get("dry_run", True)),
        mock=bool(payload.get("mock", True)),
        confirm_register=bool(payload.get("confirm_register", False)),
    )
    results, report = batch.run(job)
    _print_json({"job_id": job.job_id, "report": str(report), "results": [r.to_dict() for r in results]})
    return 0


def cmd_agent(args: argparse.Namespace) -> int:
    import os

    from app.services.agent_api import serve_agent

    if getattr(args, "real", False):
        os.environ["TCS_MOCK"] = "0"
    elif args.mock:
        os.environ["TCS_MOCK"] = "1"
    if args.dry_run:
        os.environ["TCS_DRY_RUN"] = "1"
    settings = load_settings()
    serve_agent(settings)
    return 0


def cmd_discovery(args: argparse.Namespace) -> int:
    from app.browser.discovery import run_discovery

    settings = load_settings()
    ensure_runtime_dirs(settings)
    run_discovery(
        settings,
        interactive=not args.non_interactive,
        login_only=bool(getattr(args, "login_only", False)),
    )
    return 0


def cmd_session_open(args: argparse.Namespace) -> int:
    from app.browser.session_manager import SessionManager

    settings = load_settings()
    ensure_runtime_dirs(settings)
    sm = SessionManager(settings)
    st = sm.open(headless=False)
    _print_json(st.to_dict())
    if settings.has_login_credentials and settings.captcha_ocr:
        print("\nChrome đã mở. Ưu tiên session; nếu cần login sẽ OCR CAPTCHA (ddddocr). Giữ cửa sổ mở.")
    elif settings.has_login_credentials:
        print("\nChrome đã mở + đã điền user/pass. Nhập CAPTCHA rồi Đăng nhập; giữ cửa sổ mở.")
    else:
        print("\nChrome đã mở. Thêm TCS_USERNAME/TCS_PASSWORD vào .env để tự điền, hoặc đăng nhập tay.")
    print("Nhấn Ctrl+C để đóng session này (hoặc dùng agent /session/open thay thế).")
    try:
        while True:
            import time

            time.sleep(3600)
    except KeyboardInterrupt:
        sm.close()
        print("Session closed.")
    return 0


def cmd_ui(args: argparse.Namespace) -> int:
    from app.ui.main_window import run_ui

    return run_ui(load_settings())


def _print_json(payload: object) -> None:
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    try:
        sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    except Exception:
        pass
    try:
        print(text)
    except UnicodeEncodeError:
        print(json.dumps(payload, ensure_ascii=True, indent=2))


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="TCS AWB Automation sidecar (TECS-TCS only)")
    sub = p.add_subparsers(dest="cmd", required=True)

    t = sub.add_parser("template", help="Tạo AWB_IMPORT_TEMPLATE.xlsx")
    t.add_argument("--out", default="")
    t.set_defaults(func=cmd_template)

    v = sub.add_parser("validate", help="Validate Excel import")
    v.add_argument("excel")
    v.set_defaults(func=cmd_validate)

    r = sub.add_parser("run", help="Chạy batch từ Excel")
    r.add_argument("excel")
    r.add_argument("--mock", action="store_true")
    r.add_argument("--print-real", action="store_true", help="Gửi máy in thật (mặc định dry-run)")
    r.add_argument("--confirm-register", action="store_true")
    r.set_defaults(func=cmd_run)

    j = sub.add_parser("run-job", help="Chạy job JSON từ Ops")
    j.add_argument("job")
    j.set_defaults(func=cmd_run_job_json)

    a = sub.add_parser("agent", help="HTTP agent cho Ops (localhost)")
    a.add_argument("--mock", action="store_true")
    a.add_argument("--real", action="store_true", help="Tắt mock — cần session Chrome đã login")
    a.add_argument("--dry-run", action="store_true")
    a.set_defaults(func=cmd_agent)

    d = sub.add_parser("discovery", help="Khảo sát cổng TCS (bắt buộc trước LOOKUP thật)")
    d.add_argument("--non-interactive", action="store_true")
    d.add_argument("--login-only", action="store_true", help="Chỉ chụp trang login")
    d.set_defaults(func=cmd_discovery)

    s = sub.add_parser("session-open", help="Mở Chrome persistent để đăng nhập tay")
    s.set_defaults(func=cmd_session_open)

    u = sub.add_parser("ui", help="Mở giao diện PySide6")
    u.set_defaults(func=cmd_ui)
    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())