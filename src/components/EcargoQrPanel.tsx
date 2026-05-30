import { useState } from "react";
import type { EcargoJobRecord } from "../types/ecargoJob";
import { canFetchEcargoQr } from "../types/ecargoJob";
import { copyTextToClipboard } from "../utils/copyTextToClipboard";

type Props = {
  job: EcargoJobRecord;
  awb?: string;
  className?: string;
  onFetchQr?: () => void | Promise<void>;
  fetchQrBusy?: boolean;
  showFetchAction?: boolean;
  fetchQrEnabled?: boolean;
};

export function EcargoQrPanel({
  job,
  awb,
  className = "",
  onFetchQr,
  fetchQrBusy = false,
  showFetchAction = false,
  fetchQrEnabled = false,
}: Props) {
  const [copyOk, setCopyOk] = useState(false);

  if (job.status === "qr_ready") {
    const reg = job.registrationNo?.trim();
    const fileStem = reg || awb?.replace(/[^\dA-Za-z-]+/g, "") || "ecargo-qr";

    const copyReg = async () => {
      if (!reg) return;
      const ok = await copyTextToClipboard(reg);
      if (ok) {
        setCopyOk(true);
        window.setTimeout(() => setCopyOk(false), 1600);
      }
    };

    const downloadQr = () => {
      if (!job.qrImageDataUrl) return;
      const a = document.createElement("a");
      a.href = job.qrImageDataUrl;
      a.download = `${fileStem}.png`;
      a.click();
    };

    return (
      <div
        className={`rounded-lg bg-emerald-500/8 px-3 py-2.5 text-[12px] leading-snug text-emerald-950 ring-1 ring-emerald-500/15 dark:bg-emerald-400/10 dark:text-emerald-100 dark:ring-emerald-400/20 ${className}`}
        role="region"
        aria-label="Mã QR eCargo"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold">Mã QR cổng kho</p>
            {reg ? (
              <p className="mt-0.5 font-mono text-[11px] opacity-90">Phiếu {reg}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 gap-1.5">
            {reg ? (
              <button
                type="button"
                onClick={() => void copyReg()}
                className="rounded-md bg-emerald-600/90 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-700"
              >
                {copyOk ? "Đã copy ✓" : "Copy số phiếu"}
              </button>
            ) : null}
            {job.qrImageDataUrl ? (
              <button
                type="button"
                onClick={downloadQr}
                className="rounded-md border border-emerald-600/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-900 hover:bg-emerald-600/10 dark:text-emerald-100"
              >
                Tải ảnh
              </button>
            ) : null}
          </div>
        </div>
        {job.qrImageDataUrl ? (
          <div className="mt-2 flex justify-center rounded-md bg-white p-2 dark:bg-slate-950/40">
            <img
              src={job.qrImageDataUrl}
              alt={reg ? `Mã QR phiếu ${reg}` : "Mã QR eCargo"}
              className="max-h-52 max-w-full object-contain"
            />
          </div>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-[11px] opacity-90">
              Mail QR đã tới{reg ? ` (phiếu ${reg})` : ""} — chưa trích được ảnh từ mail.
            </p>
            {onFetchQr ? (
              <button
                type="button"
                disabled={fetchQrBusy}
                onClick={() => void onFetchQr()}
                className="rounded-md bg-emerald-600/90 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {fetchQrBusy ? "Đang lấy lại…" : "Thử lấy lại ảnh QR"}
              </button>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  if (job.status === "verified_waiting_qr") {
    return (
      <div
        className={`rounded-lg bg-sky-500/8 px-3 py-2.5 text-[12px] leading-snug text-sky-950 ring-1 ring-sky-500/15 dark:bg-sky-400/10 dark:text-sky-100 dark:ring-sky-400/20 ${className}`}
        role="status"
      >
        <p className="font-semibold">Đang lấy mã QR từ Gmail…</p>
        <p className="mt-0.5 opacity-90">
          SCSC gửi mail «Phiếu đăng ký hàng vào kho» kèm mã QR — không tạo phiếu mới.
        </p>
      </div>
    );
  }

  if (showFetchAction || canFetchEcargoQr(job) || job.status === "verified") {
    const reg = job.registrationNo?.trim();
    return (
      <div
        className={`rounded-lg bg-amber-500/8 px-3 py-2.5 text-[12px] leading-snug text-amber-950 ring-1 ring-amber-500/15 dark:bg-amber-400/10 dark:text-amber-100 dark:ring-amber-400/20 ${className}`}
        role="status"
      >
        <p className="font-semibold">
          {job.status === "verified" ? "Đã xác thực — chưa lấy mã QR" : "Mã QR cổng kho"}
        </p>
        <p className="mt-0.5 opacity-90">
          {reg ? `Phiếu ${reg} · ` : ""}
          {fetchQrEnabled
            ? "Bấm «Lấy mã QR» — hệ thống quét Gmail một lần (không tự quét lặp)."
            : "Hoàn tất đăng ký eCargo trước, sau đó bấm «Lấy mã QR» ở nút bên dưới."}
        </p>
        {onFetchQr && fetchQrEnabled ? (
          <button
            type="button"
            disabled={fetchQrBusy}
            onClick={() => void onFetchQr()}
            className="mt-2 rounded-lg bg-amber-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {fetchQrBusy ? "Đang lấy QR…" : "Lấy mã QR"}
          </button>
        ) : null}
      </div>
    );
  }

  return null;
}
