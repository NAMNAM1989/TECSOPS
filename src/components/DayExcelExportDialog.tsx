import { useEffect, useRef, useState } from "react";
import { Button } from "../ui";
import { useModalFocusTrap } from "../hooks/useModalFocusTrap";

type Props = {
  open: boolean;
  defaultYmd: string;
  exporting?: boolean;
  onClose: () => void;
  onExport: (fromYmd: string, toYmd: string) => void;
};

/** Chọn ngày / khoảng ngày trước khi xuất Excel (lọc client). */
export function DayExcelExportDialog({
  open,
  defaultYmd,
  exporting,
  onClose,
  onExport,
}: Props) {
  const [fromYmd, setFromYmd] = useState(defaultYmd);
  const [toYmd, setToYmd] = useState(defaultYmd);
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(open, dialogRef, () => {
    if (!exporting) onClose();
  });

  useEffect(() => {
    if (!open) return;
    setFromYmd(defaultYmd);
    setToYmd(defaultYmd);
  }, [open, defaultYmd]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[490] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="presentation"
      onClick={() => {
        if (!exporting) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-sm rounded-xl border border-ui-border bg-ui-surface p-4 shadow-md"
        role="dialog"
        aria-modal="true"
        aria-labelledby="excel-range-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="excel-range-title" className="text-sm font-bold text-ui-text">
          Xuất Excel lô
        </h2>
        <p className="mt-1 text-[11px] text-ui-text-muted">
          Lọc trên dữ liệu đã sync · mẫu Import Shipments
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-0.5 block text-[10px] font-semibold text-ui-text-muted">
              Từ ngày
            </span>
            <input
              type="date"
              value={fromYmd}
              onChange={(e) => setFromYmd(e.target.value)}
              className="w-full rounded-lg border border-ui-border px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ui-focus"
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[10px] font-semibold text-ui-text-muted">
              Đến ngày
            </span>
            <input
              type="date"
              value={toYmd}
              onChange={(e) => setToYmd(e.target.value)}
              className="w-full rounded-lg border border-ui-border px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-ui-focus"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={exporting}>
            Hủy
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={exporting || !fromYmd || !toYmd}
            onClick={() => onExport(fromYmd, toYmd)}
          >
            {exporting ? "Đang xuất…" : "Xuất"}
          </Button>
        </div>
      </div>
    </div>
  );
}
