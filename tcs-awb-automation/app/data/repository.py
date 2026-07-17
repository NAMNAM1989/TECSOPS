from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Repository:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    @contextmanager
    def connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self.connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS batch_jobs (
                  job_id TEXT PRIMARY KEY,
                  source TEXT NOT NULL,
                  warehouse TEXT NOT NULL,
                  payload_json TEXT NOT NULL,
                  status TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS job_results (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  job_id TEXT NOT NULL,
                  awb_digits TEXT NOT NULL,
                  action TEXT NOT NULL,
                  normalized_status TEXT NOT NULL,
                  result_json TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS audit_log (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  job_id TEXT,
                  awb_digits TEXT,
                  action TEXT,
                  result TEXT,
                  error TEXT,
                  file_path TEXT,
                  created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS print_dedupe (
                  key TEXT PRIMARY KEY,
                  file_hash TEXT,
                  created_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS checkpoints (
                  job_id TEXT PRIMARY KEY,
                  last_stt INTEGER NOT NULL,
                  state_json TEXT NOT NULL,
                  updated_at TEXT NOT NULL
                );
                """
            )

    def save_job(self, job_id: str, source: str, warehouse: str, payload: dict[str, Any], status: str) -> None:
        now = _utc_now()
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO batch_jobs (job_id, source, warehouse, payload_json, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                  payload_json=excluded.payload_json,
                  status=excluded.status,
                  updated_at=excluded.updated_at
                """,
                (job_id, source, warehouse, json.dumps(payload, ensure_ascii=False), status, now, now),
            )

    def update_job_status(self, job_id: str, status: str) -> None:
        with self.connect() as conn:
            conn.execute(
                "UPDATE batch_jobs SET status=?, updated_at=? WHERE job_id=?",
                (status, _utc_now(), job_id),
            )

    def save_result(self, job_id: str, awb_digits: str, action: str, status: str, result: dict[str, Any]) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO job_results (job_id, awb_digits, action, normalized_status, result_json, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (job_id, awb_digits, action, status, json.dumps(result, ensure_ascii=False), _utc_now()),
            )

    def audit(
        self,
        *,
        job_id: str | None,
        awb_digits: str | None,
        action: str,
        result: str,
        error: str = "",
        file_path: str = "",
    ) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO audit_log (job_id, awb_digits, action, result, error, file_path, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (job_id, awb_digits, action, result, error, file_path, _utc_now()),
            )

    def is_print_duplicate(self, key: str) -> bool:
        with self.connect() as conn:
            row = conn.execute("SELECT 1 FROM print_dedupe WHERE key=?", (key,)).fetchone()
            return row is not None

    def mark_printed(self, key: str, file_hash: str = "") -> None:
        with self.connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO print_dedupe (key, file_hash, created_at) VALUES (?, ?, ?)",
                (key, file_hash, _utc_now()),
            )

    def save_checkpoint(self, job_id: str, last_stt: int, state: dict[str, Any]) -> None:
        with self.connect() as conn:
            conn.execute(
                """
                INSERT INTO checkpoints (job_id, last_stt, state_json, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                  last_stt=excluded.last_stt,
                  state_json=excluded.state_json,
                  updated_at=excluded.updated_at
                """,
                (job_id, last_stt, json.dumps(state, ensure_ascii=False), _utc_now()),
            )

    def get_checkpoint(self, job_id: str) -> dict[str, Any] | None:
        with self.connect() as conn:
            row = conn.execute(
                "SELECT last_stt, state_json FROM checkpoints WHERE job_id=?", (job_id,)
            ).fetchone()
            if not row:
                return None
            return {"last_stt": row["last_stt"], "state": json.loads(row["state_json"])}