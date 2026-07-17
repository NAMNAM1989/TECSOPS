from __future__ import annotations

import logging
import re
from logging.handlers import RotatingFileHandler
from pathlib import Path


_SENSITIVE = re.compile(r"(password|passwd|pwd|token|cookie|authorization)\s*[:=]\s*\S+", re.I)


class RedactFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            msg = record.getMessage()
            record.msg = _SENSITIVE.sub(r"\1=[REDACTED]", msg)
            record.args = ()
        except Exception:
            pass
        return True


def setup_logging(logs_dir: Path, name: str = "tcs_awb") -> logging.Logger:
    logs_dir.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    logger.setLevel(logging.INFO)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    fh = RotatingFileHandler(logs_dir / "tcs_awb.log", maxBytes=2_000_000, backupCount=5, encoding="utf-8")
    fh.setFormatter(fmt)
    fh.addFilter(RedactFilter())
    sh = logging.StreamHandler()
    sh.setFormatter(fmt)
    sh.addFilter(RedactFilter())
    logger.addHandler(fh)
    logger.addHandler(sh)
    return logger