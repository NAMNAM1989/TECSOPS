"""Benchmark tải PDF ESID: cache hit vs cold/hot print (cần agent --real đã login)."""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

AGENT = "http://127.0.0.1:8765"


def _req(method: str, path: str, body: dict | None = None, timeout: float = 180.0):
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{AGENT}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))


def main() -> int:
    awb = "".join(c for c in (sys.argv[1] if len(sys.argv) > 1 else "") if c.isdigit())
    force = "--force" in sys.argv
    try:
        health = _req("GET", "/health", timeout=5)
    except Exception as e:
        print(f"FAIL: agent offline ({e})")
        return 1
    print("health:", json.dumps({k: health.get(k) for k in ("ok", "running", "version")}, ensure_ascii=False))
    sess = health.get("session") or {}
    print(
        "session:",
        sess.get("logged_in"),
        (sess.get("message") or "")[:80].encode("ascii", "replace").decode("ascii"),
    )

    docs = ROOT / "output" / "docs"
    if not awb:
        pdfs = sorted(docs.glob("*_ESID_*.pdf"), key=lambda p: p.stat().st_mtime, reverse=True)
        if not pdfs:
            print("FAIL: cần AWB hoặc PDF mẫu trong output/docs")
            return 1
        # 232-18276495_ESID_... → digits
        name = pdfs[0].name
        digits = "".join(c for c in name.split("_")[0] if c.isdigit())
        awb = digits[:11]
        print(f"AWB từ PDF mới nhất: {awb} ({name})")

    payload = {
        "warehouse": "TECS-TCS",
        "dry_run": False,
        "mock": False,
        "force": force,
        "rows": [
            {
                "stt": 1,
                "awb": awb,
                "action": "DOWNLOAD",
                "document_type": "ESID",
                "ops_status": "",
            }
        ],
    }

    def once(label: str, force_flag: bool) -> float:
        body = dict(payload)
        body["force"] = force_flag
        t0 = time.perf_counter()
        try:
            res = _req("POST", "/jobs", body, timeout=180)
        except urllib.error.HTTPError as e:
            err = e.read().decode("utf-8", errors="replace")
            print(f"{label}: HTTP {e.code} {err[:300]}")
            return -1
        dt = time.perf_counter() - t0
        row = (res.get("results") or [{}])[0]
        print(
            f"{label}: {dt:.2f}s · ok={res.get('ok')} cache={res.get('cache_hit')} "
            f"hot={res.get('hot_path')} status={row.get('normalized_status')} "
            f"pdf={row.get('pdf_name')} print={row.get('print_status')}"
        )
        return dt

    # Lần 1: có thể cache hoặc in
    once("run1", force)
    # Lần 2: kỳ vọng cache hit rất nhanh
    once("run2-cache", False)
    if not force:
        # Lần 3: force in lại để đo hot print
        once("run3-force-print", True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
