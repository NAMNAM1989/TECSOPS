"""Sau khi CAPTCHA xong trên Chrome agent: bootstrap + prefetch + bench cache.
Usage: python scripts/finish_pdf_speed_setup.py [YYYY-MM-DD] [AWB...]
"""
from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
AGENT = "http://127.0.0.1:8765"


def req(method: str, path: str, body: dict | None = None, timeout: float = 300.0):
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(f"{AGENT}{path}", data=data, headers=headers, method=method)
    with urllib.request.urlopen(r, timeout=timeout) as res:
        return json.loads(res.read().decode("utf-8"))


def main() -> int:
    session_date = sys.argv[1] if len(sys.argv) > 1 and "-" in sys.argv[1] else date.today().isoformat()
    awbs = ["".join(c for c in a if c.isdigit())[:11] for a in sys.argv[1:] if a.replace("-", "").isdigit() or a.isdigit()]
    awbs = [a for a in awbs if len(a) == 11]
    if session_date in awbs:
        # first arg was misparsed
        pass

    print("1) health…")
    h = req("GET", "/health", timeout=5)
    sess = h.get("session") or {}
    print("   logged_in=", sess.get("logged_in"))
    if not sess.get("logged_in"):
        print("2) session/open…")
        st = req("POST", "/session/open", {"visible": True, "headed": True}, timeout=180)
        print("   logged_in=", st.get("logged_in"), st.get("message", "")[:100])
        if not st.get("logged_in"):
            print("FAIL: nhập CAPTCHA trên Chrome rồi chạy lại script này.")
            return 2

    print("3) bootstrap + prefetch…", session_date)
    boot = req(
        "POST",
        "/workspace/bootstrap",
        {
            "warehouse": "TECS-TCS",
            "session_date": session_date,
            "awbs": awbs,
            "visible": True,
        },
        timeout=600,
    )
    pref = boot.get("pdf_prefetch") or {}
    print(
        "   ok=",
        boot.get("ok"),
        "ready=",
        boot.get("ready_count"),
        "prefetch=",
        pref.get("prefetched"),
        "skipped=",
        pref.get("skipped"),
    )

    ready = [str(x.get("awb") or "") for x in (boot.get("ready") or []) if isinstance(x, dict)]
    ready = ["".join(c for c in a if c.isdigit())[:11] for a in ready]
    ready = [a for a in ready if len(a) == 11]
    sample = (awbs[0] if awbs else None) or (ready[0] if ready else None)
    if not sample:
        # fallback PDF mới nhất
        docs = ROOT / "output" / "docs"
        pdfs = sorted(docs.glob("*_ESID_*.pdf"), key=lambda p: p.stat().st_mtime, reverse=True)
        if pdfs:
            sample = "".join(c for c in pdfs[0].name.split("_")[0] if c.isdigit())[:11]
    if not sample:
        print("FAIL: không có AWB để bench")
        return 1

    print("4) bench DOWNLOAD", sample)
    for label, force in [("cache-or-print", False), ("cache2", False)]:
        t0 = time.perf_counter()
        body = {
            "warehouse": "TECS-TCS",
            "force": force,
            "rows": [
                {
                    "stt": 1,
                    "awb": sample,
                    "action": "DOWNLOAD",
                    "document_type": "ESID",
                    "ops_status": "",
                }
            ],
        }
        try:
            res = req("POST", "/jobs", body, timeout=180)
        except urllib.error.HTTPError as e:
            print(label, "HTTP", e.code, e.read()[:200])
            continue
        row = (res.get("results") or [{}])[0]
        print(
            f"   {label}: {time.perf_counter() - t0:.2f}s cache={res.get('cache_hit')} "
            f"print={row.get('print_status')} pdf={row.get('pdf_name')}"
        )

    print("DONE — Ops: F5 → Đồng bộ → Tải PDF (kỳ vọng tức thì nếu đã prefetch).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
