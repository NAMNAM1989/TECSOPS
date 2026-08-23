#!/usr/bin/env python3
"""Lấy common.onnx từ wheel ddddocr — không pip install, không onnxruntime/Playwright."""
from __future__ import annotations

import sys
import zipfile
from pathlib import Path

MIN_ONNX_BYTES = 1_000_000


def extract_onnx(wheel_dir: Path, dest: Path) -> int:
    wheels = sorted(wheel_dir.glob("ddddocr-*.whl"))
    if not wheels:
        raise SystemExit(f"Không thấy ddddocr-*.whl trong {wheel_dir}")
    wheel = wheels[-1]
    with zipfile.ZipFile(wheel) as zf:
        names = [n for n in zf.namelist() if n.replace("\\", "/").endswith("common.onnx")]
        if not names:
            raise SystemExit(f"{wheel.name} không chứa common.onnx")
        data = zf.read(names[0])
    if len(data) < MIN_ONNX_BYTES:
        raise SystemExit(f"common.onnx quá nhỏ: {len(data)} bytes")
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    print(f"ok {wheel.name} {names[0]} {len(data)}")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: extract-ddddocr-onnx.py <wheel-dir> <dest-onnx>", file=sys.stderr)
        return 2
    return extract_onnx(Path(argv[1]), Path(argv[2]))


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
