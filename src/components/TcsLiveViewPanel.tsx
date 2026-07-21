import { useEffect, useState } from "react";
import { tcsAgentLiveScreenshotUrl } from "../utils/tcsPortalAgentApi";

type Props = {
  /** Bật poll ảnh live */
  active: boolean;
  /** Poll nhanh hơn khi agent đang chạy job */
  busy?: boolean;
  onClose?: () => void;
  compact?: boolean;
};

/**
 * Xem live trang TCS trong Chrome agent (kể cả Railway headless).
 * Poll GET /tcs-agent/session/screenshot.
 */
export function TcsLiveViewPanel({ active, busy = false, onClose, compact = false }: Props) {
  const [src, setSrc] = useState("");
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const refresh = () => {
      if (cancelled) return;
      const url = tcsAgentLiveScreenshotUrl(Date.now());
      // Prefetch để biết lỗi; img vẫn dùng url mới
      void fetch(url, { cache: "no-store" })
        .then((res) => {
          if (cancelled) return;
          if (!res.ok) {
            setErr(res.status === 404 ? "Chưa có ảnh — bấm Login" : `Lỗi ảnh (${res.status})`);
            return;
          }
          setErr("");
          setSrc(url);
          setTick((n) => n + 1);
        })
        .catch(() => {
          if (!cancelled) setErr("Không lấy được ảnh live từ agent");
        });
    };
    refresh();
    const ms = busy ? 2500 : 1800;
    const id = window.setInterval(refresh, ms);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [active, busy]);

  if (!active) return null;

  return (
    <div
      className={`mx-0.5 flex min-w-0 flex-col gap-1 rounded-xl border border-sky-500/30 bg-sky-50/80 p-2 dark:border-sky-400/25 dark:bg-sky-950/40 ${
        compact ? "" : ""
      }`}
      role="region"
      aria-label="Xem live trang TCS trên agent"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-1">
        <p className="text-[10px] font-semibold text-sky-900 dark:text-sky-100">
          Xem live TCS (agent){busy ? " · đang thao tác…" : ""}
          {tick > 0 ? ` · #${tick}` : ""}
        </p>
        {onClose ? (
          <button
            type="button"
            className="text-[10px] font-semibold text-slate-500 underline dark:text-slate-400"
            onClick={onClose}
          >
            Đóng
          </button>
        ) : null}
      </div>
      {err ? (
        <p className="text-[10px] font-medium text-amber-800 dark:text-amber-200">{err}</p>
      ) : null}
      {src ? (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="block max-h-64 overflow-auto rounded-lg border border-sky-500/20 bg-white dark:bg-slate-900"
          title="Mở ảnh đầy đủ"
        >
          <img
            src={src}
            alt="Live view trang TCS trên agent"
            className="mx-auto max-h-60 w-auto max-w-full object-contain"
          />
        </a>
      ) : (
        <p className="text-[10px] text-slate-600 dark:text-slate-400">Đang lấy ảnh…</p>
      )}
      <p className="text-[9px] leading-snug text-slate-600 dark:text-slate-400">
        Ảnh xem nhanh (không click được). Muốn thao tác thật: nút <strong>TCS desktop</strong>{" "}
        (noVNC).
      </p>
    </div>
  );
}
