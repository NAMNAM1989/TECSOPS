from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def load_dotenv_file(path: Path | None = None) -> None:
    """Nạp .env cục bộ vào os.environ (không ghi đè biến đã có). File .env đã gitignore."""
    env_path = path or (ROOT / ".env")
    if not env_path.is_file():
        return
    try:
        text = env_path.read_text(encoding="utf-8")
    except OSError:
        return
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        if not key or key in os.environ:
            continue
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in {'"', "'"}:
            val = val[1:-1]
        os.environ[key] = val


@dataclass(frozen=True)
class Settings:
    base_url: str = "https://www.tcs.com.vn/AwbLogin"
    agent_host: str = "127.0.0.1"
    agent_port: int = 8765
    mock: bool = False
    dry_run: bool = False
    output_dir: Path = ROOT / "output"
    browser_profile: Path = ROOT / "browser_profile"
    screenshots_dir: Path = ROOT / "screenshots"
    logs_dir: Path = ROOT / "logs"
    db_path: Path = ROOT / "data" / "tcs_awb.db"
    templates_dir: Path = ROOT / "templates"
    discovery_dir: Path = ROOT / "discovery_artifacts"
    min_delay_ms: int = 200
    max_delay_ms: int = 500
    warehouse_scope: str = "TECS-TCS"
    max_retries: int = 2
    tcs_username: str = ""
    tcs_password: str = ""
    # Cách 1: ưu tiên cookie/profile đã login
    prefer_session: bool = True
    # Cách 2: OCR CAPTCHA local (ddddocr)
    captcha_ocr: bool = True
    captcha_ocr_attempts: int = 3
    captcha_manual_timeout_s: int = 180
    # Server/Railway: Chrome headless (không có màn hình) + tự mở session lúc boot
    headless: bool = False
    auto_open: bool = False

    @property
    def has_login_credentials(self) -> bool:
        return bool(self.tcs_username.strip() and self.tcs_password)


def load_settings() -> Settings:
    load_dotenv_file()
    return Settings(
        base_url=os.getenv("TCS_BASE_URL", "https://www.tcs.com.vn/AwbLogin"),
        agent_host=os.getenv("TCS_AGENT_HOST", "127.0.0.1"),
        agent_port=int(os.getenv("TCS_AGENT_PORT", "8765")),
        mock=_env_bool("TCS_MOCK", False),
        dry_run=_env_bool("TCS_DRY_RUN", False),
        output_dir=Path(os.getenv("TCS_OUTPUT_DIR", str(ROOT / "output"))),
        browser_profile=Path(os.getenv("TCS_BROWSER_PROFILE", str(ROOT / "browser_profile"))),
        screenshots_dir=ROOT / "screenshots",
        logs_dir=ROOT / "logs",
        db_path=ROOT / "data" / "tcs_awb.db",
        templates_dir=ROOT / "templates",
        discovery_dir=ROOT / "discovery_artifacts",
        min_delay_ms=int(os.getenv("TCS_MIN_DELAY_MS", "200")),
        max_delay_ms=int(os.getenv("TCS_MAX_DELAY_MS", "500")),
        warehouse_scope=os.getenv("TCS_WAREHOUSE_SCOPE", "TECS-TCS"),
        max_retries=int(os.getenv("TCS_MAX_RETRIES", "2")),
        tcs_username=os.getenv("TCS_USERNAME", "").strip(),
        tcs_password=os.getenv("TCS_PASSWORD", ""),
        prefer_session=_env_bool("TCS_PREFER_SESSION", True),
        captcha_ocr=_env_bool("TCS_CAPTCHA_OCR", True),
        captcha_ocr_attempts=int(os.getenv("TCS_CAPTCHA_OCR_ATTEMPTS", "3")),
        captcha_manual_timeout_s=int(os.getenv("TCS_CAPTCHA_MANUAL_TIMEOUT_S", "180")),
        headless=_env_bool("TCS_HEADLESS", False),
        auto_open=_env_bool("TCS_AUTO_OPEN", False),
    )


def ensure_runtime_dirs(settings: Settings) -> None:
    for path in (
        settings.output_dir,
        settings.browser_profile,
        settings.screenshots_dir,
        settings.logs_dir,
        settings.db_path.parent,
        settings.templates_dir,
        settings.discovery_dir,
    ):
        path.mkdir(parents=True, exist_ok=True)